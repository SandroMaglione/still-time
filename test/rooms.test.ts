/**
 * The rooms as data: every lock has something to open it, every spawn
 * stands on open floor, and walking the floor (a grid at your size) shows
 * each room can be finished with its doors open but not skipped with them
 * shut.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { insidePillar } from "../src/sim/geometry.ts"
import { ROOMS, type Pillar, type Room } from "../src/sim/rooms.ts"
import { TUNING, radiusOf } from "../src/sim/tuning.ts"

const CELL = 0.2

/** The floor cells your centre can reach from the start, walking round `walls`. */
const reachable = (room: Room, walls: ReadonlyArray<Pillar>): { readonly has: (x: number, y: number) => boolean } => {
  const r = TUNING.player.radius
  const cols = Math.floor(room.w / CELL), rows = Math.floor(room.h / CELL)
  const free = (c: number, k: number): boolean => {
    const x = (c + 0.5) * CELL, y = (k + 0.5) * CELL
    return x >= r && y >= r && x <= room.w - r && y <= room.h - r && !insidePillar(x, y, r, walls)
  }
  const seen = new Uint8Array(cols * rows)
  const c0 = Math.floor(room.start.x / CELL), k0 = Math.floor(room.start.y / CELL)
  const queue: Array<readonly [number, number]> = [[c0, k0]]
  seen[k0 * cols + c0] = 1
  while (queue.length > 0) {
    const [c, k] = queue.pop() ?? [0, 0]
    for (const [dc, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc, nk = k + dk
      if (nc < 0 || nk < 0 || nc >= cols || nk >= rows || seen[nk * cols + nc] === 1 || !free(nc, nk)) continue
      seen[nk * cols + nc] = 1
      queue.push([nc, nk])
    }
  }
  // Near enough: any reached cell within `reach` of the point.
  return {
    has: (x: number, y: number) => {
      const reach = TUNING.attackRange
      for (let k = Math.floor((y - reach) / CELL); k <= Math.floor((y + reach) / CELL); k++) {
        for (let c = Math.floor((x - reach) / CELL); c <= Math.floor((x + reach) / CELL); c++) {
          if (c < 0 || k < 0 || c >= cols || k >= rows || seen[k * cols + c] !== 1) continue
          if (Math.hypot((c + 0.5) * CELL - x, (k + 0.5) * CELL - y) <= reach) return true
        }
      }
      return false
    }
  }
}

const centreOf = (p: Pillar): { x: number; y: number } => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })

test("room names are unique", () => {
  assert.equal(new Set(ROOMS.map((r) => r.name)).size, ROOMS.length)
})

for (const room of ROOMS) {
  test(`${room.name}: every lock can be met`, () => {
    for (const door of room.doors) {
      const lock = door.lock
      if (lock.kind === "clear") assert.ok(room.enemies.some((e) => (e.chamber ?? 0) === lock.chamber), `nobody in chamber ${lock.chamber}`)
      else if (lock.kind === "captain") assert.ok(room.enemies.some((e) => (e.chamber ?? 0) === lock.chamber && e.captain === true), `no captain in chamber ${lock.chamber}`)
      else if (lock.kind === "key") assert.equal(room.enemies.filter((e) => e.kind === "runner" && e.key === lock.key).length, 1, `one runner carries key ${lock.key}`)
      else if (lock.kind === "time") assert.ok(lock.seconds > 0, "a time lock waits for some time")
      else {
        assert.ok(lock.plates.length > 0)
        for (const p of lock.plates) assert.ok(room.plates?.[p] !== undefined, `no plate ${p}`)
      }
    }
    // Every plate belongs to exactly one lock, and you can reach it before any door opens.
    const plateLocks = room.doors.flatMap((d) => (d.lock.kind === "plates" ? d.lock.plates : []))
    const shut = reachable(room, [...room.pillars, ...room.doors])
    for (const [i, plate] of (room.plates ?? []).entries()) {
      assert.equal(plateLocks.filter((p) => p === i).length, 1, `plate ${i} belongs to one lock`)
      assert.ok(shut.has(plate.x, plate.y), `plate ${i} out of reach`)
    }
    for (const e of room.enemies) assert.equal(e.kind === "runner", e.key !== undefined, `a ${e.kind} with key ${e.key}: only runners carry keys`)
    if (room.pillars.some((p) => p.breaks === "cracked")) assert.ok(room.enemies.some((e) => e.kind === "brute" || e.kind === "grenadier"), "a cracked wall needs a brute or a grenadier to break it")
    if (room.goal.kind === "clear") assert.ok(room.enemies.length > 0)
  })

  test(`${room.name}: the start and every spawn stand on open floor`, () => {
    const walls = [...room.pillars, ...room.doors]
    assert.ok(!insidePillar(room.start.x, room.start.y, TUNING.player.radius, walls), "start")
    for (const e of room.enemies) {
      const r = radiusOf(e.kind)
      assert.ok(e.x >= r && e.y >= r && e.x <= room.w - r && e.y <= room.h - r, `${e.kind} at ${e.x},${e.y} outside`)
      assert.ok(!insidePillar(e.x, e.y, r, walls), `${e.kind} at ${e.x},${e.y} in a wall`)
    }
  })

  test(`${room.name}: with its doors open (and what breaks, broken) you can reach every enemy and the exit; shut, they hold`, () => {
    const open = reachable(room, room.pillars.filter((p) => p.breaks === undefined))
    for (const e of room.enemies) assert.ok(open.has(e.x, e.y), `${e.kind} at ${e.x},${e.y} out of reach`)
    if (room.goal.kind === "exit") assert.ok(open.has(centreOf(room.goal).x, centreOf(room.goal).y), "exit out of reach")
    if (room.doors.length === 0 && room.pillars.every((p) => p.breaks === undefined)) return
    const shut = reachable(room, [...room.pillars, ...room.doors])
    if (room.goal.kind === "exit") assert.ok(!shut.has(centreOf(room.goal).x, centreOf(room.goal).y), "the exit can be reached past the doors")
    for (const e of room.enemies) if ((e.chamber ?? 0) > 0) assert.ok(!shut.has(e.x, e.y), `${e.kind} in chamber ${e.chamber} reachable past its door`)
  })
}
