/**
 * The core rule as pure functions: how hard the thumb pushes (0 to 1, shaped for finer control near the press point),
 * and the world speed easing toward how fast you actually walk: frozen (`TUNING.slow`) while you are still (pushing
 * into a wall included), real time at top speed.
 */
import { Ops } from "@typeonce/ritmo"

import { TUNING } from "./tuning.ts"

export const pushOf = (x: number, y: number): number => Ops.pow(Math.min(1, Ops.hypot(x, y)), TUNING.player.curve)

/** Within this of its target, the world speed snaps to it: a freeze is exact (the clock stops), not a long tail. */
const SNAP = 0.002

/** The world speed one step on, from `scale`, for a pace of `walked` (0 still to 1 top speed), over `dt` real seconds. */
export const paceTo = (scale: number, walked: number, dt: number): number => {
  const target = TUNING.slow + (1 - TUNING.slow) * Math.max(0, Math.min(1, walked))
  const next = scale + (target - scale) * Math.min(1, TUNING.timeEase * dt)
  return Math.abs(next - target) < SNAP ? target : next
}
