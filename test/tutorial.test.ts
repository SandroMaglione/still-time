/**
 * The first rooms, played headless, one lesson each: the Prologue the rule itself (a cutscene: a bullet that stops
 * when you stop, played by the page's director), Crossing choosing when (streams of bolts you cross between), Time Door the clock
 * (doors whose timers run only while you move), First Cut the cut (gunners that never fire).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { SHOTS, TUNING } from "../src/sim/tuning.ts"
import type { FightView } from "../src/sim/view.ts"
import { Director } from "../src/host/intro.ts"
import { fightIn, pushToward, runUntil } from "./helpers.ts"

const still = (fight: ReturnType<typeof fightIn>["fight"], thumb: ReturnType<typeof fightIn>["thumb"], steps: number): void => {
  thumb.push = { x: 0, y: 0 }
  runUntil(fight, steps, () => false)
}

test("Prologue: the gunner is in sight from the start, and holds its fire while you stand", () => {
  const { fight, thumb } = fightIn("Prologue")
  assert.equal(fight.view().room.index, 0, "it is the first room")
  assert.ok(fight.view().room.scene, "a cutscene")
  assert.deepEqual(fight.view().enemies.map((e) => [e.kind, e.quiet]), [["gunner", false]])
  still(fight, thumb, 600)
  assert.equal(fight.view().shots.length, 0, "frozen: it cannot fire")
  assert.equal(fight.view().world, 0)
  assert.ok(fight.view().enemies[0]!.sees, "it sees you from where you start")
})

test("Prologue: each beat holds; the gunner fires, you stop short of its shot twice, step aside, get close and cut, unhit", () => {
  const { fight, thumb } = fightIn("Prologue")
  const director = new Director()
  const lines: Array<string> = []
  /** How far the shot was when each stop began. */
  const stops = new Map<string, number>()
  /** Real s each held beat stood before a tap took it. */
  const holds = new Map<string, number>()
  let held = 0
  const play = (max: number, taps = true): void => {
    runUntil(fight, max, () => fight.view().flow !== "playing", () => {
      const view = fight.view()
      const cue = director.step(view, 1 / 60)
      thumb.push = cue.push
      if (cue.line !== null && lines.at(-1) !== cue.line[0]) lines.push(cue.line[0])
      if (!cue.waiting) { held = 0; return }
      // A held beat: you stand, the world frozen. The player taps every half second, taken once the beat is ready.
      assert.deepEqual(cue.push, { x: 0, y: 0 })
      const key = cue.line?.[0] ?? ""
      if ((key === "WHEN YOU STOP," || key === "IT WAITS") && !stops.has(key)) {
        const p = view.player!
        stops.set(key, Math.min(...view.shots.map((s) => Math.hypot(s.x - p.x, s.y - p.y))))
      }
      held++
      holds.set(key, held / 60)
      if (taps && held % 30 === 0) {
        assert.ok(cue.ready, "a held beat takes a tap at once")
        director.advance()
      }
    })
  }
  // Untapped, the first stop holds for as long as you like, with the world frozen.
  play(60 * 20, false)
  assert.equal(fight.view().flow, "playing")
  assert.deepEqual(lines, ["WHEN YOU STOP,"])
  assert.equal(fight.view().scale, 0)
  held = 0
  play(60 * 90)
  assert.equal(fight.view().flow, "cleared", `the prologue ends on the cut (lines: ${lines.join(", ")})`)
  assert.equal(fight.view().hits, 0)
  assert.deepEqual(lines, ["WHEN YOU STOP,", "MOVE SLOWLY,", "IT WAITS", "YOU ONLY NEED TO"])
  assert.equal(stops.size, 2, "it stops short of two shots")
  for (const d of stops.values()) assert.ok(d > 1 && d < 1.7, `just short of the shot (${d})`)
  assert.ok((holds.get("IT WAITS") ?? 0) >= 0.4, `the second stop holds until tapped (${holds.get("IT WAITS")})`)
  // After the clear: its last words, for a tap, then it is over.
  assert.deepEqual(director.step(fight.view(), 1 / 60).line, ["NOW IT'S", "YOUR TURN."])
  for (let i = 0; i < 120 && !director.over; i++) { director.advance(); director.step(fight.view(), 1 / 60) }
  assert.equal(director.over, true)
})

/** Crossing's two lanes of bolts, by the y of each. */
const LANES = [15, 10] as const

/** Whether a walk straight up across the lane at `lane` from where you stand meets no bolt (with a margin). */
const safeToCross = (view: FightView, lane: number): boolean => {
  const p = view.player!
  const speed = TUNING.player.speed, reach = TUNING.player.radius + SHOTS.bullet.radius + 0.12 + 0.1
  const t1 = Math.max(0, (p.y - lane - reach) / speed), t2 = (p.y - lane + reach) / speed + 0.1
  return view.hazards.every((h) => {
    if (h.kind !== "bolt" || !h.live || Math.abs((h.ay + h.by) / 2 - lane) > 0.5) return true
    const x = (h.ax + h.bx) / 2, v = Math.sign(h.bx - h.ax) * SHOTS.bullet.speed
    const [a, b] = [(p.x - reach - x) / v, (p.x + reach - x) / v].sort((m, n) => m - n) as [number, number]
    return b < t1 || a > t2
  })
}

test("Crossing: the bolts hold their place while you stand, fly while you walk, and a stop-and-look walk gets through", () => {
  const { fight, thumb } = fightIn("Crossing")
  assert.equal(fight.view().room.index, 1, "it is the second room")
  assert.equal(fight.view().enemies.length, 0)
  const live = (): Array<{ x: number; y: number }> => fight.view().hazards.filter((h) => h.kind === "bolt" && h.live).map((h) => ({ x: (h.ax + h.bx) / 2, y: (h.ay + h.by) / 2 }))
  assert.ok(LANES.every((lane) => live().some((b) => Math.abs(b.y - lane) < 0.5)), "a bolt on each lane from the first frame")
  const before = live()
  still(fight, thumb, 120)
  assert.deepEqual(live(), before, "still, nothing moves")
  thumb.push = { x: 0, y: -1 }
  runUntil(fight, 30, () => false)
  assert.notDeepEqual(live(), before, "walk, and they fly")
  // Up to each lane; at it, step side to side (time runs, the bolts pass) until a straight walk across is clear.
  let flip = 1, waited = 0
  runUntil(fight, 3000, () => fight.view().flow !== "playing", () => {
    const view = fight.view(), p = view.player!
    const lane = LANES.find((y) => p.y > y + 0.6)
    if (lane === undefined) { thumb.push = pushToward(fight, 4, 1.6); return }
    if (p.y - lane > 2.2 || safeToCross(view, lane)) { thumb.push = { x: 0, y: -1 }; return }
    if (++waited % 12 === 0) flip = -flip
    thumb.push = { x: p.x < 1.2 ? 1 : p.x > 6.8 ? -1 : flip, y: 0 }
  })
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("Time Door: one time door opens only as the world clock runs (only while you move)", () => {
  const { fight, thumb } = fightIn("Time Door")
  assert.equal(fight.view().room.index, 2, "it is the third room")
  assert.equal(fight.view().hazards.length, 0)
  const doors = fight.view().doors
  assert.equal(doors.length, 1, "one door")
  const lock = doors[0]!.lock
  assert.ok(lock.kind === "time" && lock.seconds > 0, "a time door")
  // Standing still, two real seconds: the world does not run and the door stays shut.
  runUntil(fight, 120, () => false)
  assert.equal(fight.view().doors[0]?.open, false, "still, the door waits")
  // Up to it, then pushing into it is standing still: the clock does not run, and it stays shut.
  const face = doors[0]!.y + doors[0]!.h
  runUntil(fight, 600, () => fight.view().player!.y < face + 0.4, () => { thumb.push = { x: 0, y: -1 } })
  const before = fight.view().world
  runUntil(fight, 120, () => false, () => { thumb.push = { x: 0, y: -1 } })
  assert.ok(fight.view().world - before < 0.3, "pushing into the door does not run the clock")
  assert.equal(fight.view().doors[0]?.open, false)
  // Stepping side to side at it runs the clock: it opens, and the exit is reached.
  let flip = 1
  runUntil(fight, 4000, () => fight.view().flow !== "playing", () => {
    const p = fight.view().player!
    const blocked = !fight.view().doors[0]!.open && p.y - face < 0.6
    flip = -flip
    thumb.push = blocked ? { x: flip, y: 0 } : { x: 0, y: -1 }
  })
  assert.equal(fight.view().flow, "cleared")
  assert.ok(lock.kind === "time" && fight.view().world >= lock.seconds - 1e-9)
})

/** Walks at the nearest enemy not shut away behind a door, until the room ends or the step budget runs out. */
const chase = (fight: ReturnType<typeof fightIn>["fight"], thumb: ReturnType<typeof fightIn>["thumb"], until: () => boolean, max = 1500): void => {
  runUntil(fight, max, () => until() || fight.view().flow !== "playing", () => {
    const p = fight.view().player!
    const open = fight.view().enemies.filter((e) => !e.sealed)
    const e = open.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
    if (e === undefined) { thumb.push = { x: 0, y: 0 }; return }
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1
    thumb.push = { x: dx / d, y: dy / d }
  })
}

test("First Cut: three gunners that never fire; cut the first, its door opens on two more; cut them and the room clears", () => {
  const { fight, thumb } = fightIn("First Cut")
  assert.equal(fight.view().room.index, 3, "it is the fourth room")
  assert.deepEqual(fight.view().enemies.map((e) => e.kind), ["gunner", "gunner", "gunner"])
  assert.ok(fight.view().enemies.every((e) => e.quiet), "none of them attacks")
  assert.equal(fight.view().room.goal.kind, "clear")
  assert.equal(fight.view().doors[0]?.open, false, "the second chamber is shut")
  // Time running for a while (side to side, full push): nobody fires.
  let flip = 1
  runUntil(fight, 600, () => fight.view().shots.length > 0, () => { flip = -flip; thumb.push = { x: flip, y: 0 } })
  assert.equal(fight.view().shots.length, 0, "quiet gunners never fire")
  // Walk into the first: it is cut, and the door opens.
  chase(fight, thumb, () => fight.view().enemies.length < 3)
  assert.equal(fight.view().enemies.length, 2)
  runUntil(fight, 5, () => false)
  assert.equal(fight.view().doors[0]?.open, true, "the first chamber cleared, its door opens")
  // Then the two inside.
  chase(fight, thumb, () => false)
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})
