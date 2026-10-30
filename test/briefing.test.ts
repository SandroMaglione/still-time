/**
 * The briefing's gates, played headless: it advances only on the player's own gestures (a sustained move, then a
 * real lift), a tap never attacks, a cancelled press never counts, a shot that reaches you only resets the beat,
 * and walking into the gunner cuts it.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { Briefing } from "../src/host/briefing.ts"

const run = (b: Briefing, steps: number, push: { x: number; y: number }, down: boolean): void => {
  for (let i = 0; i < steps; i++) { b.input(push, down); b.tick(); b.advance(1 / 60) }
}
const STILL = { x: 0, y: 0 }

test("the happy path: dodge and lift, move and lift again, walk into the gunner, vanish", () => {
  const b = new Briefing()
  run(b, 30, STILL, false)
  assert.equal(b.stage, "dodge", "nothing advances on its own")
  run(b, 50, { x: 1, y: 0 }, true)
  assert.equal(b.stage, "dodge", "moving alone is not enough: the lift is the lesson")
  run(b, 30, STILL, false)
  assert.equal(b.stage, "again")
  run(b, 42, { x: -1, y: 0 }, true)
  run(b, 30, STILL, false)
  assert.equal(b.stage, "cut")
  // Walk up to the gunner (it stands at the top middle).
  for (let i = 0; i < 400 && b.stage === "cut"; i++) {
    const hero = b.view().player!
    run(b, 1, { x: Math.abs(hero.x - 5) > 0.2 ? Math.sign(5 - hero.x) : 0, y: -1 }, true)
  }
  assert.equal(b.stage, "leaving", "close enough, the cut fires by itself")
  assert.equal(b.view().enemies.length, 0)
  run(b, 40, STILL, false)
  assert.equal(b.stage, "gone")
  assert.equal(b.view().flow, "cleared", "you vanish as on a clear")
  run(b, 120, STILL, false)
  assert.equal(b.finished, true)
})

test("a swipe does not count: a short flick then a lift leaves the lesson where it was", () => {
  const b = new Briefing()
  run(b, 10, { x: 1, y: 0 }, true)
  run(b, 30, STILL, false)
  assert.equal(b.stage, "dodge")
})

test("a cancelled press (blur, hidden tab, pointer cancel) never counts as the lift", () => {
  const b = new Briefing()
  run(b, 50, { x: 1, y: 0 }, true)
  b.cancel()
  run(b, 30, STILL, false)
  assert.equal(b.stage, "dodge")
})

test("a shot that reaches you resets the beat: you are back at the start, nothing else is lost", () => {
  const b = new Briefing()
  const start = b.view().player!
  // Walk straight up into the shot.
  run(b, 120, { x: 0, y: -1 }, true)
  assert.equal(b.stage, "dodge")
  const now = b.view().player!
  assert.ok(Math.hypot(now.x - start.x, now.y - start.y) < 3, "the reset brought you back near the start")
})

test("a tap in the cut does nothing to the gunner: only walking into it cuts", () => {
  const b = new Briefing()
  run(b, 50, { x: 1, y: 0 }, true); run(b, 30, STILL, false)
  run(b, 42, { x: -1, y: 0 }, true); run(b, 30, STILL, false)
  assert.equal(b.stage, "cut")
  b.tap()
  run(b, 60, STILL, false)
  assert.equal(b.stage, "cut")
  assert.equal(b.view().enemies.length, 1)
})

test("held on and on without lifting, the move alone counts in the end", () => {
  const b = new Briefing()
  run(b, 40, { x: 1, y: 0 }, true)
  run(b, 60 * 13, STILL, true)
  assert.equal(b.stage, "again")
})
