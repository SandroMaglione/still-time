/**
 * Batch 4, played headless: pressure plates (stepped onto, in any order or
 * numbered), hazards on the attempt's world clock (spinning blades, laser
 * gates), and rooms you win by surviving a stretch of world time.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import type { Fight } from "../src/sim/simulation.ts"
import { fightIn, placePlayer, runUntil, type ScriptedThumb } from "./helpers.ts"

/** Pushes back and forth along x so time runs while you stay about where you are. */
const jiggle = (thumb: ScriptedThumb, strength = 1): (() => void) => {
  let flip = 1
  return () => { flip = -flip; thumb.push = { x: flip * strength, y: 0 } }
}

/** Steps onto a plate (one tick on it), then off it again. */
const press = (fight: Fight, plate: number): void => {
  const p = fight.view().plates[plate]
  assert.ok(p !== undefined)
  placePlayer(fight, p.x, p.y)
  fight.tick()
  placePlayer(fight, p.x, p.y + 1.5)
  fight.tick()
}

/** Rewrites a snapshot: a test starting from a chosen moment. */
const edit = (fight: Fight, change: (value: any) => any): void => {
  const snapshot = fight.runtime.snapshot()
  if (!snapshot.ok) throw new Error("snapshot failed")
  const restored = fight.runtime.restore(change(snapshot.value))
  if (!restored.ok) throw new Error(`restore failed ${JSON.stringify(restored.error)}`)
}

test("stepping onto a plate opens its gate; the plate stays down", () => {
  const { fight } = fightIn("Switchyard")
  assert.equal(fight.view().doors[0]?.open, false)
  press(fight, 0)
  assert.equal(fight.view().plates[0]?.down, true)
  assert.equal(fight.view().doors[0]?.open, true)
})

test("numbered plates open their gate only in order; a wrong one pops them all back up", () => {
  const { fight } = fightIn("Combination")
  const down = () => fight.view().plates.map((p) => p.down)
  press(fight, 1)
  assert.deepEqual(down(), [false, false, false], "plate 2 before plate 1 does nothing but reset")
  assert.equal(fight.view().plates[1]?.missed, true, "and flashes red")
  press(fight, 0)
  assert.deepEqual(down(), [true, false, false])
  press(fight, 2)
  assert.deepEqual(down(), [false, false, false], "plate 3 out of turn resets plate 1")
  press(fight, 0); press(fight, 1)
  assert.equal(fight.view().doors[0]?.open, false)
  assert.equal(fight.view().doors[0]?.waiting, 1)
  press(fight, 2)
  assert.equal(fight.view().doors[0]?.open, true)
})

test("standing on a plate presses it once, not every step", () => {
  const { fight } = fightIn("Combination")
  const second = fight.view().plates[1]
  assert.ok(second !== undefined)
  // On the wrong plate: one miss; staying there does not keep resetting a plate pressed meanwhile.
  placePlayer(fight, second.x, second.y)
  runUntil(fight, 40, () => false)
  assert.equal(fight.view().plates.every((p) => !p.down), true)
})

test("blades turn in world time, and take whoever they touch", () => {
  const { fight, thumb } = fightIn("Mill")
  const blade = () => fight.view().hazards[0]
  const before = blade()
  assert.ok(before !== undefined)
  runUntil(fight, 60, () => false)
  const still = blade()
  assert.ok(still !== undefined)
  assert.ok(Math.hypot(still.ax - before.ax, still.ay - before.ay) < 0.2, "barely moved while you stood still")
  runUntil(fight, 30, () => false, jiggle(thumb))
  const moved = blade()
  assert.ok(moved !== undefined)
  assert.ok(Math.hypot(moved.ax - before.ax, moved.ay - before.ay) > 0.4, "turned while you moved")
  // Stand on the bar's tip: it takes you.
  placePlayer(fight, moved.ax + (moved.bx - moved.ax) * 0.1, moved.ay + (moved.by - moved.ay) * 0.1)
  fight.tick()
  assert.equal(fight.view().flow, "dead")
})

test("a blade takes an enemy too", () => {
  const { fight } = fightIn("Grinder")
  const before = fight.view().enemies.length
  const pivot = fight.view().hazards[0]
  assert.ok(pivot !== undefined)
  edit(fight, (v) => {
    let moved = false
    return { ...v, entities: v.entities.map((e: { id: number; components: Record<string, unknown> }) => {
      if (moved || !("Slap/Enemy" in e.components)) return e
      moved = true
      return { id: e.id, components: { ...e.components, "Slap/Body": { x: (pivot.ax + pivot.bx) / 2, y: (pivot.ay + pivot.by) / 2 } } }
    }) }
  })
  fight.tick()
  assert.equal(fight.view().enemies.length, before - 1)
})

test("a laser gate takes you only while it is on, and warns before", () => {
  const { fight, thumb } = fightIn("Gauntlet")
  const gate = () => fight.view().hazards[0]
  const crossAt = (): void => { const g = gate(); if (g !== undefined) placePlayer(fight, 8, g.ay) }
  // Wait (moving, so time runs) beside it until it is off, then stand in it: nothing happens.
  placePlayer(fight, 8, 20)
  runUntil(fight, 2000, () => gate()?.state === "off", jiggle(thumb, 0.5))
  thumb.push = { x: 0, y: 0 }
  crossAt()
  fight.tick()
  assert.equal(fight.view().flow, "playing")
  // It warns before it lights.
  placePlayer(fight, 8, 20)
  let warned = false
  const wait = jiggle(thumb, 0.5)
  runUntil(fight, 2000, () => gate()?.state === "on", () => { if (gate()?.state === "warn") warned = true; wait() })
  assert.ok(warned, "a warning came first")
  thumb.push = { x: 0, y: 0 }
  crossAt()
  fight.tick()
  assert.equal(fight.view().flow, "dead")
})

test("the Mill can be crossed by timing: wait in the lane, dash to the pocket between the blades, dash out", () => {
  // Found by a search over waits; kept as proof the room can be finished.
  const { fight, thumb } = fightIn("Mill")
  const lane = 9.4
  runUntil(fight, 200, () => Math.abs((fight.view().player?.x ?? 0) - lane) < 0.1, () => { thumb.push = { x: Math.sign(lane - (fight.view().player?.x ?? 0)), y: 0 } })
  runUntil(fight, 78, () => fight.view().flow !== "playing", jiggle(thumb))
  runUntil(fight, 400, () => (fight.view().player?.y ?? 99) <= 12.5 || fight.view().flow !== "playing", () => { thumb.push = { x: 0, y: -1 } })
  runUntil(fight, 600, () => fight.view().flow !== "playing", () => {
    const p = fight.view().player
    thumb.push = { x: p !== null && p.y < 6 ? Math.max(-1, Math.min(1, 7 - p.x)) : 0, y: -1 }
  })
  assert.equal(fight.view().flow, "cleared")
})
