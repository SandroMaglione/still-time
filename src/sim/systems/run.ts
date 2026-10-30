/**
 * The run: page commands and taps, entering a room (spawning its player and
 * enemies), its locks (keys dropped, picked up and used; doors opening), and
 * the outcome of each step (hit, cleared, all done) with its score.
 */
import { Clock, Ops } from "@typeonce/ritmo"

import { unlocked } from "../progress.ts"
import { ROOMS, type Lock, type Pillar } from "../rooms.ts"
import { Blade, Body, Carry, Doors, Enemy, EnterRoom, Flow, Game, Input, IntentEvent, Keys, Melee, Pace, Player, PlayerHit, Post, Reload, RoomScope, Run, Slashes, STEP, Time, type Key, type RoomResult } from "../schema.ts"
import { CROWD, LOCKS, MELEE, SHOOTERS, TUNING, isMelee } from "../tuning.ts"
import { EnemyRead, PlayerRead, RunnerRead, roomOf } from "./queries.ts"

/** The first room of the run: built once by the setup schedule. */
export const OpenRunSystem = Game.System(
  "Slap/OpenRun",
  { resources: { run: Game.System.readResource(Run) }, events: { enter: Game.System.writeEvent(EnterRoom) } },
  ({ resources, events }) => {
    events.enter.emit({ room: resources.run.get().room, fresh: true })
  }
)

/** Taps and page commands: retry after a hit, next room after a clear, restart, jump to an open room. */
export const ApplyIntentSystem = Game.System(
  "Slap/ApplyIntent",
  {
    resources: { run: Game.System.readResource(Run), input: Game.System.readResource(Input), time: Game.System.readResource(Time) },
    machines: { flow: Game.System.machine(Flow) },
    events: { intents: Game.System.readEvent(IntentEvent), enter: Game.System.writeEvent(EnterRoom) }
  },
  ({ resources, machines, events }) => {
    const flow = machines.flow.get()
    const run = resources.run.get()
    const room = run.room
    if (resources.input.get().tap) {
      if (flow._tag === "Dead" && Clock.reached(resources.time.get(), flow.retryAt)) events.enter.emit({ room, fresh: false })
      else if (flow._tag === "Cleared") events.enter.emit({ room: room + 1, fresh: true })
      else if (flow._tag === "Won") events.enter.emit({ room: 0, fresh: true })
    }
    for (const intent of events.intents.all()) {
      // A restart mid-room counts as a retry; after a clear it is a fresh go at the room.
      if (intent.kind === "restart") events.enter.emit({ room, fresh: flow._tag === "Cleared" || flow._tag === "Won" })
      else if (intent.room >= 0 && intent.room < ROOMS.length && (run.open || unlocked(run.best, intent.room))) events.enter.emit({ room: intent.room, fresh: true })
    }
  }
)

/** Builds the room asked for: clears the old one, spawns the player and the enemies, shuts its doors, back to Playing. */
export const BuildRoomSystem = Game.System(
  "Slap/BuildRoom",
  {
    resources: {
      run: Game.System.writeResource(Run),
      pace: Game.System.writeResource(Pace),
      slashes: Game.System.writeResource(Slashes),
      doors: Game.System.writeResource(Doors),
      keys: Game.System.writeResource(Keys)
    },
    nextMachines: { flow: Game.System.nextState(Flow) },
    events: { enter: Game.System.readEvent(EnterRoom) },
    commands: Game.System.commands(Game.System.spawns(Body, Player, Enemy, Carry, Reload, Post, Melee, Blade), Game.System.despawnsScope(RoomScope))
  },
  ({ resources, nextMachines, events, commands }) => {
    // Several requests in one step: the last one wins.
    const asked = events.enter.all().at(-1)
    if (asked === undefined) return
    const room = ROOMS[asked.room]
    if (room === undefined) return
    commands.despawnScope(RoomScope)
    commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: room.start.x, y: room.start.y }], [Player, { vx: 0, vy: 0 }]))
    let walkers = 0
    const keys: Array<Key> = []
    for (const e of room.enemies) {
      const enemy = { kind: e.kind, chamber: e.chamber ?? 0, captain: e.captain ?? false }
      const kind = e.kind
      const toStart = Ops.atan2(room.start.y - e.y, room.start.x - e.x)
      if (isMelee(kind)) {
        const pace = CROWD.paces[walkers++ % CROWD.paces.length] ?? 1
        const melee = { facing: toStart, pace, hp: MELEE[kind].hp }
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, enemy], [Melee, melee], [Blade, { _tag: "idle" }]))
      } else if (kind === "runner") {
        const key = e.key ?? 0
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, enemy], [Carry, { key }]))
        keys.push({ key, state: "carried", x: e.x, y: e.y })
      } else {
        const post = { hx: e.x, hy: e.y, seen: null, strafe: e.x < room.w / 2 ? 1 : -1 } as const
        // A scoped shooter starts uncharged: it must see you for a whole charge before its first shot.
        const spec = SHOOTERS[kind]
        const left = spec.scoped ? spec.period + e.delay : e.delay
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, enemy], [Reload, { left, aim: toStart }], [Post, post]))
      }
    }
    const run = resources.run.get()
    resources.run.set({ room: asked.room, deaths: run.deaths, hits: asked.fresh ? 0 : run.hits, world: 0, best: run.best, open: run.open })
    resources.doors.set(room.doors.map(() => false))
    resources.keys.set(keys)
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

/** The nearest distance from a point to a rectangle (0 inside it). */
const distanceTo = (x: number, y: number, p: Pillar): number =>
  Ops.hypot(x - Math.max(p.x, Math.min(x, p.x + p.w)), y - Math.max(p.y, Math.min(y, p.y + p.h)))

/**
 * Keys follow their runner; a runner gone (cut or shot) leaves its key on
 * the floor where it last stood; you pick up a key you walk over. A door
 * opens once its lock is met: its chamber's enemies (or captains) all down,
 * or you standing at it with its key, which it keeps.
 */
export const LocksSystem = Game.System(
  "Slap/Locks",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, enemies: EnemyRead, runners: RunnerRead },
    resources: { run: Game.System.readResource(Run), doors: Game.System.writeResource(Doors), keys: Game.System.writeResource(Keys) }
  },
  ({ queries, resources }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const runners = queries.runners.each().map((m) => ({ key: m.data.carry.get().key, at: m.data.body.get() }))
    let changed = false
    let keys = resources.keys.get().map((k): Key => {
      if (k.state === "carried") {
        changed = true
        const runner = runners.find((r) => r.key === k.key)
        return runner === undefined ? { key: k.key, state: "floor", x: k.x, y: k.y } : { key: k.key, state: "carried", x: runner.at.x, y: runner.at.y }
      }
      if (k.state === "floor" && Ops.hypot(k.x - me.x, k.y - me.y) <= LOCKS.pickup) {
        changed = true
        return { key: k.key, state: "held" }
      }
      return k
    })
    const enemies = queries.enemies.each().map((m) => m.data.enemy.get())
    const open = resources.doors.get()
    const met = (lock: Lock, door: Pillar): boolean => {
      switch (lock.kind) {
        case "clear": return !enemies.some((e) => e.chamber === lock.chamber)
        case "captain": return !enemies.some((e) => e.chamber === lock.chamber && e.captain)
        case "key": return keys.some((k) => k.key === lock.key && k.state === "held") && distanceTo(me.x, me.y, door) <= TUNING.player.radius + LOCKS.reach
      }
    }
    const next = room.doors.map((door, i) => open[i] === true || met(door.lock, door))
    for (const [i, door] of room.doors.entries()) {
      if (open[i] === true || next[i] !== true || door.lock.kind !== "key") continue
      const used = door.lock.key
      keys = keys.map((k): Key => (k.key === used && k.state === "held" ? { key: k.key, state: "used" } : k))
      changed = true
    }
    if (next.some((o, i) => o !== open[i])) resources.doors.set(next)
    if (changed) resources.keys.set(keys)
  }
)

/** Stars for a clear: one for the clear, one for no hit in the room, one for beating its par in world seconds. */
export const starsFor = (hits: number, world: number, par: number): number => 1 + (hits === 0 ? 1 : 0) + (world <= par ? 1 : 0)

/**
 * The clock of the attempt runs in world seconds, so it only moves while you
 * do. A hit ends the attempt; the room's goal (every enemy down, or you on
 * its exit) clears it, scores it, and keeps the room's best.
 */
export const OutcomeSystem = Game.System(
  "Slap/Outcome",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, enemies: EnemyRead },
    resources: { run: Game.System.writeResource(Run), time: Game.System.readResource(Time), pace: Game.System.readResource(Pace) },
    nextMachines: { flow: Game.System.nextState(Flow) },
    events: { hits: Game.System.readEvent(PlayerHit) }
  },
  ({ queries, resources, nextMachines, events }) => {
    const run = resources.run.get()
    const time = resources.time.get()
    const room = roomOf(run.room)
    // oxlint-disable-next-line ritmo/no-float-timers -- a score in world time, scaled by the slow motion: no whole step to end on
    const world = run.world + time.dt * resources.pace.get().scale
    if (events.hits.all().length > 0) {
      resources.run.set({ ...run, deaths: run.deaths + 1, hits: run.hits + 1, world })
      nextMachines.flow.set({ _tag: "Dead", retryAt: Clock.deadline(time, Clock.durationOfSteps(STEP, TUNING.deadLockSteps)) })
      return
    }
    const me = queries.players.each()[0]?.data.body.get()
    const done = room.goal.kind === "clear"
      ? queries.enemies.each().length === 0
      : me !== undefined && me.x >= room.goal.x && me.x <= room.goal.x + room.goal.w && me.y >= room.goal.y && me.y <= room.goal.y + room.goal.h
    if (!done) {
      resources.run.set({ ...run, world })
      return
    }
    const result: RoomResult = { stars: starsFor(run.hits, world, room.par), world }
    const was = run.best[run.room] ?? null
    const best = was === null ? result : { stars: Math.max(was.stars, result.stars), world: Math.min(was.world, result.world) }
    resources.run.set({ ...run, world, best: run.best.map((b, i) => (i === run.room ? best : b)) })
    nextMachines.flow.set(run.room + 1 >= ROOMS.length ? { _tag: "Won", ...result } : { _tag: "Cleared", ...result })
  }
)
