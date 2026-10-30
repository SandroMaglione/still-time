/** The projection: the one place the world is read into plain data, for the page, the tests and the fuzzer. */
import { Clock, Ops } from "@typeonce/ritmo"

import { canSee, clearLine } from "./geometry.ts"
import { ROOMS, type Goal, type Lock, type Pillar } from "./rooms.ts"
import { Blade, Body, Carry, Doors, Enemy, Flow, Game, Keys, Melee, Pace, Player, Reload, Run, Shot, Slashes, Time } from "./schema.ts"
import { wallsOf } from "./systems/queries.ts"
import { MELEE, RUNNER, SHOOTERS, SHOTS, TUNING, isMelee, isShooter, type EnemyKind, type ShotKind } from "./tuning.ts"

export type MeleePhase = "idle" | "chase" | "windup" | "swing" | "recover"

/** A melee enemy's blade: its phase, how far through it (0 to 1), its guard, and the shapes to draw. */
export interface MeleeView {
  readonly phase: MeleePhase
  readonly progress: number
  /** In the wind-up, true once it stops tracking you: the moment to dodge. */
  readonly locked: boolean
  /** The committed share of the wind-up, 0 to 1. */
  readonly lockShare: number
  readonly reach: number
  readonly arc: number
  /** Half-angle of the guarded front, and whether it is up now. */
  readonly guardArc: number
  readonly guarding: boolean
  /** True for a shield always up (the shield-bearer), false for a guard raised only to attack. */
  readonly shield: boolean
}

/** A scoped shooter's laser: where it points, how far it reaches (to you, or to the first wall), and whether it is locked. */
export interface LaserView {
  readonly aim: number
  readonly length: number
  readonly locked: boolean
}

export interface EnemyView {
  readonly id: number
  readonly kind: EnemyKind
  readonly x: number
  readonly y: number
  readonly radius: number
  /** How close to firing (shooters) or to swinging (melee, in the wind-up), 0 to 1. */
  readonly charge: number
  /** Where it faces: at you for shooters (a locked sniper keeps its line), its blade for melee. */
  readonly aim: number
  readonly sees: boolean
  /** A shut door stands between it and you: not a threat yet. */
  readonly sealed: boolean
  /** Wears a crown: downing it opens its chamber's captain door. */
  readonly captain: boolean
  /** Runners: the key it carries. */
  readonly key: number | null
  readonly melee: MeleeView | null
  /** Scoped shooters that see you: their laser. */
  readonly laser: LaserView | null
}

/** A door: its box, what opens it, whether it is open, and (for chamber locks) how many it still waits on. */
export interface DoorView extends Pillar {
  readonly lock: Lock
  readonly open: boolean
  readonly waiting: number
}

/** A key you can see: on its runner, on the floor, or over your head. */
export interface KeyView {
  readonly key: number
  readonly state: "carried" | "floor" | "held"
  readonly x: number
  readonly y: number
}

/** A room's score: world seconds and stars. */
export interface ResultView {
  readonly stars: number
  readonly world: number
}

export interface FightView {
  /** Stable simulation step; presentation observes every tick, including despawns. */
  readonly step: number
  readonly room: {
    readonly index: number
    readonly count: number
    readonly name: string
    readonly w: number
    readonly h: number
    readonly pillars: ReadonlyArray<Pillar>
    readonly goal: Goal
    readonly par: number
    readonly tip: string | null
  }
  readonly doors: ReadonlyArray<DoorView>
  readonly keys: ReadonlyArray<KeyView>
  readonly deaths: number
  /** Hits in this room since you came into it, and world seconds of this attempt. */
  readonly hits: number
  readonly world: number
  /** The clear just made (Cleared or Won), and the run's best per room. */
  readonly result: ResultView | null
  readonly best: ReadonlyArray<ResultView | null>
  /** Every room's name, in order, and whether every room is open regardless of progress (testing). */
  readonly roomNames: ReadonlyArray<string>
  readonly open: boolean
  readonly flow: "playing" | "dead" | "cleared" | "won"
  readonly canRetry: boolean
  readonly scale: number
  /** World speed while you are still, for drawing how frozen time is. */
  readonly slow: number
  readonly player: { readonly id: number; readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number; readonly attackRange: number } | null
  readonly enemies: ReadonlyArray<EnemyView>
  readonly shots: ReadonlyArray<{ readonly id: number; readonly kind: ShotKind; readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number }>
  /** Cut marks, with `age` from 0 (just cut) to 1 (gone); `blocked` for a blow a guarded front stopped. */
  readonly slashes: ReadonlyArray<{ readonly born: number; readonly x: number; readonly y: number; readonly angle: number; readonly age: number; readonly blocked: boolean }>
}

/** How far a line from (x, y) along angle `a` runs before a wall, up to `max`. */
const rayLength = (x: number, y: number, a: number, max: number, walls: ReadonlyArray<Pillar>): number => {
  if (clearLine(x, y, x + Ops.cos(a) * max, y + Ops.sin(a) * max, walls)) return max
  let lo = 0, hi = max
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    if (clearLine(x, y, x + Ops.cos(a) * mid, y + Ops.sin(a) * mid, walls)) lo = mid
    else hi = mid
  }
  return lo
}

export const FightViewInspector = Game.Inspector(
  "Slap/FightView",
  {
    queries: {
      players: Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } }),
      shooters: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.read(Reload) } }),
      melee: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), melee: Game.Query.read(Melee), blade: Game.Query.read(Blade) } }),
      runners: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), carry: Game.Query.read(Carry) } }),
      shots: Game.Query({ selection: { body: Game.Query.read(Body), shot: Game.Query.read(Shot) } })
    },
    resources: {
      run: Game.System.readResource(Run),
      pace: Game.System.readResource(Pace),
      slashes: Game.System.readResource(Slashes),
      time: Game.System.readResource(Time),
      doors: Game.System.readResource(Doors),
      keys: Game.System.readResource(Keys)
    },
    machines: { flow: Game.System.machine(Flow) }
  },
  ({ queries, resources, machines }): FightView => {
    const run = resources.run.get()
    const time = resources.time.get()
    const room = ROOMS[run.room] ?? ROOMS[0]
    if (room === undefined) throw new Error("Slap: no rooms")
    const p = queries.players.each()[0]
    const player = p === undefined ? null : { id: p.entity.id, ...p.data.body.get(), radius: TUNING.player.radius, vx: p.data.player.get().vx, vy: p.data.player.get().vy, attackRange: TUNING.attackRange }
    const open = resources.doors.get()
    const walls = wallsOf(room, open)
    const sees = (at: { x: number; y: number }): boolean => player !== null && canSee(at.x, at.y, player.x, player.y, TUNING.sight, walls)
    const shut = room.doors.filter((_, i) => open[i] !== true)
    const sealed = (at: { x: number; y: number }): boolean => player !== null && shut.length > 0 && !clearLine(at.x, at.y, player.x, player.y, shut)
    const shooters = queries.shooters.each().flatMap(({ entity, data }): Array<EnemyView> => {
      const { kind, captain } = data.enemy.get()
      if (!isShooter(kind)) return []
      const at = data.body.get()
      const spec = SHOOTERS[kind]
      const reload = data.reload.get()
      const locked = spec.scoped && reload.left <= spec.lock
      const aim = locked ? reload.aim : player === null ? Math.PI / 2 : Ops.atan2(player.y - at.y, player.x - at.x)
      const seesYou = player !== null && canSee(at.x, at.y, player.x, player.y, spec.sight, walls)
      const laser = !spec.scoped || !seesYou || player === null ? null
        : { aim, locked, length: locked ? rayLength(at.x, at.y, aim, spec.sight, walls) : Ops.hypot(player.x - at.x, player.y - at.y) }
      return [{
        id: entity.id, kind, x: at.x, y: at.y, radius: spec.radius,
        charge: Math.max(0, Math.min(1, 1 - reload.left / spec.period)),
        aim,
        sees: seesYou,
        sealed: sealed(at),
        captain, key: null,
        melee: null,
        laser
      }]
    })
    const runners = queries.runners.each().map(({ entity, data }): EnemyView => {
      const at = data.body.get()
      return {
        id: entity.id, kind: "runner", x: at.x, y: at.y, radius: RUNNER.radius, charge: 0,
        aim: player === null ? Math.PI / 2 : Ops.atan2(at.y - player.y, at.x - player.x),
        sees: sees(at),
        sealed: sealed(at),
        captain: data.enemy.get().captain, key: data.carry.get().key,
        melee: null,
        laser: null
      }
    })
    const melee = queries.melee.each().flatMap(({ entity, data }): Array<EnemyView> => {
      const kind = data.enemy.get().kind
      if (!isMelee(kind)) return []
      const spec = MELEE[kind]
      const at = data.body.get()
      const blade = data.blade.get()
      const { facing } = data.melee.get()
      const phaseLength = { idle: 1, chase: 1, windup: spec.windup, swing: spec.swing, recover: spec.recover, } as const satisfies Record<MeleePhase, number>
      const left = blade._tag === "idle" || blade._tag === "chase" ? 0 : blade.left
      const progress = left === 0 ? 0 : Math.max(0, Math.min(1, 1 - left / phaseLength[blade._tag]))
      const guarding = spec.guard === "always" || blade._tag === "windup" || blade._tag === "swing"
      return [{
        id: entity.id, kind, x: at.x, y: at.y, radius: spec.radius,
        charge: blade._tag === "windup" ? progress : 0,
        aim: facing,
        sees: sees(at),
        sealed: sealed(at),
        captain: data.enemy.get().captain, key: null,
        melee: {
          phase: blade._tag, progress, locked: blade._tag === "windup" && blade.left <= spec.lock, lockShare: spec.lock / spec.windup,
          reach: spec.reach, arc: spec.arc, guardArc: spec.guardArc, guarding, shield: spec.guard === "always"
        },
        laser: null
      }]
    })
    const flow = machines.flow.get()
    const standing = [...queries.shooters.each(), ...queries.melee.each(), ...queries.runners.each()].map((m) => m.data.enemy.get())
    const doors = room.doors.map((d, i): DoorView => {
      const lock = d.lock
      const waiting = lock.kind === "key" ? 0 : standing.filter((e) => e.chamber === lock.chamber && (lock.kind === "clear" || e.captain)).length
      return { x: d.x, y: d.y, w: d.w, h: d.h, lock, open: open[i] === true, waiting }
    })
    const keys = resources.keys.get().flatMap((k): Array<KeyView> =>
      k.state === "carried" || k.state === "floor" ? [{ key: k.key, state: k.state, x: k.x, y: k.y }]
      : k.state === "held" && player !== null ? [{ key: k.key, state: "held", x: player.x, y: player.y }]
      : [])
    return {
      step: time.step,
      room: { index: run.room, count: ROOMS.length, name: room.name, w: room.w, h: room.h, pillars: room.pillars, goal: room.goal, par: room.par, tip: room.tip ?? null },
      doors,
      keys,
      deaths: run.deaths,
      hits: run.hits,
      world: run.world,
      result: flow._tag === "Cleared" || flow._tag === "Won" ? { stars: flow.stars, world: flow.world } : null,
      best: run.best,
      roomNames: ROOMS.map((r) => r.name),
      open: run.open,
      flow: flow._tag === "Playing" ? "playing" : flow._tag === "Dead" ? "dead" : flow._tag === "Cleared" ? "cleared" : "won",
      canRetry: flow._tag !== "Dead" || Clock.reached(time, flow.retryAt),
      scale: resources.pace.get().scale,
      slow: TUNING.slow,
      player,
      enemies: [...shooters, ...melee, ...runners],
      shots: queries.shots.each().map(({ entity, data }) => {
        const at = data.body.get()
        const shot = data.shot.get()
        return { id: entity.id, kind: shot.kind, x: at.x, y: at.y, radius: SHOTS[shot.kind].radius, vx: shot.vx, vy: shot.vy }
      }),
      slashes: resources.slashes.get().map((s) => ({ born: s.born, x: s.x, y: s.y, angle: s.angle, age: Math.min(1, (time.step - s.born) / TUNING.slashSteps), blocked: s.blocked }))
    }
  }
)
