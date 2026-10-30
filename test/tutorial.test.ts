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

test("Time Door: three time doors open one after another, only as the world clock runs (only while you move)", () => {
  const { fight, thumb } = fightIn("Time Door")
  assert.equal(fight.view().room.index, 1, "it is the second room")
  assert.equal(fight.view().hazards.length, 0)
  const doors = fight.view().doors
  assert.equal(doors.length, 3)
  const seconds = doors.map((d) => (d.lock.kind === "time" ? d.lock.seconds : -1))
  assert.ok(seconds.every((t, i) => t > 0 && (i === 0 || t > seconds[i - 1]!)), "time doors, each later than the last")
  // Standing still, two real seconds: the world barely runs and every door stays shut.
  runUntil(fight, 120, () => false)
  assert.ok(fight.view().doors.every((d) => !d.open), "still, the doors wait")
  // Walking up the corridor (pushing on against each shut door) runs the clock: they open in order, and the exit is reached.
  const opened: Array<number> = []
  runUntil(fight, 3000, () => fight.view().flow !== "playing", () => {
    thumb.push = { x: 0, y: -1 }
    fight.view().doors.forEach((d, i) => { if (d.open && !opened.includes(i)) opened.push(i) })
  })
  assert.deepEqual(opened, [0, 1, 2], "in order")
  assert.equal(fight.view().flow, "cleared")
  assert.ok(fight.view().world >= seconds[2]! - 1e-9)
})

/** Walks at the nearest enemy not shut away behind a door, until the room ends or the step budget runs out. */
const chase = (fight: ReturnType<typeof fightIn>["fight"], thumb: ReturnType<typeof fightIn>["thumb"], until: () => boolean, max = 1500): void => {
  runUntil(fight, max, () => until() || fight.view().flow !== "playing", () => {
    const p = fight.view().player!
    const open = fight.view().enemies.filter((e) => !e.sealed)
    const e = open.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
    if (e === undefined) { thumb.push = { x: 0, y: 0 }; return }
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1
    thumb.push = { x: dx / d, y: dy / d }
  })
}

test("First Cut: three gunners that never fire; cut the first, its door opens on two more; cut them and the room clears", () => {
  const { fight, thumb } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 2)
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner", "gunner", "gunner"])
  assert.ok(fight.view().enemies.every((e) => e.quiet), "none of them attacks")
  assert.equal(fight.view().room.goal.kind, "clear")
  assert.equal(fight.view().doors[0]?.open, false, "the second chamber is shut")
  // Time running for a while (side to side, full push): nobody fires.
  let flip = 1
  runUntil(fight, 600, () => fight.view().shots.length > 0, () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
  assert.equal(fight.view().shots.length, 0, "quiet gunners never fire")
  // Walk into the first: it is cut, and the door opens.
  chase(fight, thumb, () => fight.view().enemies.length < 3)
  assert.equal(fight.view().enemies.length, 2)
  runUntil(fight, 5, () => false)
  assert.equal(fight.view().doors[0]?.open, true, "the first chamber cleared, its door opens")
  // Then the two inside.
  chase(fight, thumb, () => false)
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})
