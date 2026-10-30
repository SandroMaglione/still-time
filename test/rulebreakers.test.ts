/**
 * Batch 5, played headless: the enemies and floors that bend the core rule.
 * The clockwork keeps real time; the stalker moves only while you stand
 * still; a conveyor belt carries you while time stays frozen.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { BELT, STALKER, TUNING } from "../src/sim/tuning.ts"
import type { EnemyView } from "../src/sim/view.ts"
import { fightIn, placePlayer, pushToward, runUntil, type ScriptedThumb } from "./helpers.ts"

const find = (fight: Fight, kind: EnemyView["kind"]): EnemyView | undefined => fight.view().enemies.find((e) => e.kind === kind)
const distance = (fight: Fight, e: EnemyView | undefined): number => {
  const me = fight.view().player
  return e === undefined || me === null ? 0 : Math.hypot(e.x - me.x, e.y - me.y)
}

/** Pushes back and forth along x at full strength: time runs at full speed while you stay about where you are. */
const jiggle = (thumb: ScriptedThumb): (() => void) => {
  let flip = 1
  return () => { flip = -flip; thumb.push = { x: flip, y: 0 } }
}

test("the clockwork keeps real time: it closes in while you stand still, where a brute would wait", () => {
  const { fight } = fightIn("Clockworks")
  placePlayer(fight, 5, 12)
  const before = distance(fight, find(fight, "clockwork"))
  runUntil(fight, 60, () => fight.view().flow !== "playing")
  const after = distance(fight, find(fight, "clockwork"))
  assert.ok(before - after > 1, `closed ${(before - after).toFixed(2)} m in a still second`)

  const duel = fightIn("Duel").fight
  const b0 = distance(duel, find(duel, "brute"))
  runUntil(duel, 60, () => false)
  assert.ok(b0 - distance(duel, find(duel, "brute")) < 0.3, "a brute barely moves in the same still second")
})

test("the brute's dodge beats the clockwork: back off when its swing commits, close in otherwise", () => {
  const { fight, thumb } = fightIn("Clockworks")
  runUntil(fight, 4000, () => fight.view().flow !== "playing", () => {
    const c = find(fight, "clockwork")
    const m = c?.melee
    if (c === undefined || m === null || m === undefined) return
    thumb.push = pushToward(fight, c.x, c.y, (m.phase === "windup" && m.locked) || m.phase === "swing")
  })
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("the stalker moves only while you stand still", () => {
  const { fight, thumb } = fightIn("Stalker")
  const stalker = () => find(fight, "stalker")
  const d0 = distance(fight, stalker())
  runUntil(fight, 60, () => false)
  const d1 = distance(fight, stalker())
  assert.ok(d0 - d1 > STALKER.speed * 0.8, `crept ${(d0 - d1).toFixed(2)} m in a still second`)
  assert.ok((stalker()?.charge ?? 0) > 0.9, "and shows it is moving")
  // Moving at full push: it stays put (once the world is up to speed).
  runUntil(fight, 20, () => false, jiggle(thumb))
  const s0 = stalker()
  runUntil(fight, 60, () => false, jiggle(thumb))
  const s1 = stalker()
  assert.ok(s0 !== undefined && s1 !== undefined && Math.hypot(s1.x - s0.x, s1.y - s0.y) < 0.05, "it waits while you move")
})

test("the stalker strikes from just past your cut if you stand still; rushing it, one cut downs it", () => {
  const { fight } = fightIn("Stalker")
  runUntil(fight, 1200, () => fight.view().flow !== "playing")
  assert.equal(fight.view().flow, "dead")

  assert.ok(STALKER.reach > TUNING.attackRange, "its reach is past your cut")

  // Rush it at a full push: it freezes, and your cut lands first.
  const again = fightIn("Stalker")
  runUntil(again.fight, 1200, () => again.fight.view().flow !== "playing", () => {
    const s = find(again.fight, "stalker")
    if (s !== undefined) again.thumb.push = pushToward(again.fight, s.x, s.y)
  })
  assert.equal(again.fight.view().flow, "cleared")
})

test("a belt carries you while time stays frozen", () => {
  const { fight } = fightIn("Conveyor")
  placePlayer(fight, 6, 24)
  runUntil(fight, 60, () => fight.view().flow !== "playing")
  const me = fight.view().player
  assert.ok(me !== null)
  assert.ok(Math.abs(24 - me.y - BELT.speed) < 0.1, `carried ${(24 - me.y).toFixed(2)} m in a second`)
  assert.ok(fight.view().world < 0.1, `with ${fight.view().world.toFixed(3)} world s gone`)
  assert.ok(fight.view().scale < 0.05, "time stays frozen")
})
