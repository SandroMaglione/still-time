/**
 * First Cut's guide, in the style of First Step's drill: one big caption at a time, placed where it covers neither
 * you nor the enemy, each step waiting until you have done it, and the thumb let through only as far as the step
 * asks: get close, touch it to cut (its gunner never fires: getting close is the whole lesson).
 * (Time Door has no words: the timer on its door, running only while you move, is the lesson.)
 */
import type { FightView } from "../sim/view.ts"
import { TUNING } from "../sim/tuning.ts"
import { buzz, caption, zoneOf, type Zone } from "./drill.ts"
import type { Project, Stick } from "./draw.ts"

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
}

const INK = "#171c2e", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda"
// The gunner never fires here: the one thing to learn is to get close. (The caption turns gold once you are moving in.)
const CUT: ReadonlyArray<Step> = [
  {
    title: () => "GET CLOSE", sub: () => "TOUCH IT TO CUT",
    colour: (s) => (s.speed > 0.15 ? GOLD : WHITE),
    gate: () => true,
    ok: (s) => s.view.enemies.length === 0, need: 0
  }
]
const stepsFor = (room: number): ReadonlyArray<Step> => (room === 2 ? CUT : [])
const DONE: Record<number, readonly [string, string]> = { 2: ["GOT IT!", "CLOSE = CUT"] }
const DONE_LIFE = 2.2

export class Guide {
  private room = -1
  private player = -1
  private step = 0
  private held = 0
  private now = 0
  private doneAt = -1
  /** Where the caption sat last frame (canvas px). */
  private labelY: number | null = null

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
      this.step = 0; this.held = 0; this.doneAt = -1; this.labelY = null
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
    // What the caption must not cover: you, the enemy.
    const avoid: Array<{ top: number; bottom: number }> = []
    const me = P(view.player!.x, view.player!.y)
    avoid.push({ top: me.y - 34, bottom: me.y + 8 })
    // (An enemy with the gold ring round it at touching range: clear of the whole ring.)
    for (const e of view.enemies) { const at = P(e.x, e.y); avoid.push({ top: at.y - 34, bottom: at.y + 30 }) }
    const fits = (y: number): boolean => avoid.every((a) => y + 44 < a.top || y - 12 > a.bottom)
    // It stays put while it still fits (no jumping as you walk), else takes the highest spot that does.
    const spots = Array.from({ length: 34 }, (_, i) => Math.round(ch * (0.14 + i * 0.02)))
    const labelY = this.labelY !== null && fits(this.labelY) ? this.labelY : spots.find(fits) ?? Math.round(ch * 0.2)
    this.labelY = labelY
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
