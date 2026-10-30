/**
 * Drawing the fight view onto a 2D canvas in a projected, standing-up view:
 * the floor and decals flat on the ground, crates and walls as boxes, people
 * as 24-pixel sprites, all painted back to front. The simulation stays flat
 * 2D; only this file knows about height.
 */
import type { Lock, Pillar } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { posedSprite, sprite } from "./art.ts"
import { attackWave, bodyName, combatActor, dyingActor, impactBurst } from "./combat-art.ts"
import type { Presentation } from "./fx.ts"
import { decorationHash, pixelArc, pixelLine, pixelSector } from "./pixels.ts"
import { raisedBlock, roomFloor, roomWalls, type Material } from "./room-art.ts"
import { applyLighting, discardLights, emitLight, type Rgb } from "./lighting.ts"
import { DANGER, THREAT, pathArrow, reloadArc, threatArc, threatLine } from "./threats.ts"

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

/** What a door looks like by its lock: steel for a chamber, gold for a captain, the key's colour for a key. */
const lockColour = (lock: Lock): string => (lock.kind === "clear" ? "#9fb4d8" : lock.kind === "captain" ? "#ffd25a" : keyColour(lock.key))

const GOLD = "#ffd25a"
const EXIT = "#7dff9a"

/** A star of radius r centred on (x, y), filled or as an outline. */
export const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean): void => {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const k = i % 2 === 0 ? r : r * 0.45
    if (i === 0) ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
    else ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
  }
  ctx.closePath()
  if (filled) { ctx.fillStyle = GOLD; ctx.fill() }
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke()
}

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
const AMBIENT_FROZEN: Rgb = [128, 140, 184], AMBIENT_RUNNING: Rgb = [172, 162, 148]

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
    emitLight(ctx, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, radius: 2.2, colour: [125, 255, 154], intensity: 0.45 })
  }
  // Open doors: a threshold in the lock's colour.
  for (const d of view.doors) {
    if (!d.open) continue
    const a = P(d.x, d.y), b = P(d.x + d.w, d.y + d.h)
    pixelLine(ctx, a, { x: b.x, y: a.y }, lockColour(d.lock), 1, 3)
    pixelLine(ctx, { x: a.x, y: b.y }, b, "#647373", 1, 3)
  }
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
      threatLine(ctx, start, end, false, 6)
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
      threatLine(ctx, from, to, l.locked, l.locked ? 0 : 5)
      pathArrow(ctx, { x: to.x - Math.cos(l.aim) * 10, y: to.y - Math.sin(l.aim) * 8 }, Math.atan2(to.y - from.y, to.x - from.x))
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
      // Guard up: a steel front and a gold open back. Dazed: a turning white ring, open all round and no blow lands.
      // Recovering: open all round. Idle/chasing melee bodies need no foot dashes.
      if (m.phase === "stagger") {
        ring(m.progress * 6, m.progress * 6 + Math.PI * 2, "#f4efda", 1, true)
      } else if (m.guarding) {
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
    // Every enemy carries a little light of its own, so a threat never hides in a shadow.
    const lamp = P(e.x, e.y)
    emitLight(ctx, { x: lamp.x, y: lamp.y - 8, radius: 1.1, colour: [255, 226, 200], intensity: 0.45, shadows: false })
    actors.push({
      x: e.x, y: e.y, paint: () => {
        const ground = P(e.x, e.y)
        const resting = view.flow !== "playing" && e.melee !== null ? { ...e, melee: { ...e.melee, phase: "idle" as const, progress: 0 } } : e
        combatActor(ctx, resting, ground, view.flow === "playing" ? presentation?.firing(e, view.world) ?? -1 : -1)
        if (view.flow === "playing" && e.melee !== null) attackWave(ctx, e, P(e.x, e.y, 0.45), e.melee.reach * erx, e.melee.reach * ery)
        const m = e.melee
        if (m !== null && m.maxHp > 1) {
          // Hit points over its head: one pip per hit it can still take.
          const y = ground.y - (e.captain ? 33 : 26)
          for (let i = 0; i < m.maxHp; i++) {
            const x = Math.round(ground.x + (i - (m.maxHp - 1) / 2) * 5) - 1
            ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 5, 5)
            ctx.fillStyle = i < m.hp ? "#ce4655" : "#3a4048"; ctx.fillRect(x, y, 3, 3)
          }
        }
        if (e.captain) {
          sprite(ctx, "crown", ground.x, ground.y - 17)
        }
      }
    })
  }
  for (const shot of view.shots) {
    const glowing = P(shot.x, shot.y)
    emitLight(ctx, { x: glowing.x, y: glowing.y, radius: 0.9, colour: [255, 96, 72], intensity: 0.5, shadows: false })
    const paintShot = (ctx: CanvasRenderingContext2D): void => {
      /** A line held at height z from (x, y) toward angle a. */
      const held = (x: number, y: number, a: number, from: number, to: number, z: number, colour: string, width: number): void => {
        const start = P(x + Math.cos(a) * from, y + Math.sin(a) * from, z)
        const end = P(x + Math.cos(a) * to, y + Math.sin(a) * to, z)
        pixelLine(ctx, start, end, "#171c2e", width + 2)
        pixelLine(ctx, start, end, colour, width)
      }
      {
        const a = Math.atan2(shot.vy, shot.vx)
        const z = 0.6
        if (shot.kind === "bullet") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.24, z, THREAT, 2)
          const p = P(shot.x, shot.y, z)
          pixelLine(ctx, p, p, INK, 11)
          pixelLine(ctx, p, p, DANGER, 9)
          pixelLine(ctx, p, p, THREAT, 7)
          pixelLine(ctx, p, p, "#f4efda", 3)
        } else if (shot.kind === "slug") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.42, z, DANGER, 4)
          held(shot.x, shot.y, a, -0.12, 0.16, z, THREAT, 6)
          held(shot.x, shot.y, a, 0, 0.12, z, "#f4efda", 2)
        } else if (shot.kind === "arrow") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.38, z, THREAT, 3)
          held(shot.x, shot.y, a, -0.05, 0.16, z, DANGER, 5)
          for (const side of [-0.7, 0.7]) held(shot.x, shot.y, a + Math.PI + side, 0.25, 0.42, z, THREAT, 2)
        } else {
          held(shot.x, shot.y, a, -0.18, 0.18, z, DANGER, 5)
          held(shot.x, shot.y, a, 0, 0.18, z, THREAT, 3)
          held(shot.x, shot.y, a, -0.25, -0.15, z, "#f4efda", 3)
        }
      }
    }
    actors.push({ x: shot.x, y: shot.y, paint: () => { paintShot(ctx); paintShot(glow) } })
  }
  if (view.player !== null && view.flow !== "dead") {
    const p = view.player
    const at = P(p.x, p.y)
    // A faint light of your own, so you never vanish into the dark.
    emitLight(ctx, { x: at.x, y: at.y, radius: 2.4, colour: [200, 236, 230], intensity: 0.4 })
    actors.push({
      x: p.x, y: p.y, paint: () => {
        const speed = Math.hypot(p.vx, p.vy)
        const ground = P(p.x, p.y)
        sprite(ctx, "shadow", ground.x + 2, ground.y + 3)
        const bob = speed > 0.1 ? Math.round(Math.sin((p.x + p.y) * 9)) : 0
        posedSprite(ctx, bodyName("player"), ground.x, ground.y - bob, { flip: p.vx < 0 })
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
  type Box = Pillar & { readonly material: Material; readonly edge: string; readonly emblem: ((x: number, y: number) => void) | null }
  const doorBoxes = view.doors.flatMap((d): Array<Box> => {
    if (d.open) return []
    const colour = lockColour(d.lock)
    const emblem = (x: number, y: number): void => {
      if (d.lock.kind === "key") keyGlyph(ctx, x - u * 0.14, y, u * 0.26, colour)
      else if (d.lock.kind === "captain") crownGlyph(ctx, x, y + u * 0.14)
      else {
        // One pip per enemy the door still waits on.
        const n = d.waiting, gap = u * 0.24
        for (let i = 0; i < n; i++) {
          const px = Math.round(x + (i - (n - 1) / 2) * gap), py = Math.round(y)
          ctx.fillStyle = "#171c2e"; ctx.fillRect(px - 2, py - 2, 5, 5)
          ctx.fillStyle = "#ce4655"; ctx.fillRect(px - 1, py - 1, 3, 3)
        }
      }
    }
    return [{ x: d.x, y: d.y, w: d.w, h: d.h, material: "gate", edge: colour, emblem }]
  })
  const boxes: Array<Box> = [
    ...view.room.pillars.map((p, i): Box => ({ ...p, material: p.w < 2 && p.h < 2 && decorationHash(i, 0, view.room.index) % 3 === 0 ? "wood" : "stone", edge: "#899692", emblem: null })),
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
      blockers: [...view.room.pillars, ...view.doors.filter((d) => !d.open)],
      blockerHeight: PILLAR_HEIGHT,
      backWall: BACK_WALL,
      room: view.room,
      ambient: [mixc(0), mixc(1), mixc(2)]
    }, glow.canvas)
  } else discardLights(ctx)

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
    const colour = e.kind === "runner" ? "#edc66c" : e.sees ? DANGER : THREAT
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

  // Messages: a hit, or a clear with its stars.
  if (view.flow === "dead" && (presentation === null || deathAge >= 0.52)) {
    // Keep the fall visible. Retry stays available at the simulation's deadline.
    const y = ch - BOTTOM - 14
    ctx.fillStyle = "#171c2e"; ctx.fillRect(0, y - 27, cw, 40)
    title(ctx, "HIT", "#ce4655", cw / 2, y - 8)
    caption(ctx, view.canRetry ? "tap to retry the room" : "", cw / 2, y + 7)
  } else if (view.result !== null && (presentation === null || presentation.clearAge < 0 || presentation.clearAge >= 0.4)) {
    const won = view.flow === "won"
    if (won) {
      banner(ctx, cw, ch, 190)
      const top = ch / 2 - 55
      title(ctx, "ALL ROOMS CLEAR", "#91c69b", cw / 2, top)
      for (let i = 0; i < 3; i++) star(ctx, cw / 2 + (i - 1) * 40, top + 38, 15, i < view.result.stars)
      caption(ctx, `${view.result.world.toFixed(1)} s · par ${view.room.par} s`, cw / 2, top + 76)
      const stars = view.best.reduce((n, b) => n + (b?.stars ?? 0), 0)
      caption(ctx, `run: ${stars}/${view.best.length * 3} stars · ${view.deaths} deaths`, cw / 2, top + 98)
      caption(ctx, "tap to go again", cw / 2, top + 120)
    } else {
      // The score stays below the action while the final enemy finishes falling.
      const y = ch - BOTTOM - 17
      ctx.fillStyle = "#171c2e"; ctx.fillRect(0, y - 28, cw, 55)
      title(ctx, "CLEAR", "#91c69b", cw / 2, y - 9)
      for (let i = 0; i < 3; i++) star(ctx, cw / 2 + (i - 1) * 18, y + 2, 5, i < view.result.stars)
      caption(ctx, `${view.result.world.toFixed(1)} s · par ${view.room.par} s · tap for next`, cw / 2, y + 21)
    }
  }
}

const banner = (ctx: CanvasRenderingContext2D, cw: number, ch: number, height: number): void => {
  ctx.fillStyle = "#000000c8"
  ctx.fillRect(0, ch / 2 - height / 2, cw, height)
}

const title = (ctx: CanvasRenderingContext2D, text: string, colour: string, x: number, y: number): void => {
  ctx.fillStyle = colour
  ctx.textAlign = "center"
  ctx.font = `bold ${Math.min(22, Math.floor((x * 2 - 16) / Math.max(1, text.length * 0.62)))}px ui-monospace, Menlo, monospace`
  ctx.fillText(text, x, y)
}

const caption = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void => {
  ctx.fillStyle = "#e8ecf4"
  ctx.textAlign = "center"
  ctx.font = ` ${Math.min(10, Math.floor((x * 2 - 16) / Math.max(1, text.length * 0.62)))}px ui-monospace, Menlo, monospace`
  ctx.fillText(text, x, y)
}
