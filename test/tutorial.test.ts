/**
 * The two first rooms, played headless: First Step teaches the freeze with a
 * blade that turns only while you move; First Cut is one gunner to cut.
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

test("First Step: standing still holds the blade; timed, the gap can be crossed to the exit", () => {
  const { fight, thumb } = fightIn("First Step")
  assert.equal(fight.view().room.index, 0, "it is the first room")
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
    if (fight.view().flow === "cleared" && fight.view().hits === 0) crossings.push(wait)
  }
  assert.ok(crossings.length > 0, "some timing crosses the blade to the exit")
  assert.ok(crossings.length < tries, "and some timing does not: the blade is the lesson")
})

test("First Cut: one gunner, the only thing to cut", () => {
  const { fight } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 1)
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner"])
  assert.equal(fight.view().room.goal.kind, "clear")
})
