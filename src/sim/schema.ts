/**
 * The world: bodies on the floor (the player, enemies, shots), the run's
 * place through the rooms, the world speed, the thumb, and the events
 * between systems. Every saved value is an Effect schema (through `codec`),
 * so the world can be saved, restored, replayed and fuzzed.
 */
import type { InputCapture } from "@typeonce/ritmo-browser"
import { Clock, Descriptor, Schema } from "@typeonce/ritmo"
import { Schema as S } from "effect"

import { codec } from "./codec.ts"
import { ENEMY_KINDS, SHOT_KINDS, TUNING } from "./tuning.ts"

export const Root = Schema.defineRoot("Slap")

export const STEP = Clock.hz(60)
export const Time = Clock.resource("Slap/Time", STEP)

const point = S.Struct({ x: S.Number, y: S.Number })
const deadline = S.declare(Clock.isDeadline(STEP))
/** A count: a whole number, zero or more. */
const count = S.Int.check(S.isGreaterThanOrEqualTo(0))
/** World seconds left in a phase. */
const left = S.Struct({ left: S.Number })

/** Where something stands, in room metres from the top-left. */
export const Body = Descriptor.ConstructedComponent(codec(point))("Slap/Body", {
  meta: { x: { unit: "m", hint: "Room metres from the left wall." }, y: { unit: "m", hint: "Room metres from the top wall." } }
})

/** The player's velocity this step, in real time (the world is what slows, not you). */
export const Player = Descriptor.ConstructedComponent(codec(S.Struct({ vx: S.Number, vy: S.Number })))("Slap/Player", {
  meta: {
    vx: { unit: "m/s", range: [-TUNING.player.speed, TUNING.player.speed] },
    vy: { unit: "m/s", range: [-TUNING.player.speed, TUNING.player.speed] }
  }
})

/** What an enemy is, which chamber of the room it guards, and whether it wears a crown: fixed for its life. */
export const Enemy = Descriptor.ConstructedComponent(codec(S.Struct({ kind: S.Literals(ENEMY_KINDS), chamber: count, captain: S.Boolean })))("Slap/Enemy", { immutable: true })

/** A runner's key, which it drops wherever it falls. */
export const Carry = Descriptor.ConstructedComponent(codec(S.Struct({ key: count })))("Slap/Carry", { immutable: true })

/**
 * A shooter's reload: world seconds until it may fire, and where it aims
 * (a scoped shooter stops turning it once locked).
 */
export const Reload = Descriptor.ConstructedComponent(codec(S.Struct({ left: S.Number, aim: S.Number })))("Slap/Reload", {
  meta: { left: { unit: "s", range: [0, 3], hint: "World seconds (slowed with the world) until the next shot." }, aim: { unit: "rad" } }
})

/** A shooter's footing: its post, where it last saw you (once it has), and which way it sidesteps. */
export const Post = Descriptor.ConstructedComponent(codec(S.Struct({
  hx: S.Number,
  hy: S.Number,
  seen: S.NullOr(point),
  strafe: S.Literals([1, -1])
})))("Slap/Post", { meta: { hx: { unit: "m" }, hy: { unit: "m" } } })

/** A melee enemy's body: where its blade faces, and its walking pace as a share of top speed. */
export const Melee = Descriptor.ConstructedComponent(codec(S.Struct({ facing: S.Number, pace: S.Number })))("Slap/Melee", {
  meta: {
    facing: { unit: "rad" },
    pace: { unit: "share", range: [0.5, 1], hint: "Share of its kind's top speed." }
  }
})

/**
 * What a melee enemy is doing: waiting to see you, chasing (toward where it
 * last saw you), winding up, swinging, or recovering. `left` is world
 * seconds left in the phase.
 */
export const Blade = Descriptor.EntityState("Slap/Blade", {
  idle: {},
  chase: codec(point),
  windup: codec(left),
  swing: codec(left),
  recover: codec(left)
}, {
  transitions: { idle: ["chase", "windup"], chase: ["windup"], windup: ["swing"], swing: ["recover"], recover: ["chase"] }
})

/** Something flying: its kind and velocity in metres per world second. */
export const Shot = Descriptor.ConstructedComponent(codec(S.Struct({ kind: S.Literals(SHOT_KINDS), vx: S.Number, vy: S.Number })))("Slap/Shot", {
  meta: { vx: { unit: "m/s" }, vy: { unit: "m/s" } }
})

/** A room's best result this run: stars (1 to 3) and its fastest clear in world seconds. */
export const RoomResult = S.Struct({ stars: S.Int.check(S.isBetween({ minimum: 1, maximum: 3 })), world: S.Number.check(S.isGreaterThanOrEqualTo(0)) })
export type RoomResult = typeof RoomResult.Type

/**
 * Which room; how many times you were hit this run (`deaths`) and in this
 * room since you came into it (`hits`); the world seconds of this attempt;
 * each room's best result, by room index (loaded from the device's save at
 * the start of a run); and whether every room is open regardless (testing).
 */
export const Run = Descriptor.ConstructedResource(codec(S.Struct({
  room: count,
  deaths: count,
  hits: count,
  world: S.Number.check(S.isGreaterThanOrEqualTo(0)),
  best: S.Array(S.NullOr(RoomResult)),
  open: S.Boolean
})))("Slap/Run", { meta: { world: { unit: "s", hint: "World seconds (slowed with the world) of this attempt." } } })

/** Which of the room's doors are open, by door index. Doors only open; a new attempt shuts them. */
export const Doors = Descriptor.ConstructedResource(codec(S.Array(S.Boolean)))("Slap/Doors")

/**
 * The room's keys: carried by their runner (at its last place), dropped on
 * the floor, held by you, or used on their door.
 */
const key = S.Union([
  S.Struct({ key: count, state: S.Literal("carried"), x: S.Number, y: S.Number }),
  S.Struct({ key: count, state: S.Literal("floor"), x: S.Number, y: S.Number }),
  S.Struct({ key: count, state: S.Literal("held") }),
  S.Struct({ key: count, state: S.Literal("used") })
])
export type Key = typeof key.Type
export const Keys = Descriptor.ConstructedResource(codec(S.Array(key)))("Slap/Keys")

/** World speed: 1 is real time, `TUNING.slow` when you are still. */
export const Pace = Descriptor.ConstructedResource(codec(S.Struct({ scale: S.Number })))("Slap/Pace", {
  meta: { scale: { unit: "share", range: [TUNING.slow, 1], hint: "World seconds per real second." } }
})

/** Cut marks for the page to draw, with the step each was made on; `blocked` marks a blow a guarded front stopped. */
export const Slashes = Descriptor.ConstructedResource(codec(S.Array(S.Struct({ x: S.Number, y: S.Number, angle: S.Number, born: S.Int, blocked: S.Boolean }))))("Slap/Slashes")

/**
 * The thumb, once per step: its push in world directions (length 0 at the
 * press point, 1 at full reach) and whether it tapped to continue.
 */
export interface Thumb {
  readonly x: number
  readonly y: number
  readonly tap: boolean
}

/** Where the thumb comes from: the page, a test script, a replay, or the fuzzer. */
export const ThumbInput = Descriptor.Service<InputCapture.Source<Thumb>>()("Slap/ThumbInput")
/** The thumb this step, captured once at the start of the schedule. */
export const Input = Descriptor.TransientResource<InputCapture.SnapshotOf<typeof ThumbInput>>()("Slap/Input")

/** Page commands that are not the thumb. */
export type Intent =
  | { readonly kind: "restart" }
  | { readonly kind: "goToRoom"; readonly room: number }

export const IntentEvent = Descriptor.Event<Intent>()("Slap/Intent")
/** A room to (re)build this step; `fresh` when you come into it anew (not a retry), which resets its hit count. */
export const EnterRoom = Descriptor.Event<{ readonly room: number; readonly fresh: boolean }>()("Slap/EnterRoom")
/** Something touched you: a shot or a swing. */
export const PlayerHit = Descriptor.Event<{ readonly by: "shot" | "swing" }>()("Slap/PlayerHit")

export const Game = Schema.bind(
  Schema.fragment({
    components: { Body, Player, Enemy, Carry, Reload, Post, Melee, Blade, Shot },
    resources: { Time, Run, Pace, Slashes, Doors, Keys, Input },
    events: { IntentEvent, EnterRoom, PlayerHit }
  }),
  Root
)

/** Fighting, hit (a tap retries once `retryAt` is reached), room cleared, or all rooms done; a clear carries its result. */
export const Flow = Game.StateMachine("Slap/Flow", {
  Playing: {},
  Dead: codec(S.Struct({ retryAt: deadline })),
  Cleared: codec(RoomResult),
  Won: codec(RoomResult)
})

/** Everything in the current room: cleared together when a room is (re)built. */
export const RoomScope = Game.EntityScope("Slap/Room")
