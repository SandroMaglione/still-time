/**
 * Progress: rooms open one by one (the simulation refuses a locked room),
 * and the device's save, through Effect's in-memory `KeyValueStore`: read
 * back, merged room by room, kept by name, under the game's prefix, kept
 * aside when unreadable, and never written over when the storage failed.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { Effect, Layer } from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

import { Progress, layer as progressLayer, progressKey, storagePrefix } from "../src/host/progress.ts"
import { continueRoom, totalStars, unlocked, type Best } from "../src/sim/progress.ts"
import { ROOMS } from "../src/sim/rooms.ts"
import { createFight } from "../src/sim/simulation.ts"
import { ScriptedThumb, roomIndex } from "./helpers.ts"

const none: Best = ROOMS.map(() => null)
const clearedUpTo = (n: number): Best => ROOMS.map((_, i) => (i < n ? { stars: 2, world: 5 } : null))
const savedKey = `${storagePrefix}${progressKey}`

/** Runs `program` against a fresh in-memory store (shared by every Progress built inside it). */
const withStore = <A, E>(program: Effect.Effect<A, E, KeyValueStore.KeyValueStore>): Promise<A> =>
  Effect.runPromise(program.pipe(Effect.provide(KeyValueStore.layerMemory)))

/** The progress store, built anew over the store in scope: what the page gets on its next load. */
const loadProgress = Effect.gen(function*() { return yield* Progress }).pipe(Effect.provide(progressLayer))

test("rooms open one by one: the first always, each next once the one before is cleared", () => {
  assert.equal(unlocked(none, 0), true)
  assert.equal(unlocked(none, 1), false)
  assert.equal(unlocked(clearedUpTo(3), 3), true)
  assert.equal(unlocked(clearedUpTo(3), 4), false)
  assert.equal(continueRoom(none), 0)
  assert.equal(continueRoom(clearedUpTo(3)), 3)
  assert.equal(continueRoom(clearedUpTo(ROOMS.length)), ROOMS.length - 1)
  assert.equal(totalStars(clearedUpTo(3)), 6)
})

test("the simulation refuses a jump to a locked room, and takes one to an open room", () => {
  const thumb = new ScriptedThumb()
  const fight = createFight(0, thumb, { best: clearedUpTo(2) })
  fight.send({ kind: "goToRoom", room: 5 })
  fight.tick()
  assert.equal(fight.view().room.index, 0)
  fight.send({ kind: "goToRoom", room: 2 })
  fight.tick()
  assert.equal(fight.view().room.index, 2)
  assert.deepEqual(fight.view().best, clearedUpTo(2), "the run starts from the saved bests")
  // Testing: every room open.
  const open = createFight(0, thumb, { open: true })
  open.send({ kind: "goToRoom", room: roomIndex("Fortress") })
  open.tick()
  assert.equal(open.view().room.name, "Fortress")
})

test("a new device has no progress; a recorded best reads back on the next load", async () => {
  const [fresh, again] = await withStore(Effect.gen(function*() {
    const first = yield* loadProgress
    const fresh = yield* first.best
    yield* first.record(clearedUpTo(2))
    const again = yield* (yield* loadProgress).best
    return [fresh, again] as const
  }))
  assert.deepEqual(fresh, none)
  assert.deepEqual(again, clearedUpTo(2))
})

test("recording keeps the best stars and the fastest clear of each room, apart", async () => {
  const best = await withStore(Effect.gen(function*() {
    const progress = yield* loadProgress
    yield* progress.record(ROOMS.map((_, i) => (i === 0 ? { stars: 3, world: 9 } : null)))
    yield* progress.record(ROOMS.map((_, i) => (i === 0 ? { stars: 1, world: 4 } : null)))
    return yield* (yield* loadProgress).best
  }))
  assert.deepEqual(best[0], { stars: 3, world: 4 })
})

test("the save is kept by room name under the game's prefix, and keeps rooms this build no longer has", async () => {
  const raw = await withStore(Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(savedKey, JSON.stringify({ version: 1, best: { "Old Room": { stars: 2, world: 7 } } }))
    yield* (yield* loadProgress).record(clearedUpTo(1))
    return yield* store.get(savedKey)
  }))
  assert.deepEqual(JSON.parse(raw ?? "{}"), { version: 1, best: { "Old Room": { stars: 2, world: 7 }, [ROOMS[0]?.name ?? ""]: { stars: 2, world: 5 } } })
})

test("an unreadable save is kept aside, and the run starts fresh", async () => {
  const [best, aside, saved] = await withStore(Effect.gen(function*() {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(savedKey, "{ not json")
    const progress = yield* loadProgress
    const best = yield* progress.best
    yield* progress.record(clearedUpTo(1))
    return [best, yield* store.get(`${savedKey}.unreadable`), yield* store.get(savedKey)] as const
  }))
  assert.deepEqual(best, none)
  assert.equal(aside, "{ not json")
  assert.equal(JSON.parse(saved ?? "{}").version, 1)
})

test("when the storage cannot be read, nothing is written over it", async () => {
  let writes = 0
  const failing = Layer.succeed(KeyValueStore.KeyValueStore)(KeyValueStore.makeStringOnly({
    get: (key) => Effect.fail(new KeyValueStore.KeyValueStoreError({ method: "get", key, message: "refused", cause: null })),
    set: () => Effect.sync(() => { writes++ }),
    remove: () => Effect.void,
    clear: Effect.void,
    size: Effect.succeed(0)
  }))
  const best = await Effect.runPromise(Effect.gen(function*() {
    const progress = yield* Progress
    yield* progress.record(clearedUpTo(2))
    return yield* progress.best
  }).pipe(Effect.provide(progressLayer), Effect.provide(failing)))
  assert.equal(writes, 0)
  assert.deepEqual(best, clearedUpTo(2), "the session still keeps what it played")
})
