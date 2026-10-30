/**
 * Batch 2's enemies, played headless: the knight (three hits, each a
 * knock-back and a daze, then a counter), the shield-bearer (a front that
 * stops cuts and shots), and the sniper (a laser that charges only in
 * sight, locks, then fires along the locked line).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { MELEE, SHOOTERS, STAGGER, TUNING } from "../src/sim/tuning.ts"
import type { EnemyView } from "../src/sim/view.ts"
import { fightIn, placePlayer, pushToward, runUntil, spawnShot, type ScriptedThumb } from "./helpers.ts"

const find = (fight: Fight, kind: EnemyView["kind"]): EnemyView | undefined => fight.view().enemies.find((e) => e.kind === kind)

/** Places you `gap` metres from an enemy on the side at angle `side` (from its centre). */
const placeBeside = (fight: Fight, e: EnemyView, side: number, gap = e.radius + TUNING.player.radius + 0.1): void => {
  placePlayer(fight, e.x + Math.cos(side) * gap, e.y + Math.sin(side) * gap)
}

/** Pushes back and forth along x so time runs while you stay about where you are. */
const jiggle = (thumb: ScriptedThumb, strength = 1): (() => void) => {
  let flip = 1
  return () => { flip = -flip; thumb.push = { x: flip * strength, y: 0 } }
}

test("a knight takes three hits: each knocks it back out of reach and dazes it", () => {
  const { fight, thumb } = fightIn("Armory")
  const knight = () => find(fight, "knight")
  const k0 = knight()
  assert.ok(k0 !== undefined && k0.melee !== null)
  assert.equal(k0.melee.hp, 3)
  // Idle, its guard is down: cut it from the front.
  placeBeside(fight, k0, Math.PI / 2)
  fight.tick()
  const k1 = knight()
  const me = fight.view().player
  assert.ok(k1 !== undefined && k1.melee !== null && me !== null)
  assert.equal(k1.melee.hp, 2)
  assert.equal(k1.melee.phase, "stagger")
  assert.ok(Math.hypot(k1.x - me.x, k1.y - me.y) > TUNING.attackRange, "knocked out of your reach")
  // Dazed: a blow in that time does nothing.
  placeBeside(fight, k1, Math.PI / 2)
  fight.tick()
  assert.equal(knight()?.melee?.hp, 2)
  // Each further hit from its open back, until the last downs it.
  for (const hp of [1, 0]) {
    runUntil(fight, 600, () => knight()?.melee?.phase !== "stagger", jiggle(thumb))
    thumb.push = { x: 0, y: 0 }
    const k = knight()
    assert.ok(k !== undefined)
    placeBeside(fight, k, k.aim + Math.PI)
    fight.tick()
    assert.equal(knight()?.melee?.hp, hp === 0 ? undefined : hp)
  }
  assert.equal(knight(), undefined)
  assert.equal(fight.view().flow, "cleared")
})

test("the brute's dodge beats a knight too: back off when its swing commits, close in otherwise", () => {
  const { fight, thumb } = fightIn("Armory")
  runUntil(fight, 3000, () => fight.view().flow !== "playing", () => {
    const k = find(fight, "knight")
    const m = k?.melee
    if (k === undefined || m === null || m === undefined) return
    thumb.push = pushToward(fight, k.x, k.y, (m.phase === "windup" && m.locked) || m.phase === "swing")
  })
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("coming out of its daze, a knight counters at once if you stand close", () => {
  const { fight, thumb } = fightIn("Armory")
  const k0 = find(fight, "knight")
  assert.ok(k0 !== undefined)
  placeBeside(fight, k0, Math.PI / 2)
  fight.tick()
  const k1 = find(fight, "knight")
  assert.ok(k1 !== undefined)
  // Stand inside its trigger but out of your own reach, and let the daze run out.
  placeBeside(fight, k1, Math.PI / 2, MELEE.knight.trigger - 0.3)
  runUntil(fight, 600, () => find(fight, "knight")?.melee?.phase !== "stagger", jiggle(thumb, 0.4))
  assert.equal(find(fight, "knight")?.melee?.phase, "windup")
  assert.equal(find(fight, "knight")?.melee?.guarding, true)
})

test("a stray shot costs a knight a hit too", () => {
  const { fight } = fightIn("Armory")
  const k = find(fight, "knight")
  assert.ok(k !== undefined)
  // Close by, so it lands before the knight (which has seen you) walks off the line.
  spawnShot(fight, { kind: "bullet", x: k.x + 0.8, y: k.y, vx: -9, vy: 0 })
  runUntil(fight, 2000, () => fight.view().shots.length === 0)
  assert.equal(find(fight, "knight")?.melee?.hp, 2)
  assert.equal(find(fight, "knight")?.melee?.phase, "stagger")
})

test("the shield-bearer's front stops your cut; its back does not", () => {
  const { fight } = fightIn("Shieldwall")
  const shield = () => find(fight, "shield")
  const s0 = shield()
  assert.ok(s0 !== undefined && s0.melee !== null)
  assert.equal(s0.melee.guarding, true, "its shield is always up")
  placeBeside(fight, s0, s0.aim)
  fight.tick()
  assert.ok(shield() !== undefined, "a cut on the shield does nothing")
  const s1 = shield()
  assert.ok(s1 !== undefined)
  placeBeside(fight, s1, s1.aim + Math.PI)
  fight.tick()
  assert.equal(shield(), undefined, "cut from behind, it falls")
})

test("the shield stops shots from the front, with a spark; from behind they kill", () => {
  const { fight } = fightIn("Shieldwall")
  const s = find(fight, "shield")
  assert.ok(s !== undefined)
  const front = { x: s.x + Math.cos(s.aim) * 2, y: s.y + Math.sin(s.aim) * 2 }
  spawnShot(fight, { kind: "bullet", x: front.x, y: front.y, vx: -Math.cos(s.aim) * 9, vy: -Math.sin(s.aim) * 9 })
  runUntil(fight, 2000, () => fight.view().shots.length === 0)
  assert.ok(find(fight, "shield") !== undefined, "blocked")
  assert.ok(fight.view().slashes.some((m) => m.blocked), "a spark where the shot hit the shield")
  const back = { x: s.x - Math.cos(s.aim) * 2, y: s.y - Math.sin(s.aim) * 2 }
  spawnShot(fight, { kind: "bullet", x: back.x, y: back.y, vx: Math.cos(s.aim) * 9, vy: Math.sin(s.aim) * 9 })
  runUntil(fight, 2000, () => fight.view().shots.length === 0)
  assert.equal(find(fight, "shield"), undefined)
})

test("the shield-bearer turns slowly: run round it and its back is open", () => {
  const { fight, thumb } = fightIn("Shieldwall")
  const s0 = find(fight, "shield")
  assert.ok(s0 !== undefined)
  // Circle it at full speed, 2.6 m out: about 1.9 rad/s of world time against its turn of 1.5.
  placeBeside(fight, s0, s0.aim, 2.6)
  let angle = s0.aim
  let cut = false
  runUntil(fight, 600, () => cut || fight.view().flow !== "playing", () => {
    const s = find(fight, "shield")
    if (s === undefined) { cut = true; return }
    angle += 0.035
    const target = { x: s.x + Math.cos(angle) * 2.6, y: s.y + Math.sin(angle) * 2.6 }
    const me = fight.view().player
    if (me === null) return
    // Once round its back, step in.
    const behind = Math.abs(Math.atan2(Math.sin(angle - s.aim - Math.PI), Math.cos(angle - s.aim - Math.PI))) < 0.6
    const goal = behind ? { x: s.x, y: s.y } : target
    const dx = goal.x - me.x, dy = goal.y - me.y, d = Math.hypot(dx, dy) || 1
    thumb.push = { x: dx / d, y: dy / d }
  })
  assert.ok(cut, `the shield-bearer should fall from behind (flow ${fight.view().flow})`)
})

test("a sniper sees you across the room, and charges only while it does", () => {
  const { fight, thumb } = fightIn("Watchtower")
  const sniper = () => find(fight, "sniper")
  // From the start, out of even its sight.
  runUntil(fight, 30, () => false, jiggle(thumb, 0.5))
  assert.equal(sniper()?.sees, false)
  // 21.5 m away: beyond a gunner's sight, inside a sniper's.
  placePlayer(fight, 8, 24)
  runUntil(fight, 20, () => false, jiggle(thumb, 0.5))
  assert.equal(sniper()?.sees, true)
  assert.ok(21.5 > TUNING.sight && 21.5 < SHOOTERS.sniper.sight)
  const charged = sniper()?.charge ?? 0
  assert.ok(charged > 0.05, `charging: ${charged}`)
  assert.ok(sniper()?.laser !== null, "its laser is on you")
  // Behind a crate: it loses you, and its charge starts over.
  placePlayer(fight, 3.5, 11.5)
  runUntil(fight, 5, () => false, jiggle(thumb, 0.5))
  assert.equal(sniper()?.sees, false)
  assert.equal(sniper()?.charge, 0)
  assert.equal(sniper()?.laser, null)
})

test("a sniper that sees you from the first moment still needs a whole charge to fire", () => {
  const { fight, thumb } = fightIn("Watchtower")
  placePlayer(fight, 8, 12)
  const before = SHOOTERS.sniper.period - SHOOTERS.sniper.lock
  // Just short of the lock, in world seconds: no laser lock and no shot yet.
  runUntil(fight, 2000, () => fight.view().world >= before * 0.9, jiggle(thumb, 0.5))
  assert.equal(fight.view().shots.length, 0)
  assert.equal(find(fight, "sniper")?.laser?.locked, false)
})

/** Stands in the sniper's sight until its laser locks; returns the locked aim. */
const untilLocked = (fight: Fight, thumb: ScriptedThumb): number => {
  placePlayer(fight, 8, 13)
  runUntil(fight, 2000, () => find(fight, "sniper")?.laser?.locked === true, jiggle(thumb, 0.5))
  const laser = find(fight, "sniper")?.laser
  assert.ok(laser !== null && laser !== undefined && laser.locked)
  return laser.aim
}

test("once its laser locks, stepping off the line makes the sniper miss", () => {
  const { fight, thumb } = fightIn("Watchtower")
  const aim = untilLocked(fight, thumb)
  // Run sideways: the slug flies down the locked line, not at you.
  thumb.push = { x: 1, y: 0 }
  let slug: { vx: number; vy: number } | undefined
  // Until its slug has come and gone (any later shot is a new charge).
  runUntil(fight, 240, () => fight.view().flow !== "playing" || (slug !== undefined && fight.view().shots.length === 0), () => {
    slug ??= fight.view().shots.find((s) => s.kind === "slug")
  })
  assert.ok(slug !== undefined, "it fired")
  assert.ok(Math.abs(Math.atan2(slug.vy, slug.vx) - aim) < 1e-6, "along the locked line")
  assert.equal(fight.view().flow, "playing", "and missed")
})

test("standing on the locked line, the sniper's slug hits you", () => {
  const { fight, thumb } = fightIn("Watchtower")
  untilLocked(fight, thumb)
  runUntil(fight, 600, () => fight.view().flow !== "playing", jiggle(thumb, 0.3))
  assert.equal(fight.view().flow, "dead")
})

test("staggers last their world time: standing still keeps a knight dazed", () => {
  const { fight } = fightIn("Armory")
  const k = find(fight, "knight")
  assert.ok(k !== undefined)
  placeBeside(fight, k, Math.PI / 2)
  fight.tick()
  // A real second of standing still is a few hundredths of a world second.
  runUntil(fight, 60, () => false)
  assert.equal(find(fight, "knight")?.melee?.phase, "stagger")
  assert.ok(STAGGER.time > 60 / 60 * TUNING.slow)
})
