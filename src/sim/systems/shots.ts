/** Shots fly in world time; walls and pillars stop them; they hit you and any enemy alike. */
import { Ops } from "@typeonce/ritmo"

import { insidePillar } from "../geometry.ts"
import { Flow, Game, Melee, Pace, PlayerHit, Reload, Run, Shot, Slashes, Time } from "../schema.ts"
import { BRUTE, SHOTS, TUNING, radiusOf } from "../tuning.ts"
import { BruteRead, PlayerRead, ShooterRead, ShotQuery, roomOf } from "./queries.ts"

export const ShotsSystem = Game.System(
  "Slap/Shots",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, shooters: ShooterRead, brutes: BruteRead, shots: ShotQuery },
    resources: { time: Game.System.readResource(Time), pace: Game.System.readResource(Pace), run: Game.System.readResource(Run), slashes: Game.System.writeResource(Slashes) },
    events: { hit: Game.System.writeEvent(PlayerHit) },
    commands: Game.System.commands(Game.System.despawns(Shot, Reload, Melee))
  },
  ({ queries, resources, events, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const time = resources.time.get()
    const dt = time.dt * resources.pace.get().scale
    const targets = [
      ...queries.shooters.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind), down: () => commands.despawn(m.entity) })),
      ...queries.brutes.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: BRUTE.radius, down: () => commands.despawn(m.entity) }))
    ]
    const downed = new Set<number>()
    const cuts: Array<{ x: number; y: number; angle: number; born: number }> = []
    let hit = false
    for (const { entity, data } of queries.shots.each()) {
      const s = data.shot.get()
      const at = data.body.get()
      const nx = at.x + s.vx * dt, ny = at.y + s.vy * dt
      const sr = SHOTS[s.kind].radius
      if (nx < 0 || ny < 0 || nx > room.w || ny > room.h || insidePillar(nx, ny, sr, room.pillars)) {
        commands.despawn(entity)
        continue
      }
      data.body.set({ x: nx, y: ny })
      if (Ops.hypot(nx - me.x, ny - me.y) < TUNING.player.radius + sr) hit = true
      const victim = targets.find((t) => !downed.has(t.id) && Ops.hypot(nx - t.at.x, ny - t.at.y) < t.radius + sr)
      if (victim === undefined) continue
      victim.down()
      downed.add(victim.id)
      commands.despawn(entity)
      cuts.push({ x: victim.at.x, y: victim.at.y, angle: Ops.atan2(s.vy, s.vx), born: time.step })
    }
    if (hit) events.hit.emit({ by: "shot" })
    if (cuts.length > 0) resources.slashes.set([...resources.slashes.get(), ...cuts])
  }
)
