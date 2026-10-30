/**
 * The rules kept from the prototype, each played headless with a scripted
 * thumb: the world speed, shooters, brutes, solid bodies, the run's flow,
 * and saving.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { TUNING } from "../src/sim/tuning.ts"
import { fightIn, placePlayer, pushToward, runUntil } from "./helpers.ts"

test("time nearly stops while you are still, and runs with your push", () => {
  const { fight, thumb } = fightIn("Duel")
  runUntil(fight, 30, () => false)
  assert.ok(Math.abs(fight.view().scale - TUNING.slow) < 1e-6, `still: ${fight.view().scale}`)
  thumb.push = { x: 0, y: 0.5 }
  runUntil(fight, 30, () => false)
  const expected = TUNING.slow + (1 - TUNING.slow) * Math.pow(0.5, TUNING.player.curve)
  assert.ok(Math.abs(fight.view().scale - expected) < 0.01, `half push: ${fight.view().scale}, expected ${expected}`)
  thumb.push = { x: 0, y: 1 }
  runUntil(fight, 30, () => false)
  assert.ok(fight.view().scale > 0.99, `full push: ${fight.view().scale}`)
})

test("you move in real time at the push's speed, whatever the world speed", () => {
  const { fight, thumb } = fightIn("Duel")
  thumb.push = { x: 1, y: 0 }
  fight.tick()
  const before = fight.view().player?.x ?? 0
  runUntil(fight, 30, () => false)
  const moved = (fight.view().player?.x ?? 0) - before
  assert.ok(Math.abs(moved - TUNING.player.speed * 0.5) < 0.05, `moved ${moved} m in 0.5 s`)
})

test("shooters fire only when they can see you", () => {
  // Courtyard's start is out of every enemy's sight: pushing into the bottom wall keeps time running.
  const { fight, thumb } = fightIn("Courtyard")
  thumb.push = { x: 0, y: 1 }
  let shots = 0
  runUntil(fight, 180, () => false, () => { shots = Math.max(shots, fight.view().shots.length) })
  assert.equal(shots, 0)
  // In the open, in sight of the gunner at (2.5, 12): it fires.
  placePlayer(fight, 2.5, 15)
  thumb.push = { x: 0, y: 1 }
  runUntil(fight, 120, () => fight.view().shots.length > 0 || fight.view().flow !== "playing")
  assert.ok(fight.view().shots.length > 0 || fight.view().flow === "dead", "the gunner should fire once it sees you")
})

test("a shooter steps aside instead of shooting through an ally", () => {
  // Friendly Fire lines a thrower and two gunners up; from (6.5, 17) the middle one's line runs past the front one.
  const { fight, thumb } = fightIn("Friendly Fire")
  placePlayer(fight, 6.5, 17)
  const middle = () => fight.view().enemies.find((e) => e.kind === "gunner" && e.y > 4 && e.y < 7.5)
  const startX = middle()?.x ?? 0
  // Push into a wall-free spot back and forth so time runs while you stay put.
  let flip = 1
  runUntil(fight, 240, () => fight.view().flow !== "playing", () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
  assert.ok(Math.abs((middle()?.x ?? startX) - startX) > 0.2, "the middle gunner should sidestep its ally")
  assert.equal(fight.view().enemies.filter((e) => e.kind === "gunner").length, 2, "no gunner shot another")
})

test("a brute's swing kills you if you rush its guarded front", () => {
  const { fight, thumb } = fightIn("Duel")
  let closest = 99
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const b = fight.view().enemies[0]
    const me = fight.view().player
    if (b === undefined || me === null) return
    closest = Math.min(closest, Math.hypot(b.x - me.x, b.y - me.y))
    thumb.push = pushToward(fight, b.x, b.y)
  })
  assert.equal(fight.view().flow, "dead")
  assert.ok(closest >= TUNING.player.radius + 0.48 - 0.06, `walked into the brute: ${closest}`)
})

test("stepping out of the swing and cutting back in from the front kills a brute", () => {
  const { fight, thumb } = fightIn("Duel")
  let phase: "approach" | "dodge" | "cut" = "approach"
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const b = fight.view().enemies[0]
    const m = b?.melee
    if (b === undefined || m === null || m === undefined) return
    if (phase === "approach" && m.locked) phase = "dodge"
    if (phase === "dodge" && m.phase === "recover") phase = "cut"
    thumb.push = pushToward(fight, b.x, b.y, phase === "dodge")
  })
  assert.equal(fight.view().flow, "cleared")
})

test("a hit locks taps briefly, then a tap retries the room", () => {
  const { fight, thumb } = fightIn("Duel")
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const b = fight.view().enemies[0]
    if (b !== undefined) thumb.push = pushToward(fight, b.x, b.y)
  })
  assert.equal(fight.view().flow, "dead")
  assert.equal(fight.view().deaths, 1)
  thumb.push = { x: 0, y: 0 }
  thumb.tap()
  fight.tick()
  assert.equal(fight.view().flow, "dead", "a tap right after the hit is ignored")
  runUntil(fight, TUNING.deadLockSteps, () => fight.view().canRetry)
  thumb.tap()
  fight.tick()
  assert.equal(fight.view().flow, "playing")
  assert.equal(fight.view().enemies.length, 1)
  assert.deepEqual([fight.view().player?.x, fight.view().player?.y], [6, 16])
})

test("clearing a room waits for a tap, then opens the next", () => {
  const { fight, thumb } = fightIn("Duel")
  let phase: "approach" | "dodge" | "cut" = "approach"
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const m = fight.view().enemies[0]?.melee
    const b = fight.view().enemies[0]
    if (b === undefined || m === null || m === undefined) return
    if (phase === "approach" && m.locked) phase = "dodge"
    if (phase === "dodge" && m.phase === "recover") phase = "cut"
    thumb.push = pushToward(fight, b.x, b.y, phase === "dodge")
  })
  assert.equal(fight.view().flow, "cleared")
  thumb.push = { x: 0, y: 0 }
  thumb.tap()
  fight.tick()
  assert.equal(fight.view().flow, "playing")
  assert.equal(fight.view().room.name, "Two Blades")
})

test("a fight saved mid-room restores to the same moment", () => {
  const { fight, thumb } = fightIn("Market")
  thumb.push = { x: 0.3, y: -1 }
  runUntil(fight, 90, () => false)
  const before = fight.view()
  const saved = fight.runtime.snapshot()
  if (!saved.ok) throw new Error("snapshot failed")
  const json = JSON.parse(JSON.stringify(saved.value)) as typeof saved.value
  runUntil(fight, 60, () => false)
  const restored = fight.runtime.restore(json)
  assert.ok(restored.ok)
  assert.deepEqual(fight.view(), before)
})
