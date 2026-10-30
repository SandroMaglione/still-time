/**
 * The first two rooms' lessons, one step at a time, each waiting until you have done it: the move in First Step
 * (touch, keep it down, slide a little and walk, slide further and run, lift and stop), and the clock in The Blade
 * (stand still and the blade waits, move and it turns, let go and it stops with you, then cross). The step is read
 * from your real input and written under you; on touch a stick under the room acts it out. Until a step is done the
 * thumb is held back (no move before you hold, only a walk before you have walked), so the lesson cannot be skipped.
 */
import { ROOMS } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { TUNING } from "../sim/tuning.ts"
import { hand, hintText, thumbPad, type Project } from "./draw.ts"

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
  /** What to do, and what it does. */
  readonly title: string
  readonly sub: string
  /** Real seconds the condition must hold (added up while it holds); 0 is at once. */
  readonly need: number
  readonly ok: (s: Sense) => boolean
  readonly demo: Demo
  /** The most push the thumb may give on this step: you cannot run ahead of the lesson. */
  readonly cap: number
  /** Lifting the finger here starts the lesson over from its first step. */
  readonly liftResets?: boolean
}

const still = (s: Sense): boolean => s.speed < 0.05
const moving = (s: Sense): boolean => s.speed > 0.15

const MOVE_TOUCH: ReadonlyArray<Step> = [
  { title: "TOUCH THE SCREEN", sub: "ANYWHERE, WITH ONE FINGER", need: 0, ok: (s) => s.down, demo: "tap", cap: 0 },
  { title: "KEEP YOUR FINGER DOWN", sub: "DON'T LIFT IT", need: 0.8, ok: (s) => s.down, demo: "hold", cap: 0, liftResets: true },
  { title: "SLIDE IT A LITTLE", sub: "A SHORT SLIDE: YOU WALK THAT WAY", need: 1.2, ok: (s) => s.down && s.push > 0.08, demo: "slow", cap: 0.45 },
  { title: "SLIDE IT FURTHER", sub: "THE FURTHER YOU SLIDE, THE FASTER", need: 0.8, ok: (s) => s.down && s.push > 0.85, demo: "fast", cap: 1 },
  { title: "LIFT YOUR FINGER", sub: "AND YOU STOP", need: 0, ok: (s) => !s.down, demo: "release", cap: 1 }
]
const MOVE_KEYS: ReadonlyArray<Step> = [
  { title: "HOLD AN ARROW KEY", sub: "YOU WALK THAT WAY", need: 1, ok: (s) => s.down && moving(s), demo: "none", cap: 1 },
  { title: "LET GO", sub: "AND YOU STOP", need: 0, ok: (s) => !s.down, demo: "none", cap: 1 }
]
const bladeY = (): number => {
  for (const hz of ROOMS[1]?.hazards ?? []) if (hz.kind === "blade") return hz.y
  return 8
}
const clock = (keys: boolean): ReadonlyArray<Step> => [
  { title: "STAND STILL", sub: "THE BLADE WAITS FOR YOU", need: 1.5, ok: still, demo: "none", cap: 1 },
  { title: keys ? "HOLD AN ARROW KEY" : "SLIDE YOUR FINGER", sub: "AS YOU MOVE, THE BLADE TURNS", need: 1, ok: moving, demo: keys ? "none" : "slow", cap: 1 },
  { title: keys ? "LET GO" : "LIFT YOUR FINGER", sub: "THE BLADE STOPS WITH YOU", need: 0.6, ok: (s) => !s.down && still(s), demo: keys ? "none" : "release", cap: 1 },
  { title: "CROSS WHEN THE WAY IS OPEN", sub: "", need: 0, ok: (s) => s.view.player !== null && s.view.player.y < bladeY() - 1.2, demo: "none", cap: 1 }
]
const stepsFor = (room: number, keys: boolean): ReadonlyArray<Step> =>
  room === 0 ? (keys ? MOVE_KEYS : MOVE_TOUCH) : room === 1 ? clock(keys) : []
const DONE: Record<number, readonly [string, string]> = { 0: ["GOT IT!", "FOLLOW THE ARROWS TO THE EXIT"], 1: ["GOT IT!", "TIME MOVES ONLY WHEN YOU DO"] }
const DONE_LIFE = 3

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

  /** The most push the thumb may give now (1 outside the lessons). */
  cap(): number {
    return stepsFor(this.room, this.keys)[this.step]?.cap ?? 1
  }

  /**
   * The step under you, where you are already looking (pips, what to do, what it does, its progress), and on touch
   * a stick in the strip under the room acting the gesture out.
   */
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: LessonInput): void {
    if (view.flow !== "playing" || view.player === null) return
    const steps = stepsFor(this.room, this.keys)
    if (steps.length === 0) return
    const step = steps[this.step]
    const pad = { x: Math.round(cw / 2), y: ch - 34 }
    const reach = 20
    const showsPad = step !== undefined && step.demo !== "none"
    const me = P(view.player.x, view.player.y)
    // At your feet's height (centred on the screen, so the lines never run off it), kept clear of the stick below.
    const x = Math.round(cw / 2)
    const top = Math.min(Math.round(me.y) + 10, (showsPad ? pad.y - reach : ch) - 46)
    if (step === undefined) {
      const age = this.now - this.doneAt
      const done = DONE[this.room]
      if (this.doneAt >= 0 && age < DONE_LIFE && done !== undefined) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (DONE_LIFE - age) / 0.5)
        pips(ctx, x, top, steps.length, steps.length, this.now - this.stepAt)
        hintText(ctx, done[0], x, top + 12, GREEN)
        hintText(ctx, done[1], x, top + 22, "#f4efda")
        ctx.restore()
      }
      return
    }
    const sense = { ...input, speed: Math.hypot(view.player.vx, view.player.vy) / TUNING.player.speed, view }
    const doing = step.ok(sense)
    pips(ctx, x, top, steps.length, this.step, this.now - this.stepAt)
    hintText(ctx, step.title, x, top + 12, doing ? GOLD : "#f4efda")
    if (step.sub !== "") hintText(ctx, step.sub, x, top + 22, ICE)
    if (step.need > 0) bar(ctx, x, top + 30, this.held / step.need)
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
