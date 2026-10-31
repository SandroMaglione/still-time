/**
 * The game's sound: the settings (the menu's toggles read and write them),
 * and the engine that plays the bank (`public/audio/sfx/`, made by
 * `pnpm audio` from `assets/audio/`) and the music (`public/audio/music/`).
 *
 * Time is heard. The world's speed (`view.scale`, about 0.04 still to 1 at a
 * full push) drives the music, the room's air and every sound the world
 * makes: still, they slow, drop in pitch and go muffled behind a low-pass;
 * moving opens them up to full speed and brightness. Your own sounds (your
 * blade, your steps, your death), the clockwork and the stalker keep real
 * time; the clear, the stars and the menus are not in the world at all.
 *
 * Audio is host code: it reads the fight view (diffed tick by tick in
 * `audio-cues.ts`, like `fx.ts`) and never writes the simulation. Browsers
 * start audio only after an input, so nothing plays until the first press.
 */
import type { FightView } from "../sim/view.ts"
import { SONGS, SOUNDS, type SongName, type SoundName } from "./audio-bank.ts"
import { cuesBetween, isCut, type Cue } from "./audio-cues.ts"
import { RUN_MIN } from "./fx.ts"

// ---------------------------------------------------------------- settings

/** Keys under the game's prefix (itch.io shares local storage between games). */
const soundKey = `still-time/audio.sound`
const musicKey = `still-time/audio.music`

const load = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) !== "off"
  } catch {
    return true
  }
}

const save = (key: string, on: boolean): void => {
  try {
    window.localStorage.setItem(key, on ? "on" : "off")
  } catch {
    // Storage refused: the setting lasts for the session.
  }
}

let settings: { readonly sound: boolean; readonly music: boolean } = { sound: load(soundKey), music: load(musicKey) }
/** The page's engine, told when a setting changes. */
let engine: GameAudio | null = null

/** Whether sound effects and music are on. */
export const soundSettings = (): { readonly sound: boolean; readonly music: boolean } => settings

/** Turns sound effects on or off, and remembers it. */
export const setSoundEnabled = (on: boolean): void => {
  settings = { ...settings, sound: on }
  save(soundKey, on)
  engine?.applySettings()
}

/** Turns the music on or off, and remembers it. */
export const setMusicEnabled = (on: boolean): void => {
  settings = { ...settings, music: on }
  save(musicKey, on)
  engine?.applySettings()
}

// ---------------------------------------------------------------- how time sounds

/** World speed while you are still (`TUNING.slow`): the bottom of the range. */
const SLOW = 0.04
/** How far each thing follows time, from still (`frozen`) to a full push (`moving`). */
const TIME = {
  /** World sounds: an octave down while still. */
  worldRate: { frozen: 0.5, moving: 1 },
  worldCutoff: { frozen: 650, moving: 18000 },
  /** Music: slower and a fourth down while still, so it stays music. */
  musicRate: { frozen: 0.74, moving: 1 },
  musicCutoff: { frozen: 380, moving: 9000 },
  /** The room's air: a low rumble while still, a rush while you move. */
  airCutoff: { frozen: 160, moving: 1400 },
  airGain: { frozen: 0.05, moving: 0.11 }
} as const
const lerp = (range: { readonly frozen: number; readonly moving: number }, m: number): number => range.frozen + (range.moving - range.frozen) * m
/** Cutoffs move on a log scale, as the ear hears them. */
const sweep = (range: { readonly frozen: number; readonly moving: number }, m: number): number => range.frozen * Math.pow(range.moving / range.frozen, m)
/** Seconds the heard speed takes to follow the world's (it is already eased by the simulation). */
const FOLLOW = 0.06

/** Music volume per screen: the rooms, the pause (quieter), the title. */
const MUSIC_GAIN = { game: 0.6, pause: 0.32, title: 0.7 } as const
/** Metres of walking per footstep. */
const STRIDE = 0.85

type Screen = "title" | "rooms" | "pause" | null

interface Voice { readonly source: AudioBufferSourceNode; readonly gain: GainNode }
interface Graph {
  readonly ctx: AudioContext
  /** Sound effects, all buses: the Sound toggle. */
  readonly sfx: GainNode
  /** World sounds go through `worldFilter`; real and UI sounds straight to `sfx`. */
  readonly world: BiquadFilterNode
  readonly music: GainNode
  readonly musicFilter: BiquadFilterNode
  /** Ducks the music under a heavy sound. */
  readonly duck: GainNode
  readonly air: { readonly source: AudioBufferSourceNode; readonly filter: BiquadFilterNode; readonly gain: GainNode }
}

const url = (path: string): string => `${import.meta.env.BASE_URL}audio/${path}`
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** A few seconds of brown noise that loops: the dungeon's air, made here instead of shipped. */
const airBuffer = (ctx: AudioContext): AudioBuffer => {
  const seconds = 3
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  // Cross-fade the ends so the loop has no seam.
  const fade = Math.round(ctx.sampleRate * 0.2)
  for (let i = 0; i < fade; i++) {
    const k = i / fade
    const end = data.length - fade + i
    data[end] = (data[end] ?? 0) * (1 - k) + (data[i] ?? 0) * k
  }
  return buffer
}

/**
 * Plays the game: `observe` each tick's view (next to `Presentation.observe`),
 * `advance` each frame (next to `Presentation.advance`), and `unlockOn` the
 * page once, so the first press starts the sound. Made by `createAudio`.
 */
class GameAudio {
  private graph: Graph | null = null
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>()
  private readonly sounds = new Map<SoundName, AudioBuffer>()
  private readonly songs = new Map<SongName, AudioBuffer>()
  private readonly worldVoices = new Set<AudioBufferSourceNode>()
  private readonly lastPlayed = new Map<SoundName, number>()
  private song: (Voice & { readonly name: SongName }) | null = null
  private previous: FightView | null = null
  private latest: FightView | null = null
  private screen: Screen = null
  /** The heard world speed, 0 (still) to 1 (full push), smoothed. */
  private motion = 0
  private stride = 0
  private dashReady = true
  private stopReady = false
  private runFor = 0
  /** When a button was last clicked (ms): a menu closed by a click already ticked. */
  private clickedAt = -Infinity

  /**
   * Fetches the music and the sounds (decoded once there is a context). Called once the art has loaded, so the songs
   * (most of the game's bytes) never hold up the first picture; a sound wanted sooner is fetched on the spot.
   */
  preload(): void {
    for (const name of SONGS) this.fetch(`music/${name}.wav`)
    for (const name of Object.keys(SOUNDS)) this.fetch(`sfx/${name}.wav`)
  }

  /** Starts (or resumes) the sound on the first press or key, as browsers require; clicks on buttons tick. */
  unlockOn(target: Window): void {
    const start = (): void => this.start()
    for (const type of ["pointerdown", "touchend", "keydown", "click"] as const) target.addEventListener(type, start, { capture: true })
    target.document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element) || e.target.closest("button") === null) return
      this.clickedAt = performance.now()
      this.play({ name: "ui.click", bus: "ui", at: null, delay: 0 })
    })
    target.document.addEventListener("visibilitychange", () => {
      const ctx = this.graph?.ctx
      if (ctx === undefined) return
      if (target.document.hidden) void ctx.suspend()
      else void ctx.resume()
    })
  }

  /** One tick's view: the sounds since the last one. */
  observe(view: FightView): void {
    const old = this.previous
    this.previous = view
    this.latest = view
    if (old === null || isCut(old, view) || old.step === view.step) return
    for (const cue of cuesBetween(old, view)) this.play(cue)
  }

  /** One frame: time's sound follows the world's speed; steps; the music for the screen (`menu.current`). */
  advance(seconds: number, screen: Screen, view: FightView): void {
    // A menu closed by a key: the lower tick.
    if (this.screen !== null && screen === null && performance.now() - this.clickedAt > 150) this.play({ name: "ui.back", bus: "ui", at: null, delay: 0 })
    this.screen = screen
    this.latest = view
    const graph = this.graph
    if (graph === null) return
    const dt = Math.max(0, Math.min(seconds, 0.25))
    const target = screen === "title" || screen === "rooms" ? 1 : screen === "pause" ? 0 : clamp01((view.scale - SLOW) / (1 - SLOW))
    this.motion += (target - this.motion) * (1 - Math.exp(-dt / FOLLOW))
    const m = this.motion
    const now = graph.ctx.currentTime
    const glide = 0.03
    graph.world.frequency.setTargetAtTime(sweep(TIME.worldCutoff, m), now, glide)
    graph.musicFilter.frequency.setTargetAtTime(sweep(TIME.musicCutoff, m), now, glide)
    graph.air.filter.frequency.setTargetAtTime(sweep(TIME.airCutoff, m), now, glide)
    graph.air.gain.gain.setTargetAtTime(screen === "title" || screen === "rooms" ? 0.02 : lerp(TIME.airGain, m), now, 0.1)
    graph.air.source.playbackRate.setTargetAtTime(lerp(TIME.musicRate, m), now, glide)
    const worldRate = lerp(TIME.worldRate, m)
    for (const voice of this.worldVoices) voice.playbackRate.setTargetAtTime(worldRate, now, glide)
    if (this.song !== null) this.song.source.playbackRate.setTargetAtTime(lerp(TIME.musicRate, m), now, glide)
    this.chooseSong()
    if (screen === null) this.footsteps(dt, view)
  }

  /** Applies the Sound and Music toggles. */
  applySettings(): void {
    const graph = this.graph
    if (graph === null) return
    const now = graph.ctx.currentTime
    graph.sfx.gain.setTargetAtTime(settings.sound ? 1 : 0, now, 0.05)
    this.chooseSong()
  }

  private fetch(path: string): void {
    if (this.bytes.has(path)) return
    this.bytes.set(path, fetch(url(path)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null))
  }

  private start(): void {
    if (this.graph !== null) {
      if (this.graph.ctx.state !== "running") void this.graph.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    void ctx.resume()
    const sfx = ctx.createGain()
    sfx.gain.value = settings.sound ? 1 : 0
    sfx.connect(ctx.destination)
    const world = ctx.createBiquadFilter()
    world.type = "lowpass"
    world.Q.value = 0.9
    world.connect(sfx)
    const duck = ctx.createGain()
    duck.connect(ctx.destination)
    const music = ctx.createGain()
    music.gain.value = 0
    const musicFilter = ctx.createBiquadFilter()
    musicFilter.type = "lowpass"
    musicFilter.Q.value = 1.1
    music.connect(musicFilter).connect(duck)
    const air = { source: ctx.createBufferSource(), filter: ctx.createBiquadFilter(), gain: ctx.createGain() }
    air.source.buffer = airBuffer(ctx)
    air.source.loop = true
    air.filter.type = "lowpass"
    air.gain.gain.value = 0
    // The air is a sound: under the Sound toggle.
    air.source.connect(air.filter).connect(air.gain).connect(sfx)
    air.source.start()
    this.graph = { ctx, sfx, world, music, musicFilter, duck, air }
    this.motion = 0
    void this.decode(ctx)
  }

  private async decode(ctx: AudioContext): Promise<void> {
    const one = async (path: string): Promise<AudioBuffer | null> => {
      this.fetch(path)
      const bytes = await this.bytes.get(path)
      if (bytes === null || bytes === undefined) return null
      return ctx.decodeAudioData(bytes.slice(0)).catch(() => null)
    }
    // Songs first: the title is playing while the bank decodes.
    await Promise.all(SONGS.map(async (name) => {
      const buffer = await one(`music/${name}.wav`)
      if (buffer !== null) this.songs.set(name, buffer)
    }))
    this.chooseSong()
    await Promise.all(Object.keys(SOUNDS).map(async (key) => {
      const name = key as SoundName
      const buffer = await one(`sfx/${name}.wav`)
      if (buffer !== null) this.sounds.set(name, buffer)
    }))
  }

  /** The song for the screen: the title's on the title and room select, the dungeon's in the rooms; a cross-fade between. */
  private chooseSong(): void {
    const graph = this.graph
    if (graph === null) return
    const now = graph.ctx.currentTime
    const onTitle = this.screen === "title" || this.screen === "rooms"
    const want: SongName = onTitle ? "title" : "dungeon"
    graph.music.gain.setTargetAtTime(!settings.music ? 0 : onTitle ? MUSIC_GAIN.title : this.screen === "pause" ? MUSIC_GAIN.pause : MUSIC_GAIN.game, now, 0.15)
    if (this.song?.name === want) return
    const buffer = this.songs.get(want)
    if (buffer === undefined) return
    if (this.song !== null) {
      const old = this.song
      old.gain.gain.setTargetAtTime(0, now, 0.35)
      old.source.stop(now + 2)
    }
    const source = graph.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.playbackRate.value = lerp(TIME.musicRate, this.motion)
    const gain = graph.ctx.createGain()
    gain.gain.value = 0
    gain.gain.setTargetAtTime(1, now, 0.4)
    source.connect(gain).connect(graph.music)
    source.start()
    this.song = { name: want, source, gain }
  }

  /** Your steps, in real time: one per stride, louder the faster; a whoosh as you burst from still, and a breath as you stop dead. */
  private footsteps(dt: number, view: FightView): void {
    const p = view.player
    if (p === null || view.flow !== "playing") { this.stride = STRIDE * 0.7; this.stopReady = false; return }
    const speed = Math.hypot(p.vx, p.vy)
    const push = clamp01(speed / 5)
    if (push < 0.08) {
      // Stopping after a real run freezes the world: its own sound, once per stop.
      if (this.stopReady) { this.stopReady = false; this.play({ name: "time.stop", bus: "real", at: null, delay: 0 }, 0.9) }
      this.stride = STRIDE * 0.7; this.dashReady = true; return
    }
    this.runFor = push > 0.6 ? this.runFor + dt : 0
    if (this.runFor >= RUN_MIN) this.stopReady = true
    if (this.dashReady && push > 0.7) {
      this.dashReady = false
      this.play({ name: "player.dash", bus: "real", at: null, delay: 0 }, 0.8)
    }
    this.stride += speed * dt
    if (this.stride >= STRIDE) {
      this.stride -= STRIDE
      this.play({ name: "player.step", bus: "real", at: null, delay: 0 }, 0.35 + 0.65 * push)
    }
  }

  private play(cue: Cue, volume = 1): void {
    const graph = this.graph
    if (graph === null || !settings.sound) return
    const buffer = this.sounds.get(cue.name)
    if (buffer === undefined) return
    const { ctx } = graph
    const at = ctx.currentTime + cue.delay
    const spec = SOUNDS[cue.name]
    if (at - (this.lastPlayed.get(cue.name) ?? -Infinity) < spec.interval) return
    this.lastPlayed.set(cue.name, at)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    const pan = ctx.createStereoPanner()
    // Far things are quieter and to the side.
    const me = this.latest?.player
    if (cue.at !== null && me !== null && me !== undefined) {
      const dx = cue.at.x - me.x, dy = cue.at.y - me.y
      pan.pan.value = Math.max(-0.6, Math.min(0.6, dx / 9))
      volume *= Math.max(0.3, Math.min(1, 1.15 - Math.hypot(dx, dy) / 16))
    }
    gain.gain.value = volume
    // A touch of variety, so repeats don't sound copied.
    const vary = 1 + (Math.random() - 0.5) * 0.06
    if (cue.bus === "world") {
      source.playbackRate.value = lerp(TIME.worldRate, this.motion) * vary
      this.worldVoices.add(source)
      source.addEventListener("ended", () => this.worldVoices.delete(source))
      source.connect(gain).connect(pan).connect(graph.world)
    } else {
      source.playbackRate.value = cue.bus === "ui" ? 1 : vary
      source.connect(gain).connect(pan).connect(graph.sfx)
    }
    source.start(at)
    if (spec.heavy) {
      // A heavy sound clears room for itself: the music dips and comes back.
      graph.duck.gain.cancelScheduledValues(at)
      graph.duck.gain.setTargetAtTime(0.45, at, 0.015)
      graph.duck.gain.setTargetAtTime(1, at + 0.3, 0.3)
    }
  }
}

/** The page's sound engine (one per page: the settings drive it). */
export const createAudio = (): GameAudio => {
  const made = new GameAudio()
  engine = made
  return made
}
export type { GameAudio }
