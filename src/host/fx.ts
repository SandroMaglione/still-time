import type { EnemyView, FightView } from "../sim/view.ts"
import type { EnemyKind } from "../sim/tuning.ts"

export interface Death {
  readonly id: number
  readonly kind: EnemyKind | "player"
  readonly x: number
  readonly y: number
  readonly aim: number
  readonly angle: number
  readonly born: number
}
export interface Impact {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly born: number
  readonly seed: number
  readonly kind: "cut" | "shot" | "stone" | "player"
}
export interface Fire { readonly born: number; readonly aim: number }
/** An afterimage of the player: where it stood, which way it faced, and how fast the world ran then (0 to 1). */
export interface Ghost { readonly x: number; readonly y: number; readonly flip: boolean; readonly born: number; readonly strength: number }

/** How long an afterimage lasts, and how often one is left, in real seconds. */
export const GHOST_LIFE = 0.32
const GHOST_EVERY = 0.09

/** Where and when (real s) you stopped dead and the world froze. */
export interface Stop { readonly x: number; readonly y: number; readonly born: number }
/** A short line over the room the first times something happens, to name it: the freeze, in the first rooms. */
export interface Callout { readonly title: string; readonly line: string; readonly born: number }
export const STOP_LIFE = 0.5
/** The vanish on a clear, in real seconds: you gather until the pop, then you are gone; the effect ends at its life. */
export const VANISH_POP = 0.35, VANISH_LIFE = 1.0
/** When (real s after the clear) the clear panel shows, and when its i-th star pops in: the HUD and the chimes both keep this. */
export const CLEAR_PANEL_AT = VANISH_LIFE - 0.2
export const starPopAt = (i: number): number => CLEAR_PANEL_AT + 0.12 + i * 0.16
export const CALLOUT_LIFE = 1.8
/** The rooms that name the freeze (The Blade and First Cut: the first room only teaches the move), and how many times. */
const TEACH_FROM = 1, TEACH_ROOMS = 3, TEACH_TIMES = 3

/** World speed as 0 (frozen) to 1 (full speed). */
export const speedOf = (view: FightView): number => Math.max(0, Math.min(1, (view.scale - view.slow) / (1 - view.slow)))
const slashKey = (s: FightView["slashes"][number]): string => `${s.born}:${s.x}:${s.y}`

/** Tick observations create cues; real-time presentation finishes even after a room ends. */
export class Presentation {
  now = 0
  deaths: Array<Death> = []
  impacts: Array<Impact> = []
  ghosts: Array<Ghost> = []
  stops: Array<Stop> = []
  /** When (real s) this attempt began: the room's goal is shown as a picture for a moment. */
  attemptAt = 0
  /** Where you were when the room was cleared: you vanish from there, ninja-style. */
  vanish: { readonly x: number; readonly y: number; readonly flip: boolean; readonly born: number } | null = null
  callout: Callout | null = null
  private lastGhost = -1
  /** Armed by a real run, fired by stopping: one freeze moment per stop. */
  private running = false
  private taught = new Map<number, number>()
  /** Rooms you have moved in during this attempt: the first room's drag hint shows until you have, on every attempt. */
  private moved = new Set<number>()

  hasMoved(room: number): boolean { return this.moved.has(room) }
  private fire = new Map<number, Fire>()
  private previous: FightView | null = null
  private deadAt: number | null = null
  private clearedAt: number | null = null

  advance(seconds: number): void {
    this.now += Math.max(0, Math.min(seconds, 1))
    this.deaths = this.deaths.filter(d => this.now - d.born < 1.05)
    this.impacts = this.impacts.filter(i => this.now - i.born < 0.42)
    this.ghosts = this.ghosts.filter(g => this.now - g.born < GHOST_LIFE)
    this.stops = this.stops.filter(s => this.now - s.born < STOP_LIFE)
    if (this.callout !== null && this.now - this.callout.born >= CALLOUT_LIFE) this.callout = null
  }

  get playerDeathAge(): number { return this.deadAt === null ? -1 : this.now - this.deadAt }
  get clearAge(): number { return this.clearedAt === null ? -1 : this.now - this.clearedAt }
  firing(enemy: EnemyView, world: number): number {
    const shot = this.fire.get(enemy.id)
    return shot === undefined ? -1 : Math.max(0, world - shot.born)
  }

  observe(view: FightView): void {
    const old = this.previous
    if (old === null || old.room.index !== view.room.index || old.player?.id !== view.player?.id || view.step < old.step || view.world < old.world || (old.flow !== "playing" && view.flow === "playing")) {
      this.deaths = []; this.impacts = []; this.ghosts = []; this.stops = []; this.fire.clear()
      this.running = false
      // A new attempt (a room entered, a retry, a restart) teaches the move again, and shows the goal again.
      this.moved.clear()
      this.attemptAt = this.now
      this.deadAt = null; this.clearedAt = null; this.vanish = null
      this.previous = view
      return
    }
    // Repeated renders never replay events. This observer also sees multiple ticks per frame.
    if (old.step === view.step) return
    // Moving fast leaves afterimages, spaced in real time; standing still leaves none.
    const p = view.player, k = speedOf(view)
    if (p !== null && view.flow === "playing" && k > 0.12 && this.now - this.lastGhost >= GHOST_EVERY) {
      this.ghosts.push({ x: p.x, y: p.y, flip: p.vx < 0, born: this.now, strength: k })
      this.lastGhost = this.now
      this.ghosts = this.ghosts.slice(-12)
    }
    // Stopping dead after a run is the freeze: a moment of its own, and in the first rooms, named.
    if (p !== null && view.flow === "playing") {
      if (Math.hypot(p.vx, p.vy) > 0.5) this.moved.add(view.room.index)
      if (k > 0.5) this.running = true
      else if (this.running && k < 0.12) {
        this.running = false
        this.stops = [...this.stops, { x: p.x, y: p.y, born: this.now }].slice(-3)
        const times = this.taught.get(view.room.index) ?? 0
        if (view.room.index >= TEACH_FROM && view.room.index < TEACH_ROOMS && times < TEACH_TIMES) {
          this.taught.set(view.room.index, times + 1)
          this.callout = { title: "TIME STOPS", line: times === 0 ? "read the room, then move" : "", born: this.now }
        }
      }
    }
    const live = new Set(view.enemies.map(e => e.id))
    for (const enemy of old.enemies) {
      if (live.has(enemy.id)) continue
      const cut = view.slashes.find(s => !s.blocked && Math.hypot(s.x - enemy.x, s.y - enemy.y) < 0.8)
      const angle = cut?.angle ?? enemy.aim
      this.deaths.push({ ...enemy, x: cut?.x ?? enemy.x, y: cut?.y ?? enemy.y, angle, born: this.now })
      this.fire.delete(enemy.id)
    }
    const earlier = new Map(old.enemies.map(e => [e.id, e]))
    for (const enemy of view.enemies) {
      const was = earlier.get(enemy.id)
      // A hidden shooter can be held at reaction delay, which drops charge <0.3.
      // A full reload roll-over is a real shot, even if it hits a wall in this tick.
      if (was !== undefined && enemy.melee === null && enemy.kind !== "runner" && was.charge - enemy.charge > 0.3) this.fire.set(enemy.id, { born: view.world, aim: enemy.aim })
    }
    const earlierCuts = new Set(old.slashes.map(slashKey))
    const shots = new Set(view.shots.map(s => s.id))
    for (const cut of view.slashes) {
      // A blow a guard stopped draws its own sparks; it is not a hit.
      if (cut.blocked || earlierCuts.has(slashKey(cut))) continue
      const shot = old.shots.some(s => !shots.has(s.id) && Math.hypot(s.x - cut.x, s.y - cut.y) < 1)
      this.impacts.push({ ...cut, born: this.now, seed: cut.born, kind: shot ? "shot" : "cut" })
    }
    for (const shot of old.shots) {
      if (shots.has(shot.id)) continue
      const dt = Math.max(1, view.step - old.step) / 60 * view.scale
      const x = Math.max(0, Math.min(view.room.w, shot.x + shot.vx * dt))
      const y = Math.max(0, Math.min(view.room.h, shot.y + shot.vy * dt))
      const hitEnemy = old.enemies.some(e => !live.has(e.id) && Math.hypot(e.x - x, e.y - y) < 0.9)
      if (!hitEnemy) this.impacts.push({ x, y, angle: Math.atan2(-shot.vy, -shot.vx), born: this.now, seed: shot.id, kind: "stone" })
    }
    if (old.flow === "playing" && view.flow === "dead" && view.player !== null) {
      this.deadAt = this.now
      const p = view.player
      const nearest = [...view.shots].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
      const attacker = [...view.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
      const angle = nearest !== undefined && Math.hypot(nearest.x - p.x, nearest.y - p.y) < 1 ? Math.atan2(nearest.vy, nearest.vx) : attacker === undefined ? Math.PI / 4 : Math.atan2(p.y - attacker.y, p.x - attacker.x)
      this.deaths.push({ id: p.id, kind: "player", x: p.x, y: p.y, aim: p.vx < 0 ? Math.PI : 0, angle, born: this.now })
      this.impacts.push({ x: p.x, y: p.y, angle, born: this.now, seed: view.step, kind: "player" })
    }
    if (old.flow === "playing" && (view.flow === "cleared" || view.flow === "won")) {
      this.clearedAt = this.now
      const p = view.player ?? old.player
      if (p !== null) this.vanish = { x: p.x, y: p.y, flip: p.vx < 0, born: this.now }
    }
    this.previous = view
    // Bounded cosmetics, including projectile-heavy fan attacks.
    this.deaths = this.deaths.slice(-24); this.impacts = this.impacts.slice(-48)
  }
}
