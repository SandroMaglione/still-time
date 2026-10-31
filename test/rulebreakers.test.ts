/**
 * Batch 5, played headless: the enemies and floors that bend the core rule.
 * The clockwork keeps real time; the stalker moves only while you stand
 * still; a conveyor belt carries you while time stays frozen.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { BELT, MELEE_KINDS, SHOOTERS, STALKER, TUNING } from "../src/sim/tuning.ts"
import { blow } from "../src/sim/systems/blows.ts"
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

test("the clockwork's clock keeps real time: standing still, its bursts keep coming and hang at the tower, each ring turned", () => {
  const { fight, thumb } = fightIn("Clockworks")
  const tower = find(fight, "clockwork")
  assert.ok(tower !== undefined)
  // Four and a half still seconds: no world time passes, but its clock does (a burst at 1.2 s, the next 2.4 s on).
  runUntil(fight, 270, () => fight.view().flow !== "playing")
  const shots = fight.view().shots
  assert.ok(shots.length >= 2 * SHOOTERS.clockwork.spread.length, `${shots.length} shots after four still seconds`)
  assert.ok(shots.every((s) => Math.hypot(s.x - tower.x, s.y - tower.y) < 1.2), "frozen at the tower: they fly only when you move")
  // Two rings, turned half a step: twice as many directions as one ring has.
  const ways = new Set(shots.map((s) => Math.round(((Math.atan2(s.vy, s.vx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16))
  assert.ok(ways.size >= 2 * SHOOTERS.clockwork.spread.length, `${ways.size} directions`)
  assert.equal(fight.view().flow, "playing")

  // Move, and they all fly.
  const before = fight.view().shots.map((s) => Math.hypot(s.x - tower.x, s.y - tower.y))
  runUntil(fight, 20, () => false, jiggle(thumb))
  const after = fight.view().shots.map((s) => Math.hypot(s.x - tower.x, s.y - tower.y))
  assert.ok(Math.max(...after) > Math.max(...before) + 1, "moving, the waiting bursts fly out")
  const now = find(fight, "clockwork")
  assert.deepEqual([now?.x, now?.y], [tower.x, tower.y], "the tower never moves")
})

test("the clockwork never moves and has no guard: walk up to it and one cut downs it", () => {
  const { fight, thumb } = fightIn("Clockworks")
  const tower = find(fight, "clockwork")
  assert.ok(tower !== undefined)
  // Up close, between bursts (its first comes after a beat).
  placePlayer(fight, tower.x + 1.6, tower.y)
  runUntil(fight, 120, () => fight.view().flow !== "playing", () => { thumb.push = pushToward(fight, tower.x, tower.y) })
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

test("only the shield-bearer turns a head-on cut: every other melee enemy falls to a blow from its front", () => {
  for (const kind of MELEE_KINDS) {
    // Facing you (east), struck from the east: the blow comes from straight ahead.
    assert.equal(blow(kind, 0, 0), kind === "shield" ? "guarded" : "down", kind)
    assert.equal(blow(kind, 0, Math.PI), "down", `${kind} from behind`)
  }
})
