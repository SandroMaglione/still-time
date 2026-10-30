/**
 * The three first rooms, played headless, one lesson each: First Step the
 * move and the clock (blades that spin only while you move, out of reach of a
 * straight walk), The Blade the freeze (a blade in your way that turns only
 * while you move), First Cut the cut (one gunner).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { fightIn, runUntil, type ScriptedThumb } from "./helpers.ts"

/** The blade bar's angle, folded to [0, π): it is a line through its hub. */
const barAngle = (fight: Fight): number => {
  const h = fight.view().hazards[0]
  assert.ok(h !== undefined)
  const a = Math.atan2(h.by - h.ay, h.bx - h.ax)
  return ((a % Math.PI) + Math.PI) % Math.PI
}

/** Walks toward a floor point at full push until within reach of it (or the attempt ends). */
const walkTo = (fight: Fight, thumb: ScriptedThumb, x: number, y: number, max = 600): void => {
  runUntil(fight, max, () => {
    const p = fight.view().player
    return p === null || fight.view().flow !== "playing" || Math.hypot(x - p.x, y - p.y) < 0.15
  }, () => {
    const p = fight.view().player!
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 1
    thumb.push = { x: dx / d, y: dy / d }
  })
  thumb.push = { x: 0, y: 0 }
}

/** At a stream's edge, waits (nudging so time runs) for longer and longer, then crosses: the first clean crossing is kept. */
const crossStream = (fight: Fight, thumb: ScriptedThumb, to: { readonly x: number; readonly y: number }): void => {
  const saved = fight.runtime.snapshot()
  if (!saved.ok) throw new Error("snapshot failed")
  for (let wait = 0; wait < 120; wait += 3) {
    assert.ok(fight.runtime.restore(saved.value).ok)
    let flip = 1
    runUntil(fight, wait, () => false, () => { flip = -flip; thumb.push = { x: flip * 0.4, y: 0 } })
    walkTo(fight, thumb, to.x, to.y, 200)
    if (fight.view().flow === "playing" && fight.view().hits === 0) return
  }
  assert.fail(`no clean crossing to ${to.x}, ${to.y}`)
}

test("First Step: three bullet streams across a zig-zag; stopping at each and picking a gap crosses it, to the exit", () => {
  const { fight, thumb } = fightIn("First Step")
  assert.equal(fight.view().room.index, 0, "it is the first room")
  assert.equal(fight.view().enemies.length, 0)
  assert.ok(fight.view().hazards.some((h) => h.kind === "bolt"), "bullet streams")
  // Still, the bullets barely move.
  const bolt = (): { x: number; y: number } => { const h = fight.view().hazards.find((b) => b.kind === "bolt" && b.live)!; return { x: h.ax, y: h.ay } }
  const before = bolt()
  runUntil(fight, 30, () => false)
  const after = bolt()
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 0.4, "still, the bullets barely move")
  // Aisle 1: to the stream's edge below the right doorway, across, through.
  walkTo(fight, thumb, 10.7, 23.3)
  crossStream(fight, thumb, { x: 10.7, y: 20.6 })
  // Aisle 2: through the doorway to the stream's edge, across, then left to the next doorway.
  walkTo(fight, thumb, 10.7, 16.8)
  crossStream(fight, thumb, { x: 10.7, y: 14.2 })
  walkTo(fight, thumb, 1.3, 14.2)
  // Aisle 3: up through the doorway to the last stream, across, to the exit.
  walkTo(fight, thumb, 1.3, 7.3)
  crossStream(fight, thumb, { x: 1.3, y: 4.7 })
  walkTo(fight, thumb, 10, 1.8)
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("The Blade: standing still holds the blade; timed, the gap can be crossed to the exit", () => {
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
    if (fight.view().flow === "cleared" && fight.view().hits === 0) crossings.push(wait)
  }
  assert.ok(crossings.length > 0, "some timing crosses the blade to the exit")
  assert.ok(crossings.length < tries, "and some timing does not: the blade is the lesson")
})

test("First Cut: one gunner, the only thing to cut", () => {
  const { fight } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 2)
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner"])
  assert.equal(fight.view().room.goal.kind, "clear")
})
