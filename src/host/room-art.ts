import { ROOMS, type Pillar } from "../sim/rooms.ts"
import type { FightView, PlateView } from "../sim/view.ts"
import { panel, sprite, spriteImage, texture, tile } from "./art.ts"
import { torchFire } from "./combat-art.ts"
import { emitLight } from "./lighting.ts"
import { decorationHash, pixelArc, pixelLine, type Point } from "./pixels.ts"

export type Projection = (x: number, y: number, z?: number) => Point
const FLOORS = ["floor-0", "floor-1", "floor-2", "floor-3", "floor-4", "floor-5"] as const
const ROCKS = ["rock-0", "rock-1", "rock-2"] as const
const CAPS = ["cap", "cover-cap-1", "cover-cap-2"] as const

const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"] as const

const PLATE_INK = "#171c2e", PLATE_GOLD = "#edc66c", PLATE_TEAL = "#64b6b3", PLATE_RED = "#ce4655"

/**
 * A pressure plate: a raised stone slab with a gold rim while it waits, sunk flush with a teal rim once pressed, red
 * on a wrong press; an ordered lock's plates carry
 * their number. A dotted line on the floor runs from it to the gate it opens: dim gold, with a spark running to the
 * gate, while it waits; teal once pressed. Painted on `ctx` (a floor layer kept at full light: see `keepLit` in
 * draw.ts); its light is cast on `lit`, the scene.
 */
export const pressurePlate = (ctx: CanvasRenderingContext2D, lit: CanvasRenderingContext2D, P: Projection, plate: PlateView, door: Pillar | null, now: number): void => {
  if (door !== null) {
    const from = P(plate.x, plate.y), to = P(door.x + door.w / 2, door.y + door.h)
    pixelLine(ctx, from, to, plate.down ? "#3c7c7a" : "#6b5a35", 1, 3)
    if (!plate.down) {
      const t = (now * 0.8) % 1, at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
      ctx.fillStyle = PLATE_INK; ctx.fillRect(Math.round(at.x) - 2, Math.round(at.y) - 2, 4, 4)
      ctx.fillStyle = PLATE_GOLD; ctx.fillRect(Math.round(at.x) - 1, Math.round(at.y) - 1, 2, 2)
    }
  }
  // The slab (art: `plate-up`, `plate-down`, `plate-missed`), its top centred on the plate (3 px higher while raised).
  const at = P(plate.x, plate.y), state = plate.missed ? "missed" : plate.down ? "down" : "up"
  tile(ctx, `plate-${state}`, Math.round(at.x) - 12, Math.round(at.y) - 13)
  const cx = Math.round(at.x), cy = Math.round(at.y) - (plate.down ? 0 : 3)
  // An ordered lock's plates carry their number; any other plate is plain: its rim says it all.
  if (plate.order !== null) {
    ctx.fillStyle = PLATE_INK; ctx.fillRect(cx - 4, cy - 4, 9, 9)
    ctx.fillStyle = plate.missed ? PLATE_RED : plate.down ? PLATE_TEAL : "#f4efda"
    const bits = DIGITS[plate.order % 10] ?? DIGITS[0]
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") ctx.fillRect(cx - 1 + i % 3, cy - 2 + Math.floor(i / 3), 1, 1)
  }
  emitLight(lit, {
    x: cx, y: cy, radius: plate.down ? 1.6 : 1.3,
    colour: plate.missed ? [255, 86, 106] : plate.down ? [100, 182, 179] : [237, 198, 108],
    intensity: plate.down ? 0.7 : 0.45 + 0.15 * Math.sin(now * 4), shadows: false
  })
}

/** On the floor round a plate: while it waits it breathes a gold ring; a press sends out a teal ripple. */
export const plateBeacon = (ctx: CanvasRenderingContext2D, P: Projection, plate: PlateView, pressAge: number, unit: number, now: number): void => {
  const centre = P(plate.x, plate.y), rx = plate.radius * unit, ry = rx * 0.78
  if (!plate.down) {
    const t = (now * 0.9) % 1
    ctx.save(); ctx.globalAlpha = 0.85 * (1 - t)
    pixelArc(ctx, centre, rx * (1.15 + t * 0.6), ry * (1.15 + t * 0.6), 0, Math.PI * 2, PLATE_GOLD, 1, true)
    ctx.restore()
  }
  if (pressAge >= 0 && pressAge < 0.5) {
    const t = pressAge / 0.5
    ctx.save(); ctx.globalAlpha = 1 - t
    pixelArc(ctx, centre, rx * (1 + t * 2.4), ry * (1 + t * 2.4), 0, Math.PI * 2, PLATE_TEAL, 2)
    ctx.restore()
  }
}

/** Repeating slats move in real time; fixed side rails and end rollers frame the belt. */
export const conveyorBelt = (ctx: CanvasRenderingContext2D, P: Projection, belt: FightView["belts"][number]): void => {
  const a = P(belt.x, belt.y), b = P(belt.x + belt.w, belt.y + belt.h)
  const x = Math.round(a.x), y = Math.round(a.y), w = Math.round(b.x) - x, h = Math.round(b.y) - y
  const horizontal = belt.dx !== 0, cross = horizontal ? h : w, length = horizontal ? w : h
  if (cross < 7 || length < 16) return
  const unit = horizontal ? (b.x - a.x) / belt.w : (b.y - a.y) / belt.h
  ctx.save()
  if (horizontal) {
    ctx.translate(belt.dx > 0 ? x + w : x, belt.dx > 0 ? y : y + h)
    ctx.rotate(belt.dx > 0 ? Math.PI / 2 : -Math.PI / 2)
  } else if (belt.dy > 0) { ctx.translate(x + w, y + h); ctx.rotate(Math.PI) }
  else ctx.translate(x, y)
  ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, cross, length)
  ctx.save(); ctx.beginPath(); ctx.rect(3, 7, cross - 6, length - 14); ctx.clip()
  const offset = -Math.round(belt.run * unit) % 24
  texture(ctx, "belt-tread", 3, offset, cross - 6, length + 24)
  ctx.restore()
  for (const rx of [0, cross - 3]) {
    ctx.fillStyle = "#171c2e"; ctx.fillRect(rx, 0, 3, length)
    ctx.fillStyle = "#465477"; ctx.fillRect(rx + 1, 0, 1, length)
  }
  texture(ctx, "belt-roller", 2, 0, cross - 4, 8)
  texture(ctx, "belt-roller", 2, length - 8, cross - 4, 8)
  ctx.restore()
}

interface StripPixels { readonly w: number; readonly h: number; readonly colours: ReadonlyArray<string | null> }
const strips = new WeakMap<HTMLImageElement, StripPixels>()

/** Inverse sampling rotates a native repeating blade without Canvas rotation or softened pixels. */
const bladeStrip = (ctx: CanvasRenderingContext2D, a: Point, b: Point): void => {
  const image = spriteImage("blade-bar")
  if (image === undefined) return
  let data = strips.get(image)
  if (data === undefined) {
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height
    const cc = canvas.getContext("2d", { willReadFrequently: true })!
    cc.drawImage(image, 0, 0)
    const rgba = cc.getImageData(0, 0, image.width, image.height).data
    data = { w: image.width, h: image.height, colours: Array.from({ length: image.width * image.height }, (_, i) => rgba[i * 4 + 3] === 0 ? null : `rgb(${rgba[i * 4]},${rgba[i * 4 + 1]},${rgba[i * 4 + 2]})`) }
    strips.set(image, data)
  }
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
  if (length < 1) return
  const c = dx / length, s = dy / length
  let last = ""
  for (let y = Math.floor(Math.min(a.y, b.y) - 7); y <= Math.ceil(Math.max(a.y, b.y) + 7); y++) {
    for (let x = Math.floor(Math.min(a.x, b.x) - 7); x <= Math.ceil(Math.max(a.x, b.x) + 7); x++) {
      const along = (x - a.x) * c + (y - a.y) * s
      const row = Math.round(-(x - a.x) * s + (y - a.y) * c) + 12
      if (along < 0 || along > length || row < 0 || row >= data.h) continue
      const colour = data.colours[row * data.w + Math.floor(along) % data.w]
      if (colour === null || colour === undefined) continue
      if (colour !== last) { ctx.fillStyle = colour; last = colour }
      ctx.fillRect(x, y, 1, 1)
    }
  }
}

/** Call on both the scene and the existing threat/glow buffer so the blade stays visible. */
export const spinningBlade = (ctx: CanvasRenderingContext2D, P: Projection, hz: FightView["hazards"][number]): void => {
  const x = (hz.ax + hz.bx) / 2, y = (hz.ay + hz.by) / 2
  const hub = P(x, y, 0.45), ground = P(x, y)
  pixelLine(ctx, ground, hub, "#171c2e", 6); pixelLine(ctx, ground, hub, "#465477", 4)
  bladeStrip(ctx, P(hz.ax, hz.ay, 0.45), P(hz.bx, hz.by, 0.45))
  sprite(ctx, "blade-hub", hub.x, hub.y + 11)
}

/** The existing beam meets the recessed lens. The post's light starts at its floor footprint. */
export const laserPost = (ctx: CanvasRenderingContext2D, P: Projection, x: number, y: number, state: FightView["hazards"][number]["state"]): void => {
  const at = P(x, y)
  sprite(ctx, `laser-post-${state}`, at.x, at.y)
  if (state !== "off") emitLight(ctx, { x: at.x, y: at.y, radius: state === "on" ? 1.6 : 1.1, colour: state === "on" ? [255, 64, 85] : [255, 176, 96], intensity: state === "on" ? 0.8 : 0.45, shadows: false, halo: { lift: 10, radius: 0.5, strength: 0.2 } })
}

const footprint = (b: Pillar): string => [b.x, b.y, b.w, b.h].join(",")
const coverHash = (b: Pillar): number => decorationHash(Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.w * 31 + b.h * 17))

/** One room-level drain choice, clear of cover and doors; some rooms have none. */
export const roomDrain = (view: FightView, u: number, v: number): Point | null => {
  const { w, h, index, pillars, goal } = view.room
  if (decorationHash(0, 53, index) % 3 === 0) return null
  const occupied = [...pillars, ...view.doors, ...(goal.kind === "exit" ? [goal] : [])]
  let chosen: Point | null = null, best = Infinity
  for (let row = 1; (row + 1) * 24 / v < h - 0.25; row++) for (let col = 1; (col + 1) * 24 / u < w - 0.25; col++) {
    const x = col * 24 / u, y = row * 24 / v
    if (occupied.some(p => x < p.x + p.w + 0.2 && x + 24 / u > p.x - 0.2 && y < p.y + p.h + 0.2 && y + 24 / v > p.y - 0.2)) continue
    const rank = decorationHash(col, row, index + 53)
    if (rank < best) { best = rank; chosen = { x: col, y: row } }
  }
  return chosen
}

interface WallTorch extends Point { readonly seed: number }
interface RoomDressing {
  readonly braziers: ReadonlyMap<string, Point>
  readonly torches: ReadonlyArray<WallTorch>
  readonly banners: ReadonlyArray<Point>
}
const frames = new WeakMap<Projection, RoomDressing>()
/** How far (m, along the wall) torches and pots keep from a room's decoration: a lantern swings below its hook. */
const DECOR_ROOM = 1.6

/** Static dressing in floor metres. Missing quarter lights are supplied by side-wall sconces. */
export const roomDressing = (view: FightView): RoomDressing => {
  const { w, h, index, pillars } = view.room
  const braziers = new Map<string, Point>(), torches: Array<WallTorch> = [], banners: Array<Point> = []
  const launchers = (ROOMS[index]?.hazards ?? []).flatMap((hz) => (hz.kind === "bolt" ? [hz] : []))
  // The room's own decorations (lanterns, wheels) hang on the side walls: torches and pots keep clear of them.
  const decor = ROOMS[index]?.decor ?? []
  const byDecor = (x: number, y: number, room: number): boolean => decor.some((d) => Math.abs(d.x - x) < 1 && Math.abs(d.y - y) < room)
  const free = (p: Point): boolean => p.x >= 0.5 && p.x <= w - 0.5 && p.y >= 0.6 && p.y <= h - 0.5 && ![...pillars, ...view.doors].some(b => p.x > b.x - 0.45 && p.x < b.x + b.w + 0.45 && p.y > b.y - 0.45 && p.y < b.y + b.h + 0.45)
  for (const b of pillars) {
    if (b.w >= 2 || b.h >= 2) continue
    const hash = coverHash(b), placement = hash % 4
    if (placement === 0) continue
    const sideY = b.y + b.h * ((hash >>> 8) % 2 === 0 ? 0.35 : 0.7)
    const left = { x: b.x - 0.6, y: sideY }, right = { x: b.x + b.w + 0.6, y: sideY }
    const front = { x: b.x + b.w * ((hash >>> 9) % 2 === 0 ? 0.3 : 0.7), y: b.y + b.h + 0.65 }
    const candidates = placement === 1 ? [front, left, right] : placement === 2 ? [left, right, front] : [right, left, front]
    const at = candidates.find(p => free(p) && ![...braziers.values()].some(other => Math.hypot(other.x - p.x, other.y - p.y) < 0.9))
    if (at !== undefined) braziers.set(footprint(b), at)
  }
  const count = 2 + decorationHash(0, 21, index) % 3
  const slots = count === 2 ? [0.29, 0.68] : count === 3 ? [0.2, 0.44, 0.77] : [0.14, 0.35, 0.61, 0.85]
  for (let section = 0; section < count; section++) {
    const hash = decorationHash(section, 21, index), x = w * (slots[section]! + ((hash >>> 8) % 9 - 4) * 0.008)
    if (section === 0 || (section > 1 && hash % 2 === 0)) torches.push({ x, y: 0, seed: hash })
    else banners.push({ x, y: 0 })
  }
  for (let y = 1.7, section = 0; y < h - 0.6; section++) {
    const hash = decorationHash(section, 31, index)
    const x = section % 2 === 0 ? 0.3 : w - 0.3
    // The wall is the bullet launcher's (or a decoration's) there.
    if (!launchers.some((l) => Math.abs(l.x1 - x) < 1 && Math.abs(l.y1 - y) < 1.4) && !byDecor(x, y, DECOR_ROOM)) torches.push({ x, y, seed: hash })
    y += 2.8 + hash % 15 / 10
  }
  // Between two decorations on one wall, a torch: lantern, torch, wheel, torch... down the wall, none on another.
  for (const side of [0, 1]) {
    const ys = decor.filter((d) => (d.x < w / 2 ? 0 : 1) === side).map((d) => d.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) {
      const y = (ys[i - 1]! + ys[i]!) / 2
      torches.push({ x: side === 0 ? 0.3 : w - 0.3, y, seed: decorationHash(side, Math.round(y * 10), index) })
    }
  }
  const quarter = (p: Point): number => (p.x >= w / 2 ? 1 : 0) + (p.y >= h / 2 ? 2 : 0)
  const lit = new Set([...torches, ...braziers.values()].map(quarter))
  for (let q = 0; q < 4; q++) if (!lit.has(q)) {
    const seed = decorationHash(q, 45, index)
    const at = { x: q % 2 === 0 ? 0.3 : w - 0.3, y: h * (q < 2 ? 0.25 : 0.75) + (seed % 5 - 2) * 0.1 }
    if (!byDecor(at.x, at.y, DECOR_ROOM)) torches.push({ ...at, seed })
  }
  return { braziers, torches, banners }
}

/** Native 24px tiles, anchored to the room rather than the camera. Rock continues beyond its walls. */
export const roomFloor = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Projection): void => {
  const a = P(0, 0), b = P(view.room.w, view.room.h), ox = Math.round(a.x), oy = Math.round(a.y)
  const cols = [Math.floor(-ox / 24), Math.ceil((cw - ox) / 24)] as const
  const rows = [Math.floor(-oy / 24), Math.ceil((ch - oy) / 24)] as const
  for (let row = rows[0]; row < rows[1]; row++) for (let col = cols[0]; col < cols[1]; col++) {
    tile(ctx, ROCKS[decorationHash(col, row, view.room.index) % 3]!, ox + col * 24, oy + row * 24)
  }
  ctx.save()
  ctx.beginPath(); ctx.rect(ox, oy, Math.round(b.x) - ox, Math.round(b.y) - oy); ctx.clip()
  const u = (b.x - a.x) / view.room.w, v = (b.y - a.y) / view.room.h
  // (No drain where there are plates: a dark slab on the floor reads as one more.)
  const drain = view.plates.length > 0 ? null : roomDrain(view, u, v)
  for (let row = Math.max(0, rows[0]); row < Math.min(rows[1], Math.ceil((b.y - a.y) / 24)); row++) {
    for (let col = Math.max(0, cols[0]); col < Math.min(cols[1], Math.ceil((b.x - a.x) / 24)); col++) {
      const hash = decorationHash(col, row, view.room.index), wx = (col + 0.5) * 24 / u, wy = (row + 0.5) * 24 / v
      const edge = wx < 1.2 || wy < 1.2 || view.room.w - wx < 1.2 || view.room.h - wy < 1.2 || view.room.pillars.some(p => wx > p.x - 0.6 && wx < p.x + p.w + 0.6 && wy > p.y - 0.6 && wy < p.y + p.h + 0.6)
      const detail = edge && (hash >>> 10) % 12 === 0
      const name = drain?.x === col && drain.y === row ? "floor-drain" : detail ? ((hash >>> 18) % 2 === 0 ? "floor-moss" : "floor-cracked") : FLOORS[hash % 6]!
      tile(ctx, name, ox + col * 24, oy + row * 24)
    }
  }
  ctx.restore()
}

/** A native two-frame brazier; its light originates on the floor, not at its flame. */
const brazier = (ctx: CanvasRenderingContext2D, at: Point, world: number, seed: number): void => {
  sprite(ctx, Math.floor(world * 6 + seed) % 2 === 0 ? "brazier-0" : "brazier-1", at.x, at.y)
  emitLight(ctx, { x: at.x, y: at.y, radius: 4, colour: [255, 170, 90], intensity: 0.95, halo: { lift: 12, radius: 1.2, strength: 0.26 } })
}

/** Walls and sparse furnishings use the same source-pixel density as the actors. */
export const roomWalls = (ctx: CanvasRenderingContext2D, view: FightView, P: Projection, height: number): void => {
  const { w, h, index } = view.room
  const floor = P(0, 0), back = P(0, 0, height), end = P(w, h)
  texture(ctx, "masonry", back.x - 6, back.y, end.x - floor.x + 12, floor.y - back.y)
  texture(ctx, "cap", back.x - 6, back.y - 5, end.x - floor.x + 12, 5)
  texture(ctx, "masonry", floor.x - 7, floor.y, 7, end.y - floor.y + 8)
  texture(ctx, "masonry", end.x, floor.y, 7, end.y - floor.y + 8)
  texture(ctx, "masonry", floor.x - 7, end.y, end.x - floor.x + 14, 9)
  texture(ctx, "cap", floor.x - 7, end.y - 3, end.x - floor.x + 14, 4)
  const dressing = roomDressing(view)
  frames.set(P, dressing)
  for (const at of dressing.torches) {
    const p = P(at.x, at.y)
    torchFire(ctx, p.x, p.y - (at.y === 0 ? 1 : 0), view.world, at.seed)
  }
  for (const at of dressing.banners) {
    const p = P(at.x, at.y)
    sprite(ctx, index % 3 === 0 ? "banner-red" : "banner-moss", p.x, p.y - 1)
  }
  const decor = ROOMS[index]?.decor ?? []
  for (let y = 2; y < h - 1; y += 4.1) {
    const hash = decorationHash(0, Math.floor(y), index), x = hash % 2 === 0 ? 0.55 : w - 0.55, at = P(x, y)
    // (Not under a lantern or a wheel.)
    if (hash % 3 === 0 && !decor.some((d) => Math.abs(d.x - x) < 1 && Math.abs(d.y - y) < DECOR_ROOM)) sprite(ctx, "pots", at.x, at.y)
  }
}

export type Material = "stone" | "wood" | "gate"

/** Native nine-slice caps and crate fronts adapt to footprints without stretching a texel. */
export const raisedBlock = (ctx: CanvasRenderingContext2D, b: Pillar, P: Projection, height: number, material: Material, edge: string, world: number): void => {
  const far = P(b.x, b.y, height), near = P(b.x, b.y + b.h, height)
  const ground = P(b.x, b.y + b.h), right = P(b.x + b.w, b.y + b.h)
  const x = Math.round(far.x), y = Math.round(far.y)
  const width = Math.max(1, Math.round(right.x) - x), depth = Math.max(1, Math.round(near.y) - y)
  const faceHeight = Math.max(1, Math.round(ground.y) - Math.round(near.y))
  const hash = coverHash(b)
  if (material === "wood") {
    panel(ctx, "crate-cap", x, y, width, depth)
    panel(ctx, "crate-face", x, y + depth - 1, width, faceHeight + 1)
  } else {
    texture(ctx, material === "gate" ? "iron" : "masonry", x, y + depth, width, faceHeight)
    panel(ctx, material === "gate" ? "cap" : CAPS[hash % 3]!, x, y, width, depth)
    if (material === "stone" && width >= 20 && depth >= 18 && hash % 3 !== 0) {
      tile(ctx, "cover-chip", x + 2 + hash % Math.max(1, width - 20), y + 2 + (hash >>> 10) % Math.max(1, depth - 18))
    }
    pixelLine(ctx, { x, y: y + depth }, { x, y: Math.round(ground.y) }, "#171c2e")
    pixelLine(ctx, { x: x + width - 1, y: y + depth }, { x: x + width - 1, y: Math.round(ground.y) }, "#171c2e")
  }
  pixelLine(ctx, { x, y: Math.round(ground.y) }, { x: x + width - 1, y: Math.round(ground.y) }, "#171c2e")
  if (material === "gate") {
    pixelLine(ctx, { x: x + 1, y: y + depth }, { x: x + width - 2, y: y + depth }, edge, 2)
  } else if (width > 46 && material === "stone") {
    torchFire(ctx, x + (hash % 2 === 0 ? 11 : width - 11), Math.round(ground.y) - 2, world, hash)
    if (width > 92) sprite(ctx, "banner-red", x + Math.floor(width * 0.65), Math.round(ground.y) - 1)
  } else if (material === "stone") {
    if (hash % 3 === 0) sprite(ctx, "pots", x + width + 4, Math.round(ground.y) + 3)
  }
  const at = frames.get(P)?.braziers.get(footprint(b))
  if (at !== undefined && material !== "gate") brazier(ctx, P(at.x, at.y), world, hash)
}
