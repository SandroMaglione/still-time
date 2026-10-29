/** The projection: plain data for the page to draw. */
import { ROOMS, type Pillar } from "./rooms.ts"
import { Body, Enemy, Flow, Game, Pace, Player, Run, Shot, Slashes } from "./schema.ts"
import { ENEMIES, SHOTS, TUNING, VARIANTS, type EnemyKind, type ShotKind, type Variant, type VariantId } from "./tuning.ts"

export interface FightView {
  readonly room: { readonly index: number; readonly count: number; readonly name: string; readonly w: number; readonly h: number; readonly pillars: ReadonlyArray<Pillar> }
  readonly deaths: number
  readonly flow: "playing" | "dead" | "cleared" | "won"
  readonly canRetry: boolean
  readonly scale: number
  readonly variantId: VariantId
  readonly variant: Variant
  readonly player: { readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number; readonly attackRange: number } | null
  readonly enemies: ReadonlyArray<{ readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly radius: number; readonly charge: number; readonly aim: number }>
  readonly shots: ReadonlyArray<{ readonly kind: ShotKind; readonly x: number; readonly y: number; readonly radius: number; readonly vx: number; readonly vy: number }>
  readonly slashes: ReadonlyArray<{ readonly x: number; readonly y: number; readonly angle: number; readonly age: number }>
}

export const FightViewInspector = Game.Inspector(
  "Slap/FightView",
  {
    queries: {
      players: Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } }),
      enemies: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy) } }),
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
      room: { index: run.room, count: ROOMS.length, name: room.name, w: TUNING.room.w, h: TUNING.room.h, pillars: room.pillars },
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
        const spec = ENEMIES[enemy.kind]
        return {
          kind: enemy.kind,
          x: at.x,
          y: at.y,
          radius: spec.radius,
          charge: Math.max(0, Math.min(1, 1 - enemy.cooldown / spec.period)),
          aim: player === null ? Math.PI / 2 : Math.atan2(player.y - at.y, player.x - at.x)
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
