/**
 * What a blow (your cut, or a shot) does to a melee enemy: a guarded front
 * stops it, a staggered enemy shrugs it off, the last hit downs it, and any
 * other hit costs one hit point and staggers it, knocked away from the blow.
 */
import { Ops } from "@typeonce/ritmo"
import type { WriteCellForDescriptor } from "@typeonce/ritmo/Query"

import { angleDiff, settle } from "../geometry.ts"
import type { Pillar, Room } from "../rooms.ts"
import type { Blade, Body, Melee } from "../schema.ts"
import { MELEE, STAGGER, type MeleeKind } from "../tuning.ts"

export type BlowResult = "guarded" | "dazed" | "staggered" | "down"

/** Whether a melee enemy's front is up now, against a blow coming from angle `from` (from its centre). */
export const guards = (kind: MeleeKind, phase: string, facing: number, from: number): boolean => {
  const spec = MELEE[kind]
  const up = spec.guard === "always" ? phase !== "stagger" : phase === "windup" || phase === "swing"
  return up && Math.abs(angleDiff(from, facing)) <= spec.guardArc
}

export interface MeleeCells {
  readonly body: WriteCellForDescriptor<typeof Body>
  readonly melee: WriteCellForDescriptor<typeof Melee>
  readonly blade: WriteCellForDescriptor<typeof Blade>
}

/** Lands a blow from `source` on a melee enemy of `kind`; the caller despawns it on "down". */
export const blow = (kind: MeleeKind, cells: MeleeCells, source: { readonly x: number; readonly y: number }, room: Room, walls: ReadonlyArray<Pillar>): BlowResult => {
  const at = cells.body.get()
  const melee = cells.melee.get()
  const blade = cells.blade.get()
  const from = Ops.atan2(source.y - at.y, source.x - at.x)
  if (blade._tag === "stagger") return "dazed"
  if (guards(kind, blade._tag, melee.facing, from)) return "guarded"
  if (melee.hp <= 1) return "down"
  cells.melee.set({ facing: melee.facing, pace: melee.pace, hp: melee.hp - 1 })
  cells.body.set(settle(at.x - Ops.cos(from) * STAGGER.push, at.y - Ops.sin(from) * STAGGER.push, MELEE[kind].radius, room.w, room.h, walls))
  const dazed = { left: STAGGER.time }
  switch (blade._tag) {
    case "idle": cells.blade.transition({ from: "idle", to: "stagger", data: dazed }); break
    case "chase": cells.blade.transition({ from: "chase", to: "stagger", data: dazed }); break
    case "windup": cells.blade.transition({ from: "windup", to: "stagger", data: dazed }); break
    case "swing": cells.blade.transition({ from: "swing", to: "stagger", data: dazed }); break
    case "recover": cells.blade.transition({ from: "recover", to: "stagger", data: dazed }); break
  }
  return "staggered"
}
