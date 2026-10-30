/**
 * The world: bodies on the floor (the player, enemies, shots), the run's
 * place through the rooms, the world speed, the thumb, and the events
 * between systems. Every saved value is a zod schema, so the world can be
 * saved, restored, replayed and fuzzed.
 */
import type { InputCapture } from "@typeonce/ritmo-browser"
import { Clock, Descriptor, Schema } from "@typeonce/ritmo"
import { z } from "zod"

import { ENEMY_KINDS, SHOT_KINDS, TUNING } from "./tuning.ts"

export const Root = Schema.defineRoot("Slap")

export const STEP = Clock.hz(60)
export const Time = Clock.resource("Slap/Time", STEP)

const point = z.object({ x: z.number(), y: z.number() })
const deadline = z.unknown().refine(Clock.isDeadline(STEP))

/** Where something stands, in room metres from the top-left. */
export const Body = Descriptor.ConstructedComponent(point)("Slap/Body", {
  meta: { x: { unit: "m", hint: "Room metres from the left wall." }, y: { unit: "m", hint: "Room metres from the top wall." } }
})

/** The player's velocity this step, in real time (the world is what slows, not you). */
export const Player = Descriptor.ConstructedComponent(z.object({ vx: z.number(), vy: z.number() }))("Slap/Player", {
  meta: {
    vx: { unit: "m/s", range: [-TUNING.player.speed, TUNING.player.speed] },
    vy: { unit: "m/s", range: [-TUNING.player.speed, TUNING.player.speed] }
  }
})

/** What an enemy is, which chamber of the room it guards, and whether it wears a crown: fixed for its life. */
export const Enemy = Descriptor.ConstructedComponent(z.object({ kind: z.enum(ENEMY_KINDS), chamber: z.int().nonnegative(), captain: z.boolean() }))("Slap/Enemy", { immutable: true })

/** A runner's key, which it drops wherever it falls. */
export const Carry = Descriptor.ConstructedComponent(z.object({ key: z.int().nonnegative() }))("Slap/Carry", { immutable: true })

/**
 * A shooter's reload: world seconds until it may fire, and where it aims
 * (a scoped shooter stops turning it once locked).
 */
export const Reload = Descriptor.ConstructedComponent(z.object({ left: z.number(), aim: z.number() }))("Slap/Reload", {
  meta: { left: { unit: "s", range: [0, 3], hint: "World seconds (slowed with the world) until the next shot." }, aim: { unit: "rad" } }
})

/** A shooter's footing: its post, where it last saw you (once it has), and which way it sidesteps. */
export const Post = Descriptor.ConstructedComponent(z.object({
  hx: z.number(),
  hy: z.number(),
  seen: point.nullable(),
  strafe: z.union([z.literal(1), z.literal(-1)])
}))("Slap/Post", { meta: { hx: { unit: "m" }, hy: { unit: "m" } } })

/** A melee enemy's body: where its blade faces, its walking pace as a share of top speed, and the hits it can still take. */
export const Melee = Descriptor.ConstructedComponent(z.object({ facing: z.number(), pace: z.number(), hp: z.int().positive() }))("Slap/Melee", {
  meta: {
    facing: { unit: "rad" },
    pace: { unit: "share", range: [0.5, 1], hint: "Share of its kind's top speed." },
    hp: { unit: "hits", range: [1, 3] }
  }
})

/**
 * What a melee enemy is doing: waiting to see you, chasing (toward where it
 * last saw you), winding up, swinging, recovering, or staggered by a hit it
 * survived. `left` is world seconds left in the phase.
 */
export const Blade = Descriptor.EntityState("Slap/Blade", {
  idle: {},
  chase: point,
  windup: z.object({ left: z.number() }),
  swing: z.object({ left: z.number() }),
  recover: z.object({ left: z.number() }),
  stagger: z.object({ left: z.number() })
}, {
  transitions: {
    idle: ["chase", "windup", "stagger"],
    chase: ["windup", "stagger"],
    windup: ["swing", "stagger"],
    swing: ["recover", "stagger"],
    recover: ["chase", "stagger"],
    stagger: ["chase", "windup"]
  }
})

/** Something flying: its kind and velocity in metres per world second. */
export const Shot = Descriptor.ConstructedComponent(z.object({ kind: z.enum(SHOT_KINDS), vx: z.number(), vy: z.number() }))("Slap/Shot", {
  meta: { vx: { unit: "m/s" }, vy: { unit: "m/s" } }
})

/** A room's best result this run: stars (1 to 3) and its fastest clear in world seconds. */
const result = z.object({ stars: z.int().min(1).max(3), world: z.number().nonnegative() })
export type RoomResult = z.infer<typeof result>

/**
 * Which room; how many times you were hit this run (`deaths`) and in this
 * room since you came into it (`hits`); the world seconds of this attempt;
 * and each room's best result, by room index.
 */
export const Run = Descriptor.ConstructedResource(z.object({
  room: z.int().nonnegative(),
  deaths: z.int().nonnegative(),
  hits: z.int().nonnegative(),
  world: z.number().nonnegative(),
  best: z.array(result.nullable())
}))("Slap/Run", { meta: { world: { unit: "s", hint: "World seconds (slowed with the world) of this attempt." } } })

/** Which of the room's doors are open, by door index. Doors only open; a new attempt shuts them. */
export const Doors = Descriptor.ConstructedResource(z.array(z.boolean()))("Slap/Doors")

/**
 * The room's keys: carried by their runner (at its last place), dropped on
 * the floor, held by you, or used on their door.
 */
const key = z.discriminatedUnion("state", [
  z.object({ key: z.int().nonnegative(), state: z.literal("carried"), x: z.number(), y: z.number() }),
  z.object({ key: z.int().nonnegative(), state: z.literal("floor"), x: z.number(), y: z.number() }),
  z.object({ key: z.int().nonnegative(), state: z.literal("held") }),
  z.object({ key: z.int().nonnegative(), state: z.literal("used") })
])
export type Key = z.infer<typeof key>
export const Keys = Descriptor.ConstructedResource(z.array(key))("Slap/Keys")

/** World speed: 1 is real time, `TUNING.slow` when you are still. */
export const Pace = Descriptor.ConstructedResource(z.object({ scale: z.number() }))("Slap/Pace", {
  meta: { scale: { unit: "share", range: [TUNING.slow, 1], hint: "World seconds per real second." } }
})

/** Cut marks for the page to draw, with the step each was made on; `blocked` marks a blow a guarded front stopped. */
export const Slashes = Descriptor.ConstructedResource(z.array(z.object({ x: z.number(), y: z.number(), angle: z.number(), born: z.int(), blocked: z.boolean() })))("Slap/Slashes")

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
  Dead: z.object({ retryAt: deadline }),
  Cleared: result,
  Won: result
})

/** Everything in the current room: cleared together when a room is (re)built. */
export const RoomScope = Game.EntityScope("Slap/Room")
