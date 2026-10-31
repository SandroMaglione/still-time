/**
 * Drawing the fight view onto a 2D canvas in a projected, standing-up view:
 * the floor and decals flat on the ground, crates and walls as boxes, people
 * as 24-pixel sprites, all painted back to front. The simulation stays flat
 * 2D; only this file knows about height.
 */
import { ROOMS, type Hazard, type Lock, type Pillar } from "../sim/rooms.ts"

import { SHOTS, STALKER, TUNING } from "../sim/tuning.ts"
import type { FightView } from "../sim/view.ts"
import { posedSprite, sprite, spriteImage, type Sprite } from "./art.ts"
import { attackWave, bodyName, bombActor, combatActor, crateBurst, crateWreck, dyingActor, impactBurst } from "./combat-art.ts"
import { APPEAR_LIFE, GHOST_LIFE, SPLINTER_LIFE, STOP_LIFE, VANISH_LIFE, VANISH_POP, speedOf, type Presentation } from "./fx.ts"
import { messages } from "./hud.ts"
import { decorationHash, pixelArc, pixelLine, pixelSector } from "./pixels.ts"
import { conveyorBelt, laserPost, plateBeacon, pressurePlate, raisedBlock, roomFloor, roomWalls, spinningBlade, type Material } from "./room-art.ts"
import { applyLighting, discardLights, emitLight, type Rgb } from "./lighting.ts"
import { feelSettings } from "./feel.ts"
import { DANGER, PATH, THREAT, pathArrow, reloadArc, shotPath, threatArc, threatLine } from "./threats.ts"

export interface Stick { ox: number; oy: number; x: number; y: number; reach: number }

const PILLAR_HEIGHT = 1.2
const BACK_WALL = 1.6
/** How long (real s) the screen shakes when your cut lands. */
const CUT_SHAKE = 0.14

/**
 * How world metres land on screen: the room stays upright and the camera
 * leans back a little (Pokémon-style), so you see mostly tops with short
 * fronts. Floor depth is squashed to SQUASH; heights are drawn at RISE of
 * their size.
 */
export const SQUASH = 0.78
const INK = "#171c2e"
const RISE = 0.65

/** Screen offset in px of a world point (metres, z up) for unit u (px per metre). */
const project = (x: number, y: number, z: number, u: number): { readonly x: number; readonly y: number } => ({ x: x * u, y: y * u * SQUASH - z * u * RISE })

/** Pixels per metre: ten metres across the screen. */
const unitFor = (cw: number): number => cw / 10

/** A screen direction turned into the world direction that looks the same. */
export const screenToWorld = (dx: number, dy: number): { readonly x: number; readonly y: number } => ({ x: dx, y: dy / SQUASH })

/** Is a point on the ground in front of a box (drawn after it)? Nearer the viewer is further down the room. */
const inFront = (y: number, p: Pillar): boolean => y >= p.y + p.h

/** Where the camera looks on the floor, eased toward the player: page state, not world state. */
export class Camera {
  x = 0
  y = 0
  private placed = false

  follow(view: FightView, dt: number): void {
    const p = view.player
    if (p === null) return
    // A little lead in the direction you move, so you see where you are going.
    const tx = Math.max(0, Math.min(view.room.w, p.x + p.vx * 0.25))
    const ty = Math.max(0, Math.min(view.room.h, p.y + p.vy * 0.25))
    if (!this.placed) {
      this.x = tx
      this.y = ty
      this.placed = true
      return
    }
    const k = 1 - Math.exp(-dt * 8)
    this.x += (tx - this.x) * k
    this.y += (ty - this.y) * k
  }

  /** Eases toward a floor point instead of the player (a cutscene's framing: no one steers this camera). */
  look(at: { readonly x: number; readonly y: number }, dt: number, rate = 3): void {
    if (!this.placed) { this.x = at.x; this.y = at.y; this.placed = true; return }
    const k = 1 - Math.exp(-dt * rate)
    this.x += (at.x - this.x) * k
    this.y += (at.y - this.y) * k
  }

  /** Snaps to the player next frame: on a new room. */
  reset(): void {
    this.placed = false
  }
}

/** Each key and its door share a colour. */
const KEY_COLOURS = ["#64b6b3", "#c18cff", "#7dff9a"] as const
export const keyColour = (key: number): string => KEY_COLOURS[key % KEY_COLOURS.length] ?? "#5fd4ff"

const PLATE = "#64b6b3"

/** What a door looks like by its lock: steel for a chamber, gold for a captain, the key's colour for a key, teal for plates, amber for time. */
const lockColour = (lock: Lock): string => (lock.kind === "clear" ? "#9fb4d8" : lock.kind === "captain" ? "#ffd25a" : lock.kind === "plates" ? PLATE : lock.kind === "time" ? "#edc66c" : keyColour(lock.key))


const EXIT = "#7dff9a"

/** A key (art: `key`), centred on (x, y). */
const keyGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number): void => sprite(ctx, "key", x, y + 8)

/** One enemy a chamber door still waits on: a red square, on the door and over the enemy's head. Centred on (x, y). */
const doorPip = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  const px = Math.round(x), py = Math.round(y)
  ctx.fillStyle = "#171c2e"; ctx.fillRect(px - 2, py - 2, 5, 5)
  ctx.fillStyle = "#ce4655"; ctx.fillRect(px - 1, py - 1, 3, 3)
}
/** A crown glyph in screen pixels, its base centred on (x, y). */
const crownGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number): void => sprite(ctx, "crown", x, y + 3)

/** Ambient light: cool and dim while time is frozen, warmer as the world runs. */
const AMBIENT_FROZEN: Rgb = [64, 76, 116], AMBIENT_RUNNING: Rgb = [96, 86, 76]

/** A sprite filled with one colour, cached per sprite and colour (CPU-backed, like the scene). */
const tints = new Map<string, HTMLCanvasElement>()
const tinted = (name: Sprite, colour: string): HTMLCanvasElement | undefined => {
  const key = `${name}:${colour}`
  const cached = tints.get(key)
  if (cached !== undefined) return cached
  const image = spriteImage(name)
  if (image === undefined) return undefined
  const c = document.createElement("canvas"); c.width = image.width; c.height = image.height
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.drawImage(image, 0, 0)
  g.globalCompositeOperation = "source-in"; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height)
  tints.set(key, c)
  return c
}
/** A sprite's silhouette in one colour, anchored like `sprite` (feet on the point). */
export const silhouette = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, flip: boolean, colour: string, alpha: number): void => {
  const t = tinted(name, colour)
  if (t === undefined || alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.translate(Math.round(x), Math.round(y))
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(t, -Math.floor(t.width / 2), -t.height + 1)
  ctx.restore()
}

/** A pixel hand pointing up: `o` ink, `w` ivory. */
const HAND = [
  "...oo....",
  "..owwo...",
  "..owwo...",
  "..owwoo..",
  "..owwwwoo",
  "ooowwwwwo",
  "owowwwwwo",
  "owwwwwwwo",
  ".owwwwwwo",
  ".owwwwwo.",
  "..owwwwo.",
  "..oooooo."
] as const
/** The hand at twice the art's pixel size: a hint has to be seen before it is read. Its fingertip is on (x, y). */
export const hand = (ctx: CanvasRenderingContext2D, x: number, y: number, pressed: boolean): void => {
  const s = 2, left = Math.round(x) - 4 * s, top = Math.round(y) + (pressed ? 1 : 0)
  HAND.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i]
      if (c === ".") continue
      ctx.fillStyle = c === "o" ? INK : pressed ? "#e8f6ff" : "#f4efda"
      ctx.fillRect(left + i * s, top + j * s, s, s)
    }
  })
}
/** A filled pixel disc. */
const disc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string): void => {
  ctx.fillStyle = colour
  for (let j = -r; j <= r; j++) {
    const half = Math.floor(Math.sqrt(r * r - j * j))
    ctx.fillRect(Math.round(x) - half, Math.round(y) + j, half * 2 + 1, 1)
  }
}
/** The thumb-stick as it looks under your finger and in the lesson: a ring where you pressed, and a knob on a line to it. */
export const thumbPad = (ctx: CanvasRenderingContext2D, base: { readonly x: number; readonly y: number }, knob: { readonly x: number; readonly y: number }, reach: number): void => {
  // Soft, half see-through and in muted teal-grey: it says where your thumb is without pulling the eye off the room.
  ctx.save()
  ctx.globalAlpha = 0.45
  pixelArc(ctx, base, reach, reach, 0, Math.PI * 2, INK, 2)
  pixelArc(ctx, base, reach, reach, 0, Math.PI * 2, "#6f97ad", 1, true)
  disc(ctx, base.x, base.y, 2, "#6f97ad")
  pixelLine(ctx, base, knob, "#6f97ad", 1)
  disc(ctx, knob.x, knob.y, 5, INK)
  disc(ctx, knob.x, knob.y, 4, "#a9c3d1")
  ctx.restore()
}
/** How far (0 to 1) a time door's portcullis has risen: over the last DOOR_RISE world seconds before it opens. */
const DOOR_RISE = 3
const riseOf = (seconds: number, world: number): number => Math.max(0, Math.min(1, (world - (seconds - Math.min(DOOR_RISE, seconds))) / Math.min(DOOR_RISE, seconds)))

/** A time door: a beam on top and iron bars that rise into it by `lift` (0 shut, 1 all the way up). */
const portcullis = (ctx: CanvasRenderingContext2D, b: Pillar, P: Project, height: number, lift: number): void => {
  const far = P(b.x, b.y, height), near = P(b.x, b.y + b.h, height), ground = P(b.x, b.y + b.h), right = P(b.x + b.w, b.y + b.h)
  const x = Math.round(far.x), y = Math.round(far.y), width = Math.max(1, Math.round(right.x) - x), depth = Math.max(1, Math.round(near.y) - y)
  const face = Math.max(1, Math.round(ground.y) - Math.round(near.y))
  const bottom = Math.round(ground.y - face * lift)
  // The bars, from the beam down to where they have risen to; a crossbar near their foot.
  for (let bx = x + 2; bx < x + width - 1; bx += 4) {
    if (bottom > y + depth) {
      ctx.fillStyle = INK; ctx.fillRect(bx - 1, y + depth, 3, bottom - (y + depth))
      ctx.fillStyle = "#899692"; ctx.fillRect(bx, y + depth, 1, bottom - (y + depth))
    }
  }
  if (bottom - 3 > y + depth) {
    ctx.fillStyle = INK; ctx.fillRect(x, bottom - 4, width, 3)
    ctx.fillStyle = "#647373"; ctx.fillRect(x + 1, bottom - 3, width - 2, 1)
  }
  // The beam it rises into.
  ctx.fillStyle = INK; ctx.fillRect(x, y, width, depth + 2)
  ctx.fillStyle = "#465477"; ctx.fillRect(x + 1, y + 1, width - 2, depth - 1)
  ctx.fillStyle = "#edc66c"; ctx.fillRect(x + 1, y + depth, width - 2, 1)
}

/** A lantern hung on a wall, swinging on the world clock (still when you are). */
const pendulum = (ctx: CanvasRenderingContext2D, P: Project, x: number, y: number, world: number): void => {
  const pivot = P(x, y, 1.6), a = 0.7 * Math.sin(world * 2.6 + y), arm = 16
  const bob = { x: pivot.x + Math.sin(a) * arm, y: pivot.y + Math.cos(a) * arm }
  ctx.fillStyle = INK; ctx.fillRect(Math.round(pivot.x) - 2, Math.round(pivot.y) - 2, 5, 4)
  pixelLine(ctx, pivot, bob, INK, 3)
  pixelLine(ctx, pivot, bob, "#899692", 1)
  ctx.fillStyle = INK; ctx.fillRect(Math.round(bob.x) - 3, Math.round(bob.y) - 1, 7, 7)
  ctx.fillStyle = "#edc66c"; ctx.fillRect(Math.round(bob.x) - 2, Math.round(bob.y), 5, 5)
  ctx.fillStyle = "#f4efda"; ctx.fillRect(Math.round(bob.x) - 1, Math.round(bob.y) + 1, 2, 2)
  emitLight(ctx, { x: bob.x, y: bob.y + 2, radius: 1.2, colour: [255, 200, 120], intensity: 0.55, shadows: false })
}

/** A wheel on a wall, turning on the world clock (still when you are). */
const wheel = (ctx: CanvasRenderingContext2D, P: Project, x: number, y: number, world: number): void => {
  const c = P(x, y, 0.9), r = 8, turn = world * 2
  pixelArc(ctx, c, r, r, 0, Math.PI * 2, INK, 3)
  pixelArc(ctx, c, r, r, 0, Math.PI * 2, "#899692", 1)
  for (let i = 0; i < 6; i++) {
    const a = turn + (i * Math.PI) / 3
    const tip = { x: c.x + Math.cos(a) * (r - 1), y: c.y + Math.sin(a) * (r - 1) }
    pixelLine(ctx, c, tip, i === 0 ? "#edc66c" : "#647373", 1)
  }
  ctx.fillStyle = INK; ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 2, 5, 5)
  ctx.fillStyle = "#edc66c"; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3)
}

/** A time door's timer: a pause or play sign and the seconds left, big, over a bar filling to the open. */
const doorTimer = (ctx: CanvasRenderingContext2D, x: number, bottom: number, left: number, done: number, running: boolean, now: number, width: number): void => {
  const bl = Math.round(x - width / 2), by = Math.round(bottom) - 4
  ctx.fillStyle = INK; ctx.fillRect(bl - 1, by - 1, width + 2, 5)
  ctx.fillStyle = "#29334b"; ctx.fillRect(bl, by, width, 3)
  ctx.fillStyle = "#edc66c"; ctx.fillRect(bl, by, Math.round(width * Math.min(1, done)), 3)
  ctx.save()
  ctx.font = "700 16px Silkscreen, ui-monospace, monospace"; ctx.textBaseline = "top"; ctx.textAlign = "left"
  const label = left.toFixed(1), tw = Math.ceil(ctx.measureText(label).width), total = 24 + tw
  const tx = Math.round(x - total / 2) + 24, ty = by - 22
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) ctx.fillText(label, tx + dx, ty + dy)
  ctx.fillStyle = running ? "#edc66c" : "#7fd8ff"; ctx.fillText(label, tx, ty)
  ctx.restore()
  clockSign(ctx, tx - 24, ty - 1, running, now)
}

/** "it takes time to open", small and dim over a time door's timer, the word "time" in gold. */
const takesTime = (ctx: CanvasRenderingContext2D, x: number, y: number): void => {
  const parts: ReadonlyArray<readonly [string, string]> = [["IT TAKES ", "#8996b0"], ["TIME", "#edc66c"], [" TO OPEN", "#8996b0"]]
  ctx.save()
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"; ctx.textBaseline = "top"; ctx.textAlign = "left"
  const width = parts.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
  let left = Math.round(x - width / 2)
  ctx.globalAlpha = 0.85
  for (const [t, colour] of parts) {
    ctx.fillStyle = INK
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(t, left + dx, Math.round(y) + dy)
    ctx.fillStyle = colour; ctx.fillText(t, left, Math.round(y))
    left += ctx.measureText(t).width
  }
  ctx.restore()
}

/** A pause sign (still: the world waits) or a fast-forward sign (moving: the world runs), 10×9, drawn twice the size. */
const PAUSE_SIGN = [
  "ooo..ooo..",
  "obo..obo..",
  "obo..obo..",
  "obo..obo..",
  "obo..obo..",
  "obo..obo..",
  "obo..obo..",
  "obo..obo..",
  "ooo..ooo.."
] as const
const PLAY_SIGN = [
  "o....o....",
  "oo...oo...",
  "ogo..ogo..",
  "oggo.oggo.",
  "ogggoogggo",
  "oggo.oggo.",
  "ogo..ogo..",
  "oo...oo...",
  "o....o...."
] as const
export const clockSign = (ctx: CanvasRenderingContext2D, x: number, y: number, running: boolean, now: number): void => {
  const nudge = running ? Math.round(Math.sin(now * 18)) : 0
  bitmap(ctx, running ? PLAY_SIGN : PAUSE_SIGN, x + nudge + 1, y, { o: INK, b: "#7fd8ff", g: "#edc66c" }, 2)
}

/** The small pause sign over you (5×7, two bars) and the small play sign (5×7, a triangle), each centred on its own. */
const SMALL_PAUSE = ["ooooo", "obobo", "obobo", "obobo", "obobo", "obobo", "ooooo"] as const
const SMALL_PLAY = ["oo...", "ogo..", "oggo.", "ogggo", "oggo.", "ogo..", "oo..."] as const
/** Over your head: paused (ice) while the world waits, playing (gold) while it runs. Centred on `x`. */
export const paceSign = (ctx: CanvasRenderingContext2D, x: number, y: number, running: boolean): void => {
  bitmap(ctx, running ? SMALL_PLAY : SMALL_PAUSE, x + 0.5, y, { o: INK, b: "#7fd8ff", g: "#edc66c" }, 1)
}

export type Project = (x: number, y: number, z?: number) => { x: number; y: number }

/** Dust motes on the world's clock: each drifts from a fixed seed by world time, so a frozen world holds them still. */
const motes = (ctx: CanvasRenderingContext2D, view: FightView, P: Project): void => {
  const { w, h, index } = view.room
  const count = Math.round(w * h / 7)
  for (let i = 0; i < count; i++) {
    const seed = decorationHash(i, 31, index)
    const vx = (((seed >>> 4) % 21) - 10) / 50, vy = -0.12 - ((seed >>> 9) % 10) / 60
    const x = ((((seed % 997) / 997) * w + vx * view.world) % w + w) % w
    const y = (((((seed >>> 12) % 991) / 991) * h + vy * view.world) % h + h) % h
    const z = 0.3 + ((seed >>> 20) % 12) / 10
    const at = P(x, y, z)
    ctx.fillStyle = (seed >>> 24) % 3 === 0 ? "rgba(255,214,150,0.55)" : "rgba(232,236,244,0.35)"
    ctx.fillRect(Math.round(at.x), Math.round(at.y), 1, 1)
  }
}

/** A pixel arrow pointing down: `o` ink, `g` green. */
const DOWN_ARROW = ["ooooooo", "ogggggo", "oogggoo", ".ogggo.", ".oogoo.", "..ogo..", "..ooo..", "...o..."] as const
const bitmap = (ctx: CanvasRenderingContext2D, rows: ReadonlyArray<string>, x: number, y: number, colours: Record<string, string>, scale = 1): void => {
  const left = Math.round(x - (rows[0]!.length * scale) / 2), top = Math.round(y)
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = colours[row[i]!]
      if (c === undefined) continue
      ctx.fillStyle = c; ctx.fillRect(left + i * scale, top + j * scale, scale, scale)
    }
  })
}

/** The exit as a beacon: a soft column of green light over the pad and an arrow bouncing above it. */
const exitBeacon = (ctx: CanvasRenderingContext2D, g: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }, P: Project, erx: number, now: number): void => {
  const foot = P(g.x + g.w / 2, g.y + g.h / 2), top = P(g.x + g.w / 2, g.y + g.h / 2, 2.6)
  const half = Math.max(6, Math.round(g.w * erx * 0.32))
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  const col = ctx.createLinearGradient(0, top.y, 0, foot.y)
  const breathe = 0.3 + 0.1 * Math.sin(now * 3)
  col.addColorStop(0, "rgba(125,255,154,0)")
  col.addColorStop(1, `rgba(125,255,154,${breathe.toFixed(3)})`)
  ctx.fillStyle = col
  ctx.fillRect(Math.round(foot.x - half), Math.round(top.y), half * 2, Math.round(foot.y - top.y))
  ctx.restore()
  const bounce = Math.round(Math.abs(Math.sin(now * 4)) * 5)
  bitmap(ctx, DOWN_ARROW, foot.x, top.y - 10 + bounce, { o: INK, g: "#7dff9a" }, 3)
}

/** Chevrons marching from one floor point toward another, in real time: go this way. */
export const chevronsToward = (
  ctx: CanvasRenderingContext2D, from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number },
  P: Project, now: number, colour: string, reach = 4.6
): void => {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy)
  if (d <= 2) return
  const ux = dx / d, uy = dy / d, a = Math.atan2(uy * SQUASH, ux)
  const shift = (now * 1.5) % 0.7
  for (let k = 1.2 + shift; k < Math.min(d - 1.2, reach); k += 0.7) {
    const c = P(from.x + ux * k, from.y + uy * k)
    const tipPt = { x: c.x + Math.cos(a) * 2, y: c.y + Math.sin(a) * 2 }
    for (const side of [-1, 1]) {
      const end = { x: c.x - Math.cos(a) * 2 + Math.sin(a) * side * 3, y: c.y - Math.sin(a) * 2 - Math.cos(a) * side * 3 }
      pixelLine(ctx, tipPt, end, INK, 3); pixelLine(ctx, tipPt, end, colour)
    }
  }
}



/**
 * The ninja vanish when a room is cleared, in place. First a beat where you stay and gather (a teal outline that
 * pulses white, sparks rising), then the afterimage dodge: your body flickers between afterimages a step to each
 * side, with horizontal speed lines, while the real you fades out where you stood; a small puff of smoke stays.
 */
const vanishBurst = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, flip: boolean, age: number): void => {
  const body = bodyName("player")
  ctx.save()
  // Gather: your outline glows and pulses, faster as the dodge nears; sparks rise round you.
  if (age < VANISH_POP) {
    const k = age / VANISH_POP
    const pulse = Math.sin(age * (10 + k * 30)) * 0.5 + 0.5
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) silhouette(ctx, body, at.x + dx, at.y + dy, flip, AURA, 0.4 + 0.6 * k)
    silhouette(ctx, body, at.x, at.y, flip, "#ffffff", pulse * k * 0.7)
    for (let i = 0; i < 6; i++) {
      const t = ((age * 2.2 + i / 6) % 1)
      const x = Math.round(at.x - 9 + ((i * 7) % 19)), y = Math.round(at.y - 2 - t * 28)
      ctx.fillStyle = i % 2 === 0 ? AURA_CORE : AURA; ctx.fillRect(x, y, 1, 2)
    }
  }
  const after = age - VANISH_POP
  const dodge = 0.4
  if (after >= 0 && after < dodge) {
    const k = after / dodge
    // The real you, fading out in place.
    ctx.globalAlpha = 1 - k
    posedSprite(ctx, body, at.x, at.y, { flip })
    // Afterimages a step to each side, flickering: a new spot every frame-and-a-bit, each fading.
    const spots = [-11, 8, -6, 12, -13, 5]
    const now = Math.floor(after * 30)
    for (let i = 0; i < spots.length; i++) {
      const lag = now - i
      if (lag < 0) continue
      const fade = Math.max(0, 1 - lag / 6) * (1 - k)
      if (fade <= 0) continue
      ctx.globalAlpha = 1
      silhouette(ctx, body, at.x + spots[i]!, at.y, flip, i % 2 === 0 ? GHOST : "#e8ffff", fade * 0.75)
    }
    // Horizontal speed lines at chest height, both sides.
    ctx.globalAlpha = 1
    for (let i = 0; i < 4; i++) {
      const y = Math.round(at.y - 18 + i * 4), len = 8 + ((i * 5) % 7), off = 10 + Math.round(k * 10)
      ctx.fillStyle = `rgba(232,255,255,${(1 - k).toFixed(3)})`
      ctx.fillRect(Math.round(at.x - off - len), y, len, 1)
      ctx.fillRect(Math.round(at.x + off), y + 2, len, 1)
    }
  }
  // A small puff of smoke where you stood.
  if (after >= 0) {
    const smoke = VANISH_LIFE - VANISH_POP
    const k = Math.min(1, after / smoke)
    ctx.globalAlpha = 1
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3
      const r = 3 + Math.sqrt(k) * 11
      const x = Math.round(at.x + Math.cos(a) * r), y = Math.round(at.y - 3 + Math.sin(a) * r * 0.5 - k * 3)
      ctx.fillStyle = `rgba(${i % 3 === 0 ? "232,236,244" : "137,150,146"},${(0.75 * (1 - k)).toFixed(3)})`
      ctx.fillRect(x - 1, y - 1, k < 0.4 ? 3 : 2, k < 0.4 ? 3 : 2)
    }
  }
  ctx.restore()
}

/** One line of hint text in the pixel font, outlined in ink, centred on x. */
export const hintText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string): void => {
  ctx.save()
  ctx.textAlign = "center"; ctx.textBaseline = "top"
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(text, Math.round(x) + dx, Math.round(y) + dy)
  ctx.fillStyle = colour; ctx.fillText(text, Math.round(x), Math.round(y))
  ctx.restore()
}

/**
 * First Cut's marks (its words are the guide's caption, see `guide.ts`): on each gunner you can reach (not one still
 * shut away behind a door), gold brackets breathing by a pixel and a gold ring on the floor at touching range (inside
 * it, it's cut); teal chevrons toward the nearest (they give way while a shot is in the air).
 */
const cutHint = (ctx: CanvasRenderingContext2D, view: FightView, P: Project, now: number): void => {
  const p = view.player
  if (p === null || view.enemies.length === 0) return
  const pulse = Math.floor(now * 4) % 2
  const breathe = Math.round(Math.sin(now * 5) * 2)
  for (const target of view.enemies) {
    const them = P(target.x, target.y)
    // Shut away behind a door, it is not yours yet: no marks.
    if (target.sealed) continue
    const half = 12 + pulse, top = them.y - 27 - pulse, bottom = them.y + 3 + pulse
    for (const [sx, sy] of [[-1, top], [1, top], [-1, bottom], [1, bottom]] as const) {
      const cx = Math.round(them.x + sx * half), cy = Math.round(sy)
      const v = sy === top ? 4 : -4
      pixelLine(ctx, { x: cx, y: cy }, { x: cx - sx * 4, y: cy }, INK, 3); pixelLine(ctx, { x: cx, y: cy }, { x: cx, y: cy + v }, INK, 3)
      pixelLine(ctx, { x: cx, y: cy }, { x: cx - sx * 4, y: cy }, "#edc66c"); pixelLine(ctx, { x: cx, y: cy }, { x: cx, y: cy + v }, "#edc66c")
    }
    // Where the cut lands: a gold ring on the floor at touching range, breathing; step inside it and the enemy is cut.
    const r = TUNING.attackRange, rx = Math.round(P(target.x + r, target.y).x - them.x), ry = Math.round(rx * SQUASH)
    pixelArc(ctx, them, rx + breathe, ry + breathe, 0, Math.PI * 2, INK, 3, true)
    pixelArc(ctx, them, rx + breathe, ry + breathe, 0, Math.PI * 2, "#edc66c", 1, true)
  }
  // Chevrons to the nearest one you can reach.
  const open = view.enemies.filter((e) => !e.sealed)
  const near = open.reduce<(typeof open)[number] | undefined>((best, e) => (best === undefined || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best), undefined)
  if (near !== undefined && view.shots.length === 0) chevronsToward(ctx, p, near, P, now, "#64b6b3")
}

/** The speed effect's colours: afterimages, the aura's outline and its hot core. */
/** How far the wall launcher's barrel reaches out from the wall, in canvas px (its sprite's barrel tip). */
const LAUNCHER_REACH = 23
const GHOST = "#5ff0ff", AURA = "#7ff6ff", AURA_CORE = "#e8ffff", ENEMY_GHOST = "#ff6a5e"

/** Transparent layers the size of the scene, reused per context: ground decals and shots, which also mark emissive pixels. */
const glowLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
const glowLayer = (ctx: CanvasRenderingContext2D): CanvasRenderingContext2D => {
  let c = glowLayers.get(ctx)
  if (c === undefined) { c = document.createElement("canvas"); glowLayers.set(ctx, c) }
  if (c.width !== ctx.canvas.width) c.width = ctx.canvas.width
  if (c.height !== ctx.canvas.height) c.height = ctx.canvas.height
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, c.width, c.height)
  g.imageSmoothingEnabled = false
  return g
}

/** Fissures on a crate's front, more as it splinters (`amount` 0 to 1). */
const cracks = (ctx: CanvasRenderingContext2D, b: Pillar, P: (x: number, y: number, z?: number) => { x: number; y: number }, amount: number): void => {
  const near = P(b.x, b.y + b.h, PILLAR_HEIGHT), right = P(b.x + b.w, b.y + b.h), ground = P(b.x, b.y + b.h)
  const x0 = Math.round(near.x), y0 = Math.round(near.y), w = Math.round(right.x) - x0, face = Math.round(ground.y) - y0
  const count = Math.max(1, Math.round(amount * 3))
  for (let i = 0; i < count; i++) {
    const seed = decorationHash(Math.round(b.x * 10) + i, Math.round(b.y * 10), 7)
    const sx = x0 + Math.round(((i + 0.5) / count) * w) + ((seed % 5) - 2)
    // A jagged fissure from the top edge of the front down most of its height, with one short branch.
    const points = [{ x: sx, y: y0 }, { x: sx + 2, y: y0 + Math.round(face * 0.3) }, { x: sx - 1, y: y0 + Math.round(face * 0.55) }, { x: sx + 1, y: y0 + Math.round(face * 0.85) }]
    for (let k = 1; k < points.length; k++) pixelLine(ctx, points[k - 1]!, points[k]!, INK, 2)
    pixelLine(ctx, points[1]!, { x: points[1]!.x + ((seed >>> 4) % 2 === 0 ? 4 : -4), y: points[1]!.y + 3 }, INK, 1)
    ctx.fillStyle = "#c6a17a"; ctx.fillRect(sx + 1, y0 + 1, 1, 1)
  }
}

/** How this frame maps the floor to the canvas and back: where a floor point lands, and which floor point a canvas pixel shows. */
export interface Frame {
  readonly P: Project
  readonly floorAt: (sx: number, sy: number) => { readonly x: number; readonly y: number }
}

/** Draws the view; returns this frame's mapping, for overlays drawn after it and for turning a touch into a floor point. */
/** A second transparent layer the size of the scene, reused per context: floor marks kept at full light (see `keepLit`). */
const floorLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
const floorLayer = (ctx: CanvasRenderingContext2D): CanvasRenderingContext2D => {
  let c = floorLayers.get(ctx)
  if (c === undefined) { c = document.createElement("canvas"); floorLayers.set(ctx, c) }
  if (c.width !== ctx.canvas.width) c.width = ctx.canvas.width
  if (c.height !== ctx.canvas.height) c.height = ctx.canvas.height
  const g = c.getContext("2d", { willReadFrequently: true })!
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, c.width, c.height)
  g.imageSmoothingEnabled = false
  return g
}
/** The whole-pixel screen box round a floor point, `hw` by `hh` metres either side (and a body's height above, for what stands there). */
const screenArea = (P: (x: number, y: number, z?: number) => { x: number; y: number }, x: number, y: number, hw: number, hh: number): { x: number; y: number; w: number; h: number } => {
  const a = P(x - hw, y - hh, 1.6), b = P(x + hw, y + hh)
  const x0 = Math.max(0, Math.floor(a.x)), y0 = Math.max(0, Math.floor(a.y))
  return { x: x0, y: y0, w: Math.max(0, Math.ceil(b.x) - x0), h: Math.max(0, Math.ceil(b.y) - y0) }
}
const scratch = typeof document === "undefined" ? null : document.createElement("canvas")
/**
 * Floor marks (plates, wreckage) are painted on the floor, under everyone; then the pixels of them that nobody came
 * to stand over (unchanged since `bare`, taken before anyone was painted) go onto the emissive layer, so they keep full
 * light and colour while frozen time greys the rest, and never cover whoever stands on them.
 */
const keepLit = (ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, marks: CanvasRenderingContext2D, areas: ReadonlyArray<{ x: number; y: number; w: number; h: number }>, bare: ReadonlyArray<ImageData>): void => {
  if (scratch === null) return
  areas.forEach((a, i) => {
    const before = bare[i]
    if (before === undefined) return
    const after = ctx.getImageData(a.x, a.y, a.w, a.h).data, mark = marks.getImageData(a.x, a.y, a.w, a.h)
    const m = mark.data, was = before.data
    for (let j = 0; j < m.length; j += 4) {
      if (m[j + 3] === 0) continue
      if (after[j] !== was[j] || after[j + 1] !== was[j + 1] || after[j + 2] !== was[j + 2]) m[j + 3] = 0
    }
    if (scratch.width < a.w) scratch.width = a.w
    if (scratch.height < a.h) scratch.height = a.h
    const sc = scratch.getContext("2d", { willReadFrequently: true })!
    sc.clearRect(0, 0, scratch.width, scratch.height)
    sc.putImageData(mark, 0, 0)
    glow.drawImage(scratch, 0, 0, a.w, a.h, a.x, a.y, a.w, a.h)
  })
}

export const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, stick: Stick | null, camera: Camera, presentation: Presentation | null = null, lit = true): Frame => {
  // Margins are in source pixels, so short desktop/landscape views need smaller ones.
  const TOP = Math.min(32, Math.round(ch * 0.08)), BOTTOM = Math.min(42, Math.round(ch * 0.12))
  const u = unitFor(cw)
  // Screen semi-axes in px of a ground circle of 1 m radius.
  const erx = u, ery = u * SQUASH
  const { w, h } = view.room
  const centre = project(camera.x, camera.y, 0, u)
  // Keep the room's on-screen box (floor and back walls, plus a small margin) covering the view
  // where it can, so the camera never shows void past the room's edge; centre it when it is smaller.
  const corners = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, BACK_WALL], [w, 0, BACK_WALL], [0, h, BACK_WALL]] as const
  const sx = corners.map(([x, y, z]) => project(x, y, z, u).x), sy = corners.map(([x, y, z]) => project(x, y, z, u).y)
  const margin = u * 0.6
  const fit = (want: number, lo: number, hi: number, min: number, max: number): number => {
    const from = hi - max - margin, to = lo - min + margin
    return from > to ? (from + to) / 2 : Math.max(from, Math.min(to, want))
  }
  const deathAge = presentation?.playerDeathAge ?? -1
  // The screen shakes when you are hit, and a little when your cut lands (unless shake is off).
  const cutAge = presentation?.cutAge ?? -1
  // ...and a little when a crate bursts.
  const splinterAge = presentation?.splinterAge ?? -1
  const shake = !feelSettings().shake ? 0
    : deathAge >= 0 && deathAge < 0.25 ? Math.round(Math.sin(deathAge * 80) * 3 * (1 - deathAge / 0.25))
    : cutAge >= 0 && cutAge < CUT_SHAKE ? Math.round(Math.sin(cutAge * 90) * 2 * (1 - cutAge / CUT_SHAKE))
    : splinterAge >= 0 && splinterAge < CUT_SHAKE ? Math.round(Math.sin(splinterAge * 90) * 2 * (1 - splinterAge / CUT_SHAKE))
    : 0
  const cx = fit(cw / 2 - centre.x, 0, cw, Math.min(...sx), Math.max(...sx)) + shake
  const cy = fit(TOP + (ch - TOP - BOTTOM) / 2 - centre.y, TOP, ch - BOTTOM, Math.min(...sy), Math.max(...sy))
  const P = (x: number, y: number, z = 0): { x: number; y: number } => {
    const p = project(x, y, z, u)
    return { x: cx + p.x, y: cy + p.y }
  }
  // Bolts in flight are bullets on a lane: drawn exactly as shots are (body, trail, the dotted path ahead).
  const shots = [...view.shots, ...view.hazards.flatMap((hz, i) => {
    if (hz.kind !== "bolt" || !hz.live) return []
    // (Still in the barrel, on a screen where the launcher reaches past the lane's start: not out yet.)
    const lane = ROOMS[view.room.index]?.hazards?.[i]
    if (lane?.kind === "bolt") {
      const wall = lane.x2 < lane.x1 ? view.room.w : 0
      if (Math.abs((hz.ax + hz.bx) / 2 - wall) * u < LAUNCHER_REACH) return []
    }
    const len = Math.hypot(hz.bx - hz.ax, hz.by - hz.ay) || 1
    const speed = SHOTS.bullet.speed
    return [{ id: -1 - i, kind: "bullet" as const, x: (hz.ax + hz.bx) / 2, y: (hz.ay + hz.by) / 2, radius: SHOTS.bullet.radius, vx: ((hz.bx - hz.ax) / len) * speed, vy: ((hz.by - hz.ay) / len) * speed }]
  })]
  roomFloor(ctx, cw, ch, view, P)
  roomWalls(ctx, view, P, BACK_WALL)
  ctx.save()
  const floorStart = P(0, 0), floorEnd = P(w, h)
  ctx.beginPath(); ctx.rect(Math.round(floorStart.x), Math.round(floorStart.y), Math.round(floorEnd.x - floorStart.x), Math.round(floorEnd.y - floorStart.y)); ctx.clip()

  // A carved threshold with a fixed-size pixel rune.
  const goal = view.room.goal
  if (goal.kind === "exit") {
    const a = P(goal.x, goal.y), b = P(goal.x + goal.w, goal.y + goal.h)
    ctx.fillStyle = "#263234"; ctx.fillRect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y))
    pixelLine(ctx, a, { x: b.x, y: a.y }, EXIT)
    pixelLine(ctx, { x: a.x, y: b.y }, b, EXIT)
    pixelLine(ctx, a, { x: a.x, y: b.y }, "#4b5d50")
    pixelLine(ctx, { x: b.x, y: a.y }, b, "#4b5d50")
    sprite(ctx, "exit-rune", (a.x + b.x) / 2, (a.y + b.y) / 2 + 12)
    emitLight(ctx, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, radius: 2.6, colour: [125, 255, 154], intensity: 0.7, halo: { lift: 4, radius: 1.2, strength: 0.25 } })
  }
  // Open doors: a threshold in the lock's colour.
  for (const d of view.doors) {
    if (!d.open) continue
    const a = P(d.x, d.y), b = P(d.x + d.w, d.y + d.h)
    pixelLine(ctx, a, { x: b.x, y: a.y }, lockColour(d.lock), 1, 3)
    pixelLine(ctx, { x: a.x, y: b.y }, b, "#647373", 1, 3)
  }
  // Conveyor belts: a dark tread whose chevrons run in real time, the way it carries you.
  for (const belt of view.belts) conveyorBelt(ctx, P, belt)
  // Keys on the floor: a ring that pulls the eye.
  for (const k of view.keys) {
    if (k.state !== "floor") continue
    const p = P(k.x, k.y)
    pixelArc(ctx, p, 10, 5, 0, Math.PI * 2, keyColour(k.key), 1, true)
  }

  // Ground decals: where shots will pass, what each enemy covers, your reach.
  // Drawn on the glow layer: copied onto the scene, and kept at full light as threats.
  const glow = glowLayer(ctx)
  // Floor marks kept at full light (see `keepLit`): pressure plates, with the line to the gate each opens, and the
  // planks a burst crate leaves.
  const marks = floorLayer(ctx)
  view.plates.forEach((plate, i) => {
    pressurePlate(marks, ctx, P, plate, view.doors[plate.door] ?? null, presentation?.now ?? view.world)
    if (view.flow === "playing") plateBeacon(marks, P, plate, presentation?.pressAge(i) ?? -1, erx, presentation?.now ?? view.world)
  })
  for (const splinter of presentation?.splinters ?? []) crateWreck(marks, P, splinter)
  const markAreas = [
    ...view.plates.map((p) => screenArea(P, p.x, p.y, p.radius * 1.9, p.radius * 1.9)),
    ...(presentation?.splinters ?? []).map((sp) => screenArea(P, sp.x + sp.w / 2, sp.y + sp.h / 2, sp.w + 1.2, sp.h + 1.2))
  ].filter((a) => a.w > 0 && a.h > 0)
  if (markAreas.length > 0) ctx.drawImage(marks.canvas, 0, 0)
  if (view.flow === "playing") {
    const ctx = glow
    ctx.save()
    ctx.beginPath(); ctx.rect(Math.round(floorStart.x), Math.round(floorStart.y), Math.round(floorEnd.x - floorStart.x), Math.round(floorEnd.y - floorStart.y)); ctx.clip()
    for (const shot of shots) {
      const start = P(shot.x, shot.y), end = P(shot.x + shot.vx, shot.y + shot.vy)
      shotPath(ctx, start, end)
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      pathArrow(ctx, { x: start.x + (end.x - start.x) * 0.22, y: start.y + (end.y - start.y) * 0.22 }, angle, PATH)
    }
    for (const shot of shots) {
      const p = P(shot.x, shot.y)
      ctx.fillStyle = "#263234"; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y), 5, 2)
    }
    // Snipers' lasers: a dotted line that tracks you while it charges, solid and blinking once locked.
    for (const e of view.enemies) {
      const l = e.laser
      if (l === null) continue
      const from = P(e.x, e.y, 0.6), to = P(e.x + Math.cos(l.aim) * l.length, e.y + Math.sin(l.aim) * l.length, 0.6)
      if (l.locked) threatLine(ctx, from, to, true)
      else pixelLine(ctx, from, to, DANGER, 1, 3)
      pathArrow(ctx, { x: to.x - Math.cos(l.aim) * 10, y: to.y - Math.sin(l.aim) * 8 }, Math.atan2(to.y - from.y, to.x - from.x))
    }
    // Hazards: a blade's sweep on the floor; a laser gate's beam, faint when off, dashed when about to light, solid when on.
    // (Bolts are drawn with the shots.)
    for (const hz of view.hazards) {
      if (hz.kind === "bolt") continue
      if (hz.kind === "blade") {
        const centre = P((hz.ax + hz.bx) / 2, (hz.ay + hz.by) / 2), length = Math.hypot(hz.bx - hz.ax, hz.by - hz.ay) / 2
        pixelArc(ctx, centre, length * erx, length * ery, 0, Math.PI * 2, THREAT, 1, true)
        continue
      }
      const a = P(hz.ax, hz.ay, 0.5), b = P(hz.bx, hz.by, 0.5)
      if (hz.state === "on") { pixelLine(ctx, a, b, INK, 5); pixelLine(ctx, a, b, DANGER, 3); pixelLine(ctx, a, b, "#ffd0d0", 1) }
      else if (hz.state === "warn") threatLine(ctx, a, b, Math.floor(view.world * 12) % 2 === 0, 4)
      else pixelLine(ctx, a, b, "#647373", 1, 4)
    }
    // A lit bomb: its blast's reach on the floor, and a red sweep that fills as the fuse burns down.
    for (const b of view.bombs) {
      if (b.flying) continue
      const centre = P(b.x, b.y), rx = b.radius * erx, ry = b.radius * ery
      threatArc(ctx, centre, rx, ry, 0, Math.PI * 2, THREAT, 1, true)
      const burnt = 1 - b.fuse
      if (burnt > 0) threatArc(ctx, centre, rx, ry, -Math.PI / 2, -Math.PI / 2 + burnt * Math.PI * 2, b.fuse < 0.3 ? DANGER : THREAT, 2)
    }
    for (const e of view.enemies) {
      const m = e.melee
      const centre = P(e.x, e.y)
      const feet = { x: centre.x, y: centre.y + 1 }
      const footRadius = Math.round(e.radius * erx) + (m?.guarding ? 3 : 2)
      const ring = (start: number, end: number, colour: string, width = 1, segmented = false): void =>
        threatArc(ctx, feet, footRadius, Math.max(3, Math.round(footRadius * 0.4)), start, end, colour, width, segmented)
      if (e.kind === "runner") {
        ring(0, Math.PI * 2, e.sees ? "#edc66c" : "#947058", 1, true)
        continue
      }
      if (e.kind === "stalker") {
        // Its strike reach on the floor: red and whole while you are still enough for it to strike; faint and broken while you move.
        const awake = e.charge >= STALKER.wakes
        threatArc(ctx, centre, STALKER.reach * erx, STALKER.reach * ery, 0, Math.PI * 2, awake ? DANGER : "#9a638e", awake ? 2 : 1, !awake)
        continue
      }
      // A quiet enemy (First Cut's target) has no threat marks: its marks are the cut's, see `cutHint`.
      if (e.quiet) continue
      if (m === null) {
        reloadArc(ctx, feet, footRadius, Math.max(4, Math.round(footRadius * 0.4)), e.charge, e.charge > 0.8 ? THREAT : DANGER)
        continue
      }
      const rx = m.reach * erx, ry = m.reach * ery
      const active = m.phase === "windup" || m.phase === "swing"
      if (active) {
        pixelSector(ctx, centre, rx, ry, e.aim, m.arc, m.phase === "swing" ? "#edc66c" : "#80354d", m.locked ? 4 : 8)
        threatArc(ctx, centre, rx, ry, e.aim - m.arc, e.aim + m.arc, m.phase === "swing" ? "#f4efda" : DANGER, 2, !m.locked)
        for (const a of [e.aim - m.arc, e.aim + m.arc]) threatLine(ctx, centre, P(e.x + Math.cos(a) * m.reach, e.y + Math.sin(a) * m.reach), m.locked, m.locked ? 0 : 3)
        // The advancing line shows progress without covering the character art.
        if (m.phase === "windup" && m.locked) {
          const progress = Math.max(0, (m.progress - (1 - m.lockShare)) / m.lockShare)
          pixelArc(ctx, centre, rx * progress, ry * progress, e.aim - m.arc, e.aim + m.arc, "#e98a49")
        }
      } else if (m.phase === "chase" || m.phase === "idle") {
        pixelArc(ctx, centre, rx, ry, e.aim - m.arc, e.aim + m.arc, "#ad7950", 1, true)
      }
      // Guard up: a steel front and a gold open back. Recovering: open all round. Idle/chasing melee bodies need no foot dashes.
      if (m.guarding) {
        ring(e.aim - m.guardArc, e.aim + m.guardArc, "#c6d4df")
        ring(e.aim + m.guardArc, e.aim + Math.PI * 2 - m.guardArc, "#edc66c")
      } else if (m.phase !== "idle" && m.phase !== "chase") {
        ring(0, Math.PI * 2, m.phase === "recover" ? "#edc66c" : "#947058", 1, m.phase !== "recover")
      }
    }
    // Your cut's reach (not in a cutscene: nothing there says the character is yours).
    if (view.player !== null && !view.room.scene) {
      pixelArc(ctx, P(view.player.x, view.player.y), view.player.attackRange * erx, view.player.attackRange * ery, 0, Math.PI * 2, view.scale < 0.15 ? "#64b6b3" : "#647373", 1, true)
    }
    ctx.restore()
  }
  ctx.drawImage(glow.canvas, 0, 0)
  ctx.restore()

  // Everything standing, painted back to front; crates and walls by the box rule.
  type Thing = { readonly x: number; readonly y: number; readonly paint: () => void }
  const actors: Array<Thing> = []
  // The room's clockwork decoration (Time Door): lanterns swinging and wheels turning on the world clock.
  for (const d of ROOMS[view.room.index]?.decor ?? []) {
    actors.push({ x: d.x, y: d.y, paint: () => (d.kind === "pendulum" ? pendulum(ctx, P, d.x, d.y, view.world) : wheel(ctx, P, d.x, d.y, view.world)) })
  }
  // Afterimages of enemies on the move: time runs, and so do they (red, as what can hurt you is).
  for (const g of presentation?.enemyGhosts ?? []) {
    const age = presentation!.now - g.born
    const alpha = (1 - age / GHOST_LIFE) * g.strength * 0.5
    if (alpha <= 0.02) continue
    const spot = P(g.x, g.y)
    const body = bodyName(g.kind)
    actors.push({ x: g.x, y: g.y - 0.001, paint: () => { for (const c of [ctx, glow]) silhouette(c, body, spot.x, spot.y, g.flip, ENEMY_GHOST, alpha) } })
  }
  for (const e of view.enemies) {
    // A soft light at each enemy: in a dark room a threat is never lost between the torches.
    const lamp = P(e.x, e.y)
    emitLight(ctx, { x: lamp.x, y: lamp.y - 6, radius: 1.3, colour: [255, 214, 196], intensity: 0.75, shadows: false })
    // A stalker's eyes burn as you stand still.
    if (e.kind === "stalker") emitLight(ctx, { x: lamp.x, y: lamp.y - 14, radius: 1.1, colour: [100, 182, 179], intensity: 0.3 + 0.7 * e.charge, shadows: false })
    actors.push({
      x: e.x, y: e.y, paint: () => {
        const ground = P(e.x, e.y)
        // Once the room is over, weapons rest; except the blow that hit you, held at full length on the hit screen.
        const struck = view.flow === "dead" && e.melee !== null && e.melee.phase === "swing"
        const resting = view.flow !== "playing" && e.melee !== null ? { ...e, melee: { ...e.melee, phase: struck ? "swing" as const : "idle" as const, progress: struck ? 1 : 0 } } : e
        combatActor(ctx, resting, ground, view.flow === "playing" ? presentation?.firing(e, view.world) ?? -1 : -1)
        if (view.flow === "playing" && e.melee !== null) attackWave(ctx, e, P(e.x, e.y, 0.45), e.melee.reach * erx, e.melee.reach * ery)
        if (e.captain) {
          sprite(ctx, "crown", ground.x, ground.y - 17)
        }
        // The pip of the door it holds shut (the same square the door shows, one per enemy it waits on), floating
        // over its head: down it, and the pip goes, from here and from the door.
        if (e.holdsDoor && view.flow === "playing") {
          const bob = Math.round(Math.sin((presentation?.now ?? view.world) * 3 + e.id) * 1.5)
          for (const c of [ctx, glow]) doorPip(c, ground.x, ground.y - (e.captain ? 40 : 34) + bob)
        }
      }
    })
  }
  for (const shot of shots) {
    // Each bullet carries a little red light: a glow on the floor under it and round the round itself.
    if (shot.kind === "bullet") {
      const ground = P(shot.x, shot.y), body = P(shot.x, shot.y, 0.6)
      emitLight(ctx, { x: ground.x, y: ground.y, radius: 1.5, colour: [255, 110, 80], intensity: 0.9, shadows: false, halo: { lift: Math.round(ground.y - body.y), radius: 0.5, strength: 0.45 } })
    }
    const paintShot = (ctx: CanvasRenderingContext2D): void => {
      /** A line held at height z from (x, y) toward angle a. */
      const held = (x: number, y: number, a: number, from: number, to: number, z: number, colour: string, width: number): void => {
        const start = P(x + Math.cos(a) * from, y + Math.sin(a) * from, z)
        const end = P(x + Math.cos(a) * to, y + Math.sin(a) * to, z)
        pixelLine(ctx, start, end, "#171c2e", width + 1)
        pixelLine(ctx, start, end, colour, width)
      }
      {
        const a = Math.atan2(shot.vy, shot.vx)
        const z = 0.6
        if (shot.kind === "bullet") {
          // A small round: 1 px trail, a red body with a hot core, ringed in ink and a warm glowing rim so it pops off any floor.
          held(shot.x, shot.y, a + Math.PI, 0, 0.2, z, THREAT, 1)
          const p = P(shot.x, shot.y, z)
          disc(ctx, p.x, p.y, 3, "#ff9a80")
          disc(ctx, p.x, p.y, 2, INK)
          disc(ctx, p.x, p.y, 1, DANGER)
          pixelLine(ctx, p, p, "#fff2dc", 1)
        } else if (shot.kind === "slug") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.36, z, DANGER, 1)
          held(shot.x, shot.y, a, -0.1, 0.12, z, THREAT, 3)
          held(shot.x, shot.y, a, 0, 0.1, z, "#f4efda", 1)
        } else if (shot.kind === "arrow") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.36, z, THREAT, 1)
          held(shot.x, shot.y, a, -0.05, 0.14, z, DANGER, 2)
          for (const side of [-0.6, 0.6]) held(shot.x, shot.y, a + Math.PI + side, 0.26, 0.38, z, THREAT, 1)
        } else {
          held(shot.x, shot.y, a, -0.14, 0.14, z, DANGER, 2)
          held(shot.x, shot.y, a, 0, 0.14, z, "#f4efda", 1)
        }
      }
    }
    actors.push({ x: shot.x, y: shot.y, paint: () => { paintShot(ctx); paintShot(glow) } })
  }
  // Clearing the room: you vanish, ninja-style. Past the first frames your body is gone.
  const vanish = presentation?.vanish ?? null
  const vanishAge = vanish === null ? -1 : presentation!.now - vanish.born
  if (vanish !== null && vanishAge < VANISH_LIFE) {
    actors.push({ x: vanish.x, y: vanish.y, paint: () => { vanishBurst(ctx, P(vanish.x, vanish.y), vanish.flip, vanishAge); vanishBurst(glow, P(vanish.x, vanish.y), vanish.flip, vanishAge) } })
  }
  // Starting the room: you appear, the vanish played backwards (smoke gathering, afterimages closing in, the glow
  // settling), where you are. Your body shows once it has gathered.
  const appearAge = presentation?.appearAge ?? -1
  const appearing = appearAge >= 0 && view.player !== null ? VANISH_LIFE * (1 - appearAge / APPEAR_LIFE) : -1
  if (appearing >= 0 && view.player !== null) {
    const p = view.player, flip = p.vx < 0
    actors.push({ x: p.x, y: p.y, paint: () => { vanishBurst(ctx, P(p.x, p.y), flip, appearing); vanishBurst(glow, P(p.x, p.y), flip, appearing) } })
  }
  if (view.player !== null && view.flow !== "dead" && !(vanish !== null && vanishAge > VANISH_POP) && !(appearing > VANISH_POP)) {
    const p = view.player
    const at = P(p.x, p.y)
    const body = bodyName("player")
    // Speed shows on the assassin: the faster the world runs, the more it glows, sparks and leaves itself behind.
    const k = view.flow === "playing" ? speedOf(view) : 0
    // A light of your own, so you never vanish into the dark; it brightens and turns teal with speed.
    emitLight(ctx, {
      x: at.x, y: at.y, radius: 2.8 + k * 1.4, colour: [Math.round(200 - 120 * k), 236, Math.round(230 + 25 * k)], intensity: 0.6 + 0.4 * k,
      ...(k > 0.25 ? { halo: { lift: 11, radius: 0.5 + 0.6 * k, strength: 0.22 * k } } : {})
    })
    // Afterimages: teal silhouettes where you were, fading in real time; emissive, so they glow in the dark.
    for (const g of presentation?.ghosts ?? []) {
      const age = presentation!.now - g.born
      const alpha = (1 - age / GHOST_LIFE) * g.strength * 0.7
      if (alpha <= 0.02 || Math.hypot(g.x - p.x, g.y - p.y) < 0.12) continue
      const spot = P(g.x, g.y)
      actors.push({ x: g.x, y: g.y - 0.001, paint: () => { for (const c of [ctx, glow]) silhouette(c, body, spot.x, spot.y, g.flip, GHOST, alpha) } })
    }
    actors.push({
      x: p.x, y: p.y, paint: () => {
        const speed = Math.hypot(p.vx, p.vy)
        const ground = P(p.x, p.y)
        const flip = p.vx < 0
        sprite(ctx, "shadow", ground.x + 2, ground.y + 3)
        const bob = speed > 0.1 ? Math.round(Math.sin((p.x + p.y) * 9)) : 0
        const y = ground.y - bob
        // Over your head, where the eyes are: a pause sign while the world waits, a play sign as soon as it runs at
        // all (a slow walk included). On the glow layer too, so frozen time does not grey it.
        if (view.flow === "playing" && !view.room.scene) for (const c of [ctx, glow]) paceSign(c, ground.x, y - 38, view.scale > view.slow)
        if (k > 0.3) {
          // The aura: a 1 px electric outline that flickers, thicker and steadier the faster you go.
          const strength = (k - 0.3) / 0.7, frame = Math.floor((presentation?.now ?? view.world) * 24)
          const offsets: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
          for (const c of [ctx, glow]) {
            offsets.forEach(([dx, dy], i) => {
              if (i >= 4 && strength < 0.5) return
              if (decorationHash(i, frame, 3) % 5 === 0) return
              silhouette(c, body, ground.x + dx, y + dy, flip, AURA, 0.45 + 0.55 * strength)
            })
            if (strength > 0.6) silhouette(c, body, ground.x, y, flip, AURA_CORE, 0.18 * strength)
          }
          // Sparks shed behind you, against the way you run.
          const back = Math.atan2(-p.vy * SQUASH, -p.vx)
          for (let i = 0; i < 4; i++) {
            const h = decorationHash(i, frame, 11)
            if (h % 3 === 0 && strength < 0.7) continue
            const r = 6 + (h % 9), a = back + ((h >>> 4) % 9 - 4) * 0.18
            const sx = ground.x + Math.cos(a) * r, sy = y - 10 + Math.sin(a) * r * 0.8 + ((h >>> 8) % 11) - 5
            for (const c of [ctx, glow]) { c.fillStyle = (h >>> 12) % 3 === 0 ? AURA_CORE : AURA; c.fillRect(Math.round(sx), Math.round(sy), (h >>> 14) % 2 === 0 ? 2 : 1, 1) }
          }
        }
        posedSprite(ctx, body, ground.x, y, { flip })
      }
    })
  }
  // A launcher bolted to the wall behind the start of each bullet lane (the lane starts at its barrel's tip), so the
  // bullets come from somewhere; it flashes as one leaves.
  const lanes = new Map<string, Extract<Hazard, { kind: "bolt" }>>()
  for (const hz of ROOMS[view.room.index]?.hazards ?? []) if (hz.kind === "bolt") lanes.set(`${hz.x1},${hz.y1}`, hz)
  for (const lane of lanes.values()) {
    const firing = view.hazards.some((hz) => hz.kind === "bolt" && hz.live && Math.hypot((hz.ax + hz.bx) / 2 - lane.x1, (hz.ay + hz.by) / 2 - lane.y1) < 0.9)
    const flip = lane.x2 < lane.x1
    const wall = flip ? view.room.w : 0
    actors.push({
      x: wall, y: lane.y1 - 0.01, paint: () => {
        const muzzle = P(wall, lane.y1, 0.6)
        // The plate sits on the wall and the barrel's centre row is at bullet height.
        // On the glow layer too, like every threat: it keeps its colour while time is frozen.
        for (const c of [ctx, glow]) sprite(c, firing ? "bolt-launcher-fire" : "bolt-launcher", muzzle.x + (flip ? -11 : 11), muzzle.y + 12, flip)
        if (firing) emitLight(ctx, { x: muzzle.x + (flip ? -22 : 22), y: muzzle.y, radius: 1.2, colour: [255, 150, 70], intensity: 0.7, shadows: false, halo: { lift: 0, radius: 0.4, strength: 0.25 } })
      }
    })
  }
  for (const hz of view.hazards) {
    if (hz.kind === "bolt") continue
    if (hz.kind === "blade") {
      const cxw = (hz.ax + hz.bx) / 2, cyw = (hz.ay + hz.by) / 2
      // The bar is a threat: painted on the glow layer too, so the lighting never hides it.
      actors.push({ x: cxw, y: cyw, paint: () => { spinningBlade(ctx, P, hz); spinningBlade(glow, P, hz) } })
      continue
    }
    for (const [x, y] of [[hz.ax, hz.ay], [hz.bx, hz.by]] as const) {
      actors.push({
        x, y, paint: () => {
          laserPost(ctx, P, x, y, hz.state)
        }
      })
    }
  }
  for (const b of view.bombs) {
    actors.push({
      x: b.x, y: b.y, paint: () => {
        bombActor(ctx, P, b, view.world)
      }
    })
  }
  for (const death of presentation?.deaths ?? []) {
    actors.push({ x: death.x, y: death.y, paint: () => dyingActor(ctx, death, P(death.x, death.y), presentation!.now - death.born) })
  }
  // A burst is drawn at full light too (like the blades), so the room's shadow never hides it.
  for (const splinter of presentation?.splinters ?? []) {
    const age = presentation!.now - splinter.born
    if (age < SPLINTER_LIFE) actors.push({ x: splinter.x + splinter.w / 2, y: splinter.y + splinter.h + 0.02, paint: () => { crateBurst(ctx, P, splinter, PILLAR_HEIGHT, age); crateBurst(glow, P, splinter, PILLAR_HEIGHT, age, false) } })
  }
  for (const impact of presentation?.impacts ?? []) {
    actors.push({ x: impact.x, y: impact.y + 0.01, paint: () => impactBurst(ctx, impact, P(impact.x, impact.y, 0.55), presentation!.now - impact.born) })
  }
  for (const k of view.keys) {
    // Carried over a runner's head, held over yours, or lying on the floor.
    const z = k.state === "floor" ? 0.35 : k.state === "carried" ? 1.35 : 1.5
    actors.push({
      x: k.x, y: k.y + 0.01, paint: () => {
        const p = P(k.x, k.y, z + (k.state === "floor" ? 0.08 * Math.sin(view.world * 5) : 0))
        // The room's prize: at full colour (on the glow layer too), even while frozen time greys the rest.
        for (const c of [ctx, glow]) keyGlyph(c, p.x, p.y)
      }
    })
  }
  type Box = Pillar & { readonly material: Material; readonly edge: string; readonly emblem: ((x: number, y: number) => void) | null; readonly damage: number; readonly lift?: number | undefined }
  const doorBoxes = view.doors.flatMap((d): Array<Box> => {
    if (d.open) return []
    const colour = lockColour(d.lock)
    const emblem = (x: number, y: number): void => {
      if (d.lock.kind === "key") keyGlyph(ctx, x, y)
      else if (d.lock.kind === "captain") crownGlyph(ctx, x, y + u * 0.14)
      else if (d.lock.kind === "time") {
        // (Its timer is drawn over the lit scene, see `doorTimer`, so a frozen world does not grey it out.)
      } else if (d.lock.kind === "plates") {
        // One square per plate, lit as each goes down.
        const n = d.lock.plates.length, gap = u * 0.24, left = n - d.waiting
        for (let i = 0; i < n; i++) {
          const px = Math.round(x + (i - (n - 1) / 2) * gap), py = Math.round(y)
          ctx.fillStyle = INK; ctx.fillRect(px - 2, py - 2, 5, 5)
          ctx.fillStyle = i < left ? PLATE : "#29334b"; ctx.fillRect(px - 1, py - 1, 3, 3)
        }
      } else {
        // One pip per enemy the door still waits on.
        const n = d.waiting, gap = u * 0.24
        for (let i = 0; i < n; i++) {
          doorPip(ctx, x + (i - (n - 1) / 2) * gap, y)
        }
      }
    }
    // A time door's portcullis rises over its last few seconds (on the world clock), and is gone when it opens.
    const lift = d.lock.kind === "time" ? riseOf(d.lock.seconds, view.world) : undefined
    return [{ x: d.x, y: d.y, w: d.w, h: d.h, material: "gate", edge: colour, emblem, damage: 0, lift }]
  })
  const boxes: Array<Box> = [
    // Wood is what breaks under fire; everything else is stone.
    ...view.cover.map((c): Box => ({
      x: c.x, y: c.y, w: c.w, h: c.h, material: c.kind === "crate" ? "wood" : "stone", edge: "#899692", emblem: null,
      damage: c.kind === "crate" ? 1 - c.hits / c.maxHits : 0
    })),
    ...doorBoxes
  ].sort((a, b) => a.y + a.h - (b.y + b.h))
  // Each actor goes right after the last box it stands in front of.
  const slots: Array<Array<Thing>> = boxes.map(() => [])
  const first: Array<Thing> = []
  for (const a of actors) {
    let slot = -1
    boxes.forEach((b, i) => { if (inFront(a.y, b)) slot = i })
    ;(slot === -1 ? first : slots[slot] ?? first).push(a)
  }
  const paintAll = (things: Array<Thing>): void => {
    for (const t of things.sort((a, b) => a.y - b.y)) t.paint()
  }
  // What the floor marks look like before anyone stands on them (see `keepLit`).
  const bare = markAreas.map((a) => ctx.getImageData(a.x, a.y, a.w, a.h))
  paintAll(first)
  boxes.forEach((b, i) => {
    if (b.lift !== undefined) portcullis(ctx, b, P, PILLAR_HEIGHT, b.lift)
    else raisedBlock(ctx, b, P, PILLAR_HEIGHT, b.material, b.edge, view.world)
    if (b.damage > 0) cracks(ctx, b, P, b.damage)
    if (b.emblem !== null) {
      const c = P(b.x + b.w / 2, b.y + b.h / 2, PILLAR_HEIGHT)
      b.emblem(c.x, c.y)
    }
    paintAll(slots[i] ?? [])
  })
  keepLit(ctx, glow, marks, markAreas, bare)

  if (lit) {
    const t = Math.max(0, Math.min(1, (view.scale - view.slow) / (1 - view.slow)))
    const mixc = (i: number): number => Math.round(AMBIENT_FROZEN[i]! + (AMBIENT_RUNNING[i]! - AMBIENT_FROZEN[i]!) * t)
    applyLighting(ctx, {
      P, u, squash: SQUASH,
      toFloor: (sx, sy) => ({ x: (sx - cx) / u, y: (sy - cy) / (u * SQUASH) }),
      blockers: [...view.cover, ...view.doors.filter((d) => !d.open)],
      blockerHeight: PILLAR_HEIGHT,
      backWall: BACK_WALL,
      room: view.room,
      ambient: [mixc(0), mixc(1), mixc(2)]
    }, glow.canvas)
  } else discardLights(ctx)

  // Frozen time drains the world of colour; only what can hurt you (shots, lines, lasers) and your own glow keep theirs.
  // Moving floods it back. The emissive layer is laid back over the grey, so threats stay vivid.
  if (view.flow === "playing") {
    const still = 1 - speedOf(view)
    if (still > 0.05) {
      ctx.save()
      ctx.globalCompositeOperation = "saturation"
      ctx.globalAlpha = Math.min(1, still * 0.9)
      ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, cw, ch)
      ctx.restore()
      ctx.drawImage(glow.canvas, 0, 0)
    }
  }
  // A hit, screen-wide: a hard red flash, then the world drains to grey under a red vignette while you are down.
  if (view.flow === "dead" && deathAge >= 0) {
    ctx.save()
    ctx.globalCompositeOperation = "saturation"
    ctx.globalAlpha = Math.min(1, deathAge / 0.15)
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, cw, ch)
    ctx.restore()
    const r = Math.hypot(cw, ch) / 2
    const red = ctx.createRadialGradient(cw / 2, ch / 2, r * 0.3, cw / 2, ch / 2, r)
    red.addColorStop(0, "rgba(206,70,85,0)")
    red.addColorStop(1, "rgba(206,70,85,0.6)")
    ctx.fillStyle = red; ctx.fillRect(0, 0, cw, ch)
    if (deathAge < 0.3 && feelSettings().flash) { ctx.fillStyle = `rgba(255,64,85,${(0.6 * (1 - deathAge / 0.3)).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch) }
    // The shot that took you hangs where it struck: a gold ring round it, pulsing, so the hit screen's words have a referent.
    if (view.death?.by === "shot" && view.player !== null && deathAge >= 0.3) {
      const p = view.player
      const culprit = [...shots].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
      if (culprit !== undefined) {
        const at = P(culprit.x, culprit.y, 0.6)
        const r = 9 + Math.round((Math.sin(deathAge * 5) + 1) * 2)
        pixelArc(ctx, at, r, r, 0, Math.PI * 2, INK, 3)
        pixelArc(ctx, at, r, r, 0, Math.PI * 2, "#edc66c", 1)
      }
    }
  }
  // Dust in the air drifts on the world's clock: it hangs when you stop and streams when you run.
  motes(ctx, view, P)
  // The exit is a beacon: a column of light and a bouncing arrow over the pad.
  if (view.room.goal.kind === "exit" && view.flow === "playing") exitBeacon(ctx, view.room.goal, P, erx, presentation?.now ?? view.world)

  // Frozen time closes in: a cold vignette, as strong as the world is still.
  if (view.flow === "playing") {
    const still = 1 - speedOf(view)
    if (still > 0.05) {
      const r = Math.hypot(cw, ch) / 2
      const g = ctx.createRadialGradient(cw / 2, ch / 2, r * 0.45, cw / 2, ch / 2, r)
      g.addColorStop(0, "rgba(14,22,52,0)")
      g.addColorStop(1, `rgba(14,22,52,${(0.62 * still).toFixed(3)})`)
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch)
    }
  }
  // The moment you stop dead: two cold rings burst out across the floor as the world freezes.
  for (const stop of presentation?.stops ?? []) {
    const age = presentation!.now - stop.born
    for (const [lag, colour] of [[0, "#e8f6ff"], [0.08, "#7fd8ff"]] as const) {
      const t = (age - lag) / (STOP_LIFE - lag)
      if (t <= 0 || t >= 1) continue
      const reach = (1 - (1 - t) * (1 - t)) * 3.4
      const centre = P(stop.x, stop.y)
      pixelArc(ctx, centre, reach * erx, reach * ery, 0, Math.PI * 2, INK, t < 0.5 ? 3 : 2, t > 0.55)
      pixelArc(ctx, centre, reach * erx, reach * ery, 0, Math.PI * 2, colour, t < 0.5 ? 1 : 1, t > 0.55)
    }
  }
  // A time door's timer, over the lit scene: the seconds left, counting down only while you move (gold, with a play
  // sign) and waiting while you are still (ice, with a pause sign); under them a bar filling to the open.
  // (Only the next shut one shows its timer: one count at a time.)
  for (const d of view.doors.filter((door) => !door.open && door.lock.kind === "time").slice(0, 1)) {
    if (d.lock.kind !== "time" || view.flow !== "playing") continue
    const top = P(d.x + d.w / 2, d.y + d.h, PILLAR_HEIGHT * (1 - riseOf(d.lock.seconds, view.world)))
    // (Up under the top bar, it would sit over the HUD: it shows once the door is on screen.)
    if (top.y < TOP + 30) continue
    doorTimer(ctx, top.x, top.y - 4, Math.max(0, d.lock.seconds - view.world), view.world / d.lock.seconds, speedOf(view) > 0.15, presentation?.now ?? 0, Math.round(u * 1.6))
    // Over the timer, quietly: what it waits on. (At its foot, it sat under you while you waited there.)
    takesTime(ctx, top.x, top.y - 40)
  }
  // The cut's room marks what to run into.
  if (view.room.name === "First Cut" && view.flow === "playing" && view.player !== null && presentation !== null) {
    cutHint(ctx, view, P, presentation.now)
  }
  // An occluded player keeps an ivory marker above cover.
  if (view.player !== null && view.flow !== "dead") {
    const p = view.player
    if (boxes.some(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y - 1 && p.y < b.y + b.h)) {
      const g = P(p.x, p.y)
      for (const x of [-10, 10]) for (const y of [-23, 0]) {
        const corner = { x: g.x + x, y: g.y + y }
        pixelLine(ctx, corner, { x: corner.x - Math.sign(x) * 3, y: corner.y }, "#f4efda")
        pixelLine(ctx, corner, { x: corner.x, y: corner.y + (y < 0 ? 3 : -3) }, "#f4efda")
      }
    }
  }

  // Cuts, at chest height; a blow a guard stopped throws sparks instead.
  for (const c of view.slashes) {
    if (!c.blocked) continue
    const centre = P(c.x, c.y, 0.6)
    if (c.age < 0.2) {
      const radius = c.age < 0.1 ? 7 : 4
      for (const a of [0, Math.PI / 2]) {
        const from = { x: centre.x - Math.cos(a) * radius, y: centre.y - Math.sin(a) * radius }
        const to = { x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius }
        pixelLine(ctx, from, to, INK, 5); pixelLine(ctx, from, to, c.age < 0.1 ? "#f4efda" : "#ff6845", 3)
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = c.angle + Math.PI + (i - 2.5) * 0.45
      const r0 = 4 + c.age * 6, r1 = 9 + c.age * 12
      const from = { x: centre.x + Math.cos(a) * r0, y: centre.y + Math.sin(a) * r0 * SQUASH }, to = { x: centre.x + Math.cos(a) * r1, y: centre.y + Math.sin(a) * r1 * SQUASH }
      pixelLine(ctx, from, to, INK, 4)
      pixelLine(ctx, from, to, c.age < 0.5 ? "#edc66c" : "#e98a49", 2)
    }
  }
  for (const c of presentation === null ? view.slashes.filter((s) => !s.blocked) : []) {
    const t = c.age
    const centre = P(c.x, c.y, 0.6), radius = 12 + t * 9
    pixelArc(ctx, centre, radius, radius * SQUASH, c.angle - 1.2 + t, c.angle + 1.2 + t, "#171c2e", t < 0.45 ? 4 : 2)
    pixelArc(ctx, centre, radius, radius * SQUASH, c.angle - 1.2 + t, c.angle + 1.2 + t, t < 0.3 ? "#f4efda" : t < 0.65 ? "#c6d4df" : "#8996b0", t < 0.45 ? 2 : 1)
    if (t < 0.25) sprite(ctx, "spark", centre.x, centre.y + 8)
  }

  // Blasts: a hot flash over its reach, then a ring of smoke pushing out.
  for (const b of view.blasts) {
    const centre = P(b.x, b.y, 0.2), t = b.age
    const rx = b.radius * erx * (0.55 + 0.45 * t), ry = b.radius * ery * (0.55 + 0.45 * t)
    if (t < 0.35) {
      emitLight(ctx, { x: centre.x, y: centre.y, radius: 3.5, colour: [255, 200, 120], intensity: 1 - t / 0.35, shadows: false })
      pixelArc(ctx, centre, rx * 0.6, ry * 0.6, 0, Math.PI * 2, t < 0.15 && feelSettings().flash ? "#f4efda" : "#edc66c", 4)
    }
    pixelArc(ctx, centre, rx, ry, 0, Math.PI * 2, INK, 4, true)
    pixelArc(ctx, centre, rx, ry, 0, Math.PI * 2, t < 0.4 ? "#e98a49" : "#899692", 2, true)
  }

  // The exit, when it is off screen: a green arrow at the edge pointing to it.
  if (view.room.goal.kind === "exit" && view.flow === "playing") {
    const g = view.room.goal, sp = P(g.x + g.w / 2, g.y + g.h / 2)
    if (sp.x < 0 || sp.x > cw || sp.y < TOP || sp.y > ch - BOTTOM) {
      const mx = cw / 2, my = TOP + (ch - TOP - BOTTOM) / 2, dx = sp.x - mx, dy = sp.y - my
      const k = Math.min((cw / 2 - 16) / Math.abs(dx || 1e-6), ((ch - TOP - BOTTOM) / 2 - 16) / Math.abs(dy || 1e-6))
      const a = Math.atan2(dy, dx), x = mx + dx * k, y = my + dy * k
      const tip = { x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6 }
      for (const side of [-1, 1]) {
        const end = { x: x - Math.cos(a) * 4 + Math.sin(a) * side * 5, y: y - Math.sin(a) * 4 - Math.cos(a) * side * 5 }
        pixelLine(ctx, tip, end, INK, 5); pixelLine(ctx, tip, end, "#7dff9a", 3)
      }
    }
  }
  // Enemies off screen (and not shut away behind a door): a marker at the edge, bright when it can see you.
  const pad = 14
  const midX = cw / 2, midY = TOP + (ch - TOP - BOTTOM) / 2
  for (const e of view.enemies) {
    if (e.sealed) continue
    const sp = P(e.x, e.y, 0.6)
    if (sp.x >= 0 && sp.x <= cw && sp.y >= TOP && sp.y <= ch - BOTTOM) continue
    const dx = sp.x - midX, dy = sp.y - midY
    const k = Math.min((cw / 2 - pad) / Math.abs(dx || 1e-6), ((ch - TOP - BOTTOM) / 2 - pad) / Math.abs(dy || 1e-6))
    const a = Math.atan2(dy, dx), x = midX + dx * k, y = midY + dy * k
    const tip = { x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4 }
    const colour = e.kind === "runner" ? "#edc66c" : e.kind === "stalker" ? "#9a638e" : e.sees ? DANGER : THREAT
    for (const side of [-1, 1]) {
      const end = { x: x - Math.cos(a) * 3 + Math.sin(a) * side * 3, y: y - Math.sin(a) * 3 - Math.cos(a) * side * 3 }
      pixelLine(ctx, tip, end, INK, 4); pixelLine(ctx, tip, end, colour, 2)
    }
  }

  // The thumb-stick under your finger, drawn as the lesson draws it.
  if (stick !== null && view.flow === "playing") thumbPad(ctx, { x: stick.ox, y: stick.oy }, stick, stick.reach)

  // Messages: a hit, or a clear with its stars (pixel-styled page elements, see `hud.ts`).
  messages(ctx, view, presentation)
  return { P, floorAt: (sx, sy) => ({ x: (sx - cx) / u, y: (sy - cy) / (u * SQUASH) }) }
}
