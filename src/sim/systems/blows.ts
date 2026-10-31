/**
 * What a blow (your cut, or a shot) does to a melee enemy: its guarded front
 * stops it; anywhere else, it falls.
 */
import { angleDiff } from "../geometry.ts"
import { MELEE, type MeleeKind } from "../tuning.ts"

export type BlowResult = "guarded" | "down"

/** Whether a melee enemy's front is up now, against a blow coming from angle `from` (from its centre). */
export const guards = (kind: MeleeKind, facing: number, from: number): boolean => {
  const spec = MELEE[kind]
  return spec.guard === "always" && Math.abs(angleDiff(from, facing)) <= spec.guardArc
}

/** A blow from angle `from` on a melee enemy of `kind`, facing `facing`. */
export const blow = (kind: MeleeKind, facing: number, from: number): BlowResult =>
  guards(kind, facing, from) ? "guarded" : "down"
