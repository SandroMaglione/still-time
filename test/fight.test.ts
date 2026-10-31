/**
 * The rules kept from the prototype, each played headless with a scripted
 * thumb: the world speed, shooters, brutes, solid bodies, the run's flow,
 * and saving.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { TUNING } from "../src/sim/tuning.ts"
import { fightIn, placePlayer, pushToward, runUntil } from "./helpers.ts"

test("time nearly stops while you are still, and runs with your walk", () => {
  const { fight, thumb } = fightIn("Duel")
  runUntil(fight, 30, () => false)
  assert.ok(Math.abs(fight.view().scale - TUNING.slow) < 1e-6, `still: ${fight.view().scale}`)
  // (Up, into open floor: Duel's start is against the bottom wall.)
  thumb.push = { x: 0, y: -0.5 }
  runUntil(fight, 30, () => false)
  const expected = TUNING.slow + (1 - TUNING.slow) * Math.pow(0.5, TUNING.player.curve)
  assert.ok(Math.abs(fight.view().scale - expected) < 0.01, `half push: ${fight.view().scale}, expected ${expected}`)
  thumb.push = { x: 0, y: -1 }
  runUntil(fight, 30, () => false)
  assert.ok(fight.view().scale > 0.99, `full push: ${fight.view().scale}`)
})

test("pushing into a wall is standing still: you do not move, and neither does time", () => {
  const { fight, thumb } = fightIn("Duel")
  // Walk down to Duel's bottom wall, then keep pushing straight into it, at full push.
  thumb.push = { x: 0, y: 1 }
  runUntil(fight, 60, () => false)
  const at = fight.view().player!
  const from = fight.view().world
  runUntil(fight, 60, () => false)
  const now = fight.view().player!
  assert.ok(Math.hypot(now.x - at.x, now.y - at.y) < 0.05, "the wall holds you")
  assert.ok(Math.abs(fight.view().scale - TUNING.slow) < 0.01, `time stays frozen: ${fight.view().scale}`)
  assert.ok(fight.view().world - from < 0.1, `the world clock barely ran: ${fight.view().world - from}`)
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
  // Courtyard's start is out of every enemy's sight: stepping side to side there keeps time running.
  const { fight, thumb } = fightIn("Courtyard")
  let shots = 0, flip = 1
  runUntil(fight, 180, () => false, () => { flip = -flip; thumb.push = { x: flip, y: 0 }; shots = Math.max(shots, fight.view().shots.length) })
  assert.equal(shots, 0)
  // In the open, in sight of the gunner at (2.5, 12): it fires.
  placePlayer(fight, 2.5, 15)
  thumb.push = { x: 0, y: 1 }
  runUntil(fight, 120, () => fight.view().shots.length > 0 || fight.view().flow !== "playing")
  assert.ok(fight.view().shots.length > 0 || fight.view().flow === "dead", "the gunner should fire once it sees you")
})

test("a shooter steps aside instead of shooting through an ally", () => {
  // Friendly Fire lines a thrower up behind a gunner; from (6.5, 14.5) the thrower's line runs past the gunner.
  const { fight, thumb } = fightIn("Friendly Fire")
  placePlayer(fight, 6.5, 14.5)
  const thrower = () => fight.view().enemies.find((e) => e.kind === "thrower")
  const startX = thrower()?.x ?? 0
  // Push into a wall-free spot back and forth so time runs while you stay put.
  let flip = 1
  runUntil(fight, 240, () => fight.view().flow !== "playing", () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
  assert.ok(Math.abs((thrower()?.x ?? startX) - startX) > 0.2, "the thrower should sidestep its ally")
  assert.equal(fight.view().enemies.filter((e) => e.kind === "gunner").length, 1, "the thrower did not knife the gunner")
})

test("a spearman's thrust kills you if you rush it head-on: its reach is past your cut", () => {
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

test("stepping back off the thrust, then cutting in while it recovers, kills a spearman", () => {
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
  assert.equal(fight.view().room.name, "Two Spears")
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
