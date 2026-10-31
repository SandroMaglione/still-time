/**
 * Every number of the fight, in one place. Lengths in metres, speeds in
 * metres per second, angles in radians, times in seconds. "World" seconds
 * slow down with the world; "real" seconds do not.
 */
export const TUNING = {
  /**
   * World speed while you are still: 0, a true freeze (at 0.04, a bullet 4 m away still took a motionless player in
   * ten seconds, and taught that "still" is not safe). Walking brings it up to 1 at top speed.
   */
  slow: 0,
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

export const SHOOTER_KINDS = ["gunner", "archer", "thrower", "sniper", "grenadier"] as const
export type ShooterKind = (typeof SHOOTER_KINDS)[number]
export const MELEE_KINDS = ["brute", "shield", "clockwork"] as const
export type MeleeKind = (typeof MELEE_KINDS)[number]
export const ENEMY_KINDS = [...SHOOTER_KINDS, ...MELEE_KINDS, "runner", "stalker"] as const
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
  sniper: { radius: 0.36, period: 1.5, shot: "slug", spread: [0], sight: 24, creeps: false, scoped: true, lock: 0.4 },
  /** Lobs a bomb at where you stand (over allies: it does not care who the blast takes). */
  grenadier: { radius: 0.4, period: 2.6, shot: "bomb", spread: [0], sight: 13, creeps: true, scoped: false, lock: 0 }
} as const satisfies Record<ShooterKind, {
  radius: number
  period: number
  shot: ShotKind | "bomb"
  spread: ReadonlyArray<number>
  sight: number
  creeps: boolean
  scoped: boolean
  lock: number
}>

/**
 * The melee family: each walks at you with a weapon held in front. Close
 * enough, it stops, winds up (tracking you, then committed for the last
 * `lock`), strikes a wedge in front of it, and recovers. Its front may be
 * guarded within `guardArc` of its facing: never (`guard: "none"`), while it
 * attacks (`"attack"`), or always (`"always"`, the shield-bearer). A guarded
 * front stops your cut and any shot; any other blow downs it.
 *
 * - brute: the spearman. Unguarded, but its spear outreaches your cut: it
 *   starts its thrust from `trigger`, and the wind-up is short, so rushing it
 *   head-on covers too little ground (time runs only as you move: about
 *   `TUNING.player.speed` metres per world second) to reach it before the
 *   thrust lands. Step off the narrow line, then cut in while it recovers.
 * - clockwork: a slow brass brute whose `clock` is real time: it walks,
 *   winds up and swings at its own pace however still you stand.
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
    trigger: 2.9,
    /** The thrust: reach in metres and half-angle in radians (a spear: long and narrow; past `trigger`, so standing still where it starts is no escape). */
    reach: 2.7,
    arc: 0.3,
    guard: "none",
    /** Half-angle of the guarded front (none for the spearman). */
    guardArc: 0,
    /**
     * World seconds of each phase. The wind-up keeps tracking you until `lock` of it is left, then commits. Short:
     * a head-on rush covers about 1.35 m of it, and stops short of your cut.
     */
    windup: 0.27,
    lock: 0.22,
    /** While tracking in the wind-up it steps in to this distance, at this share of its speed (the spearman holds its ground). */
    close: 2.9,
    step: 0,
    swing: 0.1,
    recover: 0.8,
    /** World time (slowed with the world) or real time (never slowed). */
    clock: "world"
  },
  shield: {
    radius: 0.5, speed: 2.6, turn: 1.5, trigger: 2.0, reach: 1.7, arc: 0.8, guard: "always", guardArc: 1.25,
    windup: 0.55, lock: 0.35, close: 1.3, step: 0.6, swing: 0.1, recover: 0.9, clock: "world"
  },
  clockwork: {
    radius: 0.46, speed: 1.6, turn: 3, trigger: 2.2, reach: 1.8, arc: 0.9, guard: "attack", guardArc: 1.2,
    windup: 0.8, lock: 0.45, close: 1.4, step: 0.5, swing: 0.12, recover: 1, clock: "real"
  }
} as const satisfies Record<MeleeKind, {
  radius: number
  speed: number
  turn: number
  trigger: number
  reach: number
  arc: number
  guard: "none" | "attack" | "always"
  guardArc: number
  windup: number
  lock: number
  close: number
  step: number
  swing: number
  recover: number
  clock: "world" | "real"
}>

/**
 * Shooters reposition a little: they sidestep when an ally stands in their line
 * of fire, and creep toward where they last saw you when you hide, never more
 * than `leash` metres from their post.
 */
export const SHOOTER_MOVE = {
  speed: 1.8,
  /** How fast one walks in to its post (a spawn's `from`), m per world s: a quick entrance, while you take a few steps. */
  enter: 12,
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
export const GIVE = { gunner: 0.25, archer: 0.25, thrower: 0.25, sniper: 0.25, grenadier: 0.25, brute: 1, shield: 0.5, clockwork: 0.4, runner: 0.6, stalker: 0.6 } as const satisfies Record<EnemyKind, number>

/**
 * A bomb flies (in world time) to where you stood when it was thrown, lands,
 * and burns its fuse; then its blast takes everyone within `radius` with
 * nothing solid in between (you, allies, the grenadier itself) and breaks
 * any cracked wall or crate it reaches.
 */
export const BOMB = {
  speed: 7,
  fuse: 1.3,
  radius: 1.9,
  /** A blast mark stays on screen this many steps (real time): 0.4 s. */
  showSteps: 24
} as const

/**
 * Cover that breaks. A crate bursts at the first shot (`crateHits`); a cracked
 * wall only gives to a brute's thrust (whose spear drives `swingBite`
 * metres past its reach into the wall) or a blast.
 */
export const COVER = { crateHits: 1, swingBite: 0.8 } as const

/**
 * Hazards: a blade's bar is `width` thick; a laser gate warns for `warn`
 * world seconds before it comes on.
 */
export const HAZARD = { width: 0.12, warn: 0.45 } as const

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

/** Keys, doors and plates. */
export const LOCKS = {
  /** You stand on a plate within this distance of its centre. */
  plate: 0.55,
  /** A wrong plate's red flash, in steps (real time): 0.5 s. */
  missSteps: 30,
  /** You pick up a key within this distance of it. */
  pickup: 0.7,
  /** A key door opens when you come within this distance of it holding its key. */
  reach: 0.9
} as const

/**
 * The stalker: it creeps toward you in real time, but only as fast as you
 * are still (full `speed` when you stand frozen, none at a full push). It
 * strikes anyone within `reach` (just past your cut) while you are at least
 * `wakes` still: hesitate near it and it takes you; rush it at a hard push
 * and it stays frozen for your cut, which downs it like anyone.
 */
export const STALKER = { radius: 0.4, speed: 2.4, reach: 1.35, wakes: 0.5 } as const

/** Conveyor belts carry you at `speed` (real m/s) along them, whether or not you push, so time stays frozen while you ride. */
export const BELT = { speed: 2.6 } as const

export const radiusOf = (kind: EnemyKind): number =>
  isMelee(kind) ? MELEE[kind].radius : kind === "runner" ? RUNNER.radius : kind === "stalker" ? STALKER.radius : SHOOTERS[kind].radius

export const SHOT_KINDS = ["bullet", "arrow", "knife", "slug"] as const
export type ShotKind = (typeof SHOT_KINDS)[number]

/** Per shot: radius and speed (m per world second). */
export const SHOTS = {
  bullet: { radius: 0.12, speed: 9 },
  arrow: { radius: 0.09, speed: 18 },
  knife: { radius: 0.1, speed: 12 },
  slug: { radius: 0.1, speed: 30 }
} as const satisfies Record<ShotKind, { radius: number; speed: number }>
