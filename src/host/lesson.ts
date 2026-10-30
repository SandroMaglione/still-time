/**
 * The Blade's lesson, one step at a time, each waiting until you have done it: stand still and the blade waits, move
 * and it turns, let go and it stops with you, then cross. The step is read from your real input and written on a
 * plate under you; on touch a stick under the room acts it out. (First Step's drill is `drill.ts`.)
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
  /** Lifting the finger here starts the lesson over from its first step. */
  readonly liftResets?: boolean
}

const still = (s: Sense): boolean => s.speed < 0.05
const moving = (s: Sense): boolean => s.speed > 0.15

const bladeY = (): number => {
  for (const hz of ROOMS[1]?.hazards ?? []) if (hz.kind === "blade") return hz.y
  return 8
}
const clock = (keys: boolean): ReadonlyArray<Step> => [
  { title: "STAND STILL", sub: "THE BLADE WAITS FOR YOU", need: 1.5, ok: still, demo: "none" },
  { title: keys ? "HOLD AN ARROW KEY" : "SLIDE YOUR FINGER", sub: "AS YOU MOVE, THE BLADE TURNS", need: 1, ok: moving, demo: keys ? "none" : "slow" },
  { title: keys ? "LET GO" : "LIFT YOUR FINGER", sub: "THE BLADE STOPS WITH YOU", need: 0.6, ok: (s) => !s.down && still(s), demo: keys ? "none" : "release" },
  { title: "CROSS WHEN THE WAY IS OPEN", sub: "", need: 0, ok: (s) => s.view.player !== null && s.view.player.y < bladeY() - 1.2, demo: "none" }
]
const stepsFor = (room: number, keys: boolean): ReadonlyArray<Step> => (room === 1 ? clock(keys) : [])
const DONE: Record<number, readonly [string, string]> = { 1: ["GOT IT!", "TIME MOVES ONLY WHEN YOU DO"] }
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

  /**
   * The step on a plate under you (over you when you are low on the screen): pips, what to do, what it does, and its
   * progress; on touch, a stick in the strip under the room acting it out.
   */
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: LessonInput): void {
    if (view.flow !== "playing" || view.player === null) return
    const steps = stepsFor(this.room, this.keys)
    if (steps.length === 0) return
    const step = steps[this.step]
    const age = this.now - this.doneAt
    if (step === undefined && (this.doneAt < 0 || age >= DONE_LIFE)) return
    const done = DONE[this.room]
    const sense: Sense = { ...input, speed: Math.hypot(view.player.vx, view.player.vy) / TUNING.player.speed, view }
    const title = step?.title ?? done?.[0] ?? ""
    const sub = step === undefined ? done?.[1] ?? "" : step.sub
    const doing = step !== undefined && step.ok(sense)
    const pad = { x: Math.round(cw / 2), y: ch - 34 }
    const reach = 20
    const showsPad = step !== undefined && step.demo !== "none"
    const me = P(view.player.x, view.player.y)
    const x = Math.round(cw / 2)
    const limit = (showsPad ? pad.y - reach - 10 : ch - 6) - PANEL_H
    const below = Math.round(me.y) + 12
    const top = below <= limit ? below : Math.max(4, Math.round(me.y) - 44 - PANEL_H)
    ctx.save()
    if (step === undefined) ctx.globalAlpha = Math.min(1, (DONE_LIFE - age) / 0.5)
    plate(ctx, x, top, [title, sub])
    pips(ctx, x, top + 7, steps.length, step === undefined ? steps.length : this.step, this.now - this.stepAt)
    hintText(ctx, title, x, top + 18, step === undefined ? GREEN : doing ? GOLD : "#f4efda")
    if (sub !== "") hintText(ctx, sub, x, top + 31, step === undefined ? "#f4efda" : ICE)
    bar(ctx, x, top + 46, step === undefined ? 1 : step.need > 0 ? this.held / step.need : 0)
    ctx.restore()
    if (!showsPad || step === undefined) return
    // The demo steps back (fainter) while you are doing it yourself.
    ctx.save()
    ctx.globalAlpha = doing ? 0.35 : 1
    demo(ctx, pad, step.demo, this.now)
    ctx.restore()
  }
}

const PANEL_H = 55

/** The lesson's backing: a dark plate as wide as its longest line, so the step reads as one block apart from the room. */
const plate = (ctx: CanvasRenderingContext2D, x: number, top: number, lines: ReadonlyArray<string>): void => {
  ctx.save()
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const w = Math.max(110, ...lines.map((l) => Math.ceil(ctx.measureText(l).width))) + 20
  const left = Math.round(x - w / 2)
  ctx.fillStyle = INK; ctx.fillRect(left - 1, top - 1, w + 2, PANEL_H + 2)
  ctx.fillStyle = "rgba(41, 51, 75, 0.92)"; ctx.fillRect(left, top, w, PANEL_H)
  ctx.fillStyle = "#465477"; ctx.fillRect(left, top, w, 1)
  ctx.restore()
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
