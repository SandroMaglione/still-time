/**
 * The briefing: a short practice scene before the first room, gated on the player's own gestures (agreed from two
 * design proposals after playtests where people never connected their movement with time, swiped instead of
 * holding, and tapped an enemy to shoot it).
 *
 * One gunner fires one shot at you. It moves only while your thumb drags, at the game's own world speed:
 * - dodge: hold and drag out of its line, then lift and watch it hang;
 * - again: a second shot; move until it visibly leaves its frozen outline, then lift again;
 * - cut: walk into the gunner and the cut fires by itself (a tap does nothing but show the walk-in);
 * - then you vanish, as on a clear, and the game begins.
 * Nothing advances on a timer. A shot that reaches you resets the beat at once, with a red flash and no death screen.
 *
 * Host state for the page, never the simulation: the scene is its own tiny world, moved by the same pace rule as
 * the game (`sim/pace.ts`) and the same numbers (`TUNING`, `SHOTS`), and drawn by handing `draw` a plain view.
 */
import { paceToward, pushOf } from "../sim/pace.ts"
import { STEP } from "../sim/simulation.ts"
import { SHOOTERS, SHOTS, TUNING } from "../sim/tuning.ts"
import type { FightView } from "../sim/view.ts"
import { chevronsToward, dragHint, hintText, type Project } from "./draw.ts"
import { markBriefed } from "./briefed.ts"
import { VANISH_LIFE } from "./fx.ts"
import { pixelArc } from "./pixels.ts"

/** The practice room: metres, with the gunner up the room and you below it. */
const W = 10, H = 14
const START = { x: 5, y: 10.5 }
const GUNNER = { x: 5, y: 2.4 }
/** A shot touches you within this distance, as in the game. */
const HIT = TUNING.player.radius + SHOTS.bullet.radius
/** A move counts once it has lasted this long at a real push: a tap or flick does not. */
const SUSTAINED = 0.5, REAL_PUSH = 0.35
/** Stuck holding without lifting: the hand shows the lift after this long, and the move alone counts after that. */
const SHOW_LIFT_AFTER = 6, ACCEPT_HOLD_AFTER = 12

type Stage = "dodge" | "again" | "cut" | "leaving" | "gone"

interface Shot { readonly id: number; x: number; y: number; readonly vx: number; readonly vy: number }

export class Briefing {
  stage: Stage = "dodge"
  /** True once the vanish has played: the page hands over. */
  finished = false
  private hero = { x: START.x, y: START.y, vx: 0, vy: 0 }
  private scale: number = TUNING.slow
  private world = 0
  private step = 0
  private shots: Array<Shot> = []
  private nextShot = 100
  private gunnerUp = true
  private slashes: Array<FightView["slashes"][number]> = []
  private push = { x: 0, y: 0 }
  private down = false
  /** Real seconds: the scene's own clock, and the moments things happened. */
  private now = 0
  private movedFor = 0
  private heldFor = 0
  private idleFor = 0
  private flashAt = -10
  private tapHelpAt = -10
  private cutAt = -10
  private goneAt = -10
  /** Where the shot hung at your last lift (or when it was fired): in the second cycle it has to leave this outline. */
  private anchor: { readonly x: number; readonly y: number } | null = null
  /** A shot flew past you without hitting this cycle: the dodge is made, even if the gunner has fired again since. */
  private dodged = false
  /** How far shots have flown since your last lift (across refires): the second cycle needs it to be visible. */
  private travel = 0
  /** A real lift (a finger or key coming up, never a cancel) waiting to be judged once the world has settled. */
  private liftPending = false

  constructor() { this.fire() }

  /** The thumb's push this step (the same push the game reads), and whether a finger or key is down. */
  input(push: { readonly x: number; readonly y: number }, down: boolean): void {
    if (this.down && !down) this.liftPending = true
    if (down) this.liftPending = false
    this.push = push
    this.down = down
  }

  /** A cancelled press (pointer cancel, blur, hidden tab, menu): input resets and counts for nothing. */
  cancel(): void {
    this.push = { x: 0, y: 0 }
    this.down = false
    this.liftPending = false
    this.movedFor = 0
    this.heldFor = 0
  }

  /** A tap (a short press with no drag). In the cut it shows the walk-in; it never attacks. */
  tap(): void {
    if (this.stage === "cut") this.tapHelpAt = this.now
  }

  /** Real time for the scene's own animations (hints, flashes): called every frame. */
  advance(seconds: number): void {
    this.now += Math.max(0, Math.min(seconds, 0.25))
    if (this.stage === "gone" && this.now - this.goneAt > VANISH_LIFE + 0.2) {
      this.finished = true
      markBriefed()
    }
  }

  /** One fixed step of the scene, at the game's step. */
  tick(): void {
    const dt = STEP.dt
    this.step++
    this.slashes = this.slashes.filter((s) => (this.step - s.born) / TUNING.slashSteps < 1)
      .map((s) => ({ ...s, age: Math.min(1, (this.step - s.born) / TUNING.slashSteps) }))
    if (this.stage === "gone") return

    // You move in real time; the world runs at the pace your push sets.
    this.scale = paceToward(this.scale, this.push.x, this.push.y, dt)
    const push = pushOf(this.push.x, this.push.y)
    const len = Math.hypot(this.push.x, this.push.y)
    const speed = TUNING.player.speed * push
    this.hero.vx = len === 0 ? 0 : (this.push.x / len) * speed
    this.hero.vy = len === 0 ? 0 : (this.push.y / len) * speed
    const r = TUNING.player.radius
    this.hero.x = Math.max(r, Math.min(W - r, this.hero.x + this.hero.vx * dt))
    this.hero.y = Math.max(r + 1, Math.min(H - r, this.hero.y + this.hero.vy * dt))
    // The gunner is solid.
    if (this.gunnerUp && this.stage !== "cut") {
      const dx = this.hero.x - GUNNER.x, dy = this.hero.y - GUNNER.y, d = Math.hypot(dx, dy), min = r + SHOOTERS.gunner.radius
      if (d < min && d > 0) { this.hero.x = GUNNER.x + (dx / d) * min; this.hero.y = GUNNER.y + (dy / d) * min }
    }
    this.world += dt * this.scale

    // Shots fly on the world's clock, and stop at the walls.
    for (const s of this.shots) { s.x += s.vx * dt * this.scale; s.y += s.vy * dt * this.scale; this.travel += Math.hypot(s.vx, s.vy) * dt * this.scale }
    const before = this.shots.length
    this.shots = this.shots.filter((s) => s.x > 0 && s.x < W && s.y > 0.6 && s.y < H)
    if (this.shots.length < before) this.dodged = true
    if (this.shots.some((s) => Math.hypot(s.x - this.hero.x, s.y - this.hero.y) < HIT)) { this.reset(); return }

    // Gates: a sustained real move, then a real lift, judged once the world has settled back to still.
    if (push > REAL_PUSH) this.movedFor += dt
    this.heldFor = this.down ? this.heldFor + dt : 0
    this.idleFor = !this.down && len === 0 ? this.idleFor + dt : 0
    const settled = !this.down && this.scale < TUNING.slow * 2.5
    // Holding on and on without lifting: the move alone counts in the end.
    const stuck = this.heldFor > ACCEPT_HOLD_AFTER && this.movedFor >= SUSTAINED
    if (this.stage === "dodge" || this.stage === "again") {
      if ((this.liftPending && settled) || stuck) {
        this.liftPending = false
        const shot = this.shots[0]
        const passed = this.stage === "dodge"
          ? this.dodged || shot === undefined || this.missDistance(shot) > HIT + 0.4
          : this.travel >= 0.8
        if (this.movedFor >= SUSTAINED && passed) this.next(this.stage === "dodge" ? "again" : "cut")
        else { this.movedFor = 0; this.travel = 0; this.anchor = shot === undefined ? null : { x: shot.x, y: shot.y } }
      }
    } else if (this.stage === "cut") {
      if (this.gunnerUp && Math.hypot(this.hero.x - GUNNER.x, this.hero.y - GUNNER.y) < TUNING.attackRange) {
        this.gunnerUp = false
        this.slashes.push({ born: this.step, x: GUNNER.x, y: GUNNER.y, angle: Math.atan2(GUNNER.y - this.hero.y, GUNNER.x - this.hero.x), age: 0, blocked: false })
        this.cutAt = this.now
        this.stage = "leaving"
      }
    } else if (this.stage === "leaving") {
      if (!this.down && len === 0 && this.now - this.cutAt > 0.5) { this.stage = "gone"; this.goneAt = this.now }
    }
    // While a cycle needs a shot to watch, the gunner keeps one in the air, aimed at you.
    if ((this.stage === "dodge" || this.stage === "again") && this.shots.length === 0) this.fire()
  }

  /** How far a shot's line passes from you: under the hit distance, it will reach you. */
  private missDistance(s: Shot): number {
    const sp = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / sp, uy = s.vy / sp
    const dx = this.hero.x - s.x, dy = this.hero.y - s.y
    if (dx * ux + dy * uy < 0) return Infinity
    return Math.abs(dx * uy - dy * ux)
  }

  private next(stage: Stage): void {
    this.stage = stage
    this.movedFor = 0
    this.travel = 0
    this.heldFor = 0
    this.dodged = false
    if (stage === "again") {
      // The second shot comes as you lift: fired now, aimed at you, hanging until you move.
      this.shots = []
      this.fire()
    }
    if (stage === "cut") this.shots = []
  }

  private fire(): void {
    const dx = this.hero.x - GUNNER.x, dy = this.hero.y - GUNNER.y, d = Math.hypot(dx, dy) || 1
    const speed = SHOTS.bullet.speed
    // Out of the muzzle and a little way down the room, so it hangs between you.
    const from = 2.2
    const shot = { id: this.nextShot++, x: GUNNER.x + (dx / d) * from, y: GUNNER.y + (dy / d) * from, vx: (dx / d) * speed, vy: (dy / d) * speed }
    this.shots.push(shot)
    this.anchor = { x: shot.x, y: shot.y }
  }

  /** A shot reached you: a red flash, and the beat starts over at once (your held thumb still counts). */
  private reset(): void {
    this.flashAt = this.now
    this.hero.x = START.x; this.hero.y = START.y
    this.shots = []
    this.movedFor = 0
    this.travel = 0
    this.dodged = false
    this.fire()
  }

  /** The scene as a fight view, so the game's own renderer, effects and audio draw and sound it. */
  view(): FightView {
    return {
      step: this.step,
      room: { index: -1, count: 0, name: "Practice", w: W, h: H, pillars: [], goal: { kind: "clear" }, par: 0, tip: null },
      cover: [], doors: [], keys: [], bombs: [], plates: [], hazards: [], belts: [], blasts: [],
      deaths: 0, hits: 0, world: this.world, result: null, best: [], roomNames: [], open: false,
      flow: this.stage === "gone" ? "cleared" : "playing",
      canRetry: false,
      scale: this.scale,
      slow: TUNING.slow,
      player: { id: 1, x: this.hero.x, y: this.hero.y, radius: TUNING.player.radius, vx: this.hero.vx, vy: this.hero.vy, attackRange: TUNING.attackRange },
      enemies: this.gunnerUp ? [{
        id: 2, kind: "gunner", x: GUNNER.x, y: GUNNER.y, radius: SHOOTERS.gunner.radius, charge: 0,
        aim: Math.atan2(this.hero.y - GUNNER.y, this.hero.x - GUNNER.x), sees: true, sealed: false, captain: false, key: null, melee: null, laser: null
      }] : [],
      shots: this.shots.map((s) => ({ id: s.id, kind: "bullet" as const, x: s.x, y: s.y, radius: SHOTS.bullet.radius, vx: s.vx, vy: s.vy })),
      slashes: this.slashes
    }
  }

  /** The briefing's own marks over the scene: progress, the frozen outline, the hand, the ring, a hit's flash. */
  overlay(ctx: CanvasRenderingContext2D, P: Project, cw: number, ch: number): void {
    const hero = this.hero, me = P(hero.x, hero.y)
    // Progress: three pips, one per lesson, at the top.
    const done = this.stage === "dodge" ? 0 : this.stage === "again" ? 1 : this.stage === "cut" ? 2 : 3
    for (let i = 0; i < 3; i++) {
      const x = Math.round(cw / 2 + (i - 1) * 10) - 2, y = 10
      ctx.fillStyle = "#171c2e"; ctx.fillRect(x - 1, y - 1, 6, 6)
      ctx.fillStyle = i < done ? "#edc66c" : "#3a4048"; ctx.fillRect(x, y, 4, 4)
    }
    if (this.stage === "dodge" || this.stage === "again") {
      // Where the shot hung when you lifted: it has to leave this to count.
      const o = this.anchor
      if (o !== null && this.stage === "again" && this.shots[0] !== undefined) {
        const at = P(o.x, o.y, 0.6)
        pixelArc(ctx, at, 5, 5, 0, Math.PI * 2, "#171c2e", 3, true)
        pixelArc(ctx, at, 5, 5, 0, Math.PI * 2, "#7fd8ff", 1, true)
      }
      // The hand: before the first move, whenever you stand idle, and the lift when you have held too long.
      const shot = this.shots[0]
      const away = shot === undefined || shot.x >= hero.x ? -1 : 1
      if (this.idleFor > 0.8 || (this.step < 30 && this.movedFor === 0)) dragHint(ctx, hero, P, this.now, { x: away, y: 0 })
      if (this.down && (this.movedFor >= SUSTAINED || this.heldFor > SHOW_LIFT_AFTER)) hintText(ctx, "LIFT TO FREEZE", me.x, me.y - 48, "#7fd8ff")
    }
    if (this.stage === "cut") {
      // Your reach on the floor, a route to the gunner, and the walk-in shown on a tap or when you stand idle.
      const r = TUNING.attackRange
      const erx = Math.abs(P(hero.x + 1, hero.y).x - me.x), ery = Math.abs(P(hero.x, hero.y + 1).y - me.y)
      pixelArc(ctx, me, r * erx, r * ery, 0, Math.PI * 2, "#171c2e", 3)
      pixelArc(ctx, me, r * erx, r * ery, 0, Math.PI * 2, "#edc66c", 1)
      chevronsToward(ctx, hero, GUNNER, P, this.now, "#edc66c")
      const helping = this.now - this.tapHelpAt < 2.6
      if (helping || this.idleFor > 3) {
        const dx = GUNNER.x - hero.x, dy = GUNNER.y - hero.y, d = Math.hypot(dx, dy) || 1
        dragHint(ctx, hero, P, this.now, { x: dx / d, y: dy / d })
      }
      if (helping) hintText(ctx, "WALK INTO IT", me.x, me.y - 48, "#edc66c")
    }
    // A shot reached you: the whole screen flashes red, and the beat starts over.
    const flash = this.now - this.flashAt
    if (flash < 0.4) { ctx.fillStyle = `rgba(255,64,85,${(0.55 * (1 - flash / 0.4)).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch) }
  }
}
