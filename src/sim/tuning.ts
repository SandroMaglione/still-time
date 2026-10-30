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

export const SHOOTER_KINDS = ["gunner", "archer", "thrower", "sniper"] as const
export type ShooterKind = (typeof SHOOTER_KINDS)[number]
export const MELEE_KINDS = ["brute", "knight", "shield"] as const
export type MeleeKind = (typeof MELEE_KINDS)[number]
export const ENEMY_KINDS = [...SHOOTER_KINDS, ...MELEE_KINDS, "runner"] as const
export type EnemyKind = (typeof ENEMY_KINDS)[number]

export const isShooter = (kind: EnemyKind): kind is ShooterKind => (SHOOTER_KINDS as ReadonlyArray<EnemyKind>).includes(kind)
export const isMelee = (kind: EnemyKind): kind is MeleeKind => (MELEE_KINDS as ReadonlyArray<EnemyKind>).includes(kind)

/**
 * Per shooter: body radius, reload `period` (world s), what it fires, the fan
 * of angle offsets, how far it sees, and whether it creeps after you. A
 * `scoped` shooter charges only while it sees you (hiding resets it), aims a
 * laser at you, and for the last `lock` world seconds stops tracking: the
 * moment to step out of the line.
 */
export const SHOOTERS = {
  /** Steady bullets. */
  gunner: { radius: 0.38, period: 0.85, shot: "bullet", spread: [0], sight: 13, creeps: true, scoped: false, lock: 0 },
  /** Fast arrows, slower reload. */
  archer: { radius: 0.36, period: 1.3, shot: "arrow", spread: [0], sight: 13, creeps: true, scoped: false, lock: 0 },
  /** A fan of three knives. */
  thrower: { radius: 0.38, period: 1.1, shot: "knife", spread: [-0.3, 0, 0.3], sight: 13, creeps: true, scoped: false, lock: 0 },
  /** Sees across the room and holds still; a laser charges on you, locks, then one very fast slug. */
  sniper: { radius: 0.36, period: 1.5, shot: "slug", spread: [0], sight: 24, creeps: false, scoped: true, lock: 0.4 }
} as const satisfies Record<ShooterKind, {
  radius: number
  period: number
  shot: ShotKind
  spread: ReadonlyArray<number>
  sight: number
  creeps: boolean
  scoped: boolean
  lock: number
}>

/**
 * The melee family: each walks at you with a blade held in front. Close
 * enough, it stops, winds up (tracking you, then committed for the last
 * `lock`), swings a wedge in front of it, and recovers. Its front is guarded
 * within `guardArc` of its facing: while it attacks (`guard: "attack"`), or
 * always (`"always"`, the shield-bearer). A guarded front stops your cut and
 * any shot. `hp` hits down it; a hit that does not down it staggers it (see
 * STAGGER).
 *
 * - brute: fast, one hit, guarded only while it attacks.
 * - knight: slower, armoured (three hits), guarded while it attacks; after
 *   each stagger it counters at once if you stand close.
 * - shield-bearer: slow and slow to turn (circling it within 3 m at full
 *   speed outpaces its turn), its shield always up: go round it.
 */
export const MELEE = {
  brute: {
    radius: 0.48,
    /** Metres and radians per world second while chasing: faster than you, and a 180° turn in about 0.3 s. */
    speed: 5.5,
    turn: 10,
    /** Starts the wind-up when you are this close and in sight. */
    trigger: 2.5,
    /** The swing: reach in metres and half-angle in radians. */
    reach: 2.0,
    arc: 1.0,
    guard: "attack",
    /** Half-angle of the guarded front. */
    guardArc: 1.2,
    /** World seconds of each phase. The wind-up keeps tracking you until `lock` of it is left, then commits. */
    windup: 0.5,
    lock: 0.35,
    /** While tracking in the wind-up it steps in to this distance, at this share of its speed. */
    close: 1.6,
    step: 0.7,
    swing: 0.1,
    recover: 0.8,
    hp: 1
  },
  knight: {
    radius: 0.5, speed: 3.4, turn: 7, trigger: 2.5, reach: 2.1, arc: 1.05, guard: "attack", guardArc: 1.2,
    windup: 0.5, lock: 0.35, close: 1.6, step: 0.7, swing: 0.1, recover: 0.8, hp: 3
  },
  shield: {
    radius: 0.5, speed: 2.6, turn: 1.5, trigger: 2.0, reach: 1.7, arc: 0.8, guard: "always", guardArc: 1.25,
    windup: 0.55, lock: 0.35, close: 1.3, step: 0.6, swing: 0.1, recover: 0.9, hp: 1
  }
} as const satisfies Record<MeleeKind, {
  radius: number
  speed: number
  turn: number
  trigger: number
  reach: number
  arc: number
  guard: "attack" | "always"
  guardArc: number
  windup: number
  lock: number
  close: number
  step: number
  swing: number
  recover: number
  hp: number
}>

/**
 * A hit that does not down a melee enemy staggers it: it is knocked `push`
 * metres away from the blow and stands dazed for `time` world seconds, when
 * no blow lands on it. Dazed time is world time: stand still and it stays
 * dazed, but so does everything else.
 */
export const STAGGER = { push: 1.8, time: 0.6 } as const

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
 * Enemies have solid bodies: they never overlap, and a melee enemy steers round an
 * ally in its way. They also walk at different paces, picked at spawn from
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

/** How much each kind gives way when two enemies are pushed apart: shooters hold their ground, the melee family is shoved. */
export const GIVE = { gunner: 0.25, archer: 0.25, thrower: 0.25, sniper: 0.25, brute: 1, knight: 0.8, shield: 0.5, runner: 0.6 } as const satisfies Record<EnemyKind, number>

/**
 * The runner (a thief): it never attacks, carries a key, and runs from you
 * while it can see you. Out of sight it stands still, so you can sneak up
 * behind cover. Wherever it falls (your cut or a stray shot), it drops its key.
 */
export const RUNNER = {
  radius: 0.34,
  /** Metres per world second: slower than you, so you catch it in the open, but it reaches corners first. */
  speed: 3.6,
  /** How far ahead it weighs each way out, in metres. */
  look: 1.6,
  /** How many ways out it weighs. */
  ways: 16
} as const

/** Keys and doors. */
export const LOCKS = {
  /** You pick up a key within this distance of it. */
  pickup: 0.7,
  /** A key door opens when you come within this distance of it holding its key. */
  reach: 0.9
} as const

export const radiusOf = (kind: EnemyKind): number => (isMelee(kind) ? MELEE[kind].radius : kind === "runner" ? RUNNER.radius : SHOOTERS[kind].radius)

export const SHOT_KINDS = ["bullet", "arrow", "knife", "slug"] as const
export type ShotKind = (typeof SHOT_KINDS)[number]

/** Per shot: radius and speed (m per world second). */
export const SHOTS = {
  bullet: { radius: 0.12, speed: 9 },
  arrow: { radius: 0.09, speed: 18 },
  knife: { radius: 0.1, speed: 12 },
  slug: { radius: 0.1, speed: 30 }
} as const satisfies Record<ShotKind, { radius: number; speed: number }>
