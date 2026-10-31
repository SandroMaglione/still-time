/**
 * Batch 3, played headless: crates that burst under fire, and the grenadier's
 * bombs (thrown where you stood, a fuse in world time, a blast that takes
 * anyone in reach and breaks crates).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { BOMB, COVER } from "../src/sim/tuning.ts"
import { fightIn, placePlayer, runUntil, spawnBomb, spawnShot, type ScriptedThumb } from "./helpers.ts"

/** Pushes back and forth along x so time runs while you stay about where you are. */
const jiggle = (thumb: ScriptedThumb, strength = 1): (() => void) => {
  let flip = 1
  return () => { flip = -flip; thumb.push = { x: flip * strength, y: 0 } }
}

const crates = (fight: Fight) => fight.view().cover.filter((c) => c.kind === "crate")

test("a crate bursts after its hits", () => {
  const { fight, thumb } = fightIn("Splinters")
  // Shots fly in world time, which runs only while you move: step side to side while they fly.
  const wait = jiggle(thumb, 0.3)
  const before = crates(fight).length
  const target = crates(fight)[0]
  assert.ok(target !== undefined)
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2
  for (let n = 1; n <= COVER.crateHits; n++) {
    spawnShot(fight, { kind: "bullet", x: cx + 1.2, y: cy, vx: -9, vy: 0 })
    runUntil(fight, 3000, () => fight.view().shots.every((s) => s.x > cx + 1), wait)
    runUntil(fight, 3000, () => !fight.view().shots.some((s) => Math.abs(s.y - cy) < 0.01), wait)
    if (n < COVER.crateHits) assert.equal(crates(fight).find((c) => c.x === target.x && c.y === target.y)?.hits, COVER.crateHits - n)
  }
  assert.equal(crates(fight).length, before - 1, "its last hit breaks it")
})

test("a wooden crate hides you from no one: the gunners fire into it at you behind it, and splinter it", () => {
  const { fight, thumb } = fightIn("Splinters")
  // Tucked behind the middle crate, which stands between you and both gunners.
  const target = crates(fight).find((c) => c.x < 7 && c.x + c.w > 7 && c.y > 8 && c.y < 11)
  assert.ok(target !== undefined)
  placePlayer(fight, 7, target.y + target.h + 0.4)
  const standing = () => crates(fight).some((c) => c.x === target.x && c.y === target.y)
  const wait = jiggle(thumb, 0.2)
  runUntil(fight, 600, () => fight.view().enemies.every((e) => !e.arriving), wait)
  assert.ok(fight.view().enemies.every((e) => e.sees), "the crate does not hide you")
  runUntil(fight, 6000, () => !standing() || fight.view().flow !== "playing", wait)
  assert.equal(fight.view().flow, "playing", "the crate took the shots")
  assert.ok(!standing(), "their shots splintered the crate")
})

test("the grenadier leads you: its bomb lands where your walk is taking you, and lands lit", () => {
  const { fight, thumb } = fightIn("Powder Room")
  // Walking steadily west across the room, in its sight.
  placePlayer(fight, 13, 9.5)
  let thrown: { x: number; y: number } | null = null
  runUntil(fight, 4000, () => fight.view().bombs.length > 0 || fight.view().flow !== "playing", () => {
    const me = fight.view().player
    if (me !== null) thrown = { x: me.x, y: me.y }
    thumb.push = { x: -1, y: 0 }
  })
  const bomb = fight.view().bombs[0]
  assert.ok(bomb?.target !== null && bomb?.target !== undefined && thrown !== null, `no bomb (${fight.view().flow})`)
  const from: { x: number; y: number } = thrown
  const ahead = from.x - bomb.target.x
  assert.ok(ahead > 1 && ahead <= BOMB.lead + 0.6, `it threw ${ahead.toFixed(2)} m ahead of you`)
  assert.ok(Math.abs(bomb.target.y - from.y) < 0.6, "along your heading")
  runUntil(fight, 4000, () => fight.view().bombs.some((b) => b.target === null) || fight.view().flow !== "playing", () => { thumb.push = { x: 1, y: 0 } })
  assert.ok(fight.view().bombs.some((b) => b.target === null), "it landed lit")
})

test("a blast takes anyone in its reach, you or an enemy, and a fuse burns in world time", () => {
  // Beside the brute, far from you: the brute falls, you live.
  const { fight, thumb } = fightIn("Duel")
  const brute = fight.view().enemies[0]
  assert.ok(brute !== undefined)
  // (In its path toward you: it walks into the ring while the fuse burns.)
  spawnBomb(fight, { x: brute.x, y: brute.y + 0.9, left: 0.3 })
  // Standing still, a real second burns none of the fuse.
  runUntil(fight, 60, () => false)
  assert.equal(fight.view().bombs.length, 1)
  runUntil(fight, 600, () => fight.view().bombs.length === 0, jiggle(thumb))
  assert.equal(fight.view().enemies.length, 0)
  assert.equal(fight.view().flow, "cleared")

  // At your feet: you fall.
  const again = fightIn("Duel")
  const me = again.fight.view().player
  assert.ok(me !== null)
  spawnBomb(again.fight, { x: me.x + 0.5, y: me.y, left: 0.1 })
  runUntil(again.fight, 600, () => again.fight.view().flow !== "playing", jiggle(again.thumb))
  assert.equal(again.fight.view().flow, "dead")
})

test("a wall between you and a blast shields you; a blast breaks a crate, and a retry mends it", () => {
  // First Cut: south of its wall's west end, within reach of a bomb on the other side.
  const { fight, thumb } = fightIn("First Cut")
  placePlayer(fight, 1.2, 13.3)
  spawnBomb(fight, { x: 1.2, y: 11.6, left: 0.1 })
  assert.ok(Math.hypot(0, 13.3 - 11.6) < BOMB.radius)
  runUntil(fight, 600, () => fight.view().bombs.length === 0, jiggle(thumb, 0.2))
  assert.equal(fight.view().flow, "playing")

  const splinters = fightIn("Splinters")
  const before = crates(splinters.fight).length
  const crate = crates(splinters.fight)[0]
  assert.ok(crate !== undefined)
  spawnBomb(splinters.fight, { x: crate.x + crate.w / 2, y: crate.y + crate.h + 0.5, left: 0.1 })
  runUntil(splinters.fight, 600, () => splinters.fight.view().bombs.length === 0, jiggle(splinters.thumb, 0.2))
  assert.equal(crates(splinters.fight).length, before - 1)
  splinters.fight.send({ kind: "restart" })
  splinters.fight.tick()
  assert.equal(crates(splinters.fight).length, before, "a retry mends the crate")
})
