/**
 * The clear replay, headless: an attempt recorded from its start replays exactly (the simulation is deterministic),
 * skipping the stretches you stood still in, and counts the attempt's real seconds still and moving.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { Replay } from "../src/host/replay.ts"
import { createFight, type Thumb } from "../src/sim/simulation.ts"
import { pushToward, roomIndex } from "./helpers.ts"

test("a cleared attempt replays to the same clear, its still stretches skipped", () => {
  const replay = new Replay()
  let push: Thumb = { x: 0, y: 0, tap: false }
  const fight = createFight(roomIndex("Duel"), { snapshot: () => { replay.record(push); return push } })
  replay.begin(fight)
  // Dodge the spear's thrust, cut it as it recovers; stop and look now and then (time stands still while you do).
  let phase: "approach" | "dodge" | "cut" = "approach", steps = 0
  while (fight.view().flow === "playing" && steps < 3000) {
    const b = fight.view().enemies[0]
    const m = b?.melee
    steps++
    if (b === undefined || m === null || m === undefined) break
    if (phase === "approach" && m.locked) phase = "dodge"
    if (phase === "dodge" && m.phase === "recover") phase = "cut"
    const p = pushToward(fight, b.x, b.y, phase === "dodge")
    push = steps % 50 < 20 && phase === "approach" ? { x: 0, y: 0, tap: false } : { x: phase === "dodge" ? p.y : p.x, y: phase === "dodge" ? -p.x : p.y, tap: false }
    fight.tick()
    replay.count(fight.view())
  }
  assert.equal(fight.view().flow, "cleared", "the scripted attempt clears the Duel")
  assert.ok(replay.still > 0.3, `stood still ${replay.still.toFixed(2)} s`)
  assert.ok(replay.moving > 0.3, `moved ${replay.moving.toFixed(2)} s`)

  replay.cleared(fight.view().best)
  let frames = 0, last = replay.frame(1 / 60)
  while (last !== null && last.view.flow === "playing" && frames < 5000) { last = replay.frame(1 / 60); frames++ }
  assert.ok(last !== null)
  assert.equal(last.view.flow, "cleared", "the replay clears too")
  assert.equal(last.view.result?.world, fight.view().result?.world, "at the same world time")
  // Only the moving steps are shown: fewer frames than the attempt's steps.
  assert.ok(frames < steps, `${frames} frames for ${steps} steps`)
})
