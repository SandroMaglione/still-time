/**
 * The page: one canvas drawing the fight view, a floating thumb-stick
 * (and keys for desktop) feeding the thumb source, the menus, the device's
 * saved progress (through Effect), and the fixed-step loop.
 */
import { BrowserTickSource } from "@typeonce/ritmo-browser"
import { FixedLoop, Result } from "@typeonce/ritmo"
import { Effect, Layer, ManagedRuntime } from "effect"

import { STEP, createFight, updateSchedule, type Thumb } from "../sim/simulation.ts"
import { TITLE_ROOM } from "../sim/rooms.ts"
import { continueRoom, type Best } from "../sim/progress.ts"
import type { FightView } from "../sim/view.ts"
import { Camera, draw, screenToWorld, type Stick } from "./draw.ts"
import { Menu } from "./menu.ts"
import { Progress, layer as progressLayer } from "./progress.ts"
import { storageLayer } from "./storage.ts"
import { loadArt } from "./art.ts"
import { Presentation } from "./fx.ts"
import { Hud } from "./hud.ts"
import { Guide } from "./guide.ts"
import { Director, letterbox, onSkip, type Cue } from "./intro.ts"
import { createAudio, setMusicEnabled, setSoundEnabled, soundSettings } from "./audio.ts"
import { feelSettings, pulse, setFeel } from "./feel.ts"

declare global {
  interface Window {
    /** When the page last drew a frame (`performance.now()`), for the crash fallback in index.html. */
    stillTimeFrame?: number
    /** Shows the crash fallback (set by index.html). */
    stillTimeCrash?: () => void
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#view")
// A CPU-backed canvas: the scene is tiny (about 240 px across) and made of thousands of small draws, which a
// GPU-backed canvas pays for per call; software raster draws them in a fraction of the time.
const ctx = canvas?.getContext("2d", { willReadFrequently: true })
const el = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`Slap: #${id} missing`)
  return found
}
if (canvas === null || canvas === undefined || ctx === null || ctx === undefined) throw new Error("Slap: no canvas")

/**
 * The thumb as the simulation reads it: the current push, and a tap held
 * until the next step takes it.
 */
class ThumbSource {
  private push = { x: 0, y: 0 }
  private tapped = false

  /** A push on screen (direction and 0..1 strength), stored as the world direction that looks the same. */
  setScreenPush(dx: number, dy: number, strength: number): void {
    if (strength === 0) {
      this.push = { x: 0, y: 0 }
      return
    }
    const world = screenToWorld(dx, dy)
    const len = Math.hypot(world.x, world.y) || 1
    this.push = { x: (world.x / len) * strength, y: (world.y / len) * strength }
  }

  /** A push straight in world directions (a cutscene's director). */
  setWorldPush(x: number, y: number): void {
    this.push = { x, y }
  }

  tap(): void {
    this.tapped = true
  }

  snapshot(): Thumb {
    const thumb = { x: this.push.x, y: this.push.y, tap: this.tapped }
    this.tapped = false
    return thumb
  }
}

// The device's progress, through Effect: loaded before the run starts, saved on every clear.
const app = ManagedRuntime.make(progressLayer.pipe(Layer.provide(storageLayer)))
const progress = await app.runPromise(Effect.gen(function*() { return yield* Progress }))
const saved = await app.runPromise(progress.best)

// `?room=N` opens a room straight away and `?all` opens every room (testing); otherwise the title comes first.
const params = new URLSearchParams(window.location.search)
const asked = params.get("room")
const thumb = new ThumbSource()
const fight = createFight(asked === null ? continueRoom(saved) : Math.max(0, Number(asked) - 1), thumb, { best: saved, open: params.has("all") })

/** Folds this run's bests into the device's save, in the background. */
const save = (best: Best): void => {
  app.runFork(progress.record(best).pipe(Effect.catchTag("ProgressSaveError", (e) => Effect.logWarning("Still Time: progress not saved", e.cause))))
}

const goTo = (room: number): void => {
  if (room !== fight.view().room.index || fight.view().flow !== "playing") fight.send({ kind: "goToRoom", room })
}

const menu = new Menu(document.body, {
  play: (room) => {
    goTo(room)
    menu.close()
    // The room was waiting behind the title: you appear as it shows.
    presentation.appear()
  },
  resume: () => menu.close(),
  restart: () => {
    fight.send({ kind: "restart" })
    menu.close()
  },
  sound: { settings: soundSettings, setSound: setSoundEnabled, setMusic: setMusicEnabled },
  feel: { settings: feelSettings, set: setFeel }
})
if (asked === null) menu.show("title", fight.view())


el("restart").addEventListener("click", () => fight.send({ kind: "restart" }))
el("pause").addEventListener("click", () => menu.show("pause", fight.view()))
el("rooms-after").addEventListener("click", () => menu.show("rooms", fight.view()))
el("title-after").addEventListener("click", () => menu.show("title", fight.view()))

// The floating stick starts wherever the finger lands. Within DEAD_ZONE px of
// the press point you stand still; at REACH px you run at top speed. (A long reach: with a short one, a slow walk
// was a few millimetres of thumb, so playtesters tapped in micro-moves rather than hold a small slide.)
const DEAD_ZONE = 10
const REACH = 110
let stick: Stick | null = null
/** Which control you last used: the first rooms' drill and guides teach that one. */
let usingKeys = window.matchMedia("(pointer: fine)").matches
let consumed = false

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId)
  // A cutscene plays itself: a press moves it on a beat, or skips it from the top bar.
  if (fight.view().room.scene) {
    if (onSkip(e.clientY / cssPerPixel, canvas.height)) scene.skip()
    else scene.advance()
    consumed = true
    return
  }
  if (fight.view().flow !== "playing") {
    thumb.tap()
    consumed = true
    return
  }
  usingKeys = false
  stick = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, reach: REACH }
})
canvas.addEventListener("pointermove", (e) => {
  if (stick === null || consumed) return
  let dx = e.clientX - stick.ox
  let dy = e.clientY - stick.oy
  let len = Math.hypot(dx, dy)
  // The press point follows the thumb past full reach, so turning stays quick.
  if (len > REACH) {
    stick.ox = e.clientX - (dx / len) * REACH
    stick.oy = e.clientY - (dy / len) * REACH
    dx = e.clientX - stick.ox
    dy = e.clientY - stick.oy
    len = REACH
  }
  stick.x = e.clientX
  stick.y = e.clientY
  thumb.setScreenPush(dx, dy, Math.max(0, Math.min(1, (len - DEAD_ZONE) / (REACH - DEAD_ZONE))))
})
function lift(): void {
  stick = null
  consumed = false
  thumb.setScreenPush(0, 0, 0)
}
canvas.addEventListener("pointerup", lift)
// A cancelled press, a hidden tab or a lost window resets input.
const cancelInput = (): void => {
  lift(); held.clear()
}
canvas.addEventListener("pointercancel", cancelInput)
window.addEventListener("blur", cancelInput)
document.addEventListener("visibilitychange", () => { if (document.hidden) cancelInput() })

// Keys, for desktop: arrows or WASD move (screen directions), space continues, R restarts, 1-9 and 0 jump to rooms 1-10,
// [ and ] step to the previous and next room (open rooms only), Escape or M pauses (and closes the pause or room select).
const held = new Set<string>()
const DIRS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0]
}
const keyPush = (): void => {
  if (fight.view().room.scene) return
  let x = 0, y = 0
  for (const k of held) {
    const dir = DIRS[k]
    if (dir !== undefined) { x += dir[0]; y += dir[1] }
  }
  thumb.setScreenPush(x, y, x === 0 && y === 0 ? 0 : 1)
}
window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (e.repeat) return
  // Escape or M pauses, and closes the pause or the room select (the title stays until you pick Play).
  if (key === "Escape" || key === "m") {
    if (menu.current === "pause" || menu.current === "rooms") menu.close()
    else if (!menu.isOpen) menu.show("pause", fight.view())
    e.preventDefault()
    return
  }
  if (menu.isOpen) return
  // A cutscene plays itself: any key but the menu's moves it on a beat (S skips it).
  if (fight.view().room.scene) {
    if (key === "s") scene.skip()
    else scene.advance()
    e.preventDefault()
    return
  }
  if (DIRS[key] !== undefined) {
    held.add(key)
    usingKeys = true
    if (fight.view().flow !== "playing") thumb.tap()
    else keyPush()
  } else if (key === " " || key === "Enter") thumb.tap()
  else if (key === "r") fight.send({ kind: "restart" })
  else if (/^[0-9]$/.test(key)) fight.send({ kind: "goToRoom", room: key === "0" ? 9 : Number(key) - 1 })
  else if (key === "[" || key === "]") fight.send({ kind: "goToRoom", room: fight.view().room.index + (key === "]" ? 1 : -1) })
  else return
  e.preventDefault()
})
window.addEventListener("keyup", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (held.delete(key)) keyPush()
})

// The canvas holds the scene at its native pixel size (about 240 px across) and CSS enlarges it by a whole
// number of device pixels, pixelated: the browser's compositor does the upscale instead of a full-screen copy each frame.
let cssPerPixel = 1
const resize = (): void => {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const pixelScale = Math.max(1, Math.floor((window.innerWidth * dpr) / 240))
  canvas.width = Math.ceil((window.innerWidth * dpr) / pixelScale)
  canvas.height = Math.ceil((window.innerHeight * dpr) / pixelScale)
  cssPerPixel = pixelScale / dpr
  canvas.style.width = `${canvas.width * cssPerPixel}px`
  canvas.style.height = `${canvas.height * cssPerPixel}px`
  ctx.imageSmoothingEnabled = false
}
window.addEventListener("resize", resize)
resize()

// `?nolight` turns the lighting pass off, to compare.
const lit = !new URLSearchParams(location.search).has("nolight")
const camera = new Camera()
let lastRoom = -1
let lastPlayer = -1
let lastFlow = fight.view().flow
const presentation = new Presentation()
presentation.observe(fight.view())
// Sound starts on the first press or key (browsers require one).
const audio = createAudio()
audio.unlockOn(window)
audio.observe(fight.view())
const hud = new Hud(canvas)
const guide = new Guide()

/**
 * A cutscene room (the Prologue) as the page plays it: a director per attempt drives the thumb each step, your
 * hands are off, a tap moves it on a beat (each beat with words holds until then), "skip" plays the rest at once,
 * and once its last words are tapped through it moves on to the next room. A hit (a director's mistake) retries by
 * itself.
 */
class Scene {
  private director = new Director()
  private attempt = ""
  private skipping = false
  private now = 0
  /** The last cue, and when (real s) its words changed. */
  cue: Cue | null = null
  private line = ""
  lineAt = 0
  /** When (real s) this attempt at the scene began: its bars close in from then. */
  private startedAt = 0

  private fresh(view: FightView): void {
    const key = `${view.room.index}:${view.player?.id ?? -1}`
    if (key !== this.attempt) { this.attempt = key; this.director = new Director(); this.skipping = false; this.startedAt = this.now }
  }

  /** The director's push for this step (call before each tick of a cutscene room). */
  drive(view: FightView): void {
    this.fresh(view)
    const cue = this.director.step(view, STEP.dt)
    thumb.setWorldPush(cue.push.x, cue.push.y)
    this.see(cue)
  }

  private see(cue: Cue): void {
    this.cue = cue
    const line = cue.line?.join(" ") ?? ""
    if (line !== this.line) { this.line = line; this.lineAt = this.now }
  }

  advance(): void {
    this.director.advance()
  }

  skip(): void {
    this.skipping = true
  }

  /** Per frame: a skip plays the rest at once; the end (or a hit) moves on. */
  frame(view: FightView, dt: number): void {
    this.now += dt
    this.fresh(view)
    if (this.skipping && view.flow === "playing") {
      // The rest of the scene at once, every beat taken.
      for (let n = 0; n < 60 * 120 && fight.view().flow === "playing"; n++) {
        this.director.advance()
        this.drive(fight.view())
        fight.tick()
      }
      presentation.observe(fight.view())
    }
    if (view.flow === "playing" && !this.skipping) return
    // Hands back: the director's last push must not carry into the next room.
    thumb.setWorldPush(0, 0)
    if (view.flow === "dead") { if (view.canRetry) thumb.tap(); return }
    // After the clear, its last words, each held for a tap (a skip takes them all).
    if (this.skipping) { this.skipping = false; thumb.tap(); return }
    this.see(this.director.step(fight.view(), dt))
    if (this.director.over) thumb.tap()
  }

  get age(): number {
    return this.now - this.lineAt
  }

  /** Real s since the scene began. */
  get opened(): number {
    return this.now - this.startedAt
  }

  /**
   * Where the scene's camera looks: up the corridor ahead of you while the gunner walks in (so it enters the frame);
   * then a two-shot of you and the gunner (a little past your midpoint, toward it, more while its "!" is up), eased
   * slowly; once it is down, at you. It never snaps to you: the framing of a scene, not a camera that follows a thumb.
   */
  frameCamera(view: FightView, dt: number): void {
    const p = view.player, gunner = view.enemies[0] ?? null
    if (p === null) return
    if (gunner === null) { camera.look({ x: p.x, y: p.y }, dt, SCENE_CAMERA); return }
    if (gunner.arriving) { camera.look({ x: p.x, y: p.y - SCENE_LEAD }, dt, SCENE_CAMERA); return }
    const toward = this.cue?.alert != null ? 0.6 : 0.5
    camera.look({ x: p.x + (gunner.x - p.x) * toward, y: p.y + (gunner.y - p.y) * toward }, dt, SCENE_CAMERA)
  }
}
const scene = new Scene()
/** How fast (per real s) the scene's camera eases to its framing: slow, like a camera operator's. */
const SCENE_CAMERA = 0.9
/** How far (m) up the corridor ahead of you the scene's camera looks while the gunner walks in. */
const SCENE_LEAD = 6

/**
 * The title's backdrop: the empty aisle (the title's own room, never played) gliding by as if walking up it, with no
 * one in it, on and on. Its torches burn on real time. Its own fight (for the room) and camera: the real run is
 * untouched.
 */
/** How fast the view climbs the aisle (metres per real s). */
const AISLE_SPEED = 1.2
/** How far from either end of the aisle the climb stays (metres); past the far end it starts again from the near one. */
const AISLE_MARGIN = 14
class Attract {
  private readonly fight = createFight(TITLE_ROOM, { snapshot: () => ({ x: 0, y: 0, tap: false }) }, { open: true })
  private readonly camera = new Camera()
  private now = 0

  constructor() {
    const room = this.fight.view().room
    this.camera.x = room.w / 2
    this.camera.y = room.h - AISLE_MARGIN
  }

  /** Climbs by `dt` real seconds and draws it. */
  render(ctx: CanvasRenderingContext2D, cw: number, ch: number, dt: number, lit: boolean): void {
    this.now += dt
    const view = this.fight.view()
    this.camera.y -= AISLE_SPEED * dt
    if (this.camera.y < AISLE_MARGIN) this.camera.y = view.room.h - AISLE_MARGIN
    // No one in it; the world's clock (the torches' flicker) on real time, the light as if someone walked.
    draw(ctx, cw, ch, { ...view, player: null, world: this.now, scale: 0.5 }, null, this.camera, null, lit)
  }
}
const attract = new Attract()
/** How many steps (of 1/60 s) the world holds still when your cut lands, and how many are left of the current one. */
const HIT_STOP_STEPS = 4
let hitStop = 0
let cutsSeen = 0
await loadArt()
FixedLoop.start({
  source: BrowserTickSource.make(window),
  step: STEP,
  maxFrameSeconds: 0.25,
  maxStepsPerFrame: 5,
  // A menu pauses the game.
  update: () => {
    if (menu.isOpen) return Result.success(undefined)
    // The hit-stop: the world holds still for a beat as your cut lands.
    if (hitStop > 0) { hitStop--; return Result.success(undefined) }
    // A cutscene: the director's hands on the thumb.
    const before = fight.view()
    if (before.room.scene && before.flow === "playing") scene.drive(before)
    const result = fight.runtime.tick(updateSchedule)
    if (result.ok) {
      presentation.observe(fight.view())
      audio.observe(fight.view())
      if (presentation.cuts > cutsSeen) { cutsSeen = presentation.cuts; hitStop = HIT_STOP_STEPS }
      for (const kind of presentation.takePulses()) pulse(kind)
    }
    return result
  },
  render: (frame) => {
    // Alive: the crash fallback (in index.html) only shows when frames stop.
    window.stillTimeFrame = performance.now()
    const view = fight.view()
    presentation.advance(frame.elapsedSeconds)
    audio.advance(frame.elapsedSeconds, menu.current, view)
    // On the title, the first room plays itself behind it.
    if (menu.current === "title") {
      attract.render(ctx, canvas.width, canvas.height, frame.elapsedSeconds, lit)
      return
    }
    // A cutscene: no HUD; it plays itself and moves on by itself.
    document.body.classList.toggle("cutscene", view.room.scene)
    if (view.room.scene) scene.frame(view, frame.elapsedSeconds)
    // A clear changes the run's bests: save them.
    if ((view.flow === "cleared" || view.flow === "won") && lastFlow !== view.flow) save(view.best)
    lastFlow = view.flow
    // A new room, or the same one restarted (the player is back at the start), snaps the camera.
    if (view.room.index !== lastRoom || view.player?.id !== lastPlayer) camera.reset()
    lastRoom = view.room.index
    lastPlayer = view.player?.id ?? -1
    // The HUD: room, clock against par, the time-freeze gauge, the tip (messages are drawn with the scene, see `draw`).
    hud.update(view, frame.elapsedSeconds)
    if (view.room.scene) scene.frameCamera(view, frame.elapsedSeconds)
    else if (view.flow === "playing") camera.follow(view, frame.elapsedSeconds)
    const k = 1 / cssPerPixel
    const pixelStick = stick === null ? null : { ox: stick.ox * k, oy: stick.oy * k, x: stick.x * k, y: stick.y * k, reach: stick.reach * k }
    const dirs = [...held].filter((key) => DIRS[key] !== undefined)
    const guideInput = { stick: pixelStick, keys: usingKeys, down: usingKeys ? dirs.length > 0 : stick !== null && !consumed }
    guide.update(menu.isOpen ? 0 : frame.elapsedSeconds, view, guideInput)
    const drawn = draw(ctx, canvas.width, canvas.height, view, pixelStick, camera, presentation, lit)
    // The first rooms' guide, over everything; a cutscene's letterbox and words instead.
    if (view.room.scene) letterbox(ctx, canvas.width, canvas.height, scene.cue, scene.age, drawn.P, presentation.now, view.flow === "playing", scene.opened)
    else guide.draw(ctx, canvas.width, canvas.height, view, drawn.P, guideInput)
  },
  onFailure: (failure) => {
    console.error("Slap loop stopped", failure)
    window.stillTimeCrash?.()
  }
})
