/**
 * Every number of the fight, in one place. Lengths in metres, speeds in
 * metres per second, angles in radians, times in seconds. "World" seconds
 * slow down with the world; "real" seconds do not.
 */
export const TUNING = {
  /** World speed while you are still; moving brings it up with your push, to 1 at full push. */
  slow: 0.04,
  /** Enemies see you up to this far, and only with nothing in the way. */
  sight: 13,
  /** World seconds an enemy needs to fire once it sees you again, if its reload is already done. */
  reaction: 0.25,
  /** `speed` is the top speed (real m/s) at full push; `curve` > 1 gives finer control near the press point. */
  player: { radius: 0.32, speed: 5, curve: 1.4 },
  /** Centre distance at which you cut an enemy down. */
  attackRange: 1.15,
  /** How fast the world speed eases toward its target, per real second. */
  timeEase: 18,
  /** Steps (at 60 Hz, real time) before a tap retries the room after a hit (stops accidental taps): 0.35 s. */
  deadLockSteps: 21,
  /** Steps (real time) a cut mark stays on screen: 0.35 s. */
  slashSteps: 21
} as const

export const SHOOTER_KINDS = ["gunner", "archer", "thrower"] as const
export type ShooterKind = (typeof SHOOTER_KINDS)[number]
export const ENEMY_KINDS = [...SHOOTER_KINDS, "brute"] as const
export type EnemyKind = (typeof ENEMY_KINDS)[number]

/** Per shooter: body radius, reload `period` (world s), what it fires, and the fan of angle offsets. */
export const SHOOTERS = {
  /** Steady bullets. */
  gunner: { radius: 0.38, period: 0.85, shot: "bullet", spread: [0] },
  /** Fast arrows, slower reload. */
  archer: { radius: 0.36, period: 1.3, shot: "arrow", spread: [0] },
  /** A fan of three knives. */
  thrower: { radius: 0.38, period: 1.1, shot: "knife", spread: [-0.3, 0, 0.3] }
} as const satisfies Record<ShooterKind, { radius: number; period: number; shot: ShotKind; spread: ReadonlyArray<number> }>

/**
 * The brute: walks at you with a blade held in front. Close enough, it stops,
 * winds up, and swings a wedge in front of it. While it attacks (wind-up and
 * swing) its front is guarded: within `guard` radians of its facing your cut
 * fails, so you cannot beat its swing by rushing in. The rest of the time it
 * can be cut from any side: step out of the swing, then hit back.
 */
export const BRUTE = {
  radius: 0.48,
  /** Metres and radians per world second while chasing: faster than you, and a 180° turn in about 0.3 s. */
  speed: 5.5,
  turn: 10,
  /** Starts the wind-up when you are this close and in sight. */
  trigger: 2.5,
  /** The swing: reach in metres and half-angle in radians. */
  reach: 2.0,
  arc: 1.0,
  /** Half-angle of the guarded front. */
  guard: 1.2,
  /** World seconds of each phase. The wind-up keeps tracking you until `lock` of it is left, then commits. */
  windup: 0.5,
  lock: 0.35,
  /** While tracking in the wind-up it steps in to this distance, at this share of its speed. */
  close: 1.6,
  step: 0.7,
  swing: 0.1,
  recover: 0.8
} as const

/**
 * Shooters reposition a little: they sidestep when an ally stands in their line
 * of fire, and creep toward where they last saw you when you hide, never more
 * than `leash` metres from their post.
 */
export const SHOOTER_MOVE = {
  speed: 1.8,
  leash: 3.5,
  /** Clearance around an ally that a line of fire must keep, in metres. */
  allyGap: 0.25
} as const

/**
 * Enemies have solid bodies: they never overlap, and a brute steers round an
 * ally in its way. Brutes also walk at different paces, picked at spawn from
 * `paces` in turn, so two of them do not arrive in step.
 */
export const CROWD = {
  /** Extra room a brute keeps from other enemies, in metres, and how hard it steers away. */
  space: 0.7,
  push: 2,
  /** How far ahead a brute looks for an ally on its path, and how hard it steers round. */
  look: 2.5,
  round: 1.4,
  paces: [1, 0.82, 0.92]
} as const

export const radiusOf = (kind: EnemyKind): number => (kind === "brute" ? BRUTE.radius : SHOOTERS[kind].radius)

export const SHOT_KINDS = ["bullet", "arrow", "knife"] as const
export type ShotKind = (typeof SHOT_KINDS)[number]

/** Per shot: radius and speed (m per world second). */
export const SHOTS = {
  bullet: { radius: 0.12, speed: 9 },
  arrow: { radius: 0.09, speed: 18 },
  knife: { radius: 0.1, speed: 12 }
} as const satisfies Record<ShotKind, { radius: number; speed: number }>
