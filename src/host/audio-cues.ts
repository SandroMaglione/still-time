/**
 * Which sounds one tick makes: the fight view before and after, compared
 * (like `fx.ts`), into a list of cues. Plain reading, no audio and no state:
 * the engine in `audio.ts` plays them.
 *
 * Each cue says which clock it keeps. `world` sounds come from the slowed
 * world and play slowed, lower and muffled with it; `real` sounds keep real
 * time like you do (your blade, your death, the clockwork, the stalker);
 * `ui` sounds are the game's own (a clear, the stars, the menus).
 */
import type { FightView } from "../sim/view.ts"
import type { SoundName } from "./audio-bank.ts"
import { starPopAt } from "./fx.ts"

export type Bus = "world" | "real" | "ui"

export interface Cue {
  readonly name: SoundName
  readonly bus: Bus
  /** Where it happens in the room, for distance and pan; none for sounds that are everywhere. */
  readonly at: { readonly x: number; readonly y: number } | null
  /** Seconds (real) after now. */
  readonly delay: number
}

const cue = (name: SoundName, bus: Bus, at: { readonly x: number; readonly y: number } | null = null, delay = 0): Cue => ({ name, bus, at, delay })
const near = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, d: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) < d
const slashKey = (s: FightView["slashes"][number]): string => `${s.born}:${s.x}:${s.y}`
const boxKey = (c: { readonly x: number; readonly y: number }): string => `${c.x}:${c.y}`

/** True when `view` is not the next tick of `old` (a new room, a retry, a restart): no sounds across it. */
export const isCut = (old: FightView, view: FightView): boolean =>
  old.room.index !== view.room.index || old.player?.id !== view.player?.id || view.step < old.step || view.world < old.world || (old.flow !== "playing" && view.flow === "playing")

/** The sounds between two consecutive ticks. */
export const cuesBetween = (old: FightView, view: FightView): Array<Cue> => {
  const cues: Array<Cue> = []
  const player = view.player ?? old.player

  // Your blows: a kill, or a blow a guard stopped. A shot that downs someone leaves a mark too: that one is the shot's.
  const earlierCuts = new Set(old.slashes.map(slashKey))
  const liveShots = new Set(view.shots.map(s => s.id))
  const goneShots = old.shots.filter(s => !liveShots.has(s.id))
  for (const cut of view.slashes) {
    if (earlierCuts.has(slashKey(cut))) continue
    const byShot = goneShots.some(s => near(s, cut, 1.2))
    const mine = player !== null && near(player, cut, player.attackRange + 0.6) && !byShot
    if (cut.blocked && mine) cues.push(cue("player.slash", "real", cut), cue("player.guarded", "real", cut))
    else if (cut.blocked) cues.push(cue("shield.block", "world", cut))
    else if (mine) cues.push(cue("player.kill", "real", cut))
  }

  // Who fell.
  const live = new Set(view.enemies.map(e => e.id))
  for (const enemy of old.enemies) {
    if (live.has(enemy.id)) continue
    cues.push(cue("enemy.death", enemy.kind === "clockwork" || enemy.kind === "stalker" ? "real" : "world", enemy))
    if (enemy.key !== null) cues.push(cue("key.drop", "world", enemy, 0.08))
  }

  // Shots fired: one sound per kind per tick (a fan of knives is one throw).
  const earlierShots = new Set(old.shots.map(s => s.id))
  const fired = new Map<string, FightView["shots"][number]>()
  for (const shot of view.shots) if (!earlierShots.has(shot.id) && !fired.has(shot.kind)) fired.set(shot.kind, shot)
  for (const shot of fired.values()) cues.push(cue(`shot.${shot.kind}` as const, "world", shot))

  // Shots that struck: a crate takes the hit, anything else is stone.
  const earlierCover = new Map(old.cover.map(c => [boxKey(c), c]))
  const nowCover = new Map(view.cover.map(c => [boxKey(c), c]))
  let crateHit = false
  for (const [key, was] of earlierCover) {
    const now = nowCover.get(key)
    if (now === undefined) cues.push(cue(was.kind === "crate" ? "crate.break" : "wall.break", "world", { x: was.x + was.w / 2, y: was.y + was.h / 2 }))
    else if (now.hits < was.hits) crateHit = true
  }
  // Not a shot that downed someone, rang off a shield, or hit you.
  const newCuts = view.slashes.filter(c => !earlierCuts.has(slashKey(c)))
  const struck = view.flow === "dead" ? undefined : goneShots.find(s => !old.enemies.some(e => !live.has(e.id) && near(e, s, 1)) && !newCuts.some(c => near(c, s, 1.2)))
  if (crateHit && struck !== undefined) cues.push(cue("crate.hit", "world", struck))
  else if (struck !== undefined) cues.push(cue("shot.impact", "world", struck))

  // Enemies' tells: the sniper's laser, a melee wind-up and swing.
  const earlier = new Map(old.enemies.map(e => [e.id, e]))
  for (const enemy of view.enemies) {
    const was = earlier.get(enemy.id)
    if (was === undefined) continue
    if (enemy.laser !== null && was.laser === null) cues.push(cue("sniper.charge", "world", enemy))
    if (enemy.laser?.locked === true && was.laser?.locked !== true) cues.push(cue("sniper.lock", "world", enemy))
    const phase = enemy.melee?.phase, before = was.melee?.phase
    const clockwork = enemy.kind === "clockwork"
    if (phase === "windup" && before !== "windup") cues.push(cue(clockwork ? "clockwork.windup" : "brute.windup", clockwork ? "real" : "world", enemy))
    if (phase === "swing" && before !== "swing") cues.push(cue("brute.swing", clockwork ? "real" : "world", enemy))
  }

  // Bombs: thrown, landed, the fuse burning (ten sputters over its burn), the blast.
  const earlierBombs = new Map(old.bombs.map(b => [b.id, b]))
  for (const bomb of view.bombs) {
    const was = earlierBombs.get(bomb.id)
    if (was === undefined) cues.push(cue("bomb.throw", "world", bomb))
    else if (was.flying && !bomb.flying) cues.push(cue("bomb.land", "world", bomb))
    else if (!bomb.flying && Math.ceil(was.fuse * 10) !== Math.ceil(bomb.fuse * 10)) cues.push(cue("bomb.fuse", "world", bomb))
  }
  const earlierBlasts = new Set(old.blasts.map(boxKey))
  for (const blast of view.blasts) if (!earlierBlasts.has(boxKey(blast))) cues.push(cue("bomb.blast", "world", blast))

  // The room: doors, plates, keys, laser gates.
  view.doors.forEach((door, i) => {
    if (door.open && old.doors[i]?.open === false) cues.push(cue("door.open", "world", { x: door.x + door.w / 2, y: door.y + door.h / 2 }))
  })
  view.plates.forEach((plate, i) => {
    const was = old.plates[i]
    if (plate.down && was?.down === false) cues.push(cue("plate.press", "world", plate))
    if (plate.missed && was?.missed === false && i === view.plates.findIndex(p => p.missed)) cues.push(cue("plate.wrong", "world", plate))
  })
  if (view.keys.some(k => k.state === "held" && !old.keys.some(o => o.key === k.key && o.state === "held"))) cues.push(cue("key.pickup", "real"))
  view.hazards.forEach((gate, i) => {
    const was = old.hazards[i]
    if (gate.kind !== "gate" || was === undefined || was.state === gate.state) return
    const at = { x: (gate.ax + gate.bx) / 2, y: (gate.ay + gate.by) / 2 }
    if (gate.state === "warn") cues.push(cue("gate.warn", "world", at))
    if (gate.state === "on") cues.push(cue("gate.on", "world", at))
  })

  // How the attempt ends.
  if (old.flow === "playing" && view.flow === "dead") cues.push(cue("player.death", "real"))
  if (old.flow === "playing" && (view.flow === "cleared" || view.flow === "won")) {
    cues.push(cue(view.flow === "won" ? "run.won" : "room.clear", "ui"))
    const stars = view.result?.stars ?? 0
    const chimes = ["star.1", "star.2", "star.3"] as const
    // Each chime lands as its star pops in on the clear panel (mid-pop: the star is at its biggest).
    chimes.slice(0, stars).forEach((name, i) => cues.push(cue(name, "ui", null, starPopAt(i) + 0.06)))
  }
  return cues
}
