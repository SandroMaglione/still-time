/**
 * Random thumbs in every room, checked against the invariants after every
 * step: solid bodies stay apart, you stay on the floor, the world speed
 * stays in range. A failure prints the shrunk input.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { HostClock } from "@typeonce/ritmo"
import { Fuzz, type Replay } from "@typeonce/ritmo-devtools"

import { ROOMS } from "../src/sim/rooms.ts"
import { ThumbInput, type Thumb } from "../src/sim/schema.ts"
import { IDLE_THUMB, makeRuntime, setupSchedule, updateSchedule } from "../src/sim/simulation.ts"
import { INVARIANTS } from "./invariants.ts"

/** A thumb that holds a push for a while, then picks another (a held stick, not jitter), and taps now and then. */
const thumbs = () => {
  let held: Thumb = IDLE_THUMB
  return Fuzz.input(ThumbInput, {
    generate: (random, frame) => {
      if (frame === 0) held = IDLE_THUMB
      if (random.next() < 0.06) {
        const angle = random.range(0, Math.PI * 2)
        const push = random.next() < 0.2 ? 0 : random.range(0.2, 1)
        held = { x: Math.cos(angle) * push, y: Math.sin(angle) * push, tap: false }
      }
      return { x: held.x, y: held.y, tap: random.next() < 0.02 }
    },
    neutral: IDLE_THUMB
  })
}

for (const [room, { name }] of ROOMS.entries()) {
  test(`fuzz: ${name} keeps its invariants`, () => {
    const make = (playback: Replay.Playback) => {
      const hostClock = HostClock.test()
      const runtime = makeRuntime({ room, thumb: playback.source(ThumbInput), debug: { hostClock } })
      return { runtime, schedules: { setup: setupSchedule, update: updateSchedule }, hostClock }
    }
    const found = Fuzz.run(make, { schedule: "update", setup: "setup", inputs: [thumbs()], invariants: INVARIANTS, frames: 1500, runs: 3, seed: 11 + room })
    if (!found.ok) assert.fail(JSON.stringify(found.error._tag === "Found" ? { violation: found.error.violation, frame: found.error.frame, seed: found.error.seed } : found.error))
  })
}
