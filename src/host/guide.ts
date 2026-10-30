/**
 * The guides of Time Door and First Cut, in the style of First Step's drill: one big caption at a time, placed where
 * it covers neither you nor what it is about, each step waiting until you have done it, and the thumb let through
 * only as far as the step asks.
 *
 * Time Door (the clock): move about and the door's clock runs; at half time your thumb is held (the clock stops)
 * until you let go and watch it stand still; then move again to open it. First Cut (the cut): get close, walk into
 * the ring (its gunner never fires); as it falls, "CUT!" over it, and the guide's "got it" stays through the clear.
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
/** The room's time door: its seconds, and whether it is open. */
const timeDoor = (view: FightView): { readonly seconds: number; readonly open: boolean } | null => {
  for (const d of view.doors) if (d.lock.kind === "time") return { seconds: d.lock.seconds, open: d.open }
  return null
}

// Time Door: move and the door's clock runs; at half time the thumb is held (time freezes) until you let go and watch
// the clock stand still; then move again to finish it. (Left to itself, people ran into the door and it opened
// without their noticing why.)
const DOOR: ReadonlyArray<Step> = [
  {
    title: (s) => (s.speed > 0.15 ? "KEEP MOVING" : "MOVE AROUND"), sub: () => "THE DOOR'S CLOCK RUNS",
    colour: (s) => (s.speed > 0.15 ? GOLD : WHITE),
    gate: () => true,
    ok: (s) => s.view.world >= (timeDoor(s.view)?.seconds ?? 0) / 2, need: 0
  },
  {
    title: () => "NOW LET GO", sub: (s) => (s.down ? "LIFT YOUR THUMB" : "WATCH THE CLOCK"),
    gate: () => false,
    ok: (s) => !s.down, need: 1.4
  },
  {
    title: (s) => (s.speed > 0.15 ? "IT RUNS AGAIN" : "IT STOPPED WITH YOU"), sub: () => "MOVE TO OPEN IT",
    colour: (s) => (s.speed > 0.15 ? GOLD : WHITE),
    gate: () => true,
    ok: (s) => timeDoor(s.view)?.open === true, need: 0
  }
]

// The gunner never fires here: the one thing to learn is to get close. (The caption turns gold once you are moving in.)
const CUT: ReadonlyArray<Step> = [
  {
    title: () => "GET CLOSE", sub: () => "WALK INTO THE RING",
    colour: (s) => (s.speed > 0.15 ? GOLD : WHITE),
    gate: () => true,
    ok: (s) => s.view.enemies.length === 0, need: 0
  }
]
const stepsFor = (room: number): ReadonlyArray<Step> => (room === 1 ? DOOR : room === 2 ? CUT : [])
const DONE: Record<number, readonly [string, string]> = { 1: ["GOT IT!", "STILL = TIME STOPS"], 2: ["GOT IT!", "CLOSE = CUT"] }
const DONE_LIFE = 2.2
/** How long the "CUT!" over a fallen target lasts (real s). */
const CUT_LIFE = 1.4

export class Guide {
  private room = -1
  private player = -1
  private step = 0
  private held = 0
  private now = 0
  private doneAt = -1
  /** Where the caption sat last frame (canvas px). */
  private labelY: number | null = null
  /** The last enemy's place while it stands, and where (and when) it fell to your cut. */
  private target: { x: number; y: number } | null = null
  private cut: { x: number; y: number; at: number } | null = null

  private sense(view: FightView, input: GuideInput): Sense {
    const p = view.player
    return { ...input, zone: zoneOf(input.stick), speed: p === null ? 0 : Math.hypot(p.vx, p.vy) / TUNING.player.speed, view }
  }

  /** Whether the thumb reaches the game now (always, outside the guided rooms and once a guide is done). */
  gate(view: FightView, input: GuideInput): boolean {
    const step = stepsFor(view.room.index)[this.step]
    const sense = this.sense(view, input)
    return step === undefined || view.flow !== "playing" || step.gate(sense)
  }

  update(dt: number, view: FightView, input: GuideInput): void {
    this.now += dt
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.index; this.player = id
      this.step = 0; this.held = 0; this.doneAt = -1; this.labelY = null; this.target = null; this.cut = null
    }
    const steps = stepsFor(this.room)
    const step = steps[this.step]
    const sense = this.sense(view, input)
    const last = view.enemies[0]
    if (last !== undefined) this.target = { x: last.x, y: last.y }
    // The last step can finish on the very step the room clears (the cut ends First Cut): read it then too.
    if (step === undefined || (view.flow !== "playing" && view.flow !== "cleared" && view.flow !== "won")) return
    if (!step.ok(sense)) return
    this.held += dt
    if (this.held < step.need) return
    this.step++; this.held = 0
    buzz(this.step >= steps.length ? 60 : 40)
    if (this.step >= steps.length) {
      this.doneAt = this.now
      if (this.room === 2 && this.target !== null) this.cut = { ...this.target, at: this.now }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: GuideInput): void {
    const steps = stepsFor(this.room)
    if (steps.length === 0) return
    // Over a fallen target, a big "CUT!" for a moment: what just happened (it shows through the clear, too).
    if (this.cut !== null && this.now - this.cut.at < CUT_LIFE) cutBurst(ctx, P(this.cut.x, this.cut.y), (this.now - this.cut.at) / CUT_LIFE)
    // The guide speaks while you play, and its "got it" stays through the room's clear.
    const ended = view.flow === "cleared" || view.flow === "won"
    if (view.flow !== "playing" && !(ended && this.doneAt >= 0)) return
    const step = steps[this.step]
    const sense = this.sense(view, input)
    const x = Math.round(cw / 2)
    // What the caption must not cover: you, the enemy, a time door's timer.
    const avoid: Array<{ top: number; bottom: number }> = []
    if (view.player !== null) { const me = P(view.player.x, view.player.y); avoid.push({ top: me.y - 34, bottom: me.y + 8 }) }
    for (const d of view.doors) {
      if (d.open || d.lock.kind !== "time") continue
      avoid.push({ top: P(d.x, d.y).y - 44, bottom: P(d.x, d.y + d.h).y + 4 })
    }
    // (An enemy with the gold ring round it at touching range: clear of the whole ring.)
    for (const e of view.enemies) { const at = P(e.x, e.y); avoid.push({ top: at.y - 34, bottom: at.y + 30 }) }
    const fits = (y: number): boolean => avoid.every((a) => y + 44 < a.top || y - 12 > a.bottom)
    // It stays put while it still fits (no jumping as you walk), else takes the highest spot that does.
    const spots = Array.from({ length: 34 }, (_, i) => Math.round(ch * (0.14 + i * 0.02)))
    // (Once the room is cleared, its panel comes up from the bottom: the "got it" waits above it.)
    const labelY = ended ? Math.round(ch * 0.4) : this.labelY !== null && fits(this.labelY) ? this.labelY : spots.find(fits) ?? Math.round(ch * 0.2)
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

/** "CUT!" over where the target fell: popping in big and gold, rising and fading. */
const cutBurst = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, k: number): void => {
  ctx.save()
  ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"
  ctx.font = "700 16px Silkscreen, ui-monospace, monospace"
  const x = Math.round(at.x), y = Math.round(at.y - 30 - k * 14)
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [0, 2]] as const) ctx.fillText("CUT!", x + dx, y + dy)
  ctx.fillStyle = k < 0.12 ? WHITE : GOLD; ctx.fillText("CUT!", x, y)
  ctx.restore()
}
