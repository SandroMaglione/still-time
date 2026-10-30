/**
 * Score, doors, captains and keys, played headless: the clock in world
 * seconds and the stars; doors that open on a cleared chamber, a downed
 * captain, or a key brought to them; runners that flee and drop their key.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { insidePillar } from "../src/sim/geometry.ts"
import { ROOMS } from "../src/sim/rooms.ts"
import type { Fight } from "../src/sim/simulation.ts"
import { starsFor } from "../src/sim/systems/run.ts"
import { TUNING } from "../src/sim/tuning.ts"
import type { EnemyView } from "../src/sim/view.ts"
import { fightIn, placePlayer, pushToward, roomIndex, runUntil, type ScriptedThumb } from "./helpers.ts"

/** Puts you right next to the enemy `pick` finds, on an open side, and lets your cut take it. */
const cutDown = (fight: Fight, pick: (e: EnemyView) => boolean): void => {
  const view = fight.view()
  const e = view.enemies.find(pick)
  assert.ok(e !== undefined, "no such enemy")
  const room = ROOMS[view.room.index]
  assert.ok(room !== undefined)
  const walls = [...room.pillars, ...view.doors.filter((d) => !d.open)]
  const gap = e.radius + TUNING.player.radius + 0.1
  const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx = 0, dy = 0]) => ({ x: e.x + dx * gap, y: e.y + dy * gap }))
    .find((p) => !insidePillar(p.x, p.y, TUNING.player.radius, walls))
  assert.ok(spot !== undefined, "no open side")
  const before = view.enemies.length
  placePlayer(fight, spot.x, spot.y)
  fight.tick()
  assert.equal(fight.view().enemies.length, before - 1, `the ${e.kind} should fall`)
}

/** Pushes back and forth along x so time runs while you stay about where you are. */
const jiggle = (thumb: ScriptedThumb): (() => void) => {
  let flip = 1
  return () => { flip = -flip; thumb.push = { x: flip, y: 0 } }
}

/** The Duel's dodge-and-cut: approach, step back once the swing commits, cut in during the recovery. */
const duelClear = (fight: Fight, thumb: ScriptedThumb): void => {
  let phase: "approach" | "dodge" | "cut" = "approach"
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const b = fight.view().enemies[0]
    const m = b?.melee
    if (b === undefined || m === null || m === undefined) return
    if (phase === "approach" && m.locked) phase = "dodge"
    if (phase === "dodge" && m.phase === "recover") phase = "cut"
    thumb.push = pushToward(fight, b.x, b.y, phase === "dodge")
  })
}

test("the room's clock runs in world seconds: it barely moves while you stand still", () => {
  const { fight, thumb } = fightIn("Duel")
  runUntil(fight, 60, () => false)
  assert.ok(fight.view().world < 0.1, `still for 1 s: ${fight.view().world}`)
  const before = fight.view().world
  thumb.push = { x: 1, y: 0 }
  runUntil(fight, 60, () => false)
  const ran = fight.view().world - before
  assert.ok(ran > 0.8 && ran <= 1.0001, `full push for 1 s: ${ran}`)
})

test("stars: one for the clear, one for no hit, one for beating par", () => {
  assert.equal(starsFor(0, 3, 4), 3)
  assert.equal(starsFor(1, 3, 4), 2)
  assert.equal(starsFor(0, 5, 4), 2)
  assert.equal(starsFor(2, 9, 4), 1)
})

test("a clean dodge-and-cut beats the Duel's par for three stars; a hit first costs one", () => {
  const { fight, thumb } = fightIn("Duel")
  duelClear(fight, thumb)
  const clean = fight.view().result
  assert.ok(clean !== null)
  assert.equal(clean.stars, 3, `world ${clean.world} s against par ${fight.view().room.par} s`)
  const duel = roomIndex("Duel")
  assert.deepEqual(fight.view().best[duel], clean)

  // Again from the start: rush the brute's front, get cut, retry, clear.
  fight.send({ kind: "restart" })
  fight.tick()
  runUntil(fight, 900, () => fight.view().flow !== "playing", () => {
    const b = fight.view().enemies[0]
    if (b !== undefined) thumb.push = pushToward(fight, b.x, b.y)
  })
  assert.equal(fight.view().flow, "dead")
  runUntil(fight, TUNING.deadLockSteps, () => fight.view().canRetry)
  thumb.push = { x: 0, y: 0 }
  thumb.tap()
  fight.tick()
  assert.equal(fight.view().hits, 1, "a retry keeps the room's hit")
  duelClear(fight, thumb)
  assert.equal(fight.view().result?.stars, 2)
  assert.equal(fight.view().best[duel]?.stars, 3, "the best of the run stays")
})

test("a door holds until its chamber is clear, then opens", () => {
  const { fight, thumb } = fightIn("Gatehouse")
  const door = () => fight.view().doors[0]
  assert.equal(door()?.open, false)
  assert.equal(door()?.waiting, 2)
  // Walking into the shut door: it is a wall.
  placePlayer(fight, 7, 14.5)
  thumb.push = { x: 0, y: -1 }
  runUntil(fight, 40, () => fight.view().flow !== "playing")
  assert.ok((fight.view().player?.y ?? 0) >= 13.4 + TUNING.player.radius - 0.01, `walked through the door to ${fight.view().player?.y}`)
  thumb.push = { x: 0, y: 0 }
  cutDown(fight, (e) => e.kind === "brute")
  assert.equal(door()?.open, false)
  assert.equal(door()?.waiting, 1)
  cutDown(fight, (e) => e.kind === "gunner" && e.y > 13)
  assert.equal(door()?.open, true)
  assert.equal(fight.view().flow, "playing", "the far chamber still stands")
})

test("downing the captain opens its gate, and the exit clears the room with guards still up", () => {
  const { fight, thumb } = fightIn("Throne")
  assert.equal(fight.view().doors[0]?.open, false)
  cutDown(fight, (e) => e.captain)
  assert.equal(fight.view().doors[0]?.open, true)
  placePlayer(fight, 8, 5)
  thumb.push = { x: 0, y: -1 }
  runUntil(fight, 120, () => fight.view().flow !== "playing")
  assert.equal(fight.view().flow, "cleared")
  assert.ok(fight.view().enemies.length > 0, "guards left standing")
})

test("a runner flees while it can see you, and stands still when it cannot", () => {
  const { fight, thumb } = fightIn("Thief")
  const runner = () => fight.view().enemies.find((e) => e.kind === "runner")
  // Hidden behind the crate below it: it stays put.
  placePlayer(fight, 8, 14.2)
  runUntil(fight, 60, () => false, jiggle(thumb))
  assert.deepEqual([runner()?.x, runner()?.y], [8, 10])
  // In the open beside it: it runs.
  placePlayer(fight, 5.5, 11)
  const dist = () => { const r = runner(), me = fight.view().player; return r === undefined || me === null ? 0 : Math.hypot(r.x - me.x, r.y - me.y) }
  const start = dist()
  runUntil(fight, 30, () => fight.view().flow !== "playing", jiggle(thumb))
  assert.ok(dist() > start + 1, `ran from ${start.toFixed(2)} m to ${dist().toFixed(2)} m`)
})

test("a fallen runner drops its key; carried to its door, the key opens it", () => {
  const { fight, thumb } = fightIn("Thief")
  const key = () => fight.view().keys[0]
  assert.equal(key()?.state, "carried")
  cutDown(fight, (e) => e.kind === "runner")
  const dropped = key()
  assert.ok(dropped !== undefined && dropped.state === "floor")
  assert.equal(fight.view().doors[0]?.open, false)
  placePlayer(fight, dropped.x, dropped.y + 0.3)
  fight.tick()
  assert.equal(key()?.state, "held")
  // Holding the key isn't enough: the door opens when you reach it.
  assert.equal(fight.view().doors[0]?.open, false)

  // Saved with the key in hand, restored to the same moment.
  const saved = fight.runtime.snapshot()
  if (!saved.ok) throw new Error("snapshot failed")
  const before = fight.view()
  const restored = fight.runtime.restore(JSON.parse(JSON.stringify(saved.value)) as typeof saved.value)
  assert.ok(restored.ok)
  assert.deepEqual(fight.view(), before)

  placePlayer(fight, 8, 5.4)
  thumb.push = { x: 0, y: -1 }
  runUntil(fight, 120, () => fight.view().flow !== "playing")
  assert.equal(fight.view().doors[0]?.open, true)
  assert.equal(key(), undefined, "the door keeps the key")
  assert.equal(fight.view().flow, "cleared")
})

test("a retry shuts the doors again and gives the runner back its key", () => {
  const { fight } = fightIn("Thief")
  cutDown(fight, (e) => e.kind === "runner")
  fight.send({ kind: "restart" })
  fight.tick()
  assert.equal(fight.view().keys[0]?.state, "carried")
  assert.equal(fight.view().doors[0]?.open, false)
  assert.equal(fight.view().world < 0.01, true)
})
