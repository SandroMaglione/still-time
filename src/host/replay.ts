/**
 * Your clear, played back at full speed behind the clear card: the run you made in stops and starts, as one take.
 *
 * At the start of each attempt the page snapshots the fight and then records every thumb the simulation reads. On a
 * clear, a second fight (never shown otherwise, never heard) is restored to that snapshot and fed the same thumbs, so
 * the run replays exactly (the simulation is deterministic). It is drawn only on the steps where something moved:
 * the stretches you stood still in are skipped, so what was forty seconds of looking plays as three of action. It
 * loops, with a beat on the last frame, until you move on.
 *
 * It also counts the attempt's real seconds standing still and moving, for the clear card.
 */
import type { Thumb } from "../sim/simulation.ts"
import { createFight, type Fight } from "../sim/simulation.ts"
import type { FightView } from "../sim/view.ts"
import { Camera } from "./draw.ts"
import { Presentation } from "./fx.ts"

type Snapshot = Extract<ReturnType<Fight["runtime"]["snapshot"]>, { readonly ok: true }>["value"]

/** Real seconds held on the last frame before the replay loops. */
const HOLD = 0.9
/** Steps (1/60 s) a frame may skip looking for movement, so a long stand-still costs one frame, not a hitch. */
const SEEK = 1200
/** How far below you (m) the replay's camera looks: the clear card covers the bottom of the screen. */
const FRAME_BELOW = 2.5
/** How many times faster than the world ran the replay plays: brisk, so a whole run plays in a moment. */
const SPEED = 1.2
/** World speed below which you count as standing still. */
const STILL = 0.05

export class Replay {
  /** The attempt being recorded: where it started and every thumb since; and its real seconds still and moving. */
  private start: { readonly room: number; readonly snapshot: Snapshot } | null = null
  private inputs: Array<Thumb> = []
  private stillSteps = 0
  private movingSteps = 0
  /** The playback, while one shows. */
  private play: { fight: Fight; next: number; presentation: Presentation; camera: Camera; hold: number; budget: number; view: FightView } | null = null

  /** Whether a playback is ready to show (a clear was recorded). */
  get ready(): boolean { return this.play !== null }

  /** Real seconds of the attempt standing still, and moving (the world's own seconds are on the view). */
  get still(): number { return this.stillSteps / 60 }
  get moving(): number { return this.movingSteps / 60 }

  /** A thumb the simulation read: recorded for the attempt under way. */
  record(thumb: Thumb): void {
    if (this.start !== null) this.inputs.push(thumb)
  }

  /** A new attempt began on this tick: from here, the snapshot and the thumbs that follow it replay it. */
  begin(fight: Fight): void {
    const snap = fight.runtime.snapshot()
    this.start = snap.ok ? { room: fight.view().room.index, snapshot: snap.value } : null
    this.inputs = []
    this.stillSteps = 0
    this.movingSteps = 0
    this.play = null
  }

  /** One step of the attempt was played, in `view`: count it still or moving. */
  count(view: FightView): void {
    if (view.flow !== "playing") return
    if (view.scale < STILL) this.stillSteps++
    else this.movingSteps++
  }

  /** The attempt ended in a clear: start playing it back. */
  cleared(best: FightView["best"]): void {
    if (this.start === null || this.inputs.length === 0) return
    let i = 0
    const inputs = this.inputs
    const fight = createFight(this.start.room, { snapshot: () => inputs[Math.min(i++, inputs.length - 1)] ?? { x: 0, y: 0, tap: false } }, { best, open: true })
    if (!fight.runtime.restore(this.start.snapshot).ok) return
    i = 0
    const presentation = new Presentation()
    presentation.observe(fight.view())
    const camera = new Camera()
    this.play = { fight, next: 0, presentation, camera, hold: 0, budget: 0, view: fight.view() }
    // (Reset the read position whenever playback restarts: see `restart`.)
    this.rewind = () => { i = 0 }
  }

  private rewind: () => void = () => {}

  /** Stops showing a playback (the next attempt has begun, or the room was left). */
  stop(): void {
    this.play = null
  }

  /** Advances the playback by one shown frame (`dt` real seconds) and returns what to draw, or null if none plays. */
  frame(dt: number): { readonly view: FightView; readonly camera: Camera; readonly presentation: Presentation } | null {
    const p = this.play
    if (p === null || this.start === null) return null
    p.presentation.advance(dt)
    if (p.hold > 0) {
      p.hold -= dt
      if (p.hold <= 0) this.restart()
      return { view: p.view, camera: p.camera, presentation: p.presentation }
    }
    // `SPEED` moving steps a frame's worth of time (fractions carried over); each one steps on until something moves
    // (the world, or you on a belt) or the run ends, so frozen stretches cost no frames.
    p.budget += dt * 60 * SPEED
    while (p.budget >= 1 && p.hold <= 0) {
      p.budget -= 1
      const before = p.view
      for (let n = 0; n < SEEK; n++) {
        if (p.next >= this.inputs.length) { p.hold = HOLD; break }
        p.fight.tick()
        p.next++
        const view = p.fight.view()
        p.presentation.observe(view)
        p.view = view
        const me = view.player, was = before.player
        const moved = view.world > before.world || (me !== null && was !== null && (me.x !== was.x || me.y !== was.y))
        if (view.flow !== "playing") { p.hold = HOLD; break }
        if (moved) break
      }
    }
    // Framed a little below you, so you play out above the clear card that covers the bottom of the screen.
    const me = p.view.player
    if (me !== null) p.camera.look({ x: me.x, y: me.y + FRAME_BELOW }, dt, 8)
    return { view: p.view, camera: p.camera, presentation: p.presentation }
  }

  /** Plays the recorded attempt again from its start. */
  private restart(): void {
    if (this.start === null || this.play === null) return
    if (!this.play.fight.runtime.restore(this.start.snapshot).ok) { this.play = null; return }
    this.rewind()
    const presentation = new Presentation()
    presentation.observe(this.play.fight.view())
    this.play = { ...this.play, next: 0, presentation, hold: 0, budget: 0, view: this.play.fight.view() }
    this.play.camera.reset()
  }
}
