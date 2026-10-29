/**
 * Every number and rule the prototype compares, in one place. A variant is a
 * named set of settings switched with V (or the button at the bottom).
 */
export interface Variant {
  readonly label: string
  readonly hint: string
  /** follow: time runs as fast as you move (a slow push = slow time). snap: full speed as soon as you move. */
  readonly time: "follow" | "snap"
  /** World speed while you are still: 1 switches the slow-motion off. */
  readonly slow: number
}

export const VARIANTS = {
  glide: { label: "Glide", hint: "drag further = faster · time follows your speed", time: "follow", slow: 0.04 },
  snap: { label: "Glide·snap", hint: "drag further = faster · time full once you move", time: "snap", slow: 0.04 },
  realtime: { label: "Realtime", hint: "drag to move · no slow-motion (control)", time: "snap", slow: 1 }
} as const satisfies Record<string, Variant>

export type VariantId = keyof typeof VARIANTS
export const VARIANT_IDS = Object.keys(VARIANTS) as ReadonlyArray<VariantId>

export const TUNING = {
  /** Room size in metres: portrait. */
  room: { w: 9, h: 16 },
  /** speed is the top speed, at full stick; curve > 1 gives finer control near the press point. */
  player: { radius: 0.32, speed: 5, curve: 1.4 },
  /** Centre distance at which you cut an enemy down. */
  attackRange: 1.15,
  /** How fast the world speed eases toward its target, per real second. */
  timeEase: 18,
  /** Real seconds before a tap restarts the room after a hit (stops accidental taps). */
  deadLock: 0.35
} as const

export type EnemyKind = "gunner" | "archer" | "thrower"

export const ENEMIES = {
  /** Steady, slow bullets. */
  gunner: { radius: 0.38, period: 1.7, shot: "bullet", spread: [0] },
  /** Rare, fast arrows. */
  archer: { radius: 0.36, period: 2.6, shot: "arrow", spread: [0] },
  /** A fan of three knives. */
  thrower: { radius: 0.38, period: 2.2, shot: "knife", spread: [-0.3, 0, 0.3] }
} as const satisfies Record<EnemyKind, { radius: number; period: number; shot: ShotKind; spread: ReadonlyArray<number> }>

export type ShotKind = "bullet" | "arrow" | "knife"

export const SHOTS = {
  bullet: { radius: 0.12, speed: 4.5 },
  arrow: { radius: 0.09, speed: 9.5 },
  knife: { radius: 0.1, speed: 6 }
} as const satisfies Record<ShotKind, { radius: number; speed: number }>
