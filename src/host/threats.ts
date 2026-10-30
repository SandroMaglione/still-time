import { pixelArc, pixelLine, type Point } from "./pixels.ts"

export const THREAT = "#ff6845"
export const DANGER = "#ff4055"
const INK = "#171c2e"

/** Ink is continuous beneath the signal, so the threat survives every floor value. */
export const threatLine = (ctx: CanvasRenderingContext2D, a: Point, b: Point, locked = false, dash = 0): void => {
  pixelLine(ctx, a, b, INK, locked ? 5 : 4, dash)
  pixelLine(ctx, a, b, locked ? DANGER : THREAT, locked ? 3 : 2, dash)
}

export const threatArc = (ctx: CanvasRenderingContext2D, centre: Point, rx: number, ry: number, start: number, end: number, colour = THREAT, width = 2, segmented = false): void => {
  pixelArc(ctx, centre, rx, ry, start, end, INK, width + 2, segmented)
  pixelArc(ctx, centre, rx, ry, start, end, colour, width, segmented)
}

/** Nested raster ellipses keep reload red at 2px with a 1px ink edge, even at the tight ends. */
export const reloadArc = (ctx: CanvasRenderingContext2D, centre: Point, rx: number, ry: number, charge: number, colour: string): void => {
  const x = Math.round(centre.x), y = Math.round(centre.y), sweep = Math.max(0, Math.min(1, charge)) * Math.PI * 2
  if (sweep === 0) return
  const inside = (dx: number, dy: number, a: number, b: number): boolean => dx * dx / (a * a) + dy * dy / (b * b) <= 1
  for (let dy = -ry - 1; dy <= ry + 1; dy++) for (let dx = -rx - 1; dx <= rx + 1; dx++) {
    const angle = Math.atan2(dy / ry, dx / rx)
    const turn = (angle + Math.PI * 2.5) % (Math.PI * 2)
    if (turn > sweep || !inside(dx, dy, rx + 1, ry + 1) || inside(dx, dy, rx - 3, ry - 3)) continue
    const tangent = Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle))
    const red = inside(dx, dy, rx, ry) && !inside(dx, dy, rx - 2, ry - 2) && turn * tangent >= 1 && (sweep - turn) * tangent >= 1
    ctx.fillStyle = red ? colour : INK
    ctx.fillRect(x + dx, y + dy, 1, 1)
  }
}

/** Repeated forward chevrons let a frozen path carry velocity direction. */
export const pathArrow = (ctx: CanvasRenderingContext2D, at: Point, angle: number): void => {
  const tip = { x: at.x + Math.cos(angle) * 3, y: at.y + Math.sin(angle) * 3 }
  for (const side of [-1, 1]) threatLine(ctx, tip, { x: at.x - Math.cos(angle) * 3 + Math.sin(angle) * side * 3, y: at.y - Math.sin(angle) * 3 - Math.cos(angle) * side * 3 })
}
