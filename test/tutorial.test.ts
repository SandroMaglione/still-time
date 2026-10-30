/**
 * The first rooms, played headless, one lesson each: First Step the move (an
 * empty room cleared by the page's drill), Point Blank the stop (a bullet already
 * flying at you, frozen while you are), Time Door the clock (a door whose timer
 * runs only while you move), First Cut the cut (one gunner).
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { fightIn, runUntil } from "./helpers.ts"

test("First Step: nothing in the room; walking anywhere does not clear it, the page's lesson done does", () => {
  const { fight, thumb } = fightIn("First Step")
  assert.equal(fight.view().room.index, 0, "it is the first room")
  assert.equal(fight.view().room.goal.kind, "lesson")
  assert.equal(fight.view().enemies.length, 0)
  assert.equal(fight.view().hazards.length, 0)
  for (const push of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
    runUntil(fight, 120, () => false, () => { thumb.push = push })
  }
  assert.equal(fight.view().flow, "playing", "no exit to walk to")
  thumb.push = { x: 0, y: 0 }
  fight.send({ kind: "lessonDone" })
  runUntil(fight, 5, () => fight.view().flow !== "playing")
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("Point Blank: a bullet already flying at you, frozen while you stand; walk into it and it hits", () => {
  const { fight, thumb } = fightIn("Point Blank")
  assert.equal(fight.view().room.index, 1, "it is the second room")
  // Standing still for three real seconds: the bullet a few steps off barely moves, and you are fine.
  runUntil(fight, 180, () => fight.view().flow !== "playing")
  assert.equal(fight.view().flow, "playing", "still, it waits")
  assert.ok(fight.view().world < 0.2)
  // Walking left, into its line: it is the bullet that hits.
  runUntil(fight, 300, () => fight.view().flow !== "playing", () => { thumb.push = { x: -1, y: 0 } })
  assert.equal(fight.view().flow, "dead")
})

test("Point Blank: step up out of the bullet's line, then cross the lanes when they are clear, to the exit", () => {
  const { fight, thumb } = fightIn("Point Blank")
  let flip = 1
  runUntil(fight, 3000, () => fight.view().flow !== "playing", () => {
    const p = fight.view().player!
    // A bullet coming on the lane just ahead: run the clock on the spot until it has passed (back out of the lane first).
    const threat = fight.view().hazards.find((h) => {
      if (h.kind !== "bolt" || !h.live || h.ay < p.y - 1.6 || h.ay > p.y + 0.7) return false
      const ahead = (p.x - h.ax) * Math.sign(h.bx - h.ax)
      return ahead > -0.8 && ahead < 5
    })
    flip = -flip
    if (threat !== undefined) { thumb.push = Math.abs(threat.ay - p.y) < 0.7 ? { x: 0, y: 1 } : { x: flip, y: 0 }; return }
    const dx = p.y > 26 ? 0 : Math.max(-1, Math.min(1, (5 - p.x) / 2))
    const d = Math.hypot(dx, 1)
    thumb.push = { x: dx / d, y: -1 / d }
  })
  assert.equal(fight.view().flow, "cleared")
  assert.equal(fight.view().hits, 0)
})

test("the tutorials move you at top speed for any push; from the Duel on, the push sets the speed", () => {
  for (const [name, full] of [["Point Blank", true], ["Duel", false]] as const) {
    const { fight, thumb } = fightIn(name)
    runUntil(fight, 10, () => false, () => { thumb.push = { x: 0.3, y: 0 } })
    const speed = Math.hypot(fight.view().player!.vx, fight.view().player!.vy)
    if (full) assert.ok(speed > 4.9, `${name}: ${speed}`)
    else assert.ok(speed < 2, `${name}: ${speed}`)
  }
})

test("Time Door: three time doors open one after another, only as the world clock runs (only while you move)", () => {
  const { fight, thumb } = fightIn("Time Door")
  assert.equal(fight.view().room.index, 2, "it is the third room")
  assert.equal(fight.view().hazards.length, 0)
  const doors = fight.view().doors
  assert.equal(doors.length, 3)
  const seconds = doors.map((d) => (d.lock.kind === "time" ? d.lock.seconds : -1))
  assert.ok(seconds.every((t, i) => t > 0 && (i === 0 || t > seconds[i - 1]!)), "time doors, each later than the last")
  // Standing still, two real seconds: the world barely runs and every door stays shut.
  runUntil(fight, 120, () => false)
  assert.ok(fight.view().doors.every((d) => !d.open), "still, the doors wait")
  // Pushing into a shut door is standing still: the clock does not run, and the door stays shut.
  runUntil(fight, 600, () => { const p = fight.view().player!; return p.y < 25.4 }, () => { thumb.push = { x: 0, y: -1 } })
  const before = fight.view().world
  runUntil(fight, 120, () => false, () => { thumb.push = { x: 0, y: -1 } })
  assert.ok(fight.view().world - before < 0.3, "pushing into the door does not run the clock")
  assert.equal(fight.view().doors[0]?.open, false)
  // Walking up the corridor, and stepping side to side at each shut door, runs the clock: they open in order, and the
  // exit is reached.
  const opened: Array<number> = []
  let flip = 1
  runUntil(fight, 4000, () => fight.view().flow !== "playing", () => {
    const p = fight.view().player!
    const blocked = fight.view().doors.some((d) => !d.open && p.y - (d.y + d.h) < 0.6 && p.y > d.y)
    flip = -flip
    thumb.push = blocked ? { x: flip, y: 0 } : { x: 0, y: -1 }
    fight.view().doors.forEach((d, i) => { if (d.open && !opened.includes(i)) opened.push(i) })
  })
  assert.deepEqual(opened, [0, 1, 2], "in order")
  assert.equal(fight.view().flow, "cleared")
  assert.ok(fight.view().world >= seconds[2]! - 1e-9)
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
  assert.equal(fight.view().room.index, 3)
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
