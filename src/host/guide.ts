/**
 * The Blade's and First Cut's guides, in the style of First Step's drill: one big caption at a time, placed where it
 * covers neither you nor what it is about, each step waiting until you have done it, and the thumb let through only
 * as far as the step asks.
 *
 * The Blade (the clock): look at the blade (you cannot move yet: it waits for you); slide up a little (a walk only:
 * it turns); let go (it stops with you); then cross when it is open, free. First Cut (the cut): that's an enemy,
 * walk into it to cut; while a shot is in the air, the red line is the shot: step out of it.
 */
import { ROOMS } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { TUNING } from "../sim/tuning.ts"
import { buzz, caption, zoneOf, type Zone } from "./drill.ts"
import type { Project, Stick } from "./draw.ts"
import { pixelLine } from "./pixels.ts"

export interface GuideInput {
  readonly stick: Stick | null
  readonly keys: boolean
  /** Keys: only the up key is held. */
  readonly upOnly: boolean
  /** A finger or a direction key is down. */
  readonly down: boolean
}

interface Sense extends GuideInput {
  readonly zone: Zone
  /** Your speed, 0..1 of top speed. */
  readonly speed: number
  readonly view: FightView
}

interface Step {
  readonly title: (s: Sense) => string
  readonly sub: (s: Sense) => string
  /** The caption's colour (white unless the step says otherwise). */
  readonly colour?: (s: Sense) => string
  /** Whether the thumb reaches the game on this step. */
  readonly gate: (s: Sense) => boolean
  /** The step is done once this has held for `need` real seconds (added up while it holds). */
  readonly ok: (s: Sense) => boolean
  readonly need: number
  /** Brackets round the blade while this step is about it. */
  readonly markBlade?: boolean
}

const INK = "#171c2e", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda", RED = "#ff6845"
const still = (s: Sense): boolean => s.speed < 0.05
const moving = (s: Sense): boolean => s.speed > 0.15
const bladeOf = (room: number): { readonly x: number; readonly y: number; readonly length: number } | null => {
  for (const hz of ROOMS[room]?.hazards ?? []) if (hz.kind === "blade") return hz
  return null
}

const BLADE: ReadonlyArray<Step> = [
  { title: () => "LOOK AT THE BLADE", sub: () => "IT WAITS FOR YOU", gate: () => false, ok: still, need: 1.6, markBlade: true },
  {
    // Slid too far (a run), the walk-only step lets nothing through: say so, in red, rather than stand still.
    title: (s) => s.keys ? "HOLD UP ARROW" : s.zone === "walk" ? "HOLD IT THERE" : s.zone === "run" ? "TOO FAR" : "SLIDE UP A LITTLE",
    sub: (s) => (!s.keys && s.zone === "run" ? "SLIDE LESS: A LITTLE" : "THE BLADE TURNS"),
    colour: (s) => (!s.keys && s.zone === "run" ? RED : moving(s) ? GOLD : WHITE),
    gate: (s) => (s.keys ? s.upOnly : s.zone === "walk"),
    ok: moving, need: 1, markBlade: true
  },
  { title: () => "LET GO", sub: () => "IT STOPS WITH YOU", gate: () => false, ok: (s) => !s.down && still(s), need: 0.8, markBlade: true },
  {
    title: () => "CROSS WHEN IT'S OPEN", sub: () => "MOVE, STOP, LOOK",
    gate: () => true,
    ok: (s) => { const b = bladeOf(1); return b !== null && s.view.player !== null && s.view.player.y < b.y - b.length - 0.4 }, need: 0
  }
]
const CUT: ReadonlyArray<Step> = [
  {
    title: (s) => (s.view.shots.length > 0 ? "RED LINE: A SHOT" : "THAT'S AN ENEMY"),
    sub: (s) => (s.view.shots.length > 0 ? "STEP OUT OF IT" : "WALK INTO IT TO CUT"),
    colour: (s) => (s.view.shots.length > 0 ? RED : WHITE),
    gate: () => true,
    ok: (s) => s.view.enemies.length === 0, need: 0
  }
]
const stepsFor = (room: number): ReadonlyArray<Step> => (room === 1 ? BLADE : room === 2 ? CUT : [])
const DONE: Record<number, readonly [string, string]> = { 1: ["GOT IT!", "STILL: TIME STOPS"], 2: ["GOT IT!", "TOUCH = CUT"] }
const DONE_LIFE = 2.2

export class Guide {
  private room = -1
  private player = -1
  private step = 0
  private held = 0
  private now = 0
  private doneAt = -1

  private sense(view: FightView, input: GuideInput): Sense | null {
    const p = view.player
    if (p === null) return null
    return { ...input, zone: zoneOf(input.stick), speed: Math.hypot(p.vx, p.vy) / TUNING.player.speed, view }
  }

  /** Whether the thumb reaches the game now (always, outside the guided rooms and once a guide is done). */
  gate(view: FightView, input: GuideInput): boolean {
    const step = stepsFor(view.room.index)[this.step]
    const sense = this.sense(view, input)
    return step === undefined || sense === null || view.flow !== "playing" || step.gate(sense)
  }

  update(dt: number, view: FightView, input: GuideInput): void {
    this.now += dt
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.index; this.player = id
      this.step = 0; this.held = 0; this.doneAt = -1
    }
    const steps = stepsFor(this.room)
    const step = steps[this.step]
    const sense = this.sense(view, input)
    if (step === undefined || sense === null || view.flow !== "playing") return
    if (!step.ok(sense)) return
    this.held += dt
    if (this.held < step.need) return
    this.step++; this.held = 0
    buzz(this.step >= steps.length ? 60 : 40)
    if (this.step >= steps.length) this.doneAt = this.now
  }

  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: GuideInput): void {
    if (view.flow !== "playing") return
    const steps = stepsFor(this.room)
    if (steps.length === 0) return
    const step = steps[this.step]
    const sense = this.sense(view, input)
    if (sense === null) return
    const x = Math.round(cw / 2)
    // What the caption must not cover: you, the blade, the enemy.
    const avoid: Array<{ top: number; bottom: number }> = []
    const me = P(view.player!.x, view.player!.y)
    avoid.push({ top: me.y - 34, bottom: me.y + 8 })
    const blade = bladeOf(this.room)
    if (blade !== null) {
      const hub = P(blade.x, blade.y, 0.45), r = Math.round(blade.length * cw / 10)
      avoid.push({ top: hub.y - r * 0.6 - 6, bottom: hub.y + r * 0.6 + 6 })
      if (step?.markBlade === true) brackets(ctx, hub, r, Math.floor(this.now * 4) % 2)
    }
    for (const e of view.enemies) { const at = P(e.x, e.y); avoid.push({ top: at.y - 34, bottom: at.y + 8 }) }
    const fits = (y: number): boolean => avoid.every((a) => y + 44 < a.top || y - 12 > a.bottom)
    const labelY = [0.2, 0.36, 0.52, 0.68].map((k) => Math.round(ch * k)).find(fits) ?? Math.round(ch * 0.2)
    if (step === undefined) {
      const age = this.now - this.doneAt
      const done = DONE[this.room]
      if (this.doneAt >= 0 && age < DONE_LIFE && done !== undefined) caption(ctx, x, labelY, done[0], done[1], GREEN)
      return
    }
    caption(ctx, x, labelY, step.title(sense), step.sub(sense), step.colour?.(sense) ?? WHITE)
    // The step's progress, as a thin bar under the caption.
    if (step.need > 0) {
      const w = 80, left = x - w / 2, y = labelY + 46
      ctx.fillStyle = INK; ctx.fillRect(left - 1, y - 1, w + 2, 5)
      ctx.fillStyle = "#29334b"; ctx.fillRect(left, y, w, 3)
      ctx.fillStyle = GOLD; ctx.fillRect(left, y, Math.round(w * Math.min(1, this.held / step.need)), 3)
    }
  }
}

/** Gold corner brackets round something, breathing by a pixel. */
const brackets = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, r: number, pulse: number): void => {
  const half = r + 4 + pulse, vert = Math.round(r * 0.6) + 4 + pulse
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = Math.round(at.x + sx * half), cy = Math.round(at.y + sy * vert)
    for (const [colour, width] of [[INK, 3], [GOLD, 1]] as const) {
      pixelLine(ctx, { x: cx, y: cy }, { x: cx - sx * 6, y: cy }, colour, width)
      pixelLine(ctx, { x: cx, y: cy }, { x: cx, y: cy - sy * 6 }, colour, width)
    }
  }
}
