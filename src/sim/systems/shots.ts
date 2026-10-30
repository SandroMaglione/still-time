/** Shots fly in world time; walls and pillars stop them (a crate takes the hit); they hit you and any enemy alike (a guarded front stops them). */
import { Ops } from "@typeonce/ritmo"

import { insidePillar, pushOut } from "../geometry.ts"
import { Doors, Enemy, Flow, Game, Pace, PlayerHit, Run, Shot, Slashes, Time, Wear } from "../schema.ts"
import { SHOTS, TUNING, isMelee, radiusOf } from "../tuning.ts"
import { blow, type BlowResult } from "./blows.ts"
import { MeleeRead, PlainRead, PlayerRead, ShotQuery, roomOf, wallsOf } from "./queries.ts"

export const ShotsSystem = Game.System(
  "Slap/Shots",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, plain: PlainRead, melee: MeleeRead, shots: ShotQuery },
    resources: {
      time: Game.System.readResource(Time),
      pace: Game.System.readResource(Pace),
      run: Game.System.readResource(Run),
      doors: Game.System.readResource(Doors),
      wear: Game.System.writeResource(Wear),
      slashes: Game.System.writeResource(Slashes)
    },
    events: { hit: Game.System.writeEvent(PlayerHit) },
    commands: Game.System.commands(Game.System.despawns(Shot, Enemy))
  },
  ({ queries, resources, events, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const wear = [...resources.wear.get()]
    const walls = wallsOf(room, resources.doors.get(), wear)
    let worn = false
    const time = resources.time.get()
    const dt = time.dt * resources.pace.get().scale
    // Each target: where it stands, and what a shot from angle `from` does to it. A plain enemy falls; a guarded front stops it.
    const targets = [
      ...queries.plain.each().map((m) => ({
        id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind),
        struck: (): BlowResult => { commands.despawn(m.entity); return "down" }
      })),
      ...queries.melee.each().flatMap((m) => {
        const kind = m.data.enemy.get().kind
        if (!isMelee(kind)) return []
        return [{
          id: m.entity.id, at: m.data.body.get(), radius: radiusOf(kind),
          struck: (from: number): BlowResult => {
            const result = blow(kind, m.data.blade.get()._tag, m.data.melee.get().facing, from)
            if (result === "down") commands.despawn(m.entity)
            return result
          }
        }]
      })
    ]
    const downed = new Set<number>()
    const marks: Array<{ x: number; y: number; angle: number; born: number; blocked: boolean }> = []
    let hit = false
    for (const { entity, data } of queries.shots.each()) {
      const s = data.shot.get()
      const at = data.body.get()
      const nx = at.x + s.vx * dt, ny = at.y + s.vy * dt
      const sr = SHOTS[s.kind].radius
      if (nx < 0 || ny < 0 || nx > room.w || ny > room.h || insidePillar(nx, ny, sr, walls)) {
        commands.despawn(entity)
        // A crate it struck takes the hit (a cracked wall shrugs a shot off).
        const crate = room.pillars.findIndex((p, i) => p.breaks === "crate" && (wear[i] ?? 0) > 0 && pushOut(nx, ny, sr, p) !== null)
        const hits = wear[crate]
        if (crate !== -1 && hits !== undefined && hits !== null) { wear[crate] = hits - 1; worn = true }
        continue
      }
      data.body.set({ x: nx, y: ny })
      if (Ops.hypot(nx - me.x, ny - me.y) < TUNING.player.radius + sr) hit = true
      const victim = targets.find((t) => !downed.has(t.id) && Ops.hypot(nx - t.at.x, ny - t.at.y) < t.radius + sr)
      if (victim === undefined) continue
      // The blow comes from where the shot flew in.
      const result = victim.struck(Ops.atan2(-s.vy, -s.vx))
      if (result === "down") downed.add(victim.id)
      commands.despawn(entity)
      const angle = Ops.atan2(s.vy, s.vx)
      if (result === "guarded") marks.push({ x: nx, y: ny, angle, born: time.step, blocked: true })
      else marks.push({ x: victim.at.x, y: victim.at.y, angle, born: time.step, blocked: false })
    }
    if (hit) events.hit.emit({ by: "shot" })
    if (worn) resources.wear.set(wear)
    if (marks.length > 0) resources.slashes.set([...resources.slashes.get(), ...marks])
  }
)
