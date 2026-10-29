/**
 * You: the world speed following your push, moving (solid against walls and
 * enemies), and cutting down whatever is in reach and not guarding.
 */
import { Ops } from "@typeonce/ritmo"

import { angleDiff, settle } from "../geometry.ts"
import { BRUTE, TUNING, radiusOf } from "../tuning.ts"
import { Flow, Game, Input, Melee, Pace, Reload, Run, Slashes, Time } from "../schema.ts"
import { BruteRead, PlayerQuery, PlayerRead, ShooterRead, roomOf } from "./queries.ts"

const playing = [Game.Condition.inState(Flow, "Playing")] as const

/** How hard the thumb pushes, 0 to 1, shaped for finer control near the press point. */
const pushOf = (x: number, y: number): number => Ops.pow(Math.min(1, Ops.hypot(x, y)), TUNING.player.curve)

/** World speed follows your push: frozen while you are still, real time at full push. */
export const PaceSystem = Game.System(
  "Slap/Pace",
  { when: playing, resources: { time: Game.System.readResource(Time), input: Game.System.readResource(Input), pace: Game.System.writeResource(Pace) } },
  ({ resources }) => {
    const { x, y } = resources.input.get()
    const target = TUNING.slow + (1 - TUNING.slow) * pushOf(x, y)
    const scale = resources.pace.get().scale
    resources.pace.set({ scale: scale + (target - scale) * Math.min(1, TUNING.timeEase * resources.time.get().dt) })
  }
)

/** You move in real time; the world is what slows down. Walls and enemies are solid. */
export const MovePlayerSystem = Game.System(
  "Slap/MovePlayer",
  {
    when: playing,
    queries: { players: PlayerQuery, shooters: ShooterRead, brutes: BruteRead },
    resources: { time: Game.System.readResource(Time), input: Game.System.readResource(Input), run: Game.System.readResource(Run) }
  },
  ({ queries, resources }) => {
    const room = roomOf(resources.run.get().room)
    const { x: sx, y: sy } = resources.input.get()
    const dir = Ops.hypot(sx, sy)
    const speed = TUNING.player.speed * pushOf(sx, sy)
    const vx = dir === 0 ? 0 : (sx / dir) * speed
    const vy = dir === 0 ? 0 : (sy / dir) * speed
    const dt = resources.time.get().dt
    const r = TUNING.player.radius
    const solid = [
      ...queries.shooters.each().map((m) => ({ at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) })),
      ...queries.brutes.each().map((m) => ({ at: m.data.body.get(), radius: BRUTE.radius }))
    ]
    for (const { data } of queries.players.each()) {
      const from = data.body.get()
      let { x, y } = settle(from.x + vx * dt, from.y + vy * dt, r, room.w, room.h, room.pillars)
      // No walking through an enemy (to reach a brute's back mid-swing, say).
      for (const e of solid) {
        const dx = x - e.at.x, dy = y - e.at.y
        const d = Ops.hypot(dx, dy)
        const min = r + e.radius
        if (d >= min) continue
        x = e.at.x + (d === 0 ? 0 : dx / d) * min
        y = e.at.y + (d === 0 ? 1 : dy / d) * min
      }
      data.body.set({ x, y })
      data.player.set({ vx, vy })
    }
  }
)

/**
 * You cut down every enemy within reach, except a brute you face while it
 * attacks (its front is guarded during wind-up and swing).
 */
export const CutSystem = Game.System(
  "Slap/Cut",
  {
    when: playing,
    queries: { players: PlayerRead, shooters: ShooterRead, brutes: BruteRead },
    resources: { time: Game.System.readResource(Time), slashes: Game.System.writeResource(Slashes) },
    commands: Game.System.commands(Game.System.despawns(Reload, Melee))
  },
  ({ queries, resources, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const born = resources.time.get().step
    const cuts: Array<{ x: number; y: number; angle: number; born: number }> = []
    const inReach = (at: { x: number; y: number }): boolean => Ops.hypot(at.x - me.x, at.y - me.y) <= TUNING.attackRange
    for (const { entity, data } of queries.shooters.each()) {
      const at = data.body.get()
      if (!inReach(at)) continue
      commands.despawn(entity)
      cuts.push({ x: at.x, y: at.y, angle: Ops.atan2(at.y - me.y, at.x - me.x), born })
    }
    for (const { entity, data } of queries.brutes.each()) {
      const at = data.body.get()
      if (!inReach(at)) continue
      const phase = data.blade.get()._tag
      const toYou = Ops.atan2(me.y - at.y, me.x - at.x)
      const guarded = (phase === "windup" || phase === "swing") && Math.abs(angleDiff(toYou, data.melee.get().facing)) <= BRUTE.guard
      if (guarded) continue
      commands.despawn(entity)
      cuts.push({ x: at.x, y: at.y, angle: toYou + Math.PI, born })
    }
    if (cuts.length > 0) resources.slashes.set([...resources.slashes.get(), ...cuts])
  }
)
