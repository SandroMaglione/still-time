/**
 * The rule must be needed: a player who never learned that time runs only while they move ("a charger", full push
 * at the nearest enemy or the exit, always) loses every early fight, and the first room kills them in a way the hit
 * screen can name. If a room here ever becomes winnable by charging, it stopped teaching.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { fightIn, pushToward, runUntil } from "./helpers.ts"

/** Charges the nearest enemy (or the exit) at full push, `trials` times with a little sideways bias each; how often it clears the room. */
const charge = (name: string, trials = 20): { readonly won: number; readonly lost: number } => {
  let won = 0, lost = 0
  for (let trial = 0; trial < trials; trial++) {
    const { fight, thumb } = fightIn(name)
    const bias = (trial - trials / 2) / (trials * 2)
    runUntil(fight, 60 * 20, () => fight.view().flow !== "playing", () => {
      const v = fight.view()
      const me = v.player
      if (me === null) { thumb.push = { x: 0, y: 0 }; return }
      const goal = v.room.goal
      const target = v.enemies.length > 0
        ? v.enemies.reduce((a, b) => (Math.hypot(a.x - me.x, a.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? a : b))
        : goal.kind === "exit" ? { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2 } : null
      if (target === null) { thumb.push = { x: 0, y: 0 }; return }
      const p = pushToward(fight, target.x, target.y)
      const len = Math.hypot(p.x + bias, p.y) || 1
      thumb.push = { x: (p.x + bias) / len, y: p.y / len }
    })
    const v = fight.view()
    if (v.flow === "cleared" || v.flow === "won") won++
    else lost++
  }
  return { won, lost }
}

for (const name of ["Duel", "Two Blades", "Courtyard", "Friendly Fire", "Gatehouse"]) {
  test(`${name}: a charger who never stops to look loses every time`, () => {
    const r = charge(name)
    assert.equal(r.won, 0, `the charger cleared ${name} ${r.won} of ${r.won + r.lost} times: the room no longer needs the rule`)
  })
}

test("every way of being hit is named, and a retry clears it", () => {
  const { fight, thumb } = fightIn("Duel")
  runUntil(fight, 60 * 20, () => fight.view().flow !== "playing", () => { const e = fight.view().enemies[0]; if (e !== undefined) thumb.push = pushToward(fight, e.x, e.y) })
  assert.equal(fight.view().flow, "dead")
  assert.deepEqual(fight.view().death, { by: "swing" }, "a brute's swing")
  runUntil(fight, 60, () => fight.view().canRetry)
  thumb.push = { x: 0, y: 0 }
  thumb.tap()
  fight.tick()
  assert.equal(fight.view().flow, "playing")
  assert.equal(fight.view().death, null)
})
