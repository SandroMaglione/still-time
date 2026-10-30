/**
 * Progress saved on this device: each room's best result (stars and world
 * seconds), kept by room name so a build that adds or reorders rooms still
 * opens an older save (a room no longer in the game keeps its entry).
 *
 * Every version ever saved keeps its schema here; loading decodes any of
 * them and brings it to the latest. Loading never fails: a save that cannot
 * be read is kept aside and the run starts fresh; when the storage itself
 * cannot be read, nothing is written over it this session.
 */
import { Context, Data, Effect, Layer, Ref, Schema } from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

import type { Best } from "../sim/progress.ts"
import { ROOMS } from "../sim/rooms.ts"
import { read, write } from "./persisted.ts"

/** Every key this game stores starts with this: itch.io serves many games from one origin, so its storage is shared. */
export const storagePrefix = "still-time/"
export const progressKey = "progress"

const Result = Schema.Struct({
  stars: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
  world: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
})
type Result = typeof Result.Type

/** Version 1: each room's best, by room name. */
export const StoredProgressV1 = Schema.Struct({
  version: Schema.Literal(1),
  best: Schema.Record(Schema.String, Result)
})

export const StoredProgress = Schema.Union([StoredProgressV1])
export const StoredProgressLatest = StoredProgressV1
type ByName = (typeof StoredProgressLatest.Type)["best"]

/** Brings a saved progress to the latest version. */
const migrate = (stored: typeof StoredProgress.Type): typeof StoredProgressLatest.Type => stored

export const ProgressJson = Schema.fromJsonString(StoredProgress)
const LatestJson = Schema.fromJsonString(StoredProgressLatest)

/** The better of two results for a room: more stars, and the faster clear, kept apart. */
const better = (a: Result | undefined, b: Result): Result =>
  a === undefined ? b : { stars: Math.max(a.stars, b.stars), world: Math.min(a.world, b.world) }

/** The saved bests with a run's bests folded in, room by room. */
export const mergeBest = (saved: ByName, best: Best): ByName => {
  const merged: Record<string, Result> = { ...saved }
  ROOMS.forEach((room, i) => {
    const b = best[i]
    if (b !== null && b !== undefined) merged[room.name] = better(saved[room.name], b)
  })
  return merged
}

/** The saved bests in the order of this build's rooms. */
export const bestOf = (saved: ByName): Best => ROOMS.map((room) => saved[room.name] ?? null)

export class ProgressSaveError extends Data.TaggedError("ProgressSaveError")<{ readonly cause: unknown }> {}

export interface ProgressShape {
  /** Each room's best saved on this device, by room index. */
  readonly best: Effect.Effect<Best>
  /** Folds a run's bests into the saved ones and saves them. */
  readonly record: (best: Best) => Effect.Effect<void, ProgressSaveError>
}

export class Progress extends Context.Service<Progress, ProgressShape>()("StillTime/Progress") {}

/** The progress store over whatever `KeyValueStore` is provided (the browser's local storage on the page). */
export const layer: Layer.Layer<Progress, never, KeyValueStore.KeyValueStore> = Layer.effect(
  Progress,
  Effect.gen(function*() {
    const store = KeyValueStore.prefix(yield* KeyValueStore.KeyValueStore, storagePrefix)
    const loaded = yield* read(store, progressKey, ProgressJson)
    const writable = loaded._tag !== "Failed"
    const saved = yield* Ref.make<ByName>(loaded._tag === "Read" ? migrate(loaded.value).best : {})
    return Progress.of({
      best: Ref.get(saved).pipe(Effect.map(bestOf)),
      record: (best) =>
        Ref.updateAndGet(saved, (current) => mergeBest(current, best)).pipe(
          Effect.flatMap((merged) => (writable ? write(store, progressKey, LatestJson, { version: 1, best: merged }) : Effect.void)),
          Effect.mapError((cause) => new ProgressSaveError({ cause }))
        )
    })
  })
)
