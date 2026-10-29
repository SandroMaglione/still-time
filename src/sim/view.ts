/** The projection: plain data for the page to draw. */
import { canSee } from "./geometry.ts"
import { ROOMS, type Pillar } from "./rooms.ts"
import { Body, Enemy, Flow, Game, Melee, Pace, Player, Run, Shot, Slashes, type BrutePhase } from "./schema.ts"
import { BRUTE, SHOOTERS, SHOTS, TUNING, VARIANTS, type EnemyKind, type ShotKind, type Variant, type VariantId } from "./tuning.ts"

/** A brute's blade: facing, phase, how far through it (0 to 1), and the shapes to draw. */
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

export interface FightView {
  readonly room: { readonly index: number; readonly count: number; readonly name: string; readonly w: number; readonly h: number; readonly pillars: ReadonlyArray<Pillar> }
  readonly deaths: number
  readonly flow: "playing" | "dead" | "cleared" | "won"
  readonly canRetry: boolean
  readonly scale: number
  readonly variantId: VariantId
  readonly variant: Variant
  readonly player: { readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number; readonly attackRange: number } | null
  readonly enemies: ReadonlyArray<{ readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly radius: number; readonly charge: number; readonly aim: number; readonly sees: boolean; readonly melee: MeleeView | null }>
  readonly shots: ReadonlyArray<{ readonly kind: ShotKind; readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number }>
  readonly slashes: ReadonlyArray<{ readonly x: number; readonly y: number; readonly angle: number; readonly age: number }>
}

export const FightViewInspector = Game.Inspector(
  "Slap/FightView",
  {
    queries: {
      players: Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } }),
      enemies: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), melee: Game.Query.optional(Melee) } }),
      shots: Game.Query({ selection: { body: Game.Query.read(Body), shot: Game.Query.read(Shot) } })
    },
    resources: { run: Game.System.readResource(Run), pace: Game.System.readResource(Pace), slashes: Game.System.readResource(Slashes) },
    machines: { flow: Game.System.machine(Flow) }
  },
  ({ queries, resources, machines }): FightView => {
    const run = resources.run.get()
    const pace = resources.pace.get()
    const room = ROOMS[run.room] ?? ROOMS[0]
    if (room === undefined) throw new Error("Slap: no rooms")
    const p = queries.players.each()[0]
    const player = p === undefined ? null : { ...p.data.body.get(), radius: TUNING.player.radius, vx: p.data.player.get().vx, vy: p.data.player.get().vy, attackRange: TUNING.attackRange }
    const flow = machines.flow.get()
    return {
      room: { index: run.room, count: ROOMS.length, name: room.name, w: room.w, h: room.h, pillars: room.pillars },
      deaths: run.deaths,
      flow: flow._tag === "Playing" ? "playing" : flow._tag === "Dead" ? "dead" : flow._tag === "Cleared" ? "cleared" : "won",
      canRetry: flow._tag !== "Dead" || flow.wait <= 0,
      scale: pace.scale,
      variantId: pace.variant,
      variant: VARIANTS[pace.variant],
      player,
      enemies: queries.enemies.each().map(({ data }) => {
        const at = data.body.get()
        const enemy = data.enemy.get()
        const sees = player !== null && canSee(at.x, at.y, player.x, player.y, TUNING.sight, room.pillars)
        const aimAtYou = player === null ? Math.PI / 2 : Math.atan2(player.y - at.y, player.x - at.x)
        const m = data.melee?.get()
        if (enemy.kind === "brute" && m !== undefined) {
          const total = m.phase === "windup" ? BRUTE.windup : m.phase === "swing" ? BRUTE.swing : m.phase === "recover" ? BRUTE.recover : 1
          const progress = m.phase === "idle" || m.phase === "chase" ? 0 : Math.max(0, Math.min(1, 1 - m.t / total))
          return {
            kind: enemy.kind, x: at.x, y: at.y, radius: BRUTE.radius, charge: m.phase === "windup" ? progress : 0, aim: m.facing, sees,
            melee: { phase: m.phase, progress, locked: m.phase === "windup" && m.t <= BRUTE.lock, lockShare: BRUTE.lock / BRUTE.windup, reach: BRUTE.reach, arc: BRUTE.arc, guard: BRUTE.guard }
          }
        }
        if (enemy.kind === "brute") throw new Error("Slap: brute without a blade")
        const spec = SHOOTERS[enemy.kind]
        return {
          kind: enemy.kind,
          x: at.x,
          y: at.y,
          radius: spec.radius,
          charge: Math.max(0, Math.min(1, 1 - enemy.cooldown / spec.period)),
          aim: aimAtYou,
          sees,
          melee: null
        }
      }),
      shots: queries.shots.each().map(({ data }) => {
        const at = data.body.get()
        const shot = data.shot.get()
        return { kind: shot.kind, x: at.x, y: at.y, radius: SHOTS[shot.kind].radius, vx: shot.vx, vy: shot.vy }
      }),
      slashes: resources.slashes.get()
    }
  }
)
