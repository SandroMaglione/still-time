/**
 * How the game feels, and the player's say over it: screen shake, flashes and vibration, each on by default and
 * remembered on the device (like Sound and Music, see `audio.ts`). Host state only: none of it reaches the simulation.
 *
 * Also the vibration itself: `pulse` buzzes the phone for a moment of the game (where the browser can: Android;
 * iOS ignores it), unless vibration is off.
 */

export type FeelSetting = "shake" | "flash" | "haptics"
export type FeelSettings = Readonly<Record<FeelSetting, boolean>>

/** Keys under the game's prefix (itch.io shares local storage between games). */
const KEYS = { shake: "still-time/feel.shake", flash: "still-time/feel.flash", haptics: "still-time/feel.haptics" } as const satisfies Record<FeelSetting, string>

const load = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) !== "off"
  } catch {
    return true
  }
}

let settings: FeelSettings = { shake: load(KEYS.shake), flash: load(KEYS.flash), haptics: load(KEYS.haptics) }

/** Whether screen shake, flashes and vibration are on. */
export const feelSettings = (): FeelSettings => settings

/** Turns one of them on or off, and remembers it. */
export const setFeel = (setting: FeelSetting, on: boolean): void => {
  settings = { ...settings, [setting]: on }
  try {
    window.localStorage.setItem(KEYS[setting], on ? "on" : "off")
  } catch {
    // Storage refused: the setting lasts for the session.
  }
  // Turning vibration on says so in the hand.
  if (setting === "haptics" && on) pulse("tick")
}

/** The moments that buzz, and how (ms on, ms off, ...). */
const PULSES = {
  /** A step of a lesson done. */
  tick: [18],
  /** Your cut lands. */
  cut: [28],
  /** You stop dead after a run, and the world freezes. */
  freeze: [10],
  /** You are hit. */
  hit: [70, 50, 40],
  /** The room is clear. */
  clear: [24, 60, 24]
} as const satisfies Record<string, ReadonlyArray<number>>
export type Pulse = keyof typeof PULSES

/** Buzzes the phone for `kind`, if vibration is on and the browser can. */
export const pulse = (kind: Pulse): void => {
  if (!settings.haptics || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  navigator.vibrate([...PULSES[kind]])
}
