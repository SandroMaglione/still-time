/**
 * What must hold after every step, whatever the input: checked by the tests
 * and the fuzzer.
 */
import { Invariant } from "@typeonce/ritmo-devtools"
import { Ops } from "@typeonce/ritmo"

import { pushOut } from "../src/sim/geometry.ts"
import { ROOMS } from "../src/sim/rooms.ts"
import { Body, Doors, Enemy, Game, Pace, Player, Run, Wear } from "../src/sim/schema.ts"
import { wallsOf } from "../src/sim/systems/queries.ts"
import { TUNING, radiusOf } from "../src/sim/tuning.ts"

/** How far two solid bodies may overlap before it counts (pushes settle over a step or two). */
const SLACK = 0.06

const bodies = {
  players: Game.Query({ selection: { body: Game.Query.read(Body), player: Game.Query.read(Player) } }),
  enemies: Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.read(Enemy) } })
}

export const EnemiesDoNotOverlap = Invariant.fromInspector(Game.Inspector("Slap/EnemiesDoNotOverlap", { queries: bodies }, ({ queries }) => {
  const all = queries.enemies.each().map((m) => ({ at: m.data.body.get(), r: radiusOf(m.data.enemy.get().kind) }))
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      if (a === undefined || b === undefined) continue
      const overlap = a.r + b.r - Ops.hypot(a.at.x - b.at.x, a.at.y - b.at.y)
      if (overlap > SLACK) return `enemies at ${a.at.x.toFixed(2)},${a.at.y.toFixed(2)} and ${b.at.x.toFixed(2)},${b.at.y.toFixed(2)} overlap by ${overlap.toFixed(2)} m`
    }
  }
  return undefined
}))

export const PlayerStaysOnTheFloor = Invariant.fromInspector(Game.Inspector("Slap/PlayerStaysOnTheFloor", {
  queries: bodies,
  resources: { run: Game.System.readResource(Run), doors: Game.System.readResource(Doors), wear: Game.System.readResource(Wear) }
}, ({ queries, resources }) => {
  const room = ROOMS[resources.run.get().room]
  const me = queries.players.each()[0]?.data.body.get()
  if (room === undefined || me === undefined) return undefined
  const r = TUNING.player.radius
  if (me.x < r - SLACK || me.y < r - SLACK || me.x > room.w - r + SLACK || me.y > room.h - r + SLACK) return `player outside the room at ${me.x.toFixed(2)},${me.y.toFixed(2)}`
  if (wallsOf(room, resources.doors.get(), resources.wear.get()).some((p) => pushOut(me.x, me.y, r - SLACK, p) !== null)) return `player inside a wall or shut door at ${me.x.toFixed(2)},${me.y.toFixed(2)}`
  for (const { data } of queries.enemies.each()) {
    const at = data.body.get()
    const overlap = r + radiusOf(data.enemy.get().kind) - Ops.hypot(me.x - at.x, me.y - at.y)
    if (overlap > SLACK) return `player overlaps a ${data.enemy.get().kind} by ${overlap.toFixed(2)} m`
  }
  return undefined
}))

/** Enemies stay inside the room and out of its walls and shut doors: a chamber holds its enemies. */
export const EnemiesStayOnTheFloor = Invariant.fromInspector(Game.Inspector("Slap/EnemiesStayOnTheFloor", {
  queries: bodies,
  resources: { run: Game.System.readResource(Run), doors: Game.System.readResource(Doors), wear: Game.System.readResource(Wear) }
}, ({ queries, resources }) => {
  const room = ROOMS[resources.run.get().room]
  if (room === undefined) return undefined
  const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
  for (const { data } of queries.enemies.each()) {
    const at = data.body.get()
    const { kind } = data.enemy.get()
    const r = radiusOf(kind)
    if (at.x < r - SLACK || at.y < r - SLACK || at.x > room.w - r + SLACK || at.y > room.h - r + SLACK) return `${kind} outside the room at ${at.x.toFixed(2)},${at.y.toFixed(2)}`
    if (walls.some((p) => pushOut(at.x, at.y, r - SLACK, p) !== null)) return `${kind} inside a wall or shut door at ${at.x.toFixed(2)},${at.y.toFixed(2)}`
  }
  return undefined
}))

export const PaceStaysInRange = Invariant.fromInspector(Game.Inspector("Slap/PaceStaysInRange", {
  resources: { pace: Game.System.readResource(Pace) }
}, ({ resources }) => {
  const { scale } = resources.pace.get()
  return scale < TUNING.slow - 1e-9 || scale > 1 + 1e-9 ? `world speed ${scale} outside ${TUNING.slow}..1` : undefined
}))

export const INVARIANTS = [EnemiesDoNotOverlap, PlayerStaysOnTheFloor, EnemiesStayOnTheFloor, PaceStaysInRange] as const
