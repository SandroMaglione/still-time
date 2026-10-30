/**
 * The guides of the first rooms in your hands: one small caption at a time, placed where it covers neither you nor
 * what it is about, each step waiting until you have done it. The words only name what the room is already showing
 * (the rule itself is the Prologue's, a cutscene: see `intro.ts`).
 *
 * Crossing (the first room in your hands): a hand shows the gesture, the hold as plainly as the slide ("press
 * anywhere / and hold", "now slide / and keep holding", "you're moving / keep holding"); then "now let go / watch the bolts" until you have stood a moment ("they stopped / with you");
 * then "they hang. look. / cross between them". Time Door
 * (the clock): the door ("the door opens with time"; "it waits for you" while you stand at it; "it takes time to
 * open" over its timer), then "nothing moves / until you do" along the clockwork stretch. First Cut (the cut): "get close / walk into the ring" to the first gunner (none fire); its door opens
 * on two more; each one cut pops "CUT!" over it. Each guide's "got it" stays through the room's clear.
 */
import { TUNING } from "../sim/tuning.ts"
import type { FightView } from "../sim/view.ts"
import { hand, thumbPad, type Project, type Stick } from "./draw.ts"
import { pixelArc } from "./pixels.ts"

export interface GuideInput {
  readonly stick: Stick | null
  readonly keys: boolean
  /** A finger or a direction key is down. */
  readonly down: boolean
}

interface Sense extends GuideInput {
  /** Your speed, 0..1 of top speed. */
  readonly speed: number
  readonly view: FightView
}

interface Step {
  readonly title: (s: Sense) => string
  readonly sub: (s: Sense) => string
  /** The caption's colour (white unless the step says otherwise). */
  readonly colour?: (s: Sense) => string
  /** The step is done once this has held for `need` real seconds (added up while it holds). */
  readonly ok: (s: Sense) => boolean
  readonly need: number
  /** Whether a hand shows the gesture on screen (press, then slide) while this step waits. */
  readonly demo?: (s: Sense) => boolean
}

const INK = "#171c2e", ICE = "#7fd8ff", GOLD = "#edc66c", GREEN = "#7dff9a", WHITE = "#f4efda"
const moving = (s: Sense): boolean => s.speed > 0.15
/** Walking at all, however slowly (a small slide counts). */
const walking = (s: Sense): boolean => s.speed > 0.01
const ended = (s: Sense): boolean => s.view.flow === "cleared" || s.view.flow === "won"
/** Every time door open. */
const doorsOpen = (s: Sense): boolean => s.view.doors.every((d) => d.lock.kind !== "time" || d.open)
/** At a shut door (within a couple of metres of its face). */
const atShutDoor = (s: Sense): boolean => s.view.player !== null && s.view.doors.some((d) => !d.open && Math.abs(s.view.player!.y - (d.y + d.h)) < 2.2)

// Crossing: two streams of bolts across the hall; they fly while you walk and hang while you stand.
const CROSSING: ReadonlyArray<Step> = [
  {
    // The gesture itself, shown by a hand: press anywhere and hold, then slide. Done once you have walked a moment.
    title: (s) => (s.keys ? "HOLD AN ARROW" : walking(s) ? "YOU'RE MOVING" : s.down ? "NOW SLIDE" : "PRESS ANYWHERE"),
    sub: (s) => (s.keys ? "TO MOVE" : walking(s) ? "KEEP HOLDING" : s.down ? "AND KEEP HOLDING" : "AND HOLD"),
    colour: (s) => (walking(s) ? GOLD : WHITE),
    demo: (s) => !s.keys && !walking(s),
    ok: walking, need: 0.5
  },
  {
    // Then letting go: you stop, and so does everything.
    title: (s) => (walking(s) || s.down ? "NOW LET GO" : "THEY STOPPED"), sub: (s) => (walking(s) || s.down ? "WATCH THE BOLTS" : "WITH YOU"),
    colour: (s) => (walking(s) || s.down ? WHITE : ICE),
    ok: (s) => !s.down && s.speed < 0.02, need: 1.2
  },
  {
    title: (s) => (moving(s) ? "THEY FLY WITH YOU" : "THEY HANG. LOOK."), sub: (s) => (moving(s) ? "LET GO: THEY STOP" : "CROSS BETWEEN THEM"),
    colour: (s) => (moving(s) ? GOLD : ICE),
    ok: (s) => s.view.player !== null && s.view.player.y < 8.5, need: 0
  },
  {
    title: () => "YOU CHOOSE WHEN", sub: () => "REACH THE EXIT",
    colour: (s) => (moving(s) ? GOLD : WHITE),
    ok: ended, need: 0
  }
]

// Time Door: first the door, whose portcullis rises only as time runs (only while you move); then the clockwork
// stretch: nothing moves until you do, and everything moves when you walk.
const DOOR: ReadonlyArray<Step> = [
  {
    title: (s) => (atShutDoor(s) && !moving(s) ? "IT WAITS FOR YOU" : "THE DOOR OPENS WITH TIME"),
    sub: (s) => (moving(s) ? "KEEP MOVING" : "MOVE: TIME RUNS"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    ok: doorsOpen, need: 0
  },
  {
    title: (s) => (moving(s) ? "EVERYTHING MOVES" : "NOTHING MOVES"), sub: (s) => (moving(s) ? "WITH YOU" : "UNTIL YOU DO"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    ok: ended, need: 0
  }
]

// The gunners never fire here: the one thing to learn is to get close. One in the first chamber; its door then opens
// on two more.
const CUT: ReadonlyArray<Step> = [
  {
    title: () => "GET CLOSE", sub: () => "WALK INTO THE RING",
    colour: (s) => (moving(s) ? GOLD : WHITE),
    ok: (s) => s.view.doors.every((d) => d.open), need: 0
  },
  {
    title: () => "GET CLOSE TO HIT", sub: (s) => (s.view.enemies.length > 1 ? `${s.view.enemies.length} MORE INSIDE` : "ONE MORE"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    ok: (s) => s.view.enemies.length === 0, need: 0
  }
]
/** The guided rooms, by name: their steps and the "got it" that stays through the clear. */
const GUIDES: Record<string, { readonly steps: ReadonlyArray<Step>; readonly done: readonly [string, string] }> = {
  "Crossing": { steps: CROSSING, done: ["GOT IT!", "YOU CHOOSE WHEN"] },
  "Time Door": { steps: DOOR, done: ["GOT IT!", "YOU MOVE, TIME MOVES"] },
  "First Cut": { steps: CUT, done: ["GOT IT!", "CLOSE = CUT"] }
}
const stepsFor = (room: string): ReadonlyArray<Step> => GUIDES[room]?.steps ?? []
const DONE_LIFE = 2.2
/** How long the "CUT!" over a fallen target lasts (real s). */
const CUT_LIFE = 1.4

/** A short buzz where the phone can (Android browsers; iOS ignores it). */
export const buzz = (ms: number): void => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms)
}

export class Guide {
  private room = ""
  private player = -1
  private step = 0
  private held = 0
  private now = 0
  private doneAt = -1
  /** Where the caption sat last frame (canvas px). */
  private labelY: number | null = null
  /** Each enemy's place while it stands, and where (and when) each fell to your cut. */
  private standing = new Map<number, { x: number; y: number }>()
  private cuts: Array<{ x: number; y: number; at: number }> = []

  private sense(view: FightView, input: GuideInput): Sense {
    const p = view.player
    return { ...input, speed: p === null ? 0 : Math.hypot(p.vx, p.vy) / TUNING.player.speed, view }
  }

  update(dt: number, view: FightView, input: GuideInput): void {
    this.now += dt
    const id = view.player?.id ?? -1
    if (view.room.name !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.name; this.player = id
      this.step = 0; this.held = 0; this.doneAt = -1; this.labelY = null; this.standing.clear(); this.cuts = []
    }
    const steps = stepsFor(this.room)
    const step = steps[this.step]
    const sense = this.sense(view, input)
    // First Cut: whoever has gone since last time fell to your cut.
    if (this.room === "First Cut") {
      const now = new Set(view.enemies.map((e) => e.id))
      for (const [id, at] of this.standing) if (!now.has(id)) this.cuts.push({ ...at, at: this.now })
      this.standing = new Map(view.enemies.map((e) => [e.id, { x: e.x, y: e.y }]))
    }
    // The last step can finish on the very step the room clears (the cut ends First Cut): read it then too.
    if (step === undefined || (view.flow !== "playing" && view.flow !== "cleared" && view.flow !== "won")) return
    if (!step.ok(sense)) return
    this.held += dt
    if (this.held < step.need) return
    this.step++; this.held = 0
    buzz(this.step >= steps.length ? 60 : 40)
    if (this.step >= steps.length) this.doneAt = this.now
  }

  /** Draws the guide; with `captions` off (the title's attract loop, where the logo sits), only its marks on the floor. */
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: GuideInput, captions = true): void {
    const guide = GUIDES[this.room]
    if (guide === undefined || view.room.name !== this.room) return
    const steps = guide.steps
    // Over a fallen target, a big "CUT!" for a moment: what just happened (it shows through the clear, too).
    for (const c of this.cuts) if (this.now - c.at < CUT_LIFE) cutBurst(ctx, P(c.x, c.y), (this.now - c.at) / CUT_LIFE)
    if (!captions) return
    // The guide speaks while you play, and its "got it" stays through the room's clear.
    const over = view.flow === "cleared" || view.flow === "won"
    if (view.flow !== "playing" && !(over && this.doneAt >= 0)) return
    const step = steps[this.step]
    const sense = this.sense(view, input)
    const x = Math.round(cw / 2)
    // What the caption must not cover: you, a shot, the enemy, a time door's timer.
    const avoid: Array<{ top: number; bottom: number }> = []
    if (view.player !== null) { const me = P(view.player.x, view.player.y); avoid.push({ top: me.y - 60, bottom: me.y + 8 }) }
    for (const s of view.shots) { const at = P(s.x, s.y); avoid.push({ top: at.y - 20, bottom: at.y + 16 }) }
    for (const d of view.doors) {
      if (d.open || d.lock.kind !== "time") continue
      avoid.push({ top: P(d.x, d.y).y - 44, bottom: P(d.x, d.y + d.h).y + 16 })
    }
    // (An enemy with the gold ring round it at touching range: clear of the whole ring.)
    for (const e of view.enemies) { const at = P(e.x, e.y); avoid.push({ top: at.y - 34, bottom: at.y + 30 }) }
    const fits = (y: number): boolean => avoid.every((a) => y + CAPTION_H < a.top || y - 6 > a.bottom)
    // It stays put while it still fits (no jumping as you walk), else takes the highest spot that does.
    // (From under the room's goal banner down.)
    const spots = Array.from({ length: 32 }, (_, i) => Math.round(ch * (0.19 + i * 0.02)))
    // (Once the room is cleared, its panel comes up from the bottom: the "got it" waits above it.)
    const labelY = over ? Math.round(ch * 0.4) : this.labelY !== null && fits(this.labelY) ? this.labelY : spots.find(fits) ?? Math.round(ch * 0.2)
    this.labelY = labelY
    if (step === undefined) {
      const age = this.now - this.doneAt
      if (this.doneAt >= 0 && age < DONE_LIFE) caption(ctx, x, labelY, guide.done[0], guide.done[1], GREEN)
      return
    }
    caption(ctx, x, labelY, step.title(sense), step.sub(sense), step.colour?.(sense) ?? WHITE)
    // The gesture, shown: off to the side of you, low on the screen where the thumb is.
    if (step.demo?.(sense) === true) gesture(ctx, Math.round(cw / 2) + 64, ch - 62, this.now, sense.down)
    // The step's progress, as a thin bar under the caption.
    if (step.need > 0) {
      const w = 60, left = x - w / 2, y = labelY + 24
      ctx.fillStyle = INK; ctx.fillRect(left - 1, y - 1, w + 2, 5)
      ctx.fillStyle = "#29334b"; ctx.fillRect(left, y, w, 3)
      ctx.fillStyle = GOLD; ctx.fillRect(left, y, Math.round(w * Math.min(1, this.held / step.need)), 3)
    }
  }
}

/** Hint-size (8 px) text, centred, outlined. */
const smallText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string): void => {
  ctx.save()
  ctx.textAlign = "center"; ctx.textBaseline = "top"
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText(text, Math.round(x) + dx, Math.round(y) + dy)
  ctx.fillStyle = colour; ctx.fillText(text, Math.round(x), Math.round(y))
  ctx.restore()
}

/** Caption height in canvas px, from `y - 4`. (Small, so it never takes over the screen: playtesters found the big one did.) */
const CAPTION_H = 24

/** What to do, and what it does, small, on a plate (from `y - 4` to `y + 20`). */
export const caption = (ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string, colour: string): void => {
  ctx.save()
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const w = Math.max(Math.ceil(ctx.measureText(title).width), Math.ceil(ctx.measureText(sub).width)) + 14
  const left = Math.round(x - w / 2), top = y - 4
  ctx.fillStyle = INK; ctx.fillRect(left - 1, top - 1, w + 2, CAPTION_H + 2)
  ctx.fillStyle = "rgba(41, 51, 75, 0.88)"; ctx.fillRect(left, top, w, CAPTION_H)
  ctx.restore()
  smallText(ctx, title, x, y, colour)
  smallText(ctx, sub, x, y + 10, ICE)
}

/**
 * A hand showing the gesture, on a loop, so the hold reads as plainly as the slide: it comes down and presses (the
 * stick's ring appears), stays pressed while a ring fills round its fingertip under "HOLD", slides up and stays there
 * (still held, the ring full, "KEEP HOLDING"), then lifts. Once a finger is down, the loop starts from the slide.
 */
const gesture = (ctx: CanvasRenderingContext2D, x: number, y: number, now: number, down: boolean): void => {
  // Beats (s): come down, press and hold, slide, keep holding, lift.
  const DOWN = 0.4, HOLD = 1.1, SLIDE = 0.7, KEEP = 1.1, LIFT = 0.4
  const loop = (down ? 0 : DOWN + HOLD) + SLIDE + KEEP + LIFT
  let t = now % loop
  if (down) t += DOWN + HOLD
  const pressed = t >= DOWN && t < DOWN + HOLD + SLIDE + KEEP
  const holding = t >= DOWN && t < DOWN + HOLD
  const slid = Math.max(0, Math.min(1, (t - DOWN - HOLD) / SLIDE))
  const knob = { x, y: Math.round(y - 30 * slid) }
  ctx.save()
  ctx.globalAlpha = t > loop - LIFT ? Math.max(0, 1 - (t - (loop - LIFT)) / LIFT) : 0.92
  if (pressed) thumbPad(ctx, { x, y }, knob, 22)
  // The hold, shown: a ring filling round the fingertip, and the word.
  if (holding) {
    const k = (t - DOWN) / HOLD
    const end = -Math.PI / 2 + Math.PI * 2 * k
    pixelArc(ctx, knob, 11, 11, -Math.PI / 2, end, INK, 3)
    pixelArc(ctx, knob, 11, 11, -Math.PI / 2, end, GOLD, 1)
  }
  if (pressed) smallText(ctx, holding ? "HOLD" : slid < 1 ? "SLIDE" : "KEEP HOLDING", x, y + 26, holding || slid >= 1 ? GOLD : WHITE)
  hand(ctx, knob.x, knob.y + 2 - (pressed ? 0 : 6), pressed)
  ctx.restore()
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
