/**
 * The first two rooms' lessons, one step at a time, each waiting until you have done it: the move in First Step
 * (press anywhere, keep it pressed, slide a little and walk, slide further and run, let go and stop), and the clock in
 * The Blade (stand still and the blade waits, move and it turns, let go and it stops with you, then cross). The step
 * is read from your real input and drawn in the strip under the room, with a stick showing the gesture.
 */
import { ROOMS } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { TUNING } from "../sim/tuning.ts"
import { hand, hintText, thumbPad } from "./draw.ts"

/** What the thumb is doing: a finger (or key) down, and the push it gives, 0..1. */
export interface LessonInput {
  readonly down: boolean
  readonly push: number
  readonly keys: boolean
}

interface Sense extends LessonInput {
  /** Your speed, 0..1 of top speed. */
  readonly speed: number
  readonly view: FightView
}

/** How the stick in the strip shows the step. */
type Demo = "tap" | "hold" | "slow" | "fast" | "release" | "none"

interface Step {
  readonly label: string
  /** Real seconds the condition must hold (added up while it holds); 0 is at once. */
  readonly need: number
  readonly ok: (s: Sense) => boolean
  readonly demo: Demo
  /** Lifting the finger here starts the lesson over from its first step. */
  readonly liftResets?: boolean
}

const still = (s: Sense): boolean => s.speed < 0.05
const moving = (s: Sense): boolean => s.speed > 0.15

const MOVE_TOUCH: ReadonlyArray<Step> = [
  { label: "PRESS ANYWHERE", need: 0, ok: (s) => s.down, demo: "tap" },
  { label: "KEEP IT PRESSED", need: 0.8, ok: (s) => s.down, demo: "hold", liftResets: true },
  { label: "SLIDE A LITTLE: YOU WALK", need: 1.2, ok: (s) => s.down && s.push > 0.08 && s.push < 0.6, demo: "slow" },
  { label: "SLIDE FURTHER: YOU RUN", need: 0.8, ok: (s) => s.down && s.push > 0.85, demo: "fast" },
  { label: "LET GO: YOU STOP", need: 0, ok: (s) => !s.down, demo: "release" }
]
const MOVE_KEYS: ReadonlyArray<Step> = [
  { label: "HOLD AN ARROW: YOU RUN", need: 1, ok: (s) => s.down && moving(s), demo: "none" },
  { label: "LET GO: YOU STOP", need: 0, ok: (s) => !s.down, demo: "none" }
]
const bladeY = (): number => {
  for (const hz of ROOMS[1]?.hazards ?? []) if (hz.kind === "blade") return hz.y
  return 8
}
const clock = (keys: boolean): ReadonlyArray<Step> => [
  { label: "STAND STILL: THE BLADE WAITS", need: 1.5, ok: still, demo: "none" },
  { label: keys ? "MOVE: THE BLADE TURNS" : "SLIDE: THE BLADE TURNS", need: 1, ok: moving, demo: keys ? "none" : "slow" },
  { label: "LET GO: IT STOPS WITH YOU", need: 0.6, ok: (s) => !s.down && still(s), demo: keys ? "none" : "release" },
  { label: "CROSS WHEN THE WAY IS OPEN", need: 0, ok: (s) => s.view.player !== null && s.view.player.y < bladeY() - 1.2, demo: "none" }
]
const stepsFor = (room: number, keys: boolean): ReadonlyArray<Step> =>
  room === 0 ? (keys ? MOVE_KEYS : MOVE_TOUCH) : room === 1 ? clock(keys) : []
const DONE: Record<number, string> = { 0: "THAT'S IT: NOW REACH THE EXIT", 1: "TIME MOVES ONLY WITH YOU" }
const DONE_LIFE = 2.5

const INK = "#171c2e", ICE = "#7fd8ff", GOLD = "#edc66c", GREEN = "#7dff9a"

export class Lesson {
  private room = -1
  private player = -1
  private keys = false
  private step = 0
  private held = 0
  /** Real time of the last step done, for its flash; and of the lesson's end. */
  private stepAt = -10
  private doneAt = -1
  private now = 0

  /** Reads the step against your input; starts over on a new room, a restart, or a switch between touch and keys. */
  update(dt: number, view: FightView, input: LessonInput): void {
    this.now += dt
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player) || (input.keys !== this.keys && this.step === 0 && this.held === 0)) {
      this.room = view.room.index
      this.player = id
      this.keys = input.keys
      this.step = 0; this.held = 0; this.doneAt = -1; this.stepAt = -10
    }
    const steps = stepsFor(this.room, this.keys)
    const step = steps[this.step]
    if (step === undefined || view.flow !== "playing" || view.player === null) return
    const p = view.player
    const sense: Sense = { ...input, speed: Math.hypot(p.vx, p.vy) / TUNING.player.speed, view }
    if (step.liftResets === true && !input.down) { this.step = 0; this.held = 0; return }
    if (!step.ok(sense)) return
    this.held += dt
    if (this.held < step.need) return
    this.step++; this.held = 0; this.stepAt = this.now
    if (this.step >= steps.length) this.doneAt = this.now
  }

  /** The step, its progress and the stick showing it, in the strip under the room (over everything). */
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, input: LessonInput): void {
    if (view.flow !== "playing") return
    const steps = stepsFor(this.room, this.keys)
    if (steps.length === 0) return
    const x = Math.round(cw / 2)
    const step = steps[this.step]
    const pad = { x, y: ch - 34 }
    const showsPad = step !== undefined && step.demo !== "none"
    const labelY = showsPad ? pad.y - 34 : ch - 30
    if (step === undefined) {
      const age = this.now - this.doneAt
      if (this.doneAt >= 0 && age < DONE_LIFE) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (DONE_LIFE - age) / 0.5)
        pips(ctx, x, labelY - 12, steps.length, steps.length, this.now - this.stepAt)
        hintText(ctx, DONE[this.room] ?? "", x, labelY, GREEN)
        ctx.restore()
      }
      return
    }
    const sense = view.player === null ? null : { ...input, speed: Math.hypot(view.player.vx, view.player.vy) / TUNING.player.speed, view }
    const doing = sense !== null && step.ok(sense)
    pips(ctx, x, labelY - 12, steps.length, this.step, this.now - this.stepAt)
    hintText(ctx, step.label, x, labelY, doing ? GOLD : "#f4efda")
    if (step.need > 0) bar(ctx, x, labelY + 8, this.held / step.need)
    if (!showsPad) return
    // The demo steps back (fainter) while you are doing it yourself.
    ctx.save()
    ctx.globalAlpha = doing ? 0.35 : 1
    demo(ctx, pad, step.demo, this.now)
    ctx.restore()
  }
}

/** One square per step: done ones filled (the newest blinks once), the current one outlined. */
const pips = (ctx: CanvasRenderingContext2D, x: number, y: number, count: number, done: number, sinceDone: number): void => {
  const size = 4, gap = 3, left = x - Math.round((count * size + (count - 1) * gap) / 2)
  for (let i = 0; i < count; i++) {
    const px = left + i * (size + gap)
    ctx.fillStyle = INK; ctx.fillRect(px - 1, y - 1, size + 2, size + 2)
    const fresh = i === done - 1 && sinceDone < 0.6 && Math.floor(sinceDone * 10) % 2 === 0
    ctx.fillStyle = i < done ? (fresh ? "#ffffff" : GREEN) : i === done ? ICE : "#465477"
    if (i <= done) ctx.fillRect(px, y, size, size)
    else { ctx.fillRect(px, y, size, 1); ctx.fillRect(px, y + size - 1, size, 1); ctx.fillRect(px, y, 1, size); ctx.fillRect(px + size - 1, y, 1, size) }
  }
}

/** The step's progress: a thin bar filling while you keep doing it. */
const bar = (ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void => {
  const w = 60, left = x - w / 2
  ctx.fillStyle = INK; ctx.fillRect(left - 1, y - 1, w + 2, 4)
  ctx.fillStyle = "#29334b"; ctx.fillRect(left, y, w, 2)
  ctx.fillStyle = GOLD; ctx.fillRect(left, y, Math.round(w * Math.max(0, Math.min(1, k))), 2)
}

/** The gesture on a stick: press, hold, slide a little, slide far, let go. The knob goes up the screen. */
const demo = (ctx: CanvasRenderingContext2D, pad: { readonly x: number; readonly y: number }, kind: Demo, now: number): void => {
  const reach = 20
  let out = 0, pressed = true, lift = 0
  if (kind === "tap") {
    const t = now % 1.2
    pressed = t > 0.5 && t < 1
    lift = pressed ? 0 : 8
    if (t > 0.5 && t < 0.8) {
      const r = 4 + (t - 0.5) * 50
      ctx.save(); ctx.globalAlpha *= 1 - (t - 0.5) / 0.3
      ringAt(ctx, pad, r)
      ctx.restore()
    }
  } else if (kind === "slow" || kind === "fast") {
    const t = now % 2
    const k = t < 0.3 ? t / 0.3 : t < 1.7 ? 1 : 1 - (t - 1.7) / 0.3
    out = (kind === "slow" ? 0.4 : 1) * k
  } else if (kind === "release") {
    const t = now % 1.6
    pressed = t < 0.7
    out = pressed ? 1 : 0
    lift = pressed ? 0 : Math.round((t - 0.7) * 24)
  }
  const knob = { x: pad.x, y: pad.y - Math.round(reach * out) }
  hand(ctx, knob.x, knob.y + 2 - lift, pressed)
  thumbPad(ctx, pad, knob, reach)
}

/** The press: a thin ring opening around the spot. */
const ringAt = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, r: number): void => {
  ctx.fillStyle = "#e8f6ff"
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2
    ctx.fillRect(Math.round(at.x + Math.cos(ang) * r), Math.round(at.y + Math.sin(ang) * r), 1, 1)
  }
}
