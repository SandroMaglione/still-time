/**
 * Progress through the rooms, from each room's best result (by room index,
 * null until cleared): rooms open one by one, each once the room before it
 * is cleared. The simulation checks it on every jump to a room, and the
 * page's room select reads the same rules.
 */
import type { RoomResult } from "./schema.ts"

export type Best = ReadonlyArray<RoomResult | null>

/** The first room is always open; any other once the room before it is cleared. */
export const unlocked = (best: Best, room: number): boolean => room === 0 || (best[room - 1] ?? null) !== null

/** Where to pick up: the first room not cleared yet, or the last when every room is. */
export const continueRoom = (best: Best): number => {
  const next = best.findIndex((b) => b === null)
  return next === -1 ? Math.max(0, best.length - 1) : next
}

/** Stars earned across the rooms. */
export const totalStars = (best: Best): number => best.reduce((n, b) => n + (b?.stars ?? 0), 0)
