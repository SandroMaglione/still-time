/** The projection: the one place the world is read into plain data, for the page, the tests and the fuzzer. */
import { Clock, Ops } from "@typeonce/ritmo"

import { canSee } from "./geometry.ts"
import { ROOMS, type Pillar } from "./rooms.ts"
import { Blade, Body, Enemy, Flow, Game, Melee, Pace, Player, Reload, Run, Shot, Slashes, Time } from "./schema.ts"
import { BRUTE, SHOOTERS, SHOTS, TUNING, type EnemyKind, type ShotKind } from "./tuning.ts"

export type BrutePhase = "idle" | "chase" | "windup" | "swing" | "recover"

/** A brute's blade: its phase, how far through it (0 to 1), and the shapes to draw. */
export interface MeleeView {
  readonly phase: BrutePhase
  readonly progress: number
  /** In the wind-up, true once it stops tracking you: the moment to dodge. */
  readonly locked: boolean
  /** The committed share of the wind-up, 0 to 1. */
  readonly lockShare: number
  readonly reach: number
  readonly arc: number
  readonly guard: number
}

export interface EnemyView {
  readonly kind: EnemyKind
  readonly x: number
  readonly y: number
  readonly radius: number
  /** How close to firing (shooters) or to swinging (brutes, in the wind-up), 0 to 1. */
  readonly charge: number
  /** Where it faces: at you for shooters, its blade for brutes. */
  readonly aim: number
  readonly sees: boolean
  readonly melee: MeleeView | null
}

export interface FightView {
  readonly room: { readonly index: number; readonly count: number; readonly name: string; readonly w: number; readonly h: number; readonly pillars: ReadonlyArray<Pillar> }
  readonly deaths: number
  readonly flow: "playing" | "dead" | "cleared" | "won"
  readonly canRetry: boolean
  readonly scale: number
  /** World speed while you are still, for drawing how frozen time is. */
  readonly slow: number
  readonly player: { readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number; readonly attackRange: number } | null
  readonly enemies: ReadonlyArray<EnemyView>
  readonly shots: ReadonlyArray<{ readonly kind: ShotKind; readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number }>
  /** Cut marks, with `age` from 0 (just cut) to 1 (gone). */
  readonly slashes: ReadonlyArray<{ readonly x: number; readonly y: number; readonly angle: number; readonly age: number }>
}

const phaseLength = { idle: 1, chase: 1, windup: BRUTE.windup, swing: BRUTE.swing, recover: BRUTE.recover } as const satisfies Record<BrutePhase, number>

export const FightViewInspector = Game.Inspector(
  "Slap/FightView",
  {
    queries: {
      players: Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } }),
      shooters: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.read(Reload) } }),
      brutes: Game.Query({ selection: { body: Game.Query.read(Body), melee: Game.Query.read(Melee), blade: Game.Query.read(Blade) } }),
      shots: Game.Query({ selection: { body: Game.Query.read(Body), shot: Game.Query.read(Shot) } })
    },
    resources: { run: Game.System.readResource(Run), pace: Game.System.readResource(Pace), slashes: Game.System.readResource(Slashes), time: Game.System.readResource(Time) },
    machines: { flow: Game.System.machine(Flow) }
  },
  ({ queries, resources, machines }): FightView => {
    const run = resources.run.get()
    const time = resources.time.get()
    const room = ROOMS[run.room] ?? ROOMS[0]
    if (room === undefined) throw new Error("Slap: no rooms")
    const p = queries.players.each()[0]
    const player = p === undefined ? null : { ...p.data.body.get(), radius: TUNING.player.radius, vx: p.data.player.get().vx, vy: p.data.player.get().vy, attackRange: TUNING.attackRange }
    const sees = (at: { x: number; y: number }): boolean => player !== null && canSee(at.x, at.y, player.x, player.y, TUNING.sight, room.pillars)
    const shooters = queries.shooters.each().flatMap(({ data }): Array<EnemyView> => {
      const kind = data.enemy.get().kind
      if (kind === "brute") return []
      const at = data.body.get()
      const spec = SHOOTERS[kind]
      return [{
        kind, x: at.x, y: at.y, radius: spec.radius,
        charge: Math.max(0, Math.min(1, 1 - data.reload.get().left / spec.period)),
        aim: player === null ? Math.PI / 2 : Ops.atan2(player.y - at.y, player.x - at.x),
        sees: sees(at),
        melee: null
      }]
    })
    const brutes = queries.brutes.each().map(({ data }): EnemyView => {
      const at = data.body.get()
      const blade = data.blade.get()
      const left = blade._tag === "windup" || blade._tag === "swing" || blade._tag === "recover" ? blade.left : 0
      const progress = left === 0 ? 0 : Math.max(0, Math.min(1, 1 - left / phaseLength[blade._tag]))
      return {
        kind: "brute", x: at.x, y: at.y, radius: BRUTE.radius,
        charge: blade._tag === "windup" ? progress : 0,
        aim: data.melee.get().facing,
        sees: sees(at),
        melee: {
          phase: blade._tag, progress, locked: blade._tag === "windup" && blade.left <= BRUTE.lock, lockShare: BRUTE.lock / BRUTE.windup,
          reach: BRUTE.reach, arc: BRUTE.arc, guard: BRUTE.guard
        }
      }
    })
    const flow = machines.flow.get()
    return {
      room: { index: run.room, count: ROOMS.length, name: room.name, w: room.w, h: room.h, pillars: room.pillars },
      deaths: run.deaths,
      flow: flow._tag === "Playing" ? "playing" : flow._tag === "Dead" ? "dead" : flow._tag === "Cleared" ? "cleared" : "won",
      canRetry: flow._tag !== "Dead" || Clock.reached(time, flow.retryAt),
      scale: resources.pace.get().scale,
      slow: TUNING.slow,
      player,
      enemies: [...shooters, ...brutes],
      shots: queries.shots.each().map(({ data }) => {
        const at = data.body.get()
        const shot = data.shot.get()
        return { kind: shot.kind, x: at.x, y: at.y, radius: SHOTS[shot.kind].radius, vx: shot.vx, vy: shot.vy }
      }),
      slashes: resources.slashes.get().map((s) => ({ x: s.x, y: s.y, angle: s.angle, age: Math.min(1, (time.step - s.born) / TUNING.slashSteps) }))
    }
  }
)
