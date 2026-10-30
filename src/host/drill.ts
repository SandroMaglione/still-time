/**
 * First Step's drill: the stick taught the way puzzle games teach a gesture, one exact move at a time, with every
 * other input switched off while you do it. A circle in the thumb's area (press there; presses elsewhere are
 * ignored); slide up a little and hold (you walk, and only while you are in that band); slide all the way and hold
 * (you run); then let go (you stop). Lifting early goes back to the press. Your finger covers the spot it is on, so
 * the stick is mirrored big under the caption, high on the screen: its walk and run circles, your knob where your
 * finger is, and the step's circle filling; the phone buzzes as you enter a band and finish a step. Done, the page
 * clears the room (its goal is the lesson). With keys: hold up, then let go.
 *
 * Everything here is in canvas pixels (the scene's native pixels), the units the stick is drawn in.
 */
import type { FightView } from "../sim/view.ts"
import type { Stick } from "./draw.ts"
import { hand, thumbPad } from "./draw.ts"
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

/** Sizes in canvas px: the press circle, and the mirror of the stick up by the caption (its length, its circles). */
const PRESS_R = 16, MIRROR = 64, MIRROR_R = 10
/** Where the walk and the run sit on the stick, as a share of its reach from the press point (see `zoneOf`). */
const WALK_AT = 0.44, RUN_AT = 1
const SLOW_HOLD = 1.4, FAST_HOLD = 1, KEY_HOLD = 1.5
/** Real s "got it" shows before the room counts as cleared. */
const CLEAR_AFTER = 1.2
const INK = "#171c2e", ICE = "#7fd8ff", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda", DIM = "#465477"

type Zone = "none" | "walk" | "run"

/**
 * Which band the finger is in: a walk (slid up a little: push 0.12 to 0.62) or a run (slid up all the way: push 0.85 and
 * more), only when the slide points up (within 45°). The finger hides the spot it is on, so the bands are wide, and you
 * see where you are in the mirror up by the caption.
 */
const zoneOf = (stick: Stick | null): Zone => {
  if (stick === null) return "none"
  const dx = stick.x - stick.ox, dy = stick.y - stick.oy, len = Math.hypot(dx, dy)
  if (len === 0 || -dy / len < 0.7) return "none"
  const dead = stick.reach / 9
  const push = Math.max(0, Math.min(1, (len - dead) / (stick.reach - dead)))
  return push >= 0.85 ? "run" : push >= 0.12 && push <= 0.62 ? "walk" : "none"
}

/** A short buzz where the phone can (Android browsers; iOS ignores it). */
const buzz = (ms: number): void => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms)
}

export class Drill {
  private room = -1
  private player = -1
  private phase: Phase = "press"
  private held = 0
  private now = 0
  private doneAt = -1
  private reported = false
  private zone: Zone = "none"
  /** Where the press circle sits this frame, canvas px. */
  private spot = { x: 0, y: 0 }

  /** The drill runs in First Step while you play it, until it is done. */
  active(view: FightView): boolean {
    return view.room.index === 0 && view.flow === "playing" && this.phase !== "done"
  }

  /** On a press: only the circle takes it (the rest of the screen is off until the drill is done). */
  acceptsPress(x: number, y: number): boolean {
    return this.phase === "press" && Math.hypot(x - this.spot.x, y - this.spot.y) <= PRESS_R + 8
  }

  /** Whether the thumb may move you now: only while doing exactly the step. */
  gate(input: DrillInput): boolean {
    if (input.keys) return (this.phase === "press" || this.phase === "release") && input.upOnly
    const zone = zoneOf(input.stick)
    if (this.phase === "slow") return zone === "walk"
    if (this.phase === "fast" || this.phase === "release") return zone === "run"
    return false
  }

  update(dt: number, cw: number, ch: number, view: FightView, input: DrillInput): void {
    this.now += dt
    this.spot = { x: Math.round(cw / 2), y: ch - 40 }
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.index; this.player = id
      this.phase = "press"; this.held = 0; this.doneAt = -1; this.reported = false; this.zone = "none"
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
      if (stick !== null) { this.phase = "slow"; this.held = 0; buzz(15) }
      return
    }
    // Lifting before the end starts the drill over.
    if (stick === null) {
      if (this.phase === "release") this.finish()
      else { this.phase = "press"; this.held = 0 }
      this.zone = "none"
      return
    }
    const zone = zoneOf(stick)
    if (zone !== this.zone && zone !== "none") buzz(12)
    this.zone = zone
    if (this.phase === "slow" && zone === "walk") {
      this.held += dt
      if (this.held >= SLOW_HOLD) { this.phase = "fast"; this.held = 0; buzz(40) }
    } else if (this.phase === "fast" && zone === "run") {
      this.held += dt
      if (this.held >= FAST_HOLD) { this.phase = "release"; this.held = 0; buzz(40) }
    }
  }

  private finish(): void {
    this.phase = "done"; this.doneAt = this.now
    buzz(60)
  }

  /** True once, a moment after the drill is done: the page then clears the room. */
  takeFinished(): boolean {
    if (this.reported || this.doneAt < 0 || this.now - this.doneAt < CLEAR_AFTER) return false
    this.reported = true
    return true
  }

  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, input: DrillInput): void {
    if (view.room.index !== 0 || view.flow !== "playing") return
    const x = Math.round(cw / 2)
    // The caption sits high on the screen, far from the thumb, so the finger never covers it; under it, the mirror.
    const labelY = Math.round(ch * 0.2)
    if (this.phase === "done") {
      if (this.now - this.doneAt < CLEAR_AFTER + 0.5) caption(ctx, x, labelY, "GOT IT!", "NOW YOU CAN MOVE", GREEN)
      return
    }
    if (input.keys) {
      caption(ctx, x, labelY, this.phase === "press" ? "HOLD UP ARROW" : "LET GO", this.phase === "press" ? "ONLY THE UP ONE" : "YOU STOP", WHITE)
      if (this.phase === "press") ring(ctx, { x, y: labelY + 70 }, MIRROR_R, this.held / KEY_HOLD)
      return
    }
    const stick = input.stick
    if (this.phase === "press") {
      caption(ctx, x, labelY, "TOUCH THE CIRCLE", "KEEP IT DOWN", WHITE)
      // A pulsing circle, and a hand coming down onto it.
      const k = (this.now % 1.2) / 1.2
      pixelArc(ctx, this.spot, PRESS_R + k * 10, PRESS_R + k * 10, 0, Math.PI * 2, ICE, 1)
      target(ctx, this.spot, PRESS_R, 0)
      const down = k > 0.45 && k < 0.9
      hand(ctx, this.spot.x, this.spot.y + 2 - (down ? 0 : 8), down)
      return
    }
    const zone = zoneOf(stick)
    if (this.phase === "slow") caption(ctx, x, labelY, zone === "walk" ? "HOLD IT THERE" : "SLIDE UP", zone === "walk" ? "YOU WALK" : "A LITTLE", zone === "walk" ? GOLD : WHITE)
    else if (this.phase === "fast") caption(ctx, x, labelY, zone === "run" ? "HOLD IT THERE" : "SLIDE FURTHER", zone === "run" ? "FASTER: YOU RUN" : "ALL THE WAY UP", zone === "run" ? GOLD : WHITE)
    else caption(ctx, x, labelY, "NOW LET GO", "YOU STOP", WHITE)
    // The track sits a little left of centre so it and its WALK / RUN labels are centred together.
    this.mirror(ctx, { x: x - 14, y: labelY + 64 + MIRROR }, stick, zone)
    // Under the thumb, faint guides only (the finger covers them): the track from where you pressed, and your knob.
    if (stick !== null) {
      const base = { x: stick.ox, y: stick.oy }
      ctx.save(); ctx.globalAlpha = 0.5
      pixelLine(ctx, base, { x: base.x, y: base.y - stick.reach }, ICE, 1, 3)
      ctx.restore()
      thumbPad(ctx, base, stick, 3)
    }
  }

  /**
   * The stick as your finger has it, drawn big where you can see it: a base, the walk circle and the run circle on a
   * track up from it, and your knob where your finger is (sideways too). The circle of the step fills as you hold.
   */
  private mirror(ctx: CanvasRenderingContext2D, base: { readonly x: number; readonly y: number }, stick: Stick | null, zone: Zone): void {
    const walk = { x: base.x, y: base.y - Math.round(MIRROR * WALK_AT) }, run = { x: base.x, y: base.y - Math.round(MIRROR * RUN_AT) }
    const left = base.x - 36, top = run.y - MIRROR_R - 8
    ctx.fillStyle = INK; ctx.fillRect(left - 1, top - 1, 102, base.y - top + 12)
    ctx.fillStyle = "rgba(41, 51, 75, 0.94)"; ctx.fillRect(left, top, 100, base.y - top + 10)
    pixelLine(ctx, base, run, INK, 3, 3)
    pixelLine(ctx, base, run, ICE, 1, 3)
    const walkDone = this.phase !== "slow", runDone = this.phase === "release"
    target(ctx, walk, MIRROR_R, walkDone ? 1 : this.held / SLOW_HOLD, walkDone ? GREEN : zone === "walk" ? GOLD : ICE)
    target(ctx, run, MIRROR_R, runDone ? 1 : this.phase === "fast" ? this.held / FAST_HOLD : 0, runDone ? GREEN : zone === "run" ? GOLD : this.phase === "fast" ? ICE : DIM)
    smallText(ctx, "WALK", walk.x + MIRROR_R + 6, walk.y - 4, walkDone ? GREEN : zone === "walk" ? GOLD : WHITE)
    smallText(ctx, "RUN", run.x + MIRROR_R + 6, run.y - 4, runDone ? GREEN : zone === "run" ? GOLD : this.phase === "fast" ? WHITE : DIM)
    if (stick === null) return
    // Your finger, mirrored: the same offset from where you pressed, scaled to this track.
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, len = Math.hypot(dx, dy)
    const k = len === 0 ? 0 : Math.min(len / stick.reach, 1.1) * MIRROR / len
    const knob = { x: base.x + Math.round(dx * k), y: base.y + Math.round(dy * k) }
    thumbPad(ctx, base, knob, 3)
    // While you are not in the step's circle, a ghost hand shows the slide in the mirror.
    const want = this.phase === "slow" ? "walk" : this.phase === "fast" ? "run" : "none"
    if (want !== "none" && zone !== want) ghostSlide(ctx, base, want === "walk" ? walk : run, this.now)
  }
}

/** Hint-size text, left-aligned, outlined. */
const smallText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string): void => {
  ctx.save()
  ctx.textAlign = "left"; ctx.textBaseline = "top"
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(text, Math.round(x) + dx, Math.round(y) + dy)
  ctx.fillStyle = colour; ctx.fillText(text, Math.round(x), Math.round(y))
  ctx.restore()
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

/** Text at twice the hint size (16 px), outlined; halved when it would not fit the screen. */
const bigText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, maxWidth: number): number => {
  ctx.save()
  ctx.textAlign = "center"; ctx.textBaseline = "top"
  ctx.font = "700 16px Silkscreen, ui-monospace, monospace"
  if (ctx.measureText(text).width > maxWidth) ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const w = ctx.measureText(text).width
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [0, 2]] as const) ctx.fillText(text, Math.round(x) + dx, Math.round(y) + dy)
  ctx.fillStyle = colour; ctx.fillText(text, Math.round(x), Math.round(y))
  ctx.restore()
  return w
}

/** What to do, and what it does, big, on a plate high on the screen. */
const caption = (ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string, colour: string): void => {
  const maxWidth = x * 2 - 24
  ctx.save()
  ctx.font = "700 16px Silkscreen, ui-monospace, monospace"
  const w = Math.min(maxWidth, Math.max(120, Math.ceil(ctx.measureText(title).width), Math.ceil(ctx.measureText(sub).width))) + 20
  const left = Math.round(x - w / 2), top = y - 10, h = 52
  ctx.fillStyle = INK; ctx.fillRect(left - 1, top - 1, w + 2, h + 2)
  ctx.fillStyle = "rgba(41, 51, 75, 0.94)"; ctx.fillRect(left, top, w, h)
  ctx.fillStyle = "#465477"; ctx.fillRect(left, top, w, 1)
  ctx.restore()
  bigText(ctx, title, x, y, colour, maxWidth)
  bigText(ctx, sub, x, y + 22, ICE, maxWidth)
}
