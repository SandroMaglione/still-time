/**
 * The queries the fight systems share, and the room each step plays in.
 * Disjoint by their filters, so one system may write the player's body and
 * read the enemies' (or the reverse).
 */
import { ROOMS, type Room } from "../rooms.ts"
import { Blade, Body, Enemy, Game, Melee, Player, Post, Reload, Shot } from "../schema.ts"

export const PlayerQuery = Game.Query({ selection: { body: Game.Query.write(Body), player: Game.Query.write(Player) } })
export const PlayerRead = Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } })

export const ShooterQuery = Game.Query({
  selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.write(Reload), post: Game.Query.write(Post) },
  without: [Player, Shot, Melee]
})
export const ShooterRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.read(Reload) }, without: [Player, Shot, Melee] })

export const BruteQuery = Game.Query({
  selection: { body: Game.Query.write(Body), melee: Game.Query.write(Melee), blade: Game.Query.write(Blade) },
  without: [Player, Shot, Reload]
})
export const BruteRead = Game.Query({ selection: { body: Game.Query.read(Body), melee: Game.Query.read(Melee), blade: Game.Query.read(Blade) }, without: [Player, Shot, Reload] })

export const ShotQuery = Game.Query({ selection: { body: Game.Query.write(Body), shot: Game.Query.read(Shot) }, without: [Player, Enemy] })

/** The room of the run. The run's room is always one of ROOMS (BuildRoom only enters existing rooms). */
export const roomOf = (index: number): Room => {
  const room = ROOMS[index]
  if (room === undefined) throw new Error(`Slap: no room ${index}`)
  return room
}
