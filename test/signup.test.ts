import assert from "node:assert/strict"
import { test } from "node:test"

import { CLOSED_FOR_MS, MESSAGES, SIGNUP_KEYS, onTypeonceGames, outcomeOf, readMemory, signupShows } from "../src/host/signup.ts"

const LIVE = { hostname: "still-time.typeonce.games", dev: false }
const NOW = Date.UTC(2026, 10, 19, 12)
const fresh = { done: false, closedAt: null }

test("the sign-up shows on typeonce.games until the player signs up there", () => {
  assert.equal(signupShows(LIVE, fresh, NOW), true)
  assert.equal(signupShows({ hostname: "typeonce.games", dev: false }, fresh, NOW), true)
  assert.equal(signupShows(LIVE, { done: true, closedAt: null }, NOW), false, "signed up: hidden for good")
  assert.equal(signupShows(LIVE, { done: true, closedAt: NOW - 2 * CLOSED_FOR_MS }, NOW), false, "a close long ago does not bring it back")
})

test("the close hides the sign-up for 24 hours", () => {
  assert.equal(signupShows(LIVE, { done: false, closedAt: NOW }, NOW), false, "just closed")
  assert.equal(signupShows(LIVE, { done: false, closedAt: NOW - CLOSED_FOR_MS + 1 }, NOW), false, "closed less than a day ago")
  assert.equal(signupShows(LIVE, { done: false, closedAt: NOW - CLOSED_FOR_MS }, NOW), true, "a day after the close")
  assert.equal(signupShows(LIVE, { done: false, closedAt: NOW - 3 * CLOSED_FOR_MS }, NOW), true, "days after the close")
})

test("the sign-up never shows off typeonce.games, except in development (where it sends nothing)", () => {
  for (const hostname of ["html-classic.itch.zone", "sandromaglione.itch.io", "localhost", "typeonce.games.example.com", "nottypeonce.games", "127.0.0.1"]) {
    assert.equal(onTypeonceGames(hostname), false, hostname)
    assert.equal(signupShows({ hostname, dev: false }, fresh, NOW), false, hostname)
  }
  assert.equal(signupShows({ hostname: "localhost", dev: true }, fresh, NOW), true)
  assert.equal(signupShows({ hostname: "localhost", dev: true }, { done: false, closedAt: NOW - 60_000 }, NOW), false, "development keeps the close")
})

test("what the device remembers: anything unreadable remembers nothing", () => {
  const from = (values: Record<string, string>) => (key: string): string | null => values[key] ?? null
  assert.deepEqual(readMemory(from({})), fresh)
  assert.deepEqual(readMemory(from({ [SIGNUP_KEYS.done]: "1" })), { done: true, closedAt: null })
  assert.deepEqual(readMemory(from({ [SIGNUP_KEYS.closedAt]: String(NOW) })), { done: false, closedAt: NOW })
  assert.deepEqual(readMemory(from({ [SIGNUP_KEYS.closedAt]: "soon" })), fresh)
  assert.deepEqual(readMemory(() => null), fresh, "storage refused")
  for (const key of Object.values(SIGNUP_KEYS)) assert.ok(key.startsWith("still-time/signup"), key)
})

test("the endpoint's answers read as the four messages", () => {
  assert.equal(outcomeOf(true, { ok: true }), "ok")
  assert.equal(outcomeOf(false, { ok: false, error: "invalid_email" }), "invalid_email")
  assert.equal(outcomeOf(false, { ok: false, error: "rate_limited" }), "rate_limited")
  assert.equal(outcomeOf(false, { ok: false, error: "unavailable" }), "unavailable")
  assert.equal(outcomeOf(false, { ok: false, error: "invalid_request" }), "unavailable")
  assert.equal(outcomeOf(false, null), "unavailable", "a body that is not JSON")
  assert.equal(MESSAGES.invalid_email, "That address does not look right.")
  assert.equal(MESSAGES.rate_limited, "Too many tries. Wait a minute.")
  assert.equal(MESSAGES.unavailable, "Did not go through. Try again.")
})
