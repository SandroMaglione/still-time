/**
 * The three first rooms, played headless, one lesson each: First Step the
 * move and the clock (blades that spin only while you move, out of reach of a
 * straight walk), The Blade the freeze (a blade in your way that turns only
 * while you move), First Cut the cut (one gunner).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { fightIn, runUntil } from "./helpers.ts"

/** The blade bar's angle, folded to [0, π): it is a line through its hub. */
const barAngle = (fight: Fight): number => {
  const h = fight.view().hazards[0]
  assert.ok(h !== undefined)
  const a = Math.atan2(h.by - h.ay, h.bx - h.ax)
  return ((a % Math.PI) + Math.PI) % Math.PI
}

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

test("The Blade: standing still holds the blade; after its full turn, timed, the gap can be crossed to the exit", () => {
  const { fight, thumb } = fightIn("The Blade")
  assert.equal(fight.view().room.index, 1, "it is the second room")
  const before = barAngle(fight)
  // Two real seconds standing still: at ×0.04 the bar turns about 0.08 rad, where at full speed it would turn 2.
  runUntil(fight, 120, () => false)
  assert.ok(Math.abs(barAngle(fight) - before) < 0.1, "still, the world (and the blade) barely moves")

  // Off the hub, in the left half of the gap: walk up to just below the blade's reach.
  runUntil(fight, 300, () => { const p = fight.view().player; return p !== null && p.y <= 10.4 && p.x <= 4.1 }, () => {
    const p = fight.view().player
    thumb.push = { x: p !== null && p.x > 4.1 ? -1 : 0, y: p !== null && p.y > 10.4 ? -1 : 0 }
  })
  thumb.push = { x: 0, y: 0 }
  const saved = fight.runtime.snapshot()
  if (!saved.ok) throw new Error("snapshot failed")
  // Try waiting longer and longer (time runs only while you nudge; a full nudge runs it near full speed), then dash up:
  // over a full turn of the bar, some timings cross cleanly and some don't.
  const crossings: Array<number> = []
  const tries = 70
  for (let wait = 0; wait < tries * 6; wait += 6) {
    assert.ok(fight.runtime.restore(saved.value).ok)
    let flip = 1
    runUntil(fight, wait, () => false, () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
    runUntil(fight, 400, () => fight.view().flow !== "playing", () => { thumb.push = { x: 0, y: -1 } })
    if (fight.view().flow === "cleared" && fight.view().hits === 0) {
      // The exit opens only after one full turn of the blade, on the world clock.
      assert.ok(fight.view().world >= Math.PI * 2, "cleared only after the blade's full turn")
      crossings.push(wait)
    }
  }
  assert.ok(crossings.length > 0, "some timing crosses the blade to the exit")
  assert.ok(crossings.length < tries, "and some timing does not: the blade is the lesson")
})

test("The Blade: the door to the exit opens only after the blade's full turn, on the world clock", () => {
  const { fight, thumb } = fightIn("The Blade")
  const door = (): boolean => fight.view().doors[0]?.open === true
  assert.equal(fight.view().doors[0]?.lock.kind, "time")
  // Standing still, two real seconds: the world barely runs and the door stays shut.
  runUntil(fight, 120, () => false)
  assert.equal(door(), false, "still, the door waits")
  // Moving about (side to side, at full push) runs the world clock; the door opens once it has run a full turn.
  let flip = 1
  runUntil(fight, 900, () => door(), () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
  assert.equal(door(), true, "moving opens it")
  assert.ok(fight.view().world >= Math.PI * 2 - 1e-9, "after one full turn of the blade")
})

test("First Cut: one gunner, the only thing to cut", () => {
  const { fight } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 2)
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner"])
  assert.equal(fight.view().room.goal.kind, "clear")
})
