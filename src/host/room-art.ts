import type { Pillar } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { panel, sprite, texture, tile } from "./art.ts"
import { torchFire } from "./combat-art.ts"
import { emitLight } from "./lighting.ts"
import { decorationHash, pixelLine, type Point } from "./pixels.ts"

export type Projection = (x: number, y: number, z?: number) => Point
const FLOORS = ["floor-0", "floor-1", "floor-2", "floor-3", "floor-4", "floor-5"] as const
const ROCKS = ["rock-0", "rock-1", "rock-2"] as const
const CAPS = ["cap", "cover-cap-1", "cover-cap-2"] as const

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
  for (let row = Math.max(0, rows[0]); row < Math.min(rows[1], Math.ceil((b.y - a.y) / 24)); row++) {
    for (let col = Math.max(0, cols[0]); col < Math.min(cols[1], Math.ceil((b.x - a.x) / 24)); col++) {
      const hash = decorationHash(col, row, view.room.index), wx = (col + 0.5) * 24 / u, wy = (row + 0.5) * 24 / v
      const edge = wx < 1.2 || wy < 1.2 || view.room.w - wx < 1.2 || view.room.h - wy < 1.2 || view.room.pillars.some(p => wx > p.x - 0.6 && wx < p.x + p.w + 0.6 && wy > p.y - 0.6 && wy < p.y + p.h + 0.6)
      const detail = edge && (hash >>> 10) % 12 === 0
      const name = detail ? ((hash >>> 18) % 2 === 0 ? "floor-moss" : "floor-cracked") : (hash >>> 10) % 89 === 0 ? "floor-drain" : FLOORS[hash % 6]!
      tile(ctx, name, ox + col * 24, oy + row * 24)
    }
  }
  ctx.restore()
}

/** A native two-frame brazier; its light originates on the floor, not at its flame. */
const brazier = (ctx: CanvasRenderingContext2D, at: Point, world: number, seed: number): void => {
  sprite(ctx, Math.floor(world * 6 + seed) % 2 === 0 ? "brazier-0" : "brazier-1", at.x, at.y)
  emitLight(ctx, { x: at.x, y: at.y, radius: 3.7, colour: [255, 176, 96], intensity: 0.8 })
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
  const count = 2 + decorationHash(0, 21, index) % 3
  const slots = count === 2 ? [0.29, 0.68] : count === 3 ? [0.2, 0.44, 0.77] : [0.14, 0.35, 0.61, 0.85]
  for (let section = 0; section < count; section++) {
    const hash = decorationHash(section, 21, index)
    const x = w * (slots[section]! + ((hash >>> 8) % 9 - 4) * 0.008), p = P(x, 0)
    if (section === 0 || (section > 1 && hash % 2 === 0)) torchFire(ctx, p.x, p.y - 1, view.world, hash)
    else sprite(ctx, index % 3 === 0 ? "banner-red" : "banner-moss", p.x, p.y - 1)
  }
  // Alternating sides, unequal gaps. All fixtures face into the reachable room.
  for (let y = 1.7, section = 0; y < h - 0.6; section++) {
    const hash = decorationHash(section, 31, index), p = P(section % 2 === 0 ? 0.3 : w - 0.3, y)
    torchFire(ctx, p.x, p.y, view.world, hash)
    y += 2.8 + hash % 15 / 10
  }
  for (let y = 2; y < h - 1; y += 4.1) {
    const hash = decorationHash(0, Math.floor(y), index), at = P(hash % 2 === 0 ? 0.55 : w - 0.55, y)
    if (hash % 3 === 0) sprite(ctx, "pots", at.x, at.y)
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
  const hash = decorationHash(Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.w * 31 + b.h * 17))
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
    brazier(ctx, { x: x + Math.floor(width / 2) + (hash % 2 === 0 ? -3 : 3), y: Math.round(ground.y) + 9 }, world, hash)
  }
}
