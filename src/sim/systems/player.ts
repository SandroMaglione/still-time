/**
 * You: moving (solid against walls and enemies), the world speed following
 * how fast you actually walked, and cutting down whatever is in reach and not guarding.
 */
import { Ops } from "@typeonce/ritmo"

import { settle } from "../geometry.ts"
import { BELT, TUNING, isMelee, radiusOf } from "../tuning.ts"
import { Doors, Enemy, Flow, Game, Input, Pace, Run, Slashes, Time, Wear } from "../schema.ts"
import { paceTo, pushOf } from "../pace.ts"
import { blow } from "./blows.ts"
import { EnemyRead, MeleeRead, PlainRead, PlayerQuery, PlayerRead, roomOf, wallsOf } from "./queries.ts"

const playing = [Game.Condition.inState(Flow, "Playing")] as const


/**
 * World speed follows how fast you actually walk this step (after walls, enemies and doors have had their say; a
 * belt's carry is not walking): frozen while you are still, pushing into a wall included; real time at top speed.
 */
export const PaceSystem = Game.System(
  "Slap/Pace",
  { when: playing, queries: { players: PlayerRead }, resources: { time: Game.System.readResource(Time), pace: Game.System.writeResource(Pace) } },
  ({ queries, resources }) => {
    const me = queries.players.each()[0]?.data.player.get()
    const walked = me === undefined ? 0 : Ops.hypot(me.vx, me.vy) / TUNING.player.speed
    resources.pace.set({ scale: paceTo(resources.pace.get().scale, walked, resources.time.get().dt) })
  }
)

/**
 * You move in real time; the world is what slows down. Walls and enemies are
 * solid. A conveyor belt under you carries you along it in real time too,
 * push or no push: ride it still, and the world stays frozen.
 */
export const MovePlayerSystem = Game.System(
  "Slap/MovePlayer",
  {
    when: playing,
    queries: { players: PlayerQuery, enemies: EnemyRead },
    resources: { time: Game.System.readResource(Time), input: Game.System.readResource(Input), run: Game.System.readResource(Run), doors: Game.System.readResource(Doors), wear: Game.System.readResource(Wear) }
  },
  ({ queries, resources }) => {
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const { x: sx, y: sy } = resources.input.get()
    const dir = Ops.hypot(sx, sy)
    const speed = TUNING.player.speed * pushOf(sx, sy)
    const vx = dir === 0 ? 0 : (sx / dir) * speed
    const vy = dir === 0 ? 0 : (sy / dir) * speed
    const dt = resources.time.get().dt
    const r = TUNING.player.radius
    const solid = queries.enemies.each().map((m) => ({ at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) }))
    for (const { data } of queries.players.each()) {
      const from = data.body.get()
      const belt = (room.belts ?? []).find((b) => from.x >= b.x && from.x <= b.x + b.w && from.y >= b.y && from.y <= b.y + b.h)
      const bx = belt === undefined ? 0 : belt.dx * BELT.speed, by = belt === undefined ? 0 : belt.dy * BELT.speed
      // Your own step first (it is what runs the world), then the belt's carry on top of it.
      const own = settle(from.x + vx * dt, from.y + vy * dt, r, room.w, room.h, walls)
      let { x, y } = belt === undefined ? own : settle(own.x + bx * dt, own.y + by * dt, r, room.w, room.h, walls)
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
      // Your velocity is what you actually walked: your own step (a wall shortens it, to nothing when you push straight
      // into one), not the belt's carry.
      data.player.set(dt > 0 ? { vx: (own.x - from.x) / dt, vy: (own.y - from.y) / dt } : { vx: 0, vy: 0 })
    }
  }
)

/**
 * You cut every enemy within reach. Shooters, runners and stalkers fall; a melee enemy
 * falls unless its guarded front stops the blow (see blows.ts).
 */
export const CutSystem = Game.System(
  "Slap/Cut",
  {
    when: playing,
    queries: { players: PlayerRead, plain: PlainRead, melee: MeleeRead },
    resources: { time: Game.System.readResource(Time), slashes: Game.System.writeResource(Slashes) },
    commands: Game.System.commands(Game.System.despawns(Enemy))
  },
  ({ queries, resources, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const born = resources.time.get().step
    const cuts: Array<{ x: number; y: number; angle: number; born: number; blocked: boolean }> = []
    const inReach = (at: { x: number; y: number }): boolean => Ops.hypot(at.x - me.x, at.y - me.y) <= TUNING.attackRange
    const cutAt = (at: { x: number; y: number }): void => { cuts.push({ x: at.x, y: at.y, angle: Ops.atan2(at.y - me.y, at.x - me.x), born, blocked: false }) }
    for (const { entity, data } of queries.plain.each()) {
      const at = data.body.get()
      if (!inReach(at)) continue
      commands.despawn(entity)
      cutAt(at)
    }
    for (const { entity, data } of queries.melee.each()) {
      const at = data.body.get()
      const kind = data.enemy.get().kind
      if (!inReach(at) || !isMelee(kind)) continue
      if (blow(kind, data.blade.get()._tag, data.melee.get().facing, Ops.atan2(me.y - at.y, me.x - at.x)) === "guarded") continue
      commands.despawn(entity)
      cutAt(at)
    }
    if (cuts.length > 0) resources.slashes.set([...resources.slashes.get(), ...cuts])
  }
)
