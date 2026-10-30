/**
 * The Blade's traffic light, as a plain question: is a full-speed dash up the lane, started from its foot at this
 * world time, clear of the bar all the way? Checked against where the bar will be when you reach each step, with
 * the game's own hit distance and a small margin. Pure, so the renderer draws it and a test can trust it.
 */
import { segmentDistance } from "../sim/geometry.ts"
import { hazardAt } from "../sim/hazards.ts"
import type { Hazard } from "../sim/rooms.ts"
import { HAZARD, TUNING } from "../sim/tuning.ts"

export type Blade = Extract<Hazard, { readonly kind: "blade" }>

/**
 * The lane: left of the hub, as far out as your body fits past the bar's tip (straight through the hub always meets
 * the bar; on the right the bar sweeps into you; the outer edge is where it is longest away), from the foot of the
 * bar's sweep to past its top. For The Blade (a 4.2 m gap) a dash up it gets through for about 60% of a turn.
 */
export const bladeLane = (blade: Blade): { readonly x: number; readonly foot: number; readonly end: number } => {
  const reach = blade.length + 0.6
  return { x: blade.x - (blade.length - 0.34), foot: blade.y + reach, end: blade.y - reach }
}

export const bladeLaneSafe = (blade: Blade, world: number): boolean => {
  const { x, foot, end } = bladeLane(blade)
  const speed = TUNING.player.speed, hit = TUNING.player.radius + HAZARD.width + 0.12
  for (let y = foot; y >= end; y -= 0.1) {
    const bar = hazardAt(blade, world + (foot - y) / speed)
    if (segmentDistance(x, y, bar.ax, bar.ay, bar.bx, bar.by) < hit) return false
  }
  return true
}
