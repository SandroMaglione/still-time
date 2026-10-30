/**
 * The guides of Point Blank, Time Door and First Cut, in the style of First Step's drill: one big caption at a time,
 * placed where it covers neither you nor what it is about, each step waiting until you have done it.
 *
 * Point Blank (the stop): the room opens on a bullet a few steps off, frozen: "it's frozen / until you move"; moving,
 * "it moves with you / let go: it stops". Past it, the lanes: "bullets wait for you". Hit, the caption says why.
 *
 * Time Door (the clock): along a stretch of lanterns and wheels, "nothing moves / until you do", then "everything
 * moves / with you"; then three doors whose portcullises rise only as time runs ("doors open with time"; "it waits for
 * you" while you stand at one). First Cut (the cut): "get close / walk into the ring" to the first gunner (none fire);
 * its door opens on two more, "get close to hit"; each one cut pops "CUT!" over it, and the guide's "got it" stays
 * through the clear.
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
const moving = (s: Sense): boolean => s.speed > 0.15
/** Past the clockwork stretch of Time Door's corridor (before its first door). */
const pastDecor = (s: Sense): boolean => s.view.player !== null && s.view.player.y < 25.5
/** Every time door open. */
const doorsOpen = (s: Sense): boolean => s.view.doors.every((d) => d.lock.kind !== "time" || d.open)
/** At a shut door (within a couple of metres of its face). */
const atShutDoor = (s: Sense): boolean => s.view.player !== null && s.view.doors.some((d) => !d.open && Math.abs(s.view.player!.y - (d.y + d.h)) < 2.2)

// Point Blank: the first bullet is in the air when the room opens; nothing about it moves until you do.
const BLANK: ReadonlyArray<Step> = [
  {
    title: (s) => (moving(s) ? "IT MOVES WITH YOU" : "IT'S FROZEN"), sub: (s) => (moving(s) ? "LET GO: IT STOPS" : "UNTIL YOU MOVE"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: (s) => s.view.world > 0.4, need: 0
  },
  {
    title: (s) => (moving(s) ? "LET GO ANY TIME" : "BULLETS WAIT FOR YOU"), sub: (s) => (moving(s) ? "IT ALL STOPS" : "LOOK, THEN GO"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: (s) => s.view.player !== null && s.view.player.y < 6, need: 0
  }
]

// Time Door: first see that nothing moves until you do, and everything moves when you walk; then the doors, whose
// portcullises rise only as time runs (only while you move).
const DOOR: ReadonlyArray<Step> = [
  {
    title: (s) => (moving(s) ? "EVERYTHING MOVES" : "NOTHING MOVES"), sub: (s) => (moving(s) ? "WITH YOU" : "UNTIL YOU DO"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: pastDecor, need: 0
  },
  {
    title: (s) => (atShutDoor(s) && !moving(s) ? "IT WAITS FOR YOU" : "DOORS OPEN WITH TIME"),
    sub: (s) => (moving(s) ? "KEEP MOVING" : "MOVE: TIME RUNS"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: doorsOpen, need: 0
  }
]

// The gunners never fire here: the one thing to learn is to get close. One in the first chamber; its door then opens
// on two more.
const CUT: ReadonlyArray<Step> = [
  {
    title: () => "GET CLOSE", sub: () => "WALK INTO THE RING",
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: (s) => s.view.doors.every((d) => d.open), need: 0
  },
  {
    title: () => "GET CLOSE TO HIT", sub: (s) => (s.view.enemies.length > 1 ? `${s.view.enemies.length} MORE INSIDE` : "ONE MORE"),
    colour: (s) => (moving(s) ? GOLD : WHITE),
    gate: () => true, ok: (s) => s.view.enemies.length === 0, need: 0
  }
]
const STEPS: Record<string, ReadonlyArray<Step>> = { "Point Blank": BLANK, "Time Door": DOOR, "First Cut": CUT }
const stepsFor = (room: string): ReadonlyArray<Step> => STEPS[room] ?? []
const DONE: Record<string, readonly [string, string]> = { "Point Blank": ["GOT IT!", "STILL = SAFE"], "Time Door": ["GOT IT!", "YOU MOVE, TIME MOVES"], "First Cut": ["GOT IT!", "CLOSE = CUT"] }
/** Hit in a guided room: what happened, said plainly. */
const DEAD: Record<string, readonly [string, string]> = { "Point Blank": ["YOU MOVED, IT MOVED", "STAND STILL: IT STOPS"] }
const DONE_LIFE = 2.2
/** How long the "CUT!" over a fallen target lasts (real s). */
const CUT_LIFE = 1.4

export class Guide {
  private room = -1
  private name = ""
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
    return { ...input, zone: zoneOf(input.stick), speed: p === null ? 0 : Math.hypot(p.vx, p.vy) / TUNING.player.speed, view }
  }

  /** Whether the thumb reaches the game now (always, outside the guided rooms and once a guide is done). */
  gate(view: FightView, input: GuideInput): boolean {
    const step = stepsFor(view.room.name)[this.step]
    const sense = this.sense(view, input)
    return step === undefined || view.flow !== "playing" || step.gate(sense)
  }

  update(dt: number, view: FightView, input: GuideInput): void {
    this.now += dt
    const id = view.player?.id ?? -1
    if (view.room.index !== this.room || (id !== -1 && id !== this.player)) {
      this.room = view.room.index; this.name = view.room.name; this.player = id
      this.step = 0; this.held = 0; this.doneAt = -1; this.labelY = null; this.standing.clear(); this.cuts = []
    }
    const steps = stepsFor(this.name)
    const step = steps[this.step]
    const sense = this.sense(view, input)
    // First Cut: whoever has gone since last time fell to your cut.
    if (this.name === "First Cut") {
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

  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, P: Project, input: GuideInput): void {
    const steps = stepsFor(this.name)
    if (steps.length === 0) return
    const dead = DEAD[this.name]
    if (view.flow === "dead" && dead !== undefined) { caption(ctx, Math.round(cw / 2), Math.round(ch * 0.22), dead[0], dead[1], GOLD); return }
    // Over a fallen target, a big "CUT!" for a moment: what just happened (it shows through the clear, too).
    for (const c of this.cuts) if (this.now - c.at < CUT_LIFE) cutBurst(ctx, P(c.x, c.y), (this.now - c.at) / CUT_LIFE)
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
    // (From under the room's goal banner down.)
    const spots = Array.from({ length: 32 }, (_, i) => Math.round(ch * (0.19 + i * 0.02)))
    // (Once the room is cleared, its panel comes up from the bottom: the "got it" waits above it.)
    const labelY = ended ? Math.round(ch * 0.4) : this.labelY !== null && fits(this.labelY) ? this.labelY : spots.find(fits) ?? Math.round(ch * 0.2)
    this.labelY = labelY
    if (step === undefined) {
      const age = this.now - this.doneAt
      const done = DONE[this.name]
      if (this.doneAt >= 0 && age < DONE_LIFE && done !== undefined) caption(ctx, x, labelY, done[0], done[1], GREEN)
      return
    }
    // Point Blank's first step: the bullet a few steps off is small; ring it, pulsing in real time, and name it.
    if (this.name === "Point Blank" && this.step === 0 && view.player !== null) {
      for (const hz of view.hazards) {
        if (hz.kind !== "bolt" || !hz.live || Math.hypot(hz.ax - view.player.x, hz.ay - view.player.y) > 6) continue
        threatMark(ctx, P((hz.ax + hz.bx) / 2, (hz.ay + hz.by) / 2), this.now)
      }
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

/** A bullet pointed out: a red ring pulsing round it, and "BULLET" over it. */
const threatMark = (ctx: CanvasRenderingContext2D, at: { readonly x: number; readonly y: number }, now: number): void => {
  const r = 9 + Math.round(2 * Math.sin(now * 8))
  ctx.save()
  ctx.strokeStyle = INK; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(Math.round(at.x), Math.round(at.y), r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = "#ff5a4f"; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(Math.round(at.x), Math.round(at.y), r, 0, Math.PI * 2); ctx.stroke()
  ctx.textAlign = "center"; ctx.textBaseline = "bottom"
  ctx.font = "700 8px Silkscreen, ui-monospace, monospace"
  const x = Math.round(at.x), y = Math.round(at.y - r - 3)
  ctx.fillStyle = INK
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.fillText("BULLET", x + dx, y + dy)
  ctx.fillStyle = "#ff5a4f"; ctx.fillText("BULLET", x, y)
  ctx.restore()
}
