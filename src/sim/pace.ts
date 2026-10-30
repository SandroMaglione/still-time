/**
 * The core rule as two pure functions, shared by the game and the host's briefing so both feel the same: how hard
 * the thumb pushes (0 to 1, shaped for finer control near the press point), and the world speed easing toward that
 * push: frozen (`TUNING.slow`) while you are still, real time at full push.
 */
import { Ops } from "@typeonce/ritmo"

import { TUNING } from "./tuning.ts"

export const pushOf = (x: number, y: number): number => Ops.pow(Math.min(1, Ops.hypot(x, y)), TUNING.player.curve)

/** The world speed one step on, from `scale`, for a push of (x, y), over `dt` real seconds. */
export const paceToward = (scale: number, x: number, y: number, dt: number): number => {
  const target = TUNING.slow + (1 - TUNING.slow) * pushOf(x, y)
  return scale + (target - scale) * Math.min(1, TUNING.timeEase * dt)
}
