/**
 * The queries the fight systems share, and the room each step plays in.
 * Disjoint by their filters, so one system may write the player's body and
 * read the enemies' (or the reverse).
 */
import { ROOMS, type Cover, type Pillar, type Room } from "../rooms.ts"
import { Blade, Body, Bomb, Carry, Enemy, Game, Melee, Player, Post, Reload, Shot, Stalk } from "../schema.ts"

export const PlayerQuery = Game.Query({ selection: { body: Game.Query.write(Body), player: Game.Query.write(Player) } })
export const PlayerRead = Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } })

export const ShooterQuery = Game.Query({
  selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.write(Reload), post: Game.Query.write(Post) },
  without: [Player, Shot, Melee]
})
export const ShooterRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), reload: Game.Query.read(Reload) }, without: [Player, Shot, Melee] })

export const MeleeQuery = Game.Query({
  selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), melee: Game.Query.write(Melee), blade: Game.Query.write(Blade) },
  without: [Player, Shot, Reload]
})
export const MeleeRead = Game.Query({
  selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), melee: Game.Query.read(Melee), blade: Game.Query.read(Blade) },
  without: [Player, Shot, Reload]
})

export const RunnerQuery = Game.Query({
  selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), carry: Game.Query.read(Carry) },
  without: [Player, Shot, Reload, Melee]
})
export const RunnerRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), carry: Game.Query.read(Carry) }, without: [Player, Shot, Reload, Melee] })

export const StalkerQuery = Game.Query({
  selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), stalk: Game.Query.read(Stalk) },
  without: [Player, Shot, Reload, Melee, Carry]
})
export const StalkerRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy), stalk: Game.Query.read(Stalk) }, without: [Player, Shot, Reload, Melee, Carry] })

/** Every enemy without a guard to check (shooters, runners, stalkers): one cut or shot downs it. */
export const PlainRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy) }, without: [Player, Shot, Melee] })

/** Every enemy, whatever its kind: for systems that only read them. */
export const EnemyRead = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy) }, without: [Player, Shot] })

export const ShotQuery = Game.Query({ selection: { body: Game.Query.write(Body), shot: Game.Query.read(Shot) }, without: [Player, Enemy] })
export const BombQuery = Game.Query({ selection: { body: Game.Query.write(Body), bomb: Game.Query.write(Bomb) }, without: [Player, Enemy, Shot] })

/** The room of the run. The run's room is always one of ROOMS (BuildRoom only enters existing rooms). */
export const roomOf = (index: number): Room => {
  const room = ROOMS[index]
  if (room === undefined) throw new Error(`Slap: no room ${index}`)
  return room
}

/** The room's cover still standing (not broken). */
export const standing = (room: Room, wear: ReadonlyArray<number | null>): ReadonlyArray<Cover> =>
  wear.every((w) => w !== 0) ? room.pillars : room.pillars.filter((_, i) => wear[i] !== 0)

/** What stands in the way this step: the room's walls and cover still standing, and its doors still shut. */
export const wallsOf = (room: Room, open: ReadonlyArray<boolean>, wear: ReadonlyArray<number | null>): ReadonlyArray<Pillar> =>
  room.doors.length === 0 ? standing(room, wear) : [...standing(room, wear), ...room.doors.filter((_, i) => open[i] !== true)]

/** Wear a fresh room starts with, by pillar: a crate's hits, a cracked wall's one, null for cover that never breaks. */
export const freshWear = (room: Room, crateHits: number): Array<number | null> =>
  room.pillars.map((p) => (p.breaks === "crate" ? crateHits : p.breaks === "cracked" ? 1 : null))
