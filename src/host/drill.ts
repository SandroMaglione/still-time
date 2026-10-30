/**
 * First Step's drill: the stick taught the way puzzle games teach a gesture, one exact move at a time, with every
 * other input switched off while you do it. A circle in the thumb's area (press there; presses elsewhere are
 * ignored); a dotted track up to a near circle (slide into it and hold: you walk, and only while your finger is in
 * it); on to a far circle (hold: you run); then let go (you stop). Lifting early goes back to the press. Done, the
 * page clears the room (its goal is the lesson). With keys: hold up, then let go.
 *
 * Everything here is in canvas pixels (the scene's native pixels), the units the stick is drawn in.
 */
import type { FightView } from "../sim/view.ts"
import type { Stick } from "./draw.ts"
import { hand, hintText, thumbPad } from "./draw.ts"
import { pixelArc, pixelLine } from "./pixels.ts"

export interface DrillInput {
  /** The stick in canvas pixels, while a finger is down. */
  readonly stick: Stick | null
  readonly keys: boolean
  /** Keys held: only the up key, and nothing else. */
  readonly upOnly: boolean
  readonly anyKey: boolean
}

type Phase = "press" | "slow" | "fast" | "release" | "done"

const SLOW_HOLD = 1.4, FAST_HOLD = 1, KEY_HOLD = 1.5
/** Real s "got it" shows before the room counts as cleared. */
const CLEAR_AFTER = 1.2
const INK = "#171c2e", ICE = "#7fd8ff", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda"

export class Drill {
  private room = -1
  private player = -1
  private phase: Phase = "press"
  private held = 0
  private now = 0
  private doneAt = -1
  private reported = false
  /** Where the finger went down (the track starts there), canvas px. */
  private from: { x: number; y: number } | null = null
  /** Where the press circle sits this frame, and the stick's reach, canvas px. */
  private spot = { x: 0, y: 0 }
  private reach = 40

  /** The drill runs in First Step while you play it, until it is done. */
  active(view: FightView): boolean {
    return view.room.index === 0 && view.flow === "playing" && this.phase !== "done"
  }

  /** On a press: only the circle takes it (the rest of the screen is off until the drill is done). */
  acceptsPress(x: number, y: number): boolean {
    return this.phase === "press" && Math.hypot(x - this.spot.x, y - this.spot.y) <= Math.max(14, this.reach * 0.35)
  }

  /** The circles, from where you pressed: near (a walk) and far (a run), straight up the screen. */
  private targets(): { readonly near: { x: number; y: number }; readonly far: { x: number; y: number } } {
    const o = this.from ?? this.spot
    return { near: { x: o.x, y: o.y - Math.round(this.reach * 0.42) }, far: { x: o.x, y: o.y - Math.round(this.reach * 0.98) } }
  }

  private inside(stick: Stick | null, at: { x: number; y: number }): boolean {
    return stick !== null && Math.hypot(stick.x - at.x, stick.y - at.y) <= Math.max(6, this.reach * 0.2)
  }

  /** Whether the thumb may move you now: only while doing exactly the step. */
  gate(input: DrillInput): boolean {
    if (input.keys) return (this.phase === "press" || this.phase === "release") && input.upOnly
    const t = this.targets()
    if (this.phase === "slow") return this.inside(input.stick, t.near)
    if (this.phase === "fast" || this.phase === "release") return this.inside(input.stick, t.far)
    return false
  }

  update(dt: number, cw: number, ch: number, reach: number, view: FightView, input: DrillInput): void {
    this.now += dt
    this.spot = { x: Math.round(cw / 2), y: ch - 40 }
    this.reach = reach
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.index; this.player = id
      this.phase = "press"; this.held = 0; this.doneAt = -1; this.reported = false; this.from = null
    }
    if (!this.active(view)) return
    if (input.keys) {
      // Keys: hold up (and only up) for a moment, then let go.
      if (this.phase === "press") {
        this.held = input.upOnly ? this.held + dt : 0
        if (this.held >= KEY_HOLD) { this.phase = "release"; this.held = 0 }
      } else if (this.phase === "release" && !input.anyKey) this.finish()
      return
    }
    const stick = input.stick
    if (this.phase === "press") {
      if (stick !== null) { this.from = { x: stick.ox, y: stick.oy }; this.phase = "slow"; this.held = 0 }
      return
    }
    // Lifting before the end starts the drill over.
    if (stick === null) {
      if (this.phase === "release") this.finish()
      else { this.phase = "press"; this.held = 0; this.from = null }
      return
    }
    const t = this.targets()
    if (this.phase === "slow" && this.inside(stick, t.near)) {
      this.held += dt
      if (this.held >= SLOW_HOLD) { this.phase = "fast"; this.held = 0 }
    } else if (this.phase === "fast" && this.inside(stick, t.far)) {
      this.held += dt
      if (this.held >= FAST_HOLD) { this.phase = "release"; this.held = 0 }
    }
  }

  private finish(): void {
    this.phase = "done"; this.doneAt = this.now
  }

  /** True once, a moment after the drill is done: the page then clears the room. */
  takeFinished(): boolean {
    if (this.reported || this.doneAt < 0 || this.now - this.doneAt < CLEAR_AFTER) return false
    this.reported = true
    return true
  }

  draw(ctx: CanvasRenderingContext2D, cw: number, view: FightView, input: DrillInput): void {
    if (view.room.index !== 0 || view.flow !== "playing") return
    const x = Math.round(cw / 2)
    const t = this.targets()
    const labelY = t.far.y - 34
    if (this.phase === "done") {
      if (this.now - this.doneAt < CLEAR_AFTER + 0.5) caption(ctx, x, labelY, "GOT IT!", "THAT'S HOW YOU MOVE", GREEN)
      return
    }
    if (input.keys) {
      caption(ctx, x, labelY, this.phase === "press" ? "HOLD THE UP ARROW" : "LET GO", this.phase === "press" ? "ONLY THE UP ARROW" : "AND YOU STOP", WHITE)
      if (this.phase === "press") ring(ctx, { x, y: labelY + 34 }, 10, this.held / KEY_HOLD)
      return
    }
    const stick = input.stick
    const finger = stick === null ? null : { x: stick.x, y: stick.y }
    const o = this.from ?? this.spot
    if (this.phase === "press") {
      caption(ctx, x, labelY, "PUT YOUR FINGER HERE", "AND KEEP IT DOWN", WHITE)
      // A pulsing circle, and a hand coming down onto it.
      const k = (this.now % 1.2) / 1.2
      pixelArc(ctx, this.spot, 10 + k * 8, 10 + k * 8, 0, Math.PI * 2, ICE, 1)
      target(ctx, this.spot, 10, 0)
      const down = k > 0.45 && k < 0.9
      hand(ctx, this.spot.x, this.spot.y + 2 - (down ? 0 : 8), down)
      return
    }
    // The track up from your press: dotted to the near circle, on to the far one.
    pixelLine(ctx, o, t.far, INK, 3, 3)
    pixelLine(ctx, o, t.far, ICE, 1, 3)
    const onNear = this.inside(stick, t.near), onFar = this.inside(stick, t.far)
    const nearDone = this.phase !== "slow"
    target(ctx, t.near, 9, nearDone ? 1 : this.phase === "slow" ? this.held / SLOW_HOLD : 0, nearDone ? GREEN : onNear ? GOLD : ICE)
    target(ctx, t.far, 9, this.phase === "fast" ? this.held / FAST_HOLD : this.phase === "release" ? 1 : 0, this.phase === "release" ? GREEN : onFar ? GOLD : this.phase === "fast" ? ICE : "#465477")
    if (this.phase === "slow") {
      caption(ctx, x, labelY, onNear ? "HOLD IT THERE" : "SLIDE UP TO THE CIRCLE", onNear ? "YOU WALK" : "DON'T LIFT YOUR FINGER", onNear ? GOLD : WHITE)
      if (!onNear) ghostSlide(ctx, o, t.near, this.now)
    } else if (this.phase === "fast") {
      caption(ctx, x, labelY, onFar ? "HOLD IT THERE" : "NOW SLIDE FURTHER UP", onFar ? "FURTHER = FASTER: YOU RUN" : "TO THE TOP CIRCLE", onFar ? GOLD : WHITE)
      if (!onFar) ghostSlide(ctx, t.near, t.far, this.now)
    } else {
      caption(ctx, x, labelY, "NOW LET GO", "AND YOU STOP", WHITE)
      const k = (this.now % 1) / 1
      hand(ctx, t.far.x + 14, t.far.y + 2 - Math.round(k * 10), false)
    }
    // Your finger: the knob, on its stick from where you pressed (no outer ring: the circles are the stick here).
    if (finger !== null) thumbPad(ctx, o, finger, 3)
  }
}

/** A circle to put the finger in, its rim filling as you hold it there. */
const target = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, r: number, fill: number, colour = ICE): void => {
  pixelArc(ctx, at, r, r, 0, Math.PI * 2, INK, 3)
  pixelArc(ctx, at, r, r, 0, Math.PI * 2, colour, 1)
  if (fill > 0) ring(ctx, at, r + 3, fill)
}

/** Progress around a circle, from the top, clockwise. */
const ring = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, r: number, k: number): void => {
  const end = -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, k))
  if (k > 0) {
    pixelArc(ctx, at, r, r, -Math.PI / 2, end, INK, 3)
    pixelArc(ctx, at, r, r, -Math.PI / 2, end, GOLD, 1)
  }
}

/** A ghost hand sliding along the track, from `a` to `b`, on a loop. */
const ghostSlide = (ctx: CanvasRenderingContext2D, a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, now: number): void => {
  const t = now % 1.6
  const k = t < 0.2 ? 0 : t < 1.1 ? (t - 0.2) / 0.9 : 1
  ctx.save()
  ctx.globalAlpha *= t > 1.3 ? 1 - (t - 1.3) / 0.3 : 0.85
  hand(ctx, Math.round(a.x + (b.x - a.x) * k), Math.round(a.y + (b.y - a.y) * k) + 2, true)
  ctx.restore()
}

/** What to do, and what it does, on a plate. */
const caption = (ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string, colour: string): void => {
  ctx.save()
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const w = Math.max(110, Math.ceil(ctx.measureText(title).width), Math.ceil(ctx.measureText(sub).width)) + 20
  const left = Math.round(x - w / 2), top = y - 8, h = 30
  ctx.fillStyle = INK; ctx.fillRect(left - 1, top - 1, w + 2, h + 2)
  ctx.fillStyle = "rgba(41, 51, 75, 0.92)"; ctx.fillRect(left, top, w, h)
  ctx.fillStyle = "#465477"; ctx.fillRect(left, top, w, 1)
  ctx.restore()
  hintText(ctx, title, x, y, colour)
  hintText(ctx, sub, x, y + 12, ICE)
}
