/**
 * Drawing the fight view onto a 2D canvas in a projected, standing-up view:
 * the floor and decals flat on the ground, crates and walls as boxes, people
 * as 24-pixel sprites, all painted back to front. The simulation stays flat
 * 2D; only this file knows about height.
 */
import type { Lock, Pillar } from "../sim/rooms.ts"
import { STALKER } from "../sim/tuning.ts"
import type { FightView } from "../sim/view.ts"
import { posedSprite, sprite, spriteImage, type Sprite } from "./art.ts"
import { attackWave, bodyName, bombActor, combatActor, dyingActor, impactBurst } from "./combat-art.ts"
import { CALLOUT_LIFE, GHOST_LIFE, STOP_LIFE, speedOf, type Presentation } from "./fx.ts"
import { messages } from "./hud.ts"
import { decorationHash, pixelArc, pixelLine, pixelSector } from "./pixels.ts"
import { conveyorBelt, laserPost, pressurePlate, raisedBlock, roomFloor, roomWalls, spinningBlade, type Material } from "./room-art.ts"
import { applyLighting, discardLights, emitLight, type Rgb } from "./lighting.ts"
import { DANGER, THREAT, pathArrow, reloadArc, shotPath, threatArc, threatLine } from "./threats.ts"

export interface Stick { ox: number; oy: number; x: number; y: number; reach: number }

const PILLAR_HEIGHT = 1.2
const BACK_WALL = 1.6

/**
 * How world metres land on screen: the room stays upright and the camera
 * leans back a little (Pokémon-style), so you see mostly tops with short
 * fronts. Floor depth is squashed to SQUASH; heights are drawn at RISE of
 * their size.
 */
const SQUASH = 0.78
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

  /** Snaps to the player next frame: on a new room. */
  reset(): void {
    this.placed = false
  }
}

/** Each key and its door share a colour. */
const KEY_COLOURS = ["#5fd4ff", "#c18cff", "#7dff9a"] as const
export const keyColour = (key: number): string => KEY_COLOURS[key % KEY_COLOURS.length] ?? "#5fd4ff"

const PLATE = "#64b6b3"

/** What a door looks like by its lock: steel for a chamber, gold for a captain, the key's colour for a key, teal for plates. */
const lockColour = (lock: Lock): string => (lock.kind === "clear" ? "#9fb4d8" : lock.kind === "captain" ? "#ffd25a" : lock.kind === "plates" ? PLATE : keyColour(lock.key))


const EXIT = "#7dff9a"

/** A key glyph in screen pixels: a ring, a shaft, two teeth. */
const keyGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string): void => {
  const cx = Math.round(x - s * 0.55), cy = Math.round(y), r = Math.max(2, Math.round(s * 0.42))
  ctx.fillStyle = "#171c2e"; ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 3, r * 2 + 3)
  ctx.fillStyle = colour; ctx.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1)
  ctx.fillStyle = "#171c2e"; ctx.fillRect(cx - r + 1, cy - r + 1, r * 2 - 1, r * 2 - 1)
  const end = Math.round(x + s)
  pixelLine(ctx, { x: cx + r + 1, y: cy }, { x: end, y: cy }, "#171c2e", 4)
  pixelLine(ctx, { x: cx + r + 1, y: cy }, { x: end, y: cy }, colour, 2)
  for (const xx of [end - 3, end]) {
    pixelLine(ctx, { x: xx, y: cy }, { x: xx, y: cy + 3 }, "#171c2e", 3)
    pixelLine(ctx, { x: xx, y: cy }, { x: xx, y: cy + 3 }, colour)
  }
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
const silhouette = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, flip: boolean, colour: string, alpha: number): void => {
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
const hand = (ctx: CanvasRenderingContext2D, x: number, y: number, pressed: boolean): void => {
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
/** Touch or keys: the hint says what this device does. */
const touchFirst = (): boolean => typeof window !== "undefined" && !window.matchMedia("(pointer: fine)").matches
/**
 * The first room's lesson, looped every 2.4 real s beside the player: press (a ring), drag up (the hand rises,
 * a dotted trail behind it: "drag to move"), then lift (the hand lets go: "let go = freeze").
 */
const dragHint = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, now: number): void => {
  const t = (now % 2.4) / 2.4
  const start = { x: Math.round(at.x + 24), y: Math.round(at.y + 4) }, travel = 34
  const rise = t < 0.15 ? 0 : t < 0.6 ? (t - 0.15) / 0.45 : 1
  const eased = 1 - (1 - rise) * (1 - rise)
  const tip = { x: start.x, y: start.y - Math.round(travel * eased) }
  const pressed = t < 0.62
  const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1
  ctx.save()
  ctx.globalAlpha = fade
  if (t < 0.2) {
    pixelArc(ctx, start, 4 + t * 40, 3 + t * 28, 0, Math.PI * 2, INK, 3)
    pixelArc(ctx, start, 4 + t * 40, 3 + t * 28, 0, Math.PI * 2, "#7fd8ff", 1)
  }
  if (rise > 0) {
    pixelLine(ctx, start, { x: tip.x, y: tip.y + 2 }, INK, 3, 2)
    pixelLine(ctx, start, { x: tip.x, y: tip.y + 2 }, "#7fd8ff", 1, 2)
  }
  hand(ctx, tip.x, tip.y, pressed)
  ctx.textAlign = "center"; ctx.textBaseline = "top"
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const label = t < 0.62 ? (touchFirst() ? "DRAG TO MOVE" : "ARROWS TO MOVE") : "LET GO = FREEZE"
  // Above you, in the open floor you are about to cross.
  const ly = Math.round(at.y - 44)
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(label, at.x + dx, ly + dy)
  ctx.fillStyle = t < 0.62 ? "#f4efda" : "#7fd8ff"
  ctx.fillText(label, at.x, ly)
  ctx.restore()
}

/** The speed effect's colours: afterimages, the aura's outline and its hot core. */
const GHOST = "#5ff0ff", AURA = "#7ff6ff", AURA_CORE = "#e8ffff"

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

/** Fissures on a block's front: a cracked wall shows them all (with an orange glint: it will give); a crate shows more as it splinters (`amount` 0 to 1). */
const cracks = (ctx: CanvasRenderingContext2D, b: Pillar, P: (x: number, y: number, z?: number) => { x: number; y: number }, amount: number, cracked: boolean): void => {
  const near = P(b.x, b.y + b.h, PILLAR_HEIGHT), right = P(b.x + b.w, b.y + b.h), ground = P(b.x, b.y + b.h)
  const x0 = Math.round(near.x), y0 = Math.round(near.y), w = Math.round(right.x) - x0, face = Math.round(ground.y) - y0
  const count = cracked ? Math.max(2, Math.round(w / 18)) : Math.max(1, Math.round(amount * 3))
  for (let i = 0; i < count; i++) {
    const seed = decorationHash(Math.round(b.x * 10) + i, Math.round(b.y * 10), 7)
    const sx = x0 + Math.round(((i + 0.5) / count) * w) + ((seed % 5) - 2)
    // A jagged fissure from the top edge of the front down most of its height, with one short branch.
    const points = [{ x: sx, y: y0 }, { x: sx + 2, y: y0 + Math.round(face * 0.3) }, { x: sx - 1, y: y0 + Math.round(face * 0.55) }, { x: sx + 1, y: y0 + Math.round(face * 0.85) }]
    for (let k = 1; k < points.length; k++) pixelLine(ctx, points[k - 1]!, points[k]!, INK, 2)
    pixelLine(ctx, points[1]!, { x: points[1]!.x + ((seed >>> 4) % 2 === 0 ? 4 : -4), y: points[1]!.y + 3 }, INK, 1)
    if (cracked) { ctx.fillStyle = "#e98a49"; ctx.fillRect(sx, y0 + 1, 1, 2); ctx.fillRect(points[2]!.x + 1, points[2]!.y, 1, 1) }
    else { ctx.fillStyle = "#c6a17a"; ctx.fillRect(sx + 1, y0 + 1, 1, 1) }
  }
}

export const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, stick: Stick | null, camera: Camera, presentation: Presentation | null = null, lit = true): void => {
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
  const shake = deathAge >= 0 && deathAge < 0.12 ? Math.round(Math.sin(deathAge * 90) * (1 - deathAge / 0.12)) : 0
  const cx = fit(cw / 2 - centre.x, 0, cw, Math.min(...sx), Math.max(...sx)) + shake
  const cy = fit(TOP + (ch - TOP - BOTTOM) / 2 - centre.y, TOP, ch - BOTTOM, Math.min(...sy), Math.max(...sy))
  const P = (x: number, y: number, z = 0): { x: number; y: number } => {
    const p = project(x, y, z, u)
    return { x: cx + p.x, y: cy + p.y }
  }
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
  // Pressure plates: a raised slab with a teal rim, sunk and lit once pressed; an ordered lock's plates carry their number.
  for (const plate of view.plates) pressurePlate(ctx, P, plate)
  // Keys on the floor: a ring that pulls the eye.
  for (const k of view.keys) {
    if (k.state !== "floor") continue
    const p = P(k.x, k.y)
    pixelArc(ctx, p, 10, 5, 0, Math.PI * 2, keyColour(k.key), 1, true)
  }

  // Ground decals: where shots will pass, what each enemy covers, your reach.
  // Drawn on the glow layer: copied onto the scene, and kept at full light as threats.
  const glow = glowLayer(ctx)
  if (view.flow === "playing") {
    const ctx = glow
    ctx.save()
    ctx.beginPath(); ctx.rect(Math.round(floorStart.x), Math.round(floorStart.y), Math.round(floorEnd.x - floorStart.x), Math.round(floorEnd.y - floorStart.y)); ctx.clip()
    for (const shot of view.shots) {
      const start = P(shot.x, shot.y), end = P(shot.x + shot.vx, shot.y + shot.vy)
      shotPath(ctx, start, end)
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      pathArrow(ctx, { x: start.x + (end.x - start.x) * 0.22, y: start.y + (end.y - start.y) * 0.22 }, angle)
    }
    for (const shot of view.shots) {
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
    for (const hz of view.hazards) {
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
    if (view.player !== null) {
      pixelArc(ctx, P(view.player.x, view.player.y), view.player.attackRange * erx, view.player.attackRange * ery, 0, Math.PI * 2, view.scale < 0.15 ? "#64b6b3" : "#647373", 1, true)
    }
    ctx.restore()
  }
  ctx.drawImage(glow.canvas, 0, 0)
  ctx.restore()

  // Everything standing, painted back to front; crates and walls by the box rule.
  type Thing = { readonly x: number; readonly y: number; readonly paint: () => void }
  const actors: Array<Thing> = []
  for (const e of view.enemies) {
    // A soft light at each enemy: in a dark room a threat is never lost between the torches.
    const lamp = P(e.x, e.y)
    emitLight(ctx, { x: lamp.x, y: lamp.y - 6, radius: 1.3, colour: [255, 214, 196], intensity: 0.75, shadows: false })
    // A stalker's eyes burn as you stand still.
    if (e.kind === "stalker") emitLight(ctx, { x: lamp.x, y: lamp.y - 14, radius: 1.1, colour: [100, 182, 179], intensity: 0.3 + 0.7 * e.charge, shadows: false })
    actors.push({
      x: e.x, y: e.y, paint: () => {
        const ground = P(e.x, e.y)
        const resting = view.flow !== "playing" && e.melee !== null ? { ...e, melee: { ...e.melee, phase: "idle" as const, progress: 0 } } : e
        combatActor(ctx, resting, ground, view.flow === "playing" ? presentation?.firing(e, view.world) ?? -1 : -1)
        if (view.flow === "playing" && e.melee !== null) attackWave(ctx, e, P(e.x, e.y, 0.45), e.melee.reach * erx, e.melee.reach * ery)
        if (e.captain) {
          sprite(ctx, "crown", ground.x, ground.y - 17)
        }
      }
    })
  }
  for (const shot of view.shots) {
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
          // A small round: 1 px trail, a 3 px red body on ink, one hot pixel.
          held(shot.x, shot.y, a + Math.PI, 0, 0.2, z, THREAT, 1)
          const p = P(shot.x, shot.y, z)
          pixelLine(ctx, p, p, INK, 5)
          pixelLine(ctx, p, p, DANGER, 3)
          pixelLine(ctx, p, p, "#f4efda", 1)
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
  if (view.player !== null && view.flow !== "dead") {
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
  for (const hz of view.hazards) {
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
  for (const impact of presentation?.impacts ?? []) {
    actors.push({ x: impact.x, y: impact.y + 0.01, paint: () => impactBurst(ctx, impact, P(impact.x, impact.y, 0.55), presentation!.now - impact.born) })
  }
  for (const k of view.keys) {
    // Carried over a runner's head, held over yours, or lying on the floor.
    const z = k.state === "floor" ? 0.35 : k.state === "carried" ? 1.35 : 1.5
    actors.push({
      x: k.x, y: k.y + 0.01, paint: () => {
        const p = P(k.x, k.y, z + (k.state === "floor" ? 0.08 * Math.sin(view.world * 5) : 0))
        keyGlyph(ctx, p.x - u * 0.12, p.y, u * 0.22, keyColour(k.key))
      }
    })
  }
  type Box = Pillar & { readonly material: Material; readonly edge: string; readonly emblem: ((x: number, y: number) => void) | null; readonly damage: number; readonly cracked: boolean }
  const doorBoxes = view.doors.flatMap((d): Array<Box> => {
    if (d.open) return []
    const colour = lockColour(d.lock)
    const emblem = (x: number, y: number): void => {
      if (d.lock.kind === "key") keyGlyph(ctx, x - u * 0.14, y, u * 0.26, colour)
      else if (d.lock.kind === "captain") crownGlyph(ctx, x, y + u * 0.14)
      else if (d.lock.kind === "plates") {
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
          const px = Math.round(x + (i - (n - 1) / 2) * gap), py = Math.round(y)
          ctx.fillStyle = "#171c2e"; ctx.fillRect(px - 2, py - 2, 5, 5)
          ctx.fillStyle = "#ce4655"; ctx.fillRect(px - 1, py - 1, 3, 3)
        }
      }
    }
    return [{ x: d.x, y: d.y, w: d.w, h: d.h, material: "gate", edge: colour, emblem, damage: 0, cracked: false }]
  })
  const boxes: Array<Box> = [
    // Wood is what breaks under fire; everything else is stone. A cracked wall shows its seams.
    ...view.cover.map((c): Box => ({
      x: c.x, y: c.y, w: c.w, h: c.h, material: c.kind === "crate" ? "wood" : "stone", edge: c.kind === "cracked" ? "#e98a49" : "#899692", emblem: null,
      damage: c.kind === "crate" ? 1 - c.hits / c.maxHits : 0, cracked: c.kind === "cracked"
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
  paintAll(first)
  boxes.forEach((b, i) => {
    raisedBlock(ctx, b, P, PILLAR_HEIGHT, b.material, b.edge, view.world)
    if (b.cracked || b.damage > 0) cracks(ctx, b, P, b.cracked ? 1 : b.damage, b.cracked)
    if (b.emblem !== null) {
      const c = P(b.x + b.w / 2, b.y + b.h / 2, PILLAR_HEIGHT)
      b.emblem(c.x, c.y)
    }
    paintAll(slots[i] ?? [])
  })

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
  // The first room shows what to do until you do it: a hand presses beside you and drags, then lets go.
  if (view.room.index === 0 && view.flow === "playing" && view.player !== null && presentation !== null && !presentation.hasMoved(0)) {
    dragHint(ctx, P(view.player.x, view.player.y), presentation.now)
  }
  // In the first rooms, the freeze is named the first times it happens.
  const callout = presentation?.callout ?? null
  if (callout !== null && view.flow === "playing") {
    const age = presentation!.now - callout.born
    const alpha = Math.min(1, age / 0.12, (CALLOUT_LIFE - age) / 0.45)
    if (alpha > 0) {
      const y = Math.round(TOP + 30 - Math.min(1, age / 0.2) * 4)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.textAlign = "center"; ctx.textBaseline = "top"
      const text = (t: string, size: number, at: number, colour: string): void => {
        ctx.font = `700 ${size}px Silkscreen, ui-monospace, monospace`
        ctx.fillStyle = INK
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) ctx.fillText(t, Math.round(cw / 2) + dx, at + dy)
        ctx.fillStyle = colour; ctx.fillText(t, Math.round(cw / 2), at)
      }
      text(callout.title, 16, y, "#e8f6ff")
      if (callout.line !== "") text(callout.line, 8, y + 19, "#7fd8ff")
      ctx.restore()
    }
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
      pixelArc(ctx, centre, rx * 0.6, ry * 0.6, 0, Math.PI * 2, t < 0.15 ? "#f4efda" : "#edc66c", 4)
    }
    pixelArc(ctx, centre, rx, ry, 0, Math.PI * 2, INK, 4, true)
    pixelArc(ctx, centre, rx, ry, 0, Math.PI * 2, t < 0.4 ? "#e98a49" : "#899692", 2, true)
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

  // The thumb-stick, faint.
  if (stick !== null) {
    pixelArc(ctx, { x: stick.ox, y: stick.oy }, stick.reach, stick.reach, 0, Math.PI * 2, "#899692", 1, true)
    pixelArc(ctx, stick, 5, 5, 0, Math.PI * 2, "#c6d4df")
  }

  // Messages: a hit, or a clear with its stars (pixel-styled page elements, see `hud.ts`).
  messages(ctx, view, presentation)
}
