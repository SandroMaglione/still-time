/**
 * Bombs, in world time: a thrown bomb flies to where you stood (stopping
 * short at a wall), lands lit, and burns its fuse; then it bursts. The blast
 * takes everyone within reach with nothing solid in between (you, any enemy,
 * the grenadier itself) and breaks every cracked wall and crate it reaches.
 */
import { Ops } from "@typeonce/ritmo"

import { clearLine, insidePillar } from "../geometry.ts"
import { Blasts, Bomb, Doors, Enemy, Flow, Game, Pace, PlayerHit, Run, Time, Wear } from "../schema.ts"
import { BOMB } from "../tuning.ts"
import { BombQuery, EnemyRead, PlayerRead, roomOf, wallsOf } from "./queries.ts"

/** The nearest distance from a point to a rectangle (0 inside it). */
const distanceTo = (x: number, y: number, p: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): number =>
  Ops.hypot(x - Math.max(p.x, Math.min(x, p.x + p.w)), y - Math.max(p.y, Math.min(y, p.y + p.h)))

export const BombsSystem = Game.System(
  "Slap/Bombs",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, enemies: EnemyRead, bombs: BombQuery },
    resources: {
      time: Game.System.readResource(Time),
      pace: Game.System.readResource(Pace),
      run: Game.System.readResource(Run),
      doors: Game.System.readResource(Doors),
      wear: Game.System.writeResource(Wear),
      blasts: Game.System.writeResource(Blasts)
    },
    events: { hit: Game.System.writeEvent(PlayerHit) },
    commands: Game.System.commands(Game.System.despawns(Bomb, Enemy))
  },
  ({ queries, resources, events, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const time = resources.time.get()
    const dt = time.dt * resources.pace.get().scale
    let wear = resources.wear.get()
    const downed = new Set<number>()
    const bursts: Array<{ x: number; y: number; born: number }> = []
    for (const { entity, data } of queries.bombs.each()) {
      const at = data.body.get()
      const bomb = data.bomb.get()
      const walls = wallsOf(room, resources.doors.get(), wear)
      if (bomb._tag === "flying") {
        const d = Ops.hypot(bomb.tx - at.x, bomb.ty - at.y)
        const step = BOMB.speed * dt
        const next = d <= step ? { x: bomb.tx, y: bomb.ty } : { x: at.x + ((bomb.tx - at.x) / d) * step, y: at.y + ((bomb.ty - at.y) / d) * step }
        // It lands where it is when it would fly into a wall, or at its mark.
        const blocked = insidePillar(next.x, next.y, 0.15, walls) || next.x < 0 || next.y < 0 || next.x > room.w || next.y > room.h
        if (!blocked) data.body.set(next)
        if (blocked || d <= step) data.bomb.transition({ from: "flying", to: "lit", data: { left: BOMB.fuse } })
        continue
      }
      // oxlint-disable-next-line ritmo/no-float-timers -- world time, scaled by the slow motion
      const left = bomb.left - dt
      if (left > 0) {
        data.bomb.update({ state: "lit", data: () => ({ left }) })
        continue
      }
      commands.despawn(entity)
      bursts.push({ x: at.x, y: at.y, born: time.step })
      const reaches = (x: number, y: number): boolean => Ops.hypot(x - at.x, y - at.y) <= BOMB.radius && clearLine(at.x, at.y, x, y, walls)
      if (reaches(me.x, me.y)) events.hit.emit({ by: "blast" })
      for (const e of queries.enemies.each()) {
        const p = e.data.body.get()
        if (downed.has(e.entity.id) || !reaches(p.x, p.y)) continue
        downed.add(e.entity.id)
        commands.despawn(e.entity)
      }
      const breaks = room.pillars.map((p, i) => p.breaks !== undefined && wear[i] !== 0 && distanceTo(at.x, at.y, p) <= BOMB.radius)
      if (breaks.some((b) => b)) wear = wear.map((w, i) => (breaks[i] === true ? 0 : w))
    }
    if (wear !== resources.wear.get()) resources.wear.set(wear)
    if (bursts.length > 0) resources.blasts.set([...resources.blasts.get(), ...bursts])
  }
)
