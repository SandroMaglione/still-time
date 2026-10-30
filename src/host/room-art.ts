import type { Pillar } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { sprite, texture, tile, type Sprite } from "./art.ts"
import { decorationHash, pixelLine, type Point } from "./pixels.ts"
import { torchFire } from "./combat-art.ts"

export type Projection = (x: number, y: number, z?: number) => Point
const floors: ReadonlyArray<Sprite> = ["floor-0", "floor-1", "floor-2", "floor-3", "floor-4", "floor-5"]

/** Native 24×16 floor slabs, stable in world space and culled to the viewport. */
export const roomFloor = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Projection): void => {
  const a = P(0, 0), b = P(view.room.w, view.room.h)
  ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, cw, ch)
  ctx.save()
  ctx.beginPath(); ctx.rect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y)); ctx.clip()
  ctx.fillStyle = "#3c4848"; ctx.fillRect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y))
  const cols = Math.ceil((b.x - a.x) / 24), rows = Math.ceil((b.y - a.y) / 16)
  for (let y = Math.max(0, Math.floor(-a.y / 16)); y < Math.min(rows, Math.ceil((ch - a.y) / 16)); y++) {
    for (let x = Math.max(0, Math.floor(-a.x / 24)); x < Math.min(cols, Math.ceil((cw - a.x) / 24)); x++) {
      const hash = decorationHash(x, y, view.room.index)
      const variant = hash % 10 < 6 ? 0 : 1 + (hash >>> 8) % 5
      tile(ctx, floors[variant] ?? "floor-0", a.x + x * 24, a.y + y * 16)
    }
  }
  // Cast shadows are below telegraphs and actors, and never enter simulation.
  ctx.fillStyle = "#263234"
  for (const p of [...view.room.pillars, ...view.doors.filter(d => !d.open)]) {
    const near = P(p.x, p.y + p.h), far = P(p.x + p.w, p.y)
    ctx.fillRect(Math.round(near.x + 3), Math.round(far.y + 4), Math.round(far.x - near.x + 4), Math.round(near.y - far.y + 3))
  }
  ctx.fillRect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), 6)
  ctx.fillRect(Math.round(a.x), Math.round(a.y), 5, Math.round(b.y - a.y))
  ctx.restore()
}

/** Low perimeter walls and wall dressing frame the walkable floor. */
export const roomWalls = (ctx: CanvasRenderingContext2D, view: FightView, P: Projection, height: number): void => {
  const { w, h, index } = view.room
  const floor = P(0, 0), back = P(0, 0, height), end = P(w, h)
  texture(ctx, "masonry", back.x - 6, back.y, end.x - floor.x + 12, floor.y - back.y)
  texture(ctx, "cap", back.x - 6, back.y - 5, end.x - floor.x + 12, 5)
  pixelLine(ctx, { x: back.x - 6, y: back.y - 5 }, { x: end.x + 6, y: back.y - 5 }, "#b3c0b2")
  // Side caps are outside the collision boundary, so actors remain visible at the edges.
  texture(ctx, "masonry", floor.x - 7, floor.y, 7, end.y - floor.y + 8)
  texture(ctx, "masonry", end.x, floor.y, 7, end.y - floor.y + 8)
  pixelLine(ctx, { x: floor.x - 7, y: back.y }, { x: floor.x - 7, y: end.y + 8 }, "#899692")
  pixelLine(ctx, { x: end.x, y: back.y }, { x: end.x, y: end.y }, "#899692")
  texture(ctx, "masonry", floor.x - 7, end.y, end.x - floor.x + 14, 9)
  texture(ctx, "cap", floor.x - 7, end.y - 3, end.x - floor.x + 14, 4)
  for (let x = 1.1; x < w; x += 3.6) {
    const p = P(x, 0)
    torchFire(ctx, p.x, p.y - 1, view.world, Math.round(x * 10))
    if (x + 1.8 < w) {
      const banner = P(x + 1.8, 0)
      sprite(ctx, index % 3 === 0 ? "banner-red" : "banner-moss", banner.x, banner.y - 2)
    }
  }
  for (let y = 2; y < h - 1; y += 4.1) {
    const hash = decorationHash(0, Math.floor(y), index)
    const at = P(hash % 2 === 0 ? 0.35 : w - 0.35, y)
    sprite(ctx, hash % 4 === 0 ? "pots" : "rubble", at.x, at.y)
  }
}

export type Material = "stone" | "wood" | "gate"

/** One footprint, a bright upper plane, and a darker vertical face. */
export const raisedBlock = (ctx: CanvasRenderingContext2D, b: Pillar, P: Projection, height: number, material: Material, edge: string, world: number): void => {
  const far = P(b.x, b.y, height), near = P(b.x, b.y + b.h, height)
  const ground = P(b.x, b.y + b.h), right = P(b.x + b.w, b.y + b.h)
  const x = Math.round(far.x), y = Math.round(far.y)
  const width = Math.max(1, Math.round(right.x) - x), depth = Math.max(1, Math.round(near.y) - y)
  const faceHeight = Math.max(1, Math.round(ground.y) - Math.round(near.y))
  texture(ctx, material === "wood" ? "wood-front" : material === "gate" ? "iron" : "masonry", x, y + depth, width, faceHeight)
  texture(ctx, material === "wood" ? "wood-top" : "cap", x, y, width, depth)
  pixelLine(ctx, { x, y }, { x: x + width - 1, y }, material === "wood" ? "#947058" : "#b3c0b2")
  pixelLine(ctx, { x, y: y + 1 }, { x, y: y + depth - 1 }, "#899692")
  pixelLine(ctx, { x: x + width - 1, y }, { x: x + width - 1, y: Math.round(ground.y) }, "#263234")
  pixelLine(ctx, { x, y: Math.round(ground.y) }, { x: x + width, y: Math.round(ground.y) }, "#171c2e", 2)
  if (material === "gate") {
    pixelLine(ctx, { x: x + 1, y: y + depth }, { x: x + width - 2, y: y + depth }, edge, 2)
  } else if (material === "wood") {
    // One brace spans the whole crate, rather than repeating little crates inside it.
    pixelLine(ctx, { x: x + 2, y: y + depth + 2 }, { x: x + width - 3, y: Math.round(ground.y) - 3 }, "#263234", 3)
    pixelLine(ctx, { x: x + 2, y: y + depth + 2 }, { x: x + width - 3, y: Math.round(ground.y) - 3 }, "#947058")
  } else if (width > 46 && material === "stone") {
    torchFire(ctx, x + 9, Math.round(ground.y) - 2, world, x)
    torchFire(ctx, x + width - 10, Math.round(ground.y) - 2, world, x + width)
    if (width > 92) sprite(ctx, "banner-red", x + Math.floor(width / 2), Math.round(ground.y) - 1)
  } else if (material === "stone" && b.h > b.w * 2) {
    sprite(ctx, "chain", x + Math.floor(width / 2), Math.round(ground.y) - 1)
  } else if (material === "stone" && decorationHash(Math.round(b.x * 10), Math.round(b.y * 10), 0) % 3 === 0) {
    // A small urn on the cap adds height without changing the obstacle's footprint.
    sprite(ctx, "pots", x + Math.floor(width / 2), y + Math.floor(depth * 0.6))
  }
}
