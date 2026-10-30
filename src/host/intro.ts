/**
 * The prologue's director: it plays the cutscene room with the player's hands off, one step at a time, by reading
 * the view (not a timeline), so the page and a headless test play it the same way. Each beat with words holds,
 * the world frozen, until you tap (`advance`), for as long as you like; "tap to continue" shows at once:
 *
 * 1. A gunner up the corridor sees you as you walk at it, and fires. You walk on at the bullet (ringed in gold) and
 *    ease to a stop just short of it: "when you stop, / time stops." (tap)
 * 2. A slow step aside and the bullet crawls past: "move slowly, / and it crawls." (tap)
 * 3. On toward the gunner; it fires again, and you stop short of that one too, held longer: "it waits / as long as
 *    you do." (tap) A slow step aside again.
 * 4. Close to the gunner, its body ringed: "you only need to / get close, to cut!" (tap) You walk in and cut it.
 * 5. "now it's / your turn." (tap)
 *
 * Any later bullet is stepped round on the move, without words. And the letterbox it is shown in: black bars, its
 * words in the bottom one with "tap to continue" once a beat can be tapped through, a "skip" in the top one, and the
 * gold ring.
 */
import { TUNING } from "../sim/tuning.ts"
import type { FightView } from "../sim/view.ts"
import type { Project } from "./draw.ts"
import { pixelArc } from "./pixels.ts"

/** Two lines of subtitle. */
export type Line = readonly [string, string]

/**
 * What the director does this step: the push (world directions, 0 to 1), the words, what to ring, whether a beat
 * holds (waiting for a tap), and whether a tap now would take it.
 */
export interface Cue {
  readonly push: { readonly x: number; readonly y: number }
  readonly line: Line | null
  readonly ring: { readonly x: number; readonly y: number } | null
  readonly waiting: boolean
  readonly ready: boolean
}

type Phase = "advance" | "stop1" | "dodge1" | "passed1" | "stop2" | "dodge" | "close" | "turn" | "over"

/** Distance (m) along the bullet's line it stops at, short of it: far enough for the slow step aside to clear it. */
const STOP = 1.3
/** Walking share toward the gunner: an unhurried walk. */
const WALK = 0.6
/** Within this of the gunner (m), the closing beat. */
const CLOSE = 2.8
const LINES = {
  stop: ["WHEN YOU STOP,", "TIME STOPS."],
  slow: ["MOVE SLOWLY,", "AND IT CRAWLS."],
  waits: ["IT WAITS", "AS LONG AS YOU DO."],
  close: ["YOU ONLY NEED TO", "GET CLOSE, TO CUT!"],
  turn: ["NOW IT'S", "YOUR TURN."]
} as const satisfies Record<string, Line>
/**
 * The least each beat stands (real s) before a tap takes it: only long enough that one tap never takes two beats.
 * (Longer minimums, up to 3 s, were tried: a player who had read it was made to wait.)
 */
const MIN = { stop1: 0.25, passed1: 0.25, stop2: 0.25, close: 0.25, turn: 0.25 } as const

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
/** The push that walks at `share` of top speed (the stick's curve undone). */
const pushFor = (share: number): number => Math.pow(clamp(share, 0, 1), 1 / TUNING.player.curve)
const STILL = { x: 0, y: 0 } as const

type Shot = FightView["shots"][number]
/** A shot coming at you: how far ahead of you along its line it is (negative once past), and how wide of you. */
const lineOf = (s: Shot, p: { readonly x: number; readonly y: number }): { readonly along: number; readonly wide: number } => {
  const v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v
  const dx = p.x - s.x, dy = p.y - s.y
  return { along: dx * ux + dy * uy, wide: Math.abs(dx * uy - dy * ux) }
}

export class Director {
  private phase: Phase = "advance"
  /** The shot being stopped for or stepped round. */
  private bullet: number | null = null
  private stops = 0
  /** Which way the current step aside goes (chosen once per shot, so it never dithers). */
  private side = 1
  private closed = false
  private tapped = false
  private heldFor = 0

  /** A tap: the beat that holds moves on (once it has stood its minimum). */
  advance(): void {
    this.tapped = true
  }

  /** Whether the scene is over: its last words read (the page then moves on). */
  get over(): boolean {
    return this.phase === "over"
  }

  /** Holds `line` until a tap once `min` real s have passed, then moves to `next`. */
  private hold(next: Phase, line: Line, min: number, dt: number, ring: Cue["ring"] = null): Cue | null {
    this.heldFor += dt
    const ready = this.heldFor >= min
    if (this.tapped && ready) { this.tapped = false; this.heldFor = 0; this.phase = next; return null }
    // (A tap before the beat has stood is let go: it does not count later.)
    this.tapped = false
    return { push: STILL, line, ring, waiting: true, ready }
  }

  /** The cue for one step of `dt` real seconds. */
  step(view: FightView, dt: number): Cue {
    const cue = this.decide(view, dt, 0)
    // (A tap while nothing holds is let go: it does not skip the next beat.)
    if (!cue.waiting) this.tapped = false
    return cue
  }

  private decide(view: FightView, dt: number, depth: number): Cue {
    const go = (push: Cue["push"], line: Line | null = null, ring: Cue["ring"] = null): Cue => ({ push, line, ring, waiting: false, ready: false })
    if (depth > 4) return go(STILL)
    const again = (): Cue => this.decide(view, 0, depth + 1)
    if (view.flow === "cleared" || view.flow === "won") {
      if (this.phase !== "over") this.phase = "turn"
      if (this.phase === "turn") return this.hold("over", LINES.turn, MIN.turn, dt) ?? again()
      return go(STILL, LINES.turn)
    }
    const p = view.player
    if (p === null || view.flow !== "playing") return go(STILL)
    const gunner = view.enemies[0] ?? null
    const tracked = view.shots.find((s) => s.id === this.bullet) ?? null
    const ringOf = (s: Shot | null): Cue["ring"] => (s === null ? null : { x: s.x, y: s.y })
    // The nearest shot still coming at you.
    const incoming = view.shots
      .map((s) => ({ s, ...lineOf(s, p) }))
      .filter((t) => t.along > -0.2 && t.wide < 1)
      .sort((a, b) => a.along - b.along)[0] ?? null
    /** A slow step off the shot's line, to the side chosen for it, and a little back. */
    const aside = (s: Shot, share: number): Cue["push"] => {
      const v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v
      const side = this.side
      const nx = -uy * side + ux * 0.45, ny = ux * side + uy * 0.45, n = Math.hypot(nx, ny) || 1
      return { x: (nx / n) * pushFor(share), y: (ny / n) * pushFor(share) }
    }
    const passed = (s: Shot | null): boolean => s === null || lineOf(s, p).along < -0.5
    switch (this.phase) {
      case "advance": {
        if (gunner === null) return go(STILL)
        const dx = gunner.x - p.x, dy = gunner.y - p.y, d = Math.hypot(dx, dy) || 1
        let share = this.closed ? 1 : WALK
        if (incoming !== null) {
          // Easing in as the shot closes: you slow, the world slows with you, and both come to rest together.
          const gap = incoming.along - STOP
          if (gap < 0.03 || (this.stops >= 2 && gap < 0.4)) {
            this.bullet = incoming.s.id
            // Toward the room's middle; from the middle itself, right then left, by turns.
            const s = incoming.s, v = Math.hypot(s.vx, s.vy) || 1
            const lean = (s.vy / v) * (p.x - view.room.w / 2)
            this.side = Math.abs(p.x - view.room.w / 2) < 0.6 ? (this.stops % 2 === 0 ? -1 : 1) : lean >= 0 ? 1 : -1
            this.phase = this.stops === 0 ? "stop1" : this.stops === 1 ? "stop2" : "dodge"
            this.stops++
            return again()
          }
          share = Math.min(share, gap / 4)
        } else if (!this.closed && d < CLOSE) {
          this.phase = "close"
          return again()
        }
        // (Ringed from the first frame it flies: far off, a bullet is a few pixels.)
        return go({ x: (dx / d) * pushFor(share), y: (dy / d) * pushFor(share) }, null, incoming !== null && this.stops < 2 ? ringOf(incoming.s) : null)
      }
      case "stop1":
        return this.hold("dodge1", LINES.stop, MIN.stop1, dt, ringOf(tracked)) ?? again()
      case "dodge1":
        if (tracked === null || passed(tracked)) { this.phase = "passed1"; return again() }
        return go(aside(tracked, 0.4), LINES.slow, ringOf(tracked))
      case "passed1":
        return this.hold("advance", LINES.slow, MIN.passed1, dt) ?? again()
      case "stop2":
        return this.hold("dodge", LINES.waits, MIN.stop2, dt, ringOf(tracked)) ?? again()
      case "dodge":
        if (tracked === null || passed(tracked)) { this.phase = "advance"; return again() }
        return go(aside(tracked, 0.4), this.stops === 2 ? LINES.waits : null, ringOf(tracked))
      case "close":
        return this.hold("advance", LINES.close, MIN.close, dt, gunner === null ? null : { x: gunner.x, y: gunner.y }) ?? (this.closed = true, again())
      default:
        return go(STILL)
    }
  }
}

const INK = "#171c2e", GOLD = "#edc66c", WHITE = "#f4efda", DIM = "#8996b0"
/** The bars' share of the screen's height. */
const BAR = 0.13

/** Whether a press at canvas y `y` lands on the top bar (where "skip" is). */
export const onSkip = (y: number, ch: number): boolean => y < Math.round(ch * BAR)

/** Outlined text, centred on `x`. */
const text = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: 8 | 16, colour: string, alpha: number): void => {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.textAlign = "center"; ctx.textBaseline = "top"
  ctx.font = `700 ${size}px Silkscreen, ui-monospace, monospace`
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(value, Math.round(x) + dx, Math.round(y) + dy)
  ctx.fillStyle = colour; ctx.fillText(value, Math.round(x), Math.round(y))
  ctx.restore()
}

/** The letterbox: the bars, the subtitle (fading in, `age` real s after it changed), "tap to continue", "skip", and the ring. */
export const letterbox = (ctx: CanvasRenderingContext2D, cw: number, ch: number, cue: Cue | null, age: number, P: Project, now: number, skip: boolean): void => {
  const bar = Math.round(ch * BAR)
  if (cue?.ring != null) {
    const at = P(cue.ring.x, cue.ring.y, 0.6)
    const r = 8 + Math.round((Math.sin(now * 5) + 1) * 1.5)
    pixelArc(ctx, at, r, r, 0, Math.PI * 2, INK, 3)
    pixelArc(ctx, at, r, r, 0, Math.PI * 2, GOLD, 1)
  }
  ctx.fillStyle = "#06070a"
  ctx.fillRect(0, 0, cw, bar); ctx.fillRect(0, ch - bar, cw, bar)
  if (skip) {
    // A plate to press: the whole top bar takes it.
    const w = 40, h = 16, left = cw - w - 8, top = Math.round(bar / 2) - 8
    ctx.fillStyle = "#29334b"; ctx.fillRect(left, top, w, h)
    ctx.fillStyle = "#465477"; ctx.fillRect(left, top, w, 1)
    text(ctx, "SKIP", left + w / 2, top + 4, 8, DIM, 1)
  }
  if (cue?.line != null) {
    const alpha = Math.min(1, age / 0.35)
    const top = ch - bar + Math.round((bar - 52) / 2)
    text(ctx, cue.line[0], cw / 2, top, 16, WHITE, alpha)
    text(ctx, cue.line[1], cw / 2, top + 20, 16, GOLD, alpha)
    // While the beat holds: what to do, blinking, once the words are in.
    // (Always there while a tap would take it, pulsing gently: a blink read as "not yet".)
    if (cue.ready) text(ctx, "TAP TO CONTINUE", cw / 2, top + 44, 8, DIM, 0.65 + 0.35 * Math.sin(now * 4))
  }
}
