/**
 * Renders the game's audio into `public/audio/`: every sound in the bank
 * (`assets/audio/still-time.sounds.json`) and every song
 * (`assets/audio/*.song.json`), through `ritmo-tools`, then shrinks each WAV
 * for the web: mono and 16-bit, sounds at 22 050 Hz with their silent tails cut,
 * songs at 16 000 Hz (a song's loop stays seamless).
 * Also writes `src/host/audio-bank.ts`: the sound names and each one's
 * `heavy` and `interval`, so the game's code names sounds the bank has.
 *
 *   node scripts/audio.mjs   (or `pnpm audio`)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const bankFile = join(root, "assets/audio/still-time.sounds.json")
const out = join(root, "public/audio")
const tools = join(root, "node_modules/.bin/ritmo-tools")
const SOUND_RATE = 22050
const MUSIC_RATE = 16000

/** The PCM frames of a 16-bit WAV, mixed to mono, and its rate. */
const readWav = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 12, channels = 1, rate = 44100, data = null
  while (at + 8 <= bytes.length) {
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4))
    const size = view.getUint32(at + 4, true)
    if (tag === "fmt ") { channels = view.getUint16(at + 10, true); rate = view.getUint32(at + 12, true) }
    if (tag === "data") data = { start: at + 8, size }
    at += 8 + size + (size % 2)
  }
  if (data === null) throw new Error("no data chunk")
  const frames = Math.floor(data.size / 2 / channels)
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += view.getInt16(data.start + (i * channels + c) * 2, true) / 32768
    samples[i] = sum / channels
  }
  return { samples, rate }
}

const writeWav = (samples, rate) => {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at, text) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) }
  ascii(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, "WAVE")
  ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, "data"); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true)
  return bytes
}

/** Resamples `samples` from `from` Hz to `to` Hz through a windowed-sinc low-pass; `loop` wraps the filter round the ends. */
const resample = (samples, from, to, loop) => {
  const ratio = from / to, cutoff = (0.45 * to) / from, half = 32
  const length = samples.length
  const at = (i) => loop ? samples[((i % length) + length) % length] : i < 0 || i >= length ? 0 : samples[i]
  const result = new Float32Array(Math.round(length / ratio))
  for (let o = 0; o < result.length; o++) {
    const t = o * ratio, centre = Math.floor(t)
    let sum = 0
    for (let i = centre - half + 1; i <= centre + half; i++) {
      const n = i - t
      const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)
      const w = 0.42 + 0.5 * Math.cos((Math.PI * n) / half) + 0.08 * Math.cos((2 * Math.PI * n) / half)
      sum += sinc * w * at(i)
    }
    result[o] = sum
  }
  return result
}

/** Cuts a sound's tail once it stays under -60 dBFS, with a 5 ms fade so it ends without a click. */
const trim = (samples, rate) => {
  let end = samples.length
  while (end > 0 && Math.abs(samples[end - 1]) < 0.001) end--
  const fade = Math.round(rate * 0.005)
  const cut = samples.slice(0, Math.min(samples.length, end + fade))
  for (let i = 0; i < fade && i < cut.length; i++) cut[cut.length - 1 - i] *= i / fade
  return cut
}

/** A sound: 22 050 Hz, tail trimmed. A song: 16 000 Hz (it is dark, and slowed time lowers it further), loop kept seamless. */
const shrink = (from, to, kind) => {
  const { samples, rate } = readWav(readFileSync(from))
  const target = kind === "sound" ? SOUND_RATE : MUSIC_RATE
  const resampled = resample(samples, rate, target, kind === "loop")
  writeFileSync(to, writeWav(kind === "sound" ? trim(resampled, target) : resampled, target))
}

const run = (...args) => execFileSync(tools, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"] })

const temp = mkdtempSync(join(tmpdir(), "still-time-audio-"))
try {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, "sfx"), { recursive: true })
  mkdirSync(join(out, "music"), { recursive: true })

  run("sound", "render", bankFile, "-o", join(temp, "sfx"))
  for (const file of readdirSync(join(temp, "sfx")).filter((f) => f.endsWith(".wav"))) shrink(join(temp, "sfx", file), join(out, "sfx", file), "sound")

  const songs = readdirSync(join(root, "assets/audio")).filter((f) => f.endsWith(".song.json"))
  for (const song of songs) {
    const name = basename(song, ".song.json")
    const wav = join(temp, `${name}.wav`)
    run("music", "render", join(root, "assets/audio", song), "-o", wav)
    const loop = JSON.parse(readFileSync(join(root, "assets/audio", song), "utf8")).loop !== false
    shrink(wav, join(out, "music", `${name}.wav`), loop ? "loop" : "once")
  }

  // The names the game may play, typed from the bank.
  const bank = JSON.parse(readFileSync(bankFile, "utf8"))
  const entries = Object.entries(bank.sounds).map(([name, r]) => `  ${JSON.stringify(name)}: { heavy: ${r.heavy === true}, interval: ${r.interval ?? 0} }`)
  const musicNames = songs.map((s) => JSON.stringify(basename(s, ".song.json")))
  writeFileSync(join(root, "src/host/audio-bank.ts"), `/** Written by \`pnpm audio\` from \`assets/audio/\`: do not edit by hand. */

/** Every sound in the bank: whether it ducks the others, and the least seconds between two plays. */
export const SOUNDS = {
${entries.join(",\n")}
} as const satisfies Record<string, { readonly heavy: boolean; readonly interval: number }>
export type SoundName = keyof typeof SOUNDS

/** Every song, a looping WAV under \`public/audio/music/\`. */
export const SONGS = [${musicNames.join(", ")}] as const
export type SongName = (typeof SONGS)[number]
`)

  let total = 0
  for (const dir of ["sfx", "music"]) for (const f of readdirSync(join(out, dir))) total += readFileSync(join(out, dir, f)).length
  console.log(`public/audio: ${readdirSync(join(out, "sfx")).length} sounds, ${songs.length} songs, ${(total / 1024 / 1024).toFixed(2)} MB`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
