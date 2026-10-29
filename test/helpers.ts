/** Scripted thumbs, rooms by name, and placing the player, for the headless tests. */
import assert from "node:assert/strict"

import { ROOMS } from "../src/sim/rooms.ts"
import { createFight, type Fight, type Thumb } from "../src/sim/simulation.ts"

/** A thumb a test steers: set `push`, call `tap()`; the next step reads it. */
export class ScriptedThumb {
  push = { x: 0, y: 0 }
  private tapped = false

  tap(): void {
    this.tapped = true
  }

  snapshot(): Thumb {
    const thumb = { x: this.push.x, y: this.push.y, tap: this.tapped }
    this.tapped = false
    return thumb
  }
}

export const roomIndex = (name: string): number => {
  const index = ROOMS.findIndex((r) => r.name === name)
  assert.notEqual(index, -1, `no room named ${name}`)
  return index
}

export const fightIn = (name: string): { readonly fight: Fight; readonly thumb: ScriptedThumb } => {
  const thumb = new ScriptedThumb()
  return { fight: createFight(roomIndex(name), thumb), thumb }
}

/** Moves the player by editing a snapshot and restoring it: a test starting from a chosen spot. */
export const placePlayer = (fight: Fight, x: number, y: number): void => {
  const snapshot = fight.runtime.snapshot()
  if (!snapshot.ok) throw new Error("snapshot failed")
  // The snapshot is plain data: rewrite the player's Body, keep everything else.
  const edited = {
    ...snapshot.value,
    entities: snapshot.value.entities.map((e) => ("Slap/Player" in e.components ? { id: e.id, components: { ...e.components, "Slap/Body": { x, y } } } : e))
  }
  const restored = fight.runtime.restore(edited)
  if (!restored.ok) throw new Error(`restore failed ${JSON.stringify(restored.error)}`)
}

/** Ticks until `done` (or `max` steps), steering with `steer` before each step. Returns the steps taken. */
export const runUntil = (fight: Fight, max: number, done: () => boolean, steer: () => void = () => {}): number => {
  let steps = 0
  while (steps < max && !done()) {
    steer()
    fight.tick()
    steps++
  }
  return steps
}

/** A unit push from the player toward a point (or away, with `away`). */
export const pushToward = (fight: Fight, x: number, y: number, away = false): { x: number; y: number } => {
  const me = fight.view().player
  if (me === null) return { x: 0, y: 0 }
  const dx = x - me.x, dy = y - me.y
  const d = Math.hypot(dx, dy) || 1
  const sign = away ? -1 : 1
  return { x: (dx / d) * sign, y: (dy / d) * sign }
}
