/**
 * Batch 3, played headless: crates that splinter under fire, a cracked wall
 * a brute's swing breaks, and the grenadier's bombs (thrown where you stood,
 * a fuse in world time, a blast that takes anyone in reach and breaks walls).
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
const cracked = (fight: Fight) => fight.view().cover.filter((c) => c.kind === "cracked")

test("a crate splinters after its hits; a cracked wall shrugs shots off", () => {
  const { fight } = fightIn("Splinters")
  const before = crates(fight).length
  const target = crates(fight)[0]
  assert.ok(target !== undefined)
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2
  for (let n = 1; n <= COVER.crateHits; n++) {
    spawnShot(fight, { kind: "bullet", x: cx + 1.2, y: cy, vx: -9, vy: 0 })
    runUntil(fight, 3000, () => fight.view().shots.every((s) => s.x > cx + 1))
    runUntil(fight, 3000, () => !fight.view().shots.some((s) => Math.abs(s.y - cy) < 0.01))
    if (n < COVER.crateHits) assert.equal(crates(fight).find((c) => c.x === target.x && c.y === target.y)?.hits, COVER.crateHits - n)
  }
  assert.equal(crates(fight).length, before - 1, "the third hit breaks it")

  const breach = fightIn("Breach").fight
  const wall = cracked(breach)[0]
  assert.ok(wall !== undefined)
  spawnShot(breach, { kind: "bullet", x: wall.x + wall.w / 2, y: wall.y + wall.h + 1, vx: 0, vy: -9 })
  runUntil(breach, 3000, () => breach.view().shots.length === 0)
  assert.equal(cracked(breach).length, 1)
})

test("a brute's swing breaks the cracked wall you lure it into", () => {
  const { fight, thumb } = fightIn("Breach")
  const wall = cracked(fight)[0]
  assert.ok(wall !== undefined)
  // Stand with your back to the cracked wall; when the swing commits, step aside.
  placePlayer(fight, wall.x + wall.w / 2, wall.y + wall.h + 0.4)
  let dodged = false
  const wait = jiggle(thumb, 0.3)
  runUntil(fight, 3000, () => cracked(fight).length === 0 || fight.view().flow !== "playing", () => {
    const m = fight.view().enemies[0]?.melee
    if (m?.phase === "windup" && m.locked) dodged = true
    if (dodged) thumb.push = { x: 1, y: 0 }
    else wait()
  })
  assert.equal(fight.view().flow, "playing", "you stepped out of the swing")
  assert.equal(cracked(fight).length, 0, "the swing broke the wall")
})

test("the grenadier lobs a bomb at where you stand, and it lands lit", () => {
  const { fight, thumb } = fightIn("Powder Room")
  placePlayer(fight, 6, 6.2)
  let stood = { x: 0, y: 0 }
  const wait = jiggle(thumb, 0.4)
  runUntil(fight, 4000, () => fight.view().bombs.length > 0 || fight.view().flow !== "playing", () => {
    const me = fight.view().player
    if (me !== null) stood = { x: me.x, y: me.y }
    wait()
  })
  assert.equal(fight.view().bombs[0]?.flying, true)
  runUntil(fight, 4000, () => fight.view().bombs.some((b) => !b.flying) || fight.view().flow !== "playing", wait)
  const lit = fight.view().bombs.find((b) => !b.flying)
  assert.ok(lit !== undefined)
  assert.ok(Math.hypot(lit.x - stood.x, lit.y - stood.y) < 0.6, `landed ${Math.hypot(lit.x - stood.x, lit.y - stood.y).toFixed(2)} m from where you stood`)
})

test("a blast takes anyone in its reach, you or an enemy, and a fuse burns in world time", () => {
  // Beside the brute, far from you: the brute falls, you live.
  const { fight, thumb } = fightIn("Duel")
  const brute = fight.view().enemies[0]
  assert.ok(brute !== undefined)
  spawnBomb(fight, { x: brute.x + 0.9, y: brute.y, left: 0.3 })
  // Standing still, a real second burns a few hundredths of the fuse.
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

test("a wall between you and a blast shields you; the blast breaks a cracked wall and a retry mends it", () => {
  const { fight, thumb } = fightIn("Breach")
  // Behind the solid wall's west end, within reach of a bomb on the other side.
  placePlayer(fight, 2, 7.75)
  spawnBomb(fight, { x: 2, y: 6.1, left: 0.1 })
  assert.ok(Math.hypot(0, 7.75 - 6.1) < BOMB.radius)
  runUntil(fight, 600, () => fight.view().bombs.length === 0, jiggle(thumb, 0.2))
  assert.equal(fight.view().flow, "playing")

  const wall = cracked(fight)[0]
  assert.ok(wall !== undefined)
  spawnBomb(fight, { x: wall.x + wall.w / 2, y: wall.y + wall.h + 0.5, left: 0.1 })
  runUntil(fight, 600, () => fight.view().bombs.length === 0, jiggle(thumb, 0.2))
  assert.equal(cracked(fight).length, 0)
  fight.send({ kind: "restart" })
  fight.tick()
  assert.equal(cracked(fight).length, 1, "a retry mends the wall")
})
