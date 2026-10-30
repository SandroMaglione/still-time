/**
 * Hazards on the attempt's world clock: a spinning blade or a laser gate
 * that is on takes anyone it touches, you or any enemy.
 */
import { segmentDistance } from "../geometry.ts"
import { hazardAt } from "../hazards.ts"
import { Enemy, Flow, Game, PlayerHit, Run } from "../schema.ts"
import { HAZARD, TUNING, radiusOf } from "../tuning.ts"
import { EnemyRead, PlayerRead, roomOf } from "./queries.ts"

export const HazardsSystem = Game.System(
  "Slap/Hazards",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerRead, enemies: EnemyRead },
    resources: { run: Game.System.readResource(Run) },
    events: { hit: Game.System.writeEvent(PlayerHit) },
    commands: Game.System.commands(Game.System.despawns(Enemy))
  },
  ({ queries, resources, events, commands }) => {
    const run = resources.run.get()
    const hazards = roomOf(run.room).hazards ?? []
    if (hazards.length === 0) return
    const me = queries.players.each()[0]?.data.body.get()
    const shapes = hazards.map((h) => hazardAt(h, run.world)).filter((s) => s.live)
    const touches = (x: number, y: number, r: number): boolean => shapes.some((s) => segmentDistance(x, y, s.ax, s.ay, s.bx, s.by) < r + HAZARD.width)
    if (me !== undefined && touches(me.x, me.y, TUNING.player.radius)) events.hit.emit({ by: "hazard" })
    for (const { entity, data } of queries.enemies.each()) {
      const at = data.body.get()
      if (touches(at.x, at.y, radiusOf(data.enemy.get().kind))) commands.despawn(entity)
    }
  }
)
