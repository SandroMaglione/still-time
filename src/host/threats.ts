import { pixelArc, pixelLine, type Point } from "./pixels.ts"

export const THREAT = "#ff6845"
export const DANGER = "#ff4055"
const INK = "#171c2e"

/** A 1 px signal on a 3 px ink bed, so the threat survives every floor value without shouting. */
export const threatLine = (ctx: CanvasRenderingContext2D, a: Point, b: Point, locked = false, dash = 0): void => {
  pixelLine(ctx, a, b, INK, 3, dash)
  pixelLine(ctx, a, b, locked ? DANGER : THREAT, 1, dash)
}

/** Where a shot will pass: a fine dotted line, no ink, so many paths at once still read as lines and not as walls. */
export const shotPath = (ctx: CanvasRenderingContext2D, a: Point, b: Point): void => {
  pixelLine(ctx, a, b, THREAT, 1, 2)
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

/** A small 1 px chevron: a frozen path still says which way it goes. */
export const pathArrow = (ctx: CanvasRenderingContext2D, at: Point, angle: number): void => {
  const tip = { x: at.x + Math.cos(angle) * 2, y: at.y + Math.sin(angle) * 2 }
  for (const side of [-1, 1]) pixelLine(ctx, tip, { x: at.x - Math.cos(angle) * 2 + Math.sin(angle) * side * 2, y: at.y - Math.sin(angle) * 2 - Math.cos(angle) * side * 2 }, THREAT)
}
