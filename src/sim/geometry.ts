/** Circles against the rooms' rectangles: pushing out, overlap, and line of sight. */
import type { Pillar } from "./rooms.ts"

/** Pushes a circle out of a rectangle; returns the corrected centre, or null when apart. */
export const pushOut = (x: number, y: number, r: number, p: Pillar): { x: number; y: number } | null => {
  const cx = Math.max(p.x, Math.min(x, p.x + p.w))
  const cy = Math.max(p.y, Math.min(y, p.y + p.h))
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy)
  if (d >= r) return null
  if (d === 0) {
    // Centre inside: leave by the nearest side.
    const left = x - p.x, right = p.x + p.w - x, top = y - p.y, bottom = p.y + p.h - y
    const m = Math.min(left, right, top, bottom)
    if (m === left) return { x: p.x - r, y }
    if (m === right) return { x: p.x + p.w + r, y }
    if (m === top) return { x, y: p.y - r }
    return { x, y: p.y + p.h + r }
  }
  return { x: cx + (dx / d) * r, y: cy + (dy / d) * r }
}

export const insidePillar = (x: number, y: number, r: number, pillars: ReadonlyArray<Pillar>): boolean =>
  pillars.some((p) => pushOut(x, y, r, p) !== null)

/** True when the segment from a to b crosses no pillar: the slab test per rectangle. */
export const clearLine = (ax: number, ay: number, bx: number, by: number, pillars: ReadonlyArray<Pillar>): boolean => {
  const dx = bx - ax, dy = by - ay
  for (const p of pillars) {
    let t0 = 0, t1 = 1
    const slabs: ReadonlyArray<readonly [number, number, number, number]> = [[dx, ax, p.x, p.x + p.w], [dy, ay, p.y, p.y + p.h]]
    let blocked = true
    for (const [d, a, lo, hi] of slabs) {
      if (d === 0) {
        if (a < lo || a > hi) { blocked = false; break }
        continue
      }
      let ta = (lo - a) / d, tb = (hi - a) / d
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) { blocked = false; break }
    }
    if (blocked) return false
  }
  return true
}

/** Whether an enemy at (ex, ey) can see a target at (x, y): in range, nothing in the way. */
export const canSee = (ex: number, ey: number, x: number, y: number, sight: number, pillars: ReadonlyArray<Pillar>): boolean =>
  Math.hypot(x - ex, y - ey) <= sight && clearLine(ex, ey, x, y, pillars)

/** Distance from point (px, py) to the segment from a to b. */
export const segmentDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}
