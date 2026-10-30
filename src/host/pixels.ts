/** Raster primitives for effects. Every mark lands on the same source pixel grid. */
export interface Point { readonly x: number; readonly y: number }

export const pixelLine = (ctx: CanvasRenderingContext2D, a: Point, b: Point, colour: string, width = 1, dash = 0): void => {
  let x = Math.round(a.x), y = Math.round(a.y)
  const bx = Math.round(b.x), by = Math.round(b.y)
  const dx = Math.abs(bx - x), sx = x < bx ? 1 : -1
  const dy = -Math.abs(by - y), sy = y < by ? 1 : -1
  let error = dx + dy, step = 0
  ctx.fillStyle = colour
  for (;;) {
    if (dash === 0 || Math.floor(step / dash) % 2 === 0) ctx.fillRect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width)
    if (x === bx && y === by) break
    const twice = error * 2
    if (twice >= dy) { error += dy; x += sx }
    if (twice <= dx) { error += dx; y += sy }
    step++
  }
}

export const pixelArc = (ctx: CanvasRenderingContext2D, centre: Point, rx: number, ry: number, start: number, end: number, colour: string, width = 1, segmented = false): void => {
  const count = Math.max(1, Math.ceil(Math.abs(end - start) * Math.max(rx, ry)))
  let previous = { x: centre.x + Math.cos(start) * rx, y: centre.y + Math.sin(start) * ry }
  for (let i = 1; i <= count; i++) {
    const angle = start + (end - start) * i / count
    const next = { x: centre.x + Math.cos(angle) * rx, y: centre.y + Math.sin(angle) * ry }
    if (!segmented || Math.floor(i / 3) % 3 === 0) pixelLine(ctx, previous, next, colour, width)
    previous = next
  }
}

/** A stippled attack sector in ground space; no translucent solid disk over the art. */
export const pixelSector = (ctx: CanvasRenderingContext2D, centre: Point, rx: number, ry: number, aim: number, arc: number, colour: string, spacing: number): void => {
  ctx.fillStyle = colour
  for (let y = Math.ceil(centre.y - ry); y <= centre.y + ry; y++) {
    for (let x = Math.ceil(centre.x - rx); x <= centre.x + rx; x++) {
      if ((x + y * 2) % spacing !== 0 || y % 2 !== 0) continue
      const nx = (x - centre.x) / rx, ny = (y - centre.y) / ry
      if (nx * nx + ny * ny > 1) continue
      const d = Math.atan2(Math.sin(Math.atan2(ny, nx) - aim), Math.cos(Math.atan2(ny, nx) - aim))
      if (Math.abs(d) <= arc) ctx.fillRect(x, y, 1, 1)
    }
  }
}

/** Stable decoration choices are derived from tile coordinates, never simulation randomness. */
export const decorationHash = (x: number, y: number, room: number): number => {
  let n = Math.imul(x + 37, 374761393) ^ Math.imul(y + 11, 668265263) ^ Math.imul(room + 1, 1274126177)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return (n ^ (n >>> 16)) >>> 0
}
