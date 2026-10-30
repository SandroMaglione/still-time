/**
 * The three first rooms, played headless, one lesson each: First Step the
 * move (an empty room cleared by the page's drill), Time Door the clock (a door
 * whose timer runs only while you move), First Cut the cut (one gunner).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { fightIn, runUntil } from "./helpers.ts"

test("First Step: nothing in the room; walking anywhere does not clear it, the page's lesson done does", () => {
  const { fight, thumb } = fightIn("First Step")
  assert.equal(fight.view().room.index, 0, "it is the first room")
  assert.equal(fight.view().room.goal.kind, "lesson")
  assert.equal(fight.view().enemies.length, 0)
  assert.equal(fight.view().hazards.length, 0)
  for (const push of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
    runUntil(fight, 120, () => false, () => { thumb.push = push })
  }
  assert.equal(fight.view().flow, "playing", "no exit to walk to")
  thumb.push = { x: 0, y: 0 }
  fight.send({ kind: "lessonDone" })
  runUntil(fight, 5, () => fight.view().flow !== "playing")
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("Time Door: the door opens only once its timer has run, and its timer runs only while you move", () => {
  const { fight, thumb } = fightIn("Time Door")
  assert.equal(fight.view().room.index, 1, "it is the second room")
  assert.equal(fight.view().hazards.length, 0)
  const door = (): boolean => fight.view().doors[0]?.open === true
  const lock = fight.view().doors[0]?.lock
  assert.ok(lock !== undefined && lock.kind === "time")
  // Standing still, two real seconds: the world barely runs and the door stays shut.
  runUntil(fight, 120, () => false)
  assert.equal(door(), false, "still, the door waits")
  // Straight up runs into the shut door: the exit cannot be reached yet.
  runUntil(fight, 120, () => fight.view().flow !== "playing", () => { thumb.push = { x: 0, y: -1 } })
  assert.equal(fight.view().flow, "playing")
  // Moving about runs the clock; once it has run the door's seconds, it opens, and the exit is reached.
  runUntil(fight, 900, () => door() || fight.view().flow !== "playing", () => { thumb.push = { x: 0, y: -1 } })
  assert.equal(door(), true, "moving opens it")
  assert.ok(fight.view().world >= lock.seconds - 1e-9)
  runUntil(fight, 600, () => fight.view().flow !== "playing", () => { thumb.push = { x: 0, y: -1 } })
  assert.equal(fight.view().flow, "cleared")
})

test("First Cut: one gunner, the only thing to cut", () => {
  const { fight } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 2)
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner"])
  assert.equal(fight.view().room.goal.kind, "clear")
})
