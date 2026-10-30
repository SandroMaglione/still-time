/**
 * Where this device keeps what the game saves: the browser's local storage,
 * as Effect's `KeyValueStore`. On itch.io the game runs in an iframe from
 * itch's game host, whose storage every game there shares, so each store
 * keeps its keys under the game's prefix (see `progress.ts`). Where the
 * browser refuses local storage (blocked site data, some private modes),
 * the game keeps progress in memory for the session instead.
 */
import { BrowserKeyValueStore } from "@effect/platform-browser"
import { Effect, Layer } from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

export const storageLayer: Layer.Layer<KeyValueStore.KeyValueStore> = Layer.unwrap(
  // Reading the property itself throws where storage is refused.
  Effect.try(() => window.localStorage.getItem(`still-time/probe`)).pipe(
    Effect.as(BrowserKeyValueStore.layerLocalStorage),
    Effect.orElseSucceed(() => KeyValueStore.layerMemory)
  )
)
