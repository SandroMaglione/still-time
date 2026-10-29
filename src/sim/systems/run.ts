/**
 * The run: page commands and taps, entering a room (spawning its player and
 * enemies), and the outcome of each step (hit, cleared, all done).
 */
import { Clock } from "@typeonce/ritmo"

import { ROOMS } from "../rooms.ts"
import { Blade, Body, Enemy, EnterRoom, Flow, Game, Input, IntentEvent, Melee, Pace, Player, PlayerHit, Post, Reload, RoomScope, Run, Slashes, STEP, Time } from "../schema.ts"
import { CROWD, TUNING } from "../tuning.ts"
import { BruteRead, ShooterRead } from "./queries.ts"
import { Ops } from "@typeonce/ritmo"

/** The first room of the run: built once by the setup schedule. */
export const OpenRunSystem = Game.System(
  "Slap/OpenRun",
  { resources: { run: Game.System.readResource(Run) }, events: { enter: Game.System.writeEvent(EnterRoom) } },
  ({ resources, events }) => {
    events.enter.emit({ room: resources.run.get().room })
  }
)

/** Taps and page commands: retry after a hit, next room after a clear, restart, jump to a room. */
export const ApplyIntentSystem = Game.System(
  "Slap/ApplyIntent",
  {
    resources: { run: Game.System.readResource(Run), input: Game.System.readResource(Input), time: Game.System.readResource(Time) },
    machines: { flow: Game.System.machine(Flow) },
    events: { intents: Game.System.readEvent(IntentEvent), enter: Game.System.writeEvent(EnterRoom) }
  },
  ({ resources, machines, events }) => {
    const flow = machines.flow.get()
    const room = resources.run.get().room
    if (resources.input.get().tap) {
      if (flow._tag === "Dead" && Clock.reached(resources.time.get(), flow.retryAt)) events.enter.emit({ room })
      else if (flow._tag === "Cleared") events.enter.emit({ room: room + 1 })
      else if (flow._tag === "Won") events.enter.emit({ room: 0 })
    }
    for (const intent of events.intents.all()) {
      if (intent.kind === "restart") events.enter.emit({ room })
      else if (intent.room >= 0 && intent.room < ROOMS.length) events.enter.emit({ room: intent.room })
    }
  }
)

/** Builds the room asked for: clears the old one, spawns the player and the enemies, back to Playing. */
export const BuildRoomSystem = Game.System(
  "Slap/BuildRoom",
  {
    resources: { run: Game.System.writeResource(Run), pace: Game.System.writeResource(Pace), slashes: Game.System.writeResource(Slashes) },
    nextMachines: { flow: Game.System.nextState(Flow) },
    events: { enter: Game.System.readEvent(EnterRoom) },
    commands: Game.System.commands(Game.System.spawns(Body, Player, Enemy, Reload, Post, Melee, Blade), Game.System.despawnsScope(RoomScope))
  },
  ({ resources, nextMachines, events, commands }) => {
    // Several requests in one step: the last one wins.
    const asked = events.enter.all().at(-1)
    if (asked === undefined) return
    const room = ROOMS[asked.room]
    if (room === undefined) return
    commands.despawnScope(RoomScope)
    commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: room.start.x, y: room.start.y }], [Player, { vx: 0, vy: 0 }]))
    let brutes = 0
    for (const e of room.enemies) {
      if (e.kind === "brute") {
        const facing = Ops.atan2(room.start.y - e.y, room.start.x - e.x)
        const pace = CROWD.paces[brutes++ % CROWD.paces.length] ?? 1
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, { kind: e.kind }], [Melee, { facing, pace }], [Blade, { _tag: "idle" }]))
      } else {
        const post = { hx: e.x, hy: e.y, seen: null, strafe: e.x < room.w / 2 ? 1 : -1 } as const
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, { kind: e.kind }], [Reload, { left: e.delay }], [Post, post]))
      }
    }
    resources.run.set({ room: asked.room, deaths: resources.run.get().deaths })
    resources.pace.set({ scale: TUNING.slow })
    resources.slashes.set([])
    nextMachines.flow.set({ _tag: "Playing" })
  }
)

/** Cut marks fade out after their time. */
export const FadeSlashesSystem = Game.System(
  "Slap/FadeSlashes",
  { resources: { time: Game.System.readResource(Time), slashes: Game.System.writeResource(Slashes) } },
  ({ resources }) => {
    const now = resources.time.get().step
    const slashes = resources.slashes.get()
    if (slashes.some((s) => now - s.born >= TUNING.slashSteps)) resources.slashes.set(slashes.filter((s) => now - s.born < TUNING.slashSteps))
  }
)

/** A hit ends the attempt; no enemies left clears the room (or the run). */
export const OutcomeSystem = Game.System(
  "Slap/Outcome",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { shooters: ShooterRead, brutes: BruteRead },
    resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time) },
    nextMachines: { flow: Game.System.nextState(Flow) },
    events: { hits: Game.System.readEvent(PlayerHit) }
  },
  ({ queries, resources, nextMachines, events }) => {
    const run = resources.run.get()
    if (events.hits.all().length > 0) {
      resources.run.set({ room: run.room, deaths: run.deaths + 1 })
      nextMachines.flow.set({ _tag: "Dead", retryAt: Clock.deadline(resources.time.get(), Clock.durationOfSteps(STEP, TUNING.deadLockSteps)) })
    } else if (queries.shooters.each().length + queries.brutes.each().length === 0) {
      nextMachines.flow.set(run.room + 1 >= ROOMS.length ? { _tag: "Won" } : { _tag: "Cleared" })
    }
  }
)
