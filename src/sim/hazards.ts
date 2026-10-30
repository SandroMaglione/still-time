/**
 * Where a hazard is at a moment of the attempt's world clock: a blade bar
 * (its two ends), or a laser gate's beam and whether it is off, warning
 * (about to come on), or on. Pure, so the system and the view agree.
 */
import { Ops } from "@typeonce/ritmo"

import type { Hazard } from "./rooms.ts"
import { HAZARD } from "./tuning.ts"

export interface HazardShape {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  /** Whether it takes whoever it touches now (a blade always; a gate while on). */
  readonly live: boolean
  /** Gates only: on, about to come on, or off. */
  readonly state: "on" | "warn" | "off"
}

export const hazardAt = (hazard: Hazard, world: number): HazardShape => {
  if (hazard.kind === "blade") {
    const a = hazard.phase + hazard.speed * world
    const dx = Ops.cos(a) * hazard.length, dy = Ops.sin(a) * hazard.length
    return { ax: hazard.x - dx, ay: hazard.y - dy, bx: hazard.x + dx, by: hazard.y + dy, live: true, state: "on" }
  }
  const t = (((world + hazard.offset) % hazard.period) + hazard.period) % hazard.period
  const onFor = hazard.on * hazard.period
  const state = t < onFor ? "on" : t > hazard.period - HAZARD.warn ? "warn" : "off"
  return { ax: hazard.x1, ay: hazard.y1, bx: hazard.x2, by: hazard.y2, live: state === "on", state }
}
