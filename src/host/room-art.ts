import type { Pillar } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { sprite, texture } from "./art.ts"
import { decorationHash, pixelLine, type Point } from "./pixels.ts"
import { torchFire } from "./combat-art.ts"

export type Projection = (x: number, y: number, z?: number) => Point
/** Large staggered flagstones. Wear is sparse and concentrated at collision boundaries. */
export const roomFloor = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Projection): void => {
  const a = P(0, 0), b = P(view.room.w, view.room.h)
  ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, cw, ch)
  ctx.save()
  ctx.beginPath(); ctx.rect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y)); ctx.clip()
  ctx.fillStyle = "#303638"; ctx.fillRect(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y))
  const unit = (b.x - a.x) / view.room.w, depthUnit = (b.y - a.y) / view.room.h
  const fills = ["#353b3d", "#363d3f", "#343b3d"]
  let wy = 0, row = 0
  while (wy < view.room.h) {
    const height = 1.05 + decorationHash(row, 7, view.room.index) % 4 * 0.17
    let wx = -(decorationHash(row, 3, view.room.index) % 14) / 10, col = 0
    while (wx < view.room.w) {
      const hash = decorationHash(col, row, view.room.index), width = 1.4 + hash % 5 * 0.27
      const x = Math.round(a.x + wx * unit), y = Math.round(a.y + wy * depthUnit)
      const w = Math.round(a.x + (wx + width) * unit) - x, h = Math.round(a.y + (wy + height) * depthUnit) - y
      if (x < cw && x + w > 0 && y < ch && y + h > 0) {
        ctx.fillStyle = fills[(hash >>> 8) % fills.length]!
        ctx.fillRect(x + 1, y + 1, w - 1, h - 1)
        // Inset corners and interrupted seams avoid a hard regular grid.
        ctx.fillStyle = "#303638"
        if (hash % 3 === 0) ctx.fillRect(x + 1, y + 1, 2, 1)
        if (hash % 5 === 0) ctx.fillRect(x + w - 2, y + h - 2, 2, 2)
        const mx = wx + width / 2, my = wy + height / 2
        const nearWall = mx < 1.3 || view.room.w - mx < 1.3 || my < 1.2 || view.room.h - my < 1.2 || view.room.pillars.some(p => mx > p.x - 1.2 && mx < p.x + p.w + 1.2 && my > p.y - 1.2 && my < p.y + p.h + 1.2)
        const worn = nearWall ? (hash >>> 14) % 4 === 0 : (hash >>> 14) % 64 === 0
        if (worn) {
          const dx = x + 3 + (hash >>> 5) % Math.max(1, w - 10), dy = y + 3 + (hash >>> 10) % Math.max(1, h - 8)
          if ((hash >>> 21) % 2 === 0) {
            const sign = hash % 2 === 0 ? 1 : -1
            pixelLine(ctx, { x: dx, y: dy }, { x: dx + 3, y: dy + sign * 2 }, "#2e3436")
            pixelLine(ctx, { x: dx + 3, y: dy + sign * 2 }, { x: dx + 5, y: dy + sign * 5 }, "#2e3436")
          } else {
            ctx.fillStyle = "#444d41"; ctx.fillRect(dx, dy, 3, 2); ctx.fillRect(dx + 2, dy + 1, 3, 2)
          }
        }
      }
      wx += width; col++
    }
    wy += height; row++
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
  for (let x = 0.9, section = 0; x < w; section++) {
    const hash = decorationHash(section, 21, index)
    const p = P(x, 0)
    if (hash % 5 < 2) torchFire(ctx, p.x, p.y - 1, view.world, Math.round(x * 10))
    else if (hash % 5 === 2) sprite(ctx, index % 3 === 0 ? "banner-red" : "banner-moss", p.x, p.y - 1)
    x += 2.5 + (hash >>> 8) % 28 / 10
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
  const fill = (xx: number, yy: number, w: number, h: number, colour: string): void => { ctx.fillStyle = colour; ctx.fillRect(xx, yy, w, h) }
  if (material === "wood") {
    fill(x, y, width, depth + faceHeight, "#352c29")
    fill(x + 2, y + 2, width - 4, depth - 3, "#82644c")
    fill(x + 2, y + depth + 1, width - 4, faceHeight - 3, "#674b38")
    for (let offset = 7; offset < width - 3; offset += 7) pixelLine(ctx, { x: x + offset, y: y + 2 }, { x: x + offset, y: y + depth + faceHeight - 3 }, "#4f3b30")
    // Outer timber frame and a broad X identify one solid packing crate.
    for (const yy of [y + depth + 1, y + depth + faceHeight - 4]) fill(x + 1, yy, width - 2, 3, "#8b6b50")
    for (const sign of [-1, 1]) {
      const from = { x: x + 3, y: sign > 0 ? y + depth + 3 : y + depth + faceHeight - 5 }
      const to = { x: x + width - 4, y: sign > 0 ? y + depth + faceHeight - 5 : y + depth + 3 }
      pixelLine(ctx, from, to, "#352c29", 4); pixelLine(ctx, from, to, "#987857", 2)
    }
    for (const xx of [x + 2, x + width - 3]) for (const yy of [y + depth + 2, y + depth + faceHeight - 4]) fill(xx, yy, 1, 1, "#9ba7bc")
  } else {
    texture(ctx, material === "gate" ? "iron" : "masonry", x, y + depth, width, faceHeight)
    if (material === "gate") texture(ctx, "cap", x, y, width, depth)
    else {
      fill(x, y, width, depth, "#485166"); fill(x + 2, y + 2, width - 4, depth - 4, "#737d94")
      pixelLine(ctx, { x: x + 2, y: y + 2 }, { x: x + width - 3, y: y + 2 }, "#9ba7bc")
    }
  }
  pixelLine(ctx, { x, y }, { x: x + width - 1, y }, material === "wood" ? "#947058" : "#b3c0b2")
  pixelLine(ctx, { x, y: y + 1 }, { x, y: y + depth - 1 }, "#899692")
  pixelLine(ctx, { x: x + width - 1, y }, { x: x + width - 1, y: Math.round(ground.y) }, "#263234")
  pixelLine(ctx, { x, y: Math.round(ground.y) }, { x: x + width, y: Math.round(ground.y) }, "#171c2e", 2)
  if (material === "gate") {
    pixelLine(ctx, { x: x + 1, y: y + depth }, { x: x + width - 2, y: y + depth }, edge, 2)
  } else if (width > 46 && material === "stone") {
    const hash = decorationHash(Math.round(b.x), Math.round(b.y), 3)
    if (hash % 3 !== 0) torchFire(ctx, x + (hash % 2 === 0 ? 10 : width - 10), Math.round(ground.y) - 2, world, hash)
    if (width > 92 && hash % 2 === 0) sprite(ctx, "banner-red", x + Math.floor(width * 0.65), Math.round(ground.y) - 1)
  } else if (material === "stone" && b.h > b.w * 2) {
    sprite(ctx, "chain", x + Math.floor(width / 2), Math.round(ground.y) - 1)
  } else if (material === "stone" && decorationHash(Math.round(b.x * 10), Math.round(b.y * 10), 0) % 3 === 0) {
    // Floor dressing stays beside the base, never on the cap.
    sprite(ctx, "pots", x + width + 5, Math.round(ground.y) + 4)
  }
}
