import assert from "node:assert/strict"
import { test } from "node:test"
import { Presentation } from "../src/host/fx.ts"
import { cuesBetween } from "../src/host/audio-cues.ts"
import { Director } from "../src/host/intro.ts"
import type { FightView } from "../src/sim/view.ts"
import { createFight, IDLE_THUMB } from "../src/sim/simulation.ts"
import { fightIn, placePlayer, pushToward, roomIndex, runUntil } from "./helpers.ts"

// The Duel: a room that starts with an enemy to kill.
const initial = (): FightView => createFight(roomIndex("Duel"), { snapshot: () => IDLE_THUMB }).view()
const next = (view: FightView, changes: Partial<FightView> = {}): FightView => ({ ...view, step: view.step + 1, world: view.world + 1 / 60, ...changes })

test("presentation keeps both same-kind deaths and does not replay them on a render", () => {
  const base = initial(), actor = base.enemies[0]!
  const view = { ...base, enemies: [actor, { ...actor, id: actor.id + 10, x: actor.x + 2 }] }
  const fx = new Presentation(); fx.observe(view)
  const killed = next(view, { enemies: [], flow: "cleared", slashes: [{ born: 1, x: actor.x, y: actor.y, angle: 1, age: 0, blocked: false }] })
  fx.observe(killed); fx.observe(killed); fx.observe(next(killed))
  assert.equal(fx.deaths.length, 2)
  assert.equal(new Set(fx.deaths.map(d => d.id)).size, 2)
  assert.equal(fx.impacts.length, 1)
  fx.advance(0.65)
  assert.equal(fx.deaths.length, 2, "death keeps playing after the room clears")
  fx.advance(0.5)
  assert.equal(fx.deaths.length, 0, "finished corpses are bounded and removed")
})

test("shot recoil follows a reload roll-over, including a projectile consumed in its birth tick", () => {
  const base = initial(), actor = { ...base.enemies[0]!, kind: "gunner" as const, melee: null, charge: 0.99 }
  const view = { ...base, enemies: [actor], shots: [] }
  const fx = new Presentation(); fx.observe(view)
  const fired = next(view, { enemies: [{ ...actor, charge: 0.01 }] })
  fx.observe(fired)
  assert.equal(fx.firing(actor, fired.world), 0)
  fx.advance(0.6)
  assert.equal(fx.firing(actor, fired.world), 0, "weapon recoil uses world time when time freezes")
  fx.observe(next(fired, { world: fired.world + 0.04 }))
  assert.ok(fx.firing(actor, fired.world + 0.04) > 0.039)
  const hidden = new Presentation(); hidden.observe(view)
  hidden.observe(next(view, { enemies: [{ ...actor, charge: 0.72, sees: false }] }))
  assert.equal(hidden.firing(actor, view.world), -1, "reaction delay is not a shot")
})

test("player death plays in real time and resets completely on retry or restore", () => {
  const view = initial(), fx = new Presentation(); fx.observe(view)
  const dead = next(view, { flow: "dead", deaths: 1 })
  fx.observe(dead); fx.observe(next(dead))
  assert.equal(fx.deaths.filter(d => d.kind === "player").length, 1)
  fx.advance(0.6)
  assert.equal(fx.playerDeathAge, 0.6)
  const retry = next(dead, { flow: "playing", world: 0, player: { ...view.player!, id: view.player!.id + 100 } })
  fx.observe(retry)
  assert.equal(fx.deaths.length, 0)
  assert.equal(fx.impacts.length, 0)
  assert.equal(fx.playerDeathAge, -1)
  fx.observe(next(retry, { enemies: [] }))
  assert.ok(fx.deaths.length > 0)
  fx.observe(view)
  assert.equal(fx.deaths.length, 0, "restoring an earlier step cannot leave phantom deaths")
})

test("a projectile kill gets an impact instead of a phantom sword slash", () => {
  const view = initial(), enemy = view.enemies[0]!, fx = new Presentation()
  fx.observe({ ...view, shots: [{ id: 123, kind: "bullet", x: enemy.x - 0.2, y: enemy.y, vx: 9, vy: 0, radius: 0.12 }] })
  fx.observe(next(view, { enemies: [], slashes: [{ born: 1, x: enemy.x, y: enemy.y, angle: 0, age: 0, blocked: false }] }))
  assert.equal(fx.deaths.length, 1)
  assert.deepEqual(fx.impacts.map(i => i.kind), ["shot"])
})

test("the real cut and fatal-swing paths produce complete presentation deaths", () => {
  const { fight } = fightIn("Courtyard")
  placePlayer(fight, 2.5, 12.8)
  const fx = new Presentation(); fx.observe(fight.view())
  const count = fight.view().enemies.length
  fight.tick(); fx.observe(fight.view())
  assert.equal(fight.view().enemies.length, count - 1)
  assert.equal(fx.deaths[0]?.kind, "gunner")
  assert.equal(fx.impacts[0]?.kind, "cut")

  const duel = fightIn("Duel"), death = new Presentation()
  death.observe(duel.fight.view())
  for (let n = 0; n < 900 && duel.fight.view().flow === "playing"; n++) {
    const brute = duel.fight.view().enemies[0]!
    duel.thumb.push = pushToward(duel.fight, brute.x, brute.y)
    duel.fight.tick(); death.observe(duel.fight.view()); death.advance(1 / 60)
  }
  assert.equal(duel.fight.view().flow, "dead")
  assert.equal(death.deaths.filter(d => d.kind === "player").length, 1)
})

test("a cutscene's clear is quiet: no fanfare, no star chimes, no vanish; a room's clear keeps them", () => {
  const clearOf = (name: string, play: (fight: ReturnType<typeof fightIn>["fight"], thumb: ReturnType<typeof fightIn>["thumb"]) => void): { readonly cues: ReadonlyArray<string>; readonly vanished: boolean } => {
    const { fight, thumb } = fightIn(name)
    const presentation = new Presentation()
    let before = fight.view()
    presentation.observe(before)
    const cues: Array<string> = []
    runUntil(fight, 60 * 120, () => fight.view().flow !== "playing", () => {
      play(fight, thumb)
      before = fight.view()
    })
    const after = fight.view()
    presentation.observe(after)
    cues.push(...cuesBetween(before, after).map((c) => c.name))
    return { cues, vanished: presentation.vanish !== null }
  }
  const director = new Director()
  const scene = clearOf("Prologue", (fight, thumb) => {
    const cue = director.step(fight.view(), 1 / 60)
    thumb.push = cue.push
    if (cue.ready) director.advance()
  })
  assert.ok(!scene.cues.some((c) => c === "room.clear" || c.startsWith("star.")), `quiet: ${scene.cues.join(", ")}`)
  assert.equal(scene.vanished, false)
  const room = clearOf("First Cut", (fight, thumb) => {
    const p = fight.view().player!
    const e = fight.view().enemies.filter((x) => !x.sealed).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
    thumb.push = e === undefined ? { x: 0, y: 0 } : pushToward(fight, e.x, e.y)
  })
  assert.ok(room.cues.includes("room.clear") && room.cues.includes("star.1"), `a room's clear sings: ${room.cues.join(", ")}`)
  assert.equal(room.vanished, true)
})

test("a crate a shot breaks bursts the shot's way, once, and its planks stay until the attempt ends", () => {
  const base = initial()
  const crate = { x: 4, y: 6, w: 1.2, h: 1.2, kind: "crate" as const, hits: 1, maxHits: 1 }
  const view = { ...base, cover: [...base.cover, crate], shots: [{ id: 7, kind: "bullet" as const, x: 3.3, y: 6.6, radius: 0.12, vx: 9, vy: 0 }] }
  const fx = new Presentation(); fx.observe(view)
  const burst = next(view, { cover: base.cover, shots: [] })
  fx.observe(burst); fx.observe(burst); fx.observe(next(burst))
  assert.equal(fx.splinters.length, 1, "one burst, not replayed on a render")
  assert.ok(Math.abs(fx.splinters[0]!.angle) < 0.01, "thrown the way the bullet flew")
  assert.deepEqual(fx.takePulses(), ["crate"])
  fx.advance(2)
  assert.equal(fx.splinters.length, 1, "the planks stay on the floor")
  fx.observe({ ...initial(), step: 0 })
  assert.equal(fx.splinters.length, 0, "a retry clears them")
})
