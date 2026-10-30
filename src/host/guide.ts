/**
 * The Blade's and First Cut's guides, in the style of First Step's drill: one big caption at a time, placed where it
 * covers neither you nor what it is about, each step waiting until you have done it, and the thumb let through only
 * as far as the step asks.
 *
 * The Blade (the clock): free hands; turn the blade a full turn by moving about (the door to the exit opens then: a
 * ring round the blade fills as it turns), then get past it. First Cut (the cut):
 * that's an enemy, walk into it to cut; while a shot is in the air, the red line is the shot: step out of it.
 */
import { ROOMS } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"
import { TUNING } from "../sim/tuning.ts"
import { buzz, caption, zoneOf, type Zone } from "./drill.ts"
import { SQUASH, type Project, type Stick } from "./draw.ts"
import { pixelArc } from "./pixels.ts"

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

const INK = "#171c2e", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda", RED = "#ff6845"
const bladeOf = (room: number): { readonly x: number; readonly y: number; readonly length: number } | null => {
  for (const hz of ROOMS[room]?.hazards ?? []) if (hz.kind === "blade") return hz
  return null
}

/** Seconds of world time the room's time door waits for, or 0. */
const opensAfter = (view: FightView): number => {
  for (const d of view.doors) if (d.lock.kind === "time") return d.lock.seconds
  return 0
}
const pastBlade = (s: Sense): boolean => { const b = bladeOf(1); return b !== null && s.view.player !== null && s.view.player.y < b.y - b.length - 0.4 }

// Free hands, two captions: first turn the blade a full turn by moving about (the door to the exit stays shut until
// then, and a ring round the blade fills as it turns), then get past it. Moving is the clock, before it is the danger.
const BLADE: ReadonlyArray<Step> = [
  {
    title: (s) => (s.speed > 0.15 ? "KEEP MOVING" : "TURN THE BLADE"), sub: () => "MOVE: TIME RUNS",
    colour: (s) => (s.speed > 0.15 ? GOLD : WHITE),
    gate: () => true, ok: (s) => s.view.world >= opensAfter(s.view), need: 0
  },
  { title: () => "NOW GET PAST IT", sub: () => "STOP, LOOK, GO", gate: () => true, ok: pastBlade, need: 0 }
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
    // What the caption must not cover: you, the blade, the enemy.
    const avoid: Array<{ top: number; bottom: number }> = []
    const me = P(view.player!.x, view.player!.y)
    avoid.push({ top: me.y - 34, bottom: me.y + 8 })
    const blade = bladeOf(this.room)
    if (blade !== null) {
      const hub = P(blade.x, blade.y, 0.45), r = Math.round(blade.length * cw / 10)
      avoid.push({ top: hub.y - r * 0.6 - 6, bottom: hub.y + r * 0.6 + 6 })
      // While the exit waits on the blade, a gold ring round it fills as it turns (with the world clock).
      const after = opensAfter(view)
      if (this.room === 1 && after > 0 && this.step === 0) turnRing(ctx, P(blade.x, blade.y), r, Math.min(1, view.world / after))
    }
    for (const e of view.enemies) { const at = P(e.x, e.y); avoid.push({ top: at.y - 34, bottom: at.y + 8 }) }
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

/** A ring round the blade's sweep, filling clockwise from the top: how far it has turned. */
const turnRing = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, r: number, k: number): void => {
  const rx = r + 6, ry = Math.round((r + 6) * SQUASH)
  pixelArc(ctx, at, rx, ry, 0, Math.PI * 2, "#29334b", 3)
  if (k <= 0) return
  const end = -Math.PI / 2 + Math.PI * 2 * k
  pixelArc(ctx, at, rx, ry, -Math.PI / 2, end, INK, 4)
  pixelArc(ctx, at, rx, ry, -Math.PI / 2, end, GOLD, 2)
}
