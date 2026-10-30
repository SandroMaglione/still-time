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

/** Repeated forward chevrons let a frozen path carry velocity direction. */
export const pathArrow = (ctx: CanvasRenderingContext2D, at: Point, angle: number): void => {
  const tip = { x: at.x + Math.cos(angle) * 3, y: at.y + Math.sin(angle) * 3 }
  for (const side of [-1, 1]) threatLine(ctx, tip, { x: at.x - Math.cos(angle) * 3 + Math.sin(angle) * side * 3, y: at.y - Math.sin(angle) * 3 - Math.cos(angle) * side * 3 })
}
