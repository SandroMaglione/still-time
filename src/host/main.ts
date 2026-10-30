/**
 * The page: one canvas drawing the fight view, a hidden floating thumb-stick
 * (and keys for desktop) feeding the thumb source, the menus, the device's
 * saved progress (through Effect), and the fixed-step loop.
 */
import { BrowserTickSource } from "@typeonce/ritmo-browser"
import { FixedLoop, Result } from "@typeonce/ritmo"
import { Effect, Layer, ManagedRuntime } from "effect"

import { STEP, createFight, updateSchedule, type Thumb } from "../sim/simulation.ts"
import { continueRoom, type Best } from "../sim/progress.ts"
import { Camera, draw, screenToWorld, type Stick } from "./draw.ts"
import { Menu } from "./menu.ts"
import { Progress, layer as progressLayer } from "./progress.ts"
import { storageLayer } from "./storage.ts"
import { loadArt } from "./art.ts"
import { Presentation } from "./fx.ts"
import { Hud } from "./hud.ts"
import { createAudio, setMusicEnabled, setSoundEnabled, soundSettings } from "./audio.ts"

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
  },
  resume: () => menu.close(),
  restart: () => {
    fight.send({ kind: "restart" })
    menu.close()
  },
  sound: { settings: soundSettings, setSound: setSoundEnabled, setMusic: setMusicEnabled }
})
if (asked === null) menu.show("title", fight.view())


el("restart").addEventListener("click", () => fight.send({ kind: "restart" }))
el("pause").addEventListener("click", () => menu.show("pause", fight.view()))
el("rooms-after").addEventListener("click", () => menu.show("rooms", fight.view()))
el("title-after").addEventListener("click", () => menu.show("title", fight.view()))

// The floating stick starts wherever the finger lands. Within DEAD_ZONE px of
// the press point you stand still; at REACH px you run at top speed.
const DEAD_ZONE = 8
const REACH = 72
let stick: Stick | null = null
let consumed = false

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId)
  if (fight.view().flow !== "playing") {
    thumb.tap()
    consumed = true
    return
  }
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
  if (DIRS[key] !== undefined) {
    held.add(key)
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
await loadArt()
FixedLoop.start({
  source: BrowserTickSource.make(window),
  step: STEP,
  maxFrameSeconds: 0.25,
  maxStepsPerFrame: 5,
  // A menu pauses the game.
  update: () => {
    if (menu.isOpen) return Result.success(undefined)
    const result = fight.runtime.tick(updateSchedule)
    if (result.ok) {
      presentation.observe(fight.view())
      audio.observe(fight.view())
    }
    return result
  },
  render: (frame) => {
    const view = fight.view()
    presentation.advance(frame.elapsedSeconds)
    audio.advance(frame.elapsedSeconds, menu.current, view)
    // A clear changes the run's bests: save them.
    if ((view.flow === "cleared" || view.flow === "won") && lastFlow !== view.flow) save(view.best)
    lastFlow = view.flow
    // A new room, or the same one restarted (the player is back at the start), snaps the camera.
    if (view.room.index !== lastRoom || view.player?.id !== lastPlayer) camera.reset()
    lastRoom = view.room.index
    lastPlayer = view.player?.id ?? -1
    // The HUD: room, clock against par, the time-freeze gauge, the tip (messages are drawn with the scene, see `draw`).
    hud.update(view, frame.elapsedSeconds)
    if (view.flow === "playing") camera.follow(view, frame.elapsedSeconds)
    const k = 1 / cssPerPixel
    const pixelStick = stick === null ? null : { ox: stick.ox * k, oy: stick.oy * k, x: stick.x * k, y: stick.y * k, reach: stick.reach * k }
    draw(ctx, canvas.width, canvas.height, view, pixelStick, camera, presentation, lit)
  },
  onFailure: (failure) => console.error("Slap loop stopped", failure)
})
