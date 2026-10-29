/**
 * The world: bodies on the floor (the player, enemies, shots), the run's
 * place through the rooms, the world speed, and the intents the page sends.
 */
import { Clock, Descriptor, Schema } from "@typeonce/ritmo"
import { z } from "zod"

import type { EnemyKind, ShotKind } from "./tuning.ts"

export const Root = Schema.defineRoot("Slap")

export const STEP = Clock.hz(60)
export const Time = Clock.resource("Slap/Time", STEP)

/** Where something is, in room metres. */
export const Body = Descriptor.Component<{ readonly x: number; readonly y: number }>()("Slap/Body")

/** The player: current velocity in metres per real second. */
export const Player = Descriptor.Component<{ readonly vx: number; readonly vy: number }>()("Slap/Player")

/** An enemy: its kind and world seconds until it shoots. */
export const Enemy = Descriptor.Component<{ readonly kind: EnemyKind; readonly cooldown: number }>()("Slap/Enemy")

/** A shooter's footing: its post, where it last saw you (once it has), and which way it sidesteps. */
export const Post = Descriptor.Component<{ readonly hx: number; readonly hy: number; readonly seen: { readonly x: number; readonly y: number } | null; readonly strafe: 1 | -1 }>()("Slap/Post")

export type BrutePhase = "idle" | "chase" | "windup" | "swing" | "recover"

/** A brute's blade: where it faces, its phase, world seconds left in it, where it last saw you, and its walking pace (share of top speed). */
export const Melee = Descriptor.Component<{ readonly facing: number; readonly phase: BrutePhase; readonly t: number; readonly tx: number; readonly ty: number; readonly pace: number }>()("Slap/Melee")

/** Something flying: its kind and velocity in metres per real second. */
export const Shot = Descriptor.Component<{ readonly kind: ShotKind; readonly vx: number; readonly vy: number }>()("Slap/Shot")

/** Which room, how many deaths, and whether the room must be (re)built this tick. */
export const Run = Descriptor.Resource<{ readonly room: number; readonly deaths: number; readonly rebuild: boolean }>()("Slap/Run")

/** World speed: 1 is real time, small when you are still. */
export const Pace = Descriptor.Resource<{ readonly scale: number }>()("Slap/Pace")

/** The thumb: direction times push (0 at the press point, 1 at full reach), zero when lifted. */
export const Stick = Descriptor.Resource<{ readonly x: number; readonly y: number }>()("Slap/Stick")

/** Short-lived cut marks for the page to draw, aged in real seconds. */
export const Slashes = Descriptor.Resource<ReadonlyArray<{ readonly x: number; readonly y: number; readonly angle: number; readonly age: number }>>()("Slap/Slashes")

export type Intent =
  | { readonly kind: "stick"; readonly x: number; readonly y: number }
  | { readonly kind: "tap" }
  | { readonly kind: "restart" }
  | { readonly kind: "goToRoom"; readonly room: number }

export const IntentEvent = Descriptor.Event<Intent>()("Slap/Intent")

export const Game = Schema.bind(
  Schema.fragment({
    components: { Body, Player, Enemy, Melee, Post, Shot },
    resources: { Time, Run, Pace, Stick, Slashes },
    events: { IntentEvent }
  }),
  Root
)

/** Fighting, hit (waiting for a tap to retry), room cleared, or all rooms done. */
export const Flow = Game.StateMachine("Slap/Flow", {
  Playing: {},
  Dead: z.object({ wait: z.number() }),
  Cleared: {},
  Won: {}
})

/** Everything in the current room: cleared together on rebuild. */
export const RoomScope = Game.EntityScope("Slap/Room")
