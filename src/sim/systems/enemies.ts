/**
 * The enemies, in world time (slowed with the world):
 * - shooters reload, sidestep an ally in their line of fire, creep toward
 *   where they last saw you, and fire only with sight and a clear line;
 * - the melee family (brute, shield-bearer) chases you round its allies,
 *   winds up (tracking, then committed), swings a wedge, and recovers;
 * - runners flee while they can see you, toward the way out that keeps
 *   them furthest from you;
 * - every enemy is solid: overlaps are pushed apart.
 * Closed doors are walls to all of them.
 */
import { Ops } from "@typeonce/ritmo"

import { angleDiff, canSee, segmentDistance, settle, turnToward } from "../geometry.ts"
import { Body, Bomb, Doors, Flow, Game, Pace, PlayerHit, RoomScope, Run, Shot, Time, Wear } from "../schema.ts"
import type { Pillar } from "../rooms.ts"
import { COVER, CROWD, GIVE, MELEE, RUNNER, STALKER, SHOOTER_MOVE, SHOOTERS, SHOTS, TUNING, isMelee, isShooter, radiusOf } from "../tuning.ts"
import { MeleeQuery, MeleeRead, PlayerRead, RunnerQuery, RunnerRead, ShooterQuery, ShooterRead, StalkerQuery, StalkerRead, roomOf, wallsOf } from "./queries.ts"

const playing = [Game.Condition.inState(Flow, "Playing")] as const

/** Whether a swing's wedge (from `at`, facing `facing`, `reach` long, ±`arc`) reaches into a rectangle: sampled across the wedge. */
const wedgeTouches = (p: Pillar, at: { readonly x: number; readonly y: number }, facing: number, reach: number, arc: number): boolean => {
  for (let i = 0; i <= 8; i++) {
    const a = facing - arc + (2 * arc * i) / 8
    for (let j = 1; j <= 6; j++) {
      const d = (reach * j) / 6
      const x = at.x + Ops.cos(a) * d, y = at.y + Ops.sin(a) * d
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true
    }
  }
  return false
}

/** Seconds of world time this step: real seconds times the world speed. */
const worldDt = (time: { readonly dt: number }, pace: { readonly scale: number }): number => time.dt * pace.scale

const fightResources = {
  time: Game.System.readResource(Time),
  pace: Game.System.readResource(Pace),
  run: Game.System.readResource(Run),
  doors: Game.System.readResource(Doors),
  wear: Game.System.readResource(Wear)
} as const

export const ShootersSystem = Game.System(
  "Slap/Shooters",
  {
    when: playing,
    queries: { players: PlayerRead, shooters: ShooterQuery, melee: MeleeRead, runners: RunnerRead, stalkers: StalkerRead },
    resources: fightResources,
    commands: Game.System.commands(Game.System.spawns(Body, Shot, Bomb))
  },
  ({ queries, resources, commands }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const dt = worldDt(resources.time.get(), resources.pace.get())
    // Everyone's place at the start of the step, to keep lines of fire clear of allies.
    const allies = [
      ...queries.shooters.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) })),
      ...queries.melee.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) })),
      ...queries.runners.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: RUNNER.radius })),
      ...queries.stalkers.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: STALKER.radius }))
    ]
    for (const { entity, data } of queries.shooters.each()) {
      const kind = data.enemy.get().kind
      // A quiet shooter never aims, moves or fires: a target, not a threat.
      if (!isShooter(kind) || data.enemy.get().quiet) continue
      const spec = SHOOTERS[kind]
      // A bomb is lobbed over allies (whoever its blast takes); every other shot keeps its line clear of them.
      const fires = spec.shot
      const shot = fires === "bomb" ? null : SHOTS[fires]
      const at = data.body.get()
      const post = data.post.get()
      // Still walking in: straight to its post, nothing else (its reload waits).
      if (post.arriving) {
        const dx = post.hx - at.x, dy = post.hy - at.y, d = Ops.hypot(dx, dy), step = SHOOTER_MOVE.enter * dt
        if (d <= step) { data.body.set({ x: post.hx, y: post.hy }); data.post.set({ ...post, arriving: false }) }
        else data.body.set({ x: at.x + (dx / d) * step, y: at.y + (dy / d) * step })
        continue
      }
      const sees = canSee(at.x, at.y, me.x, me.y, spec.sight, walls)
      const reload = data.reload.get()
      // A scoped shooter's aim stops following you for the last `lock` of its charge.
      const aim = spec.scoped && reload.left <= spec.lock ? reload.aim : Ops.atan2(me.y - at.y, me.x - at.x)
      // Would any of its shots (each knife of a fan) pass through an ally first?
      const reach = Ops.hypot(me.x - at.x, me.y - at.y)
      const blocked = sees && shot !== null && spec.spread.some((offset) => {
        const ex = at.x + Ops.cos(aim + offset) * reach, ey = at.y + Ops.sin(aim + offset) * reach
        return allies.some((a) => a.id !== entity.id && segmentDistance(a.at.x, a.at.y, at.x, at.y, ex, ey) < a.radius + shot.radius + SHOOTER_MOVE.allyGap)
      })
      const seen = sees ? { x: me.x, y: me.y } : post.seen
      // Footwork: sidestep a blocked line, creep toward where it last saw you, on a leash from its post.
      let strafe = post.strafe
      let to = at
      const stepLen = SHOOTER_MOVE.speed * dt
      if (blocked) {
        const side = aim + (Math.PI / 2) * strafe
        to = settle(at.x + Ops.cos(side) * stepLen, at.y + Ops.sin(side) * stepLen, spec.radius, room.w, room.h, walls)
      } else if (spec.creeps && !sees && seen !== null && Ops.hypot(seen.x - at.x, seen.y - at.y) > 1) {
        const d = Ops.hypot(seen.x - at.x, seen.y - at.y)
        to = settle(at.x + ((seen.x - at.x) / d) * stepLen, at.y + ((seen.y - at.y) / d) * stepLen, spec.radius, room.w, room.h, walls)
      }
      if (Ops.hypot(to.x - post.hx, to.y - post.hy) > SHOOTER_MOVE.leash) {
        to = at
        if (blocked) strafe = strafe === 1 ? -1 : 1
      } else if (blocked && Ops.hypot(to.x - at.x, to.y - at.y) < stepLen * 0.3) strafe = strafe === 1 ? -1 : 1
      if (to !== at) data.body.set(to)
      data.post.set({ hx: post.hx, hy: post.hy, seen, strafe, arriving: false })
      // Reload runs always; a shot needs sight and a clear line, and a short reaction after you step out of cover.
      // A scoped shooter charges only while it sees you with a clear line (an ally in the way holds it): losing sight of you starts it over.
      // oxlint-disable-next-line ritmo/no-float-timers -- world time, scaled by the slow motion: no whole step to end on
      const counted = reload.left - dt
      const left = sees && !blocked ? counted
        : spec.scoped ? (sees ? reload.left : spec.period)
        : Math.max(TUNING.reaction, counted)
      if (left > 0) {
        data.reload.set({ left, aim })
        continue
      }
      data.reload.set({ left: left + spec.period, aim })
      if (fires === "bomb" || shot === null) {
        // At where you stand, as far as it can see.
        const d = Math.min(reach, spec.sight)
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: to.x, y: to.y }], [Bomb, { _tag: "flying", tx: to.x + Ops.cos(aim) * d, ty: to.y + Ops.sin(aim) * d }]))
        continue
      }
      for (const offset of spec.spread) {
        const a = aim + offset
        const ux = Ops.cos(a), uy = Ops.sin(a)
        const start = spec.radius + shot.radius + 0.05
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: to.x + ux * start, y: to.y + uy * start }], [Shot, { kind: fires, vx: ux * shot.speed, vy: uy * shot.speed }]))
      }
    }
  }
)

export const MeleeSystem = Game.System(
  "Slap/Blades",
  {
    when: playing,
    queries: { players: PlayerRead, shooters: ShooterRead, melee: MeleeQuery, runners: RunnerRead, stalkers: StalkerRead },
    resources: { ...fightResources, wear: Game.System.writeResource(Wear) },
    events: { hit: Game.System.writeEvent(PlayerHit) }
  },
  ({ queries, resources, events }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const dt = worldDt(resources.time.get(), resources.pace.get())
    const r = TUNING.player.radius
    const allies = [
      ...queries.shooters.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) })),
      ...queries.melee.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind) })),
      ...queries.runners.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: RUNNER.radius })),
      ...queries.stalkers.each().map((m) => ({ id: m.entity.id, at: m.data.body.get(), radius: STALKER.radius }))
    ]
    const worldStep = dt
    for (const { entity, data } of queries.melee.each()) {
      const kind = data.enemy.get().kind
      if (!isMelee(kind)) continue
      const spec = MELEE[kind]
      // A clockwork enemy keeps real time: standing still does not slow it.
      const dt = spec.clock === "real" ? resources.time.get().dt : worldStep
      const at = data.body.get()
      const { facing, pace } = data.melee.get()
      const blade = data.blade.get()
      const toYou = Ops.atan2(me.y - at.y, me.x - at.x)
      const dist = Ops.hypot(me.x - at.x, me.y - at.y)
      const sees = canSee(at.x, at.y, me.x, me.y, TUNING.sight, walls)
      switch (blade._tag) {
        case "idle":
        case "chase": {
          if (blade._tag === "idle" && !sees) break
          if (sees && dist <= spec.trigger) {
            if (blade._tag === "idle") data.blade.transition({ from: "idle", to: "windup", data: { left: spec.windup } })
            else data.blade.transition({ from: "chase", to: "windup", data: { left: spec.windup } })
            break
          }
          const target = sees ? { x: me.x, y: me.y } : blade._tag === "chase" ? { x: blade.x, y: blade.y } : at
          // Face you at a limited rate; walk toward you, keeping room from allies and steering round any in the way.
          const want = Ops.atan2(target.y - at.y, target.x - at.x)
          const ux = Ops.cos(want), uy = Ops.sin(want)
          let mx = ux, my = uy
          for (const a of allies) {
            if (a.id === entity.id) continue
            const ox = at.x - a.at.x, oy = at.y - a.at.y
            const od = Ops.hypot(ox, oy)
            if (od === 0) { mx += Ops.cos(facing + Math.PI / 2); my += Ops.sin(facing + Math.PI / 2); continue }
            const space = spec.radius + a.radius + CROWD.space
            if (od < space) { mx += (ox / od) * ((space - od) / space) * CROWD.push; my += (oy / od) * ((space - od) / space) * CROWD.push }
            // An ally ahead on the path: step to whichever side it is not on.
            const ahead = -(ox * ux + oy * uy)
            const lateral = -(ox * -uy + oy * ux)
            if (ahead > 0 && ahead < CROWD.look && Math.abs(lateral) < spec.radius + a.radius + 0.3) {
              const k = CROWD.round * (1 - ahead / CROWD.look) * (lateral > 0 ? -1 : 1)
              mx += -uy * k; my += ux * k
            }
          }
          const ml = Ops.hypot(mx, my) || 1
          const step = Ops.hypot(target.x - at.x, target.y - at.y) > 0.3 ? spec.speed * pace * dt : 0
          data.body.set(settle(at.x + (mx / ml) * step, at.y + (my / ml) * step, spec.radius, room.w, room.h, walls))
          data.melee.set({ facing: turnToward(facing, want, spec.turn * dt), pace })
          if (blade._tag === "idle") data.blade.transition({ from: "idle", to: "chase", data: target })
          else data.blade.update({ state: "chase", data: () => target })
          break
        }
        case "windup": {
          // Tracks you and steps in until the last `lock` seconds, then commits to its facing.
          const tracking = blade.left > spec.lock
          if (tracking) {
            data.melee.set({ facing: turnToward(facing, toYou, spec.turn * dt), pace })
            if (dist > spec.close) {
              const step = Math.min(dist - spec.close, spec.speed * spec.step * dt)
              data.body.set(settle(at.x + Ops.cos(toYou) * step, at.y + Ops.sin(toYou) * step, spec.radius, room.w, room.h, walls))
            }
          }
          // oxlint-disable-next-line ritmo/no-float-timers -- world time, scaled by the slow motion
          const left = blade.left - dt
          if (left > 0) data.blade.update({ state: "windup", data: () => ({ left }) })
          else {
            data.blade.transition({ from: "windup", to: "swing", data: { left: spec.swing } })
            // The strike lands the step it starts: a rush that would reach your cut this step meets the blade first.
            if (dist <= spec.reach + r && Math.abs(angleDiff(toYou, facing)) <= spec.arc) events.hit.emit({ by: "swing" })
          }
          break
        }
        case "swing": {
          if (dist <= spec.reach + r && Math.abs(angleDiff(toYou, facing)) <= spec.arc) events.hit.emit({ by: "swing" })
          // The blade bites into any cracked wall inside its wedge.
          const wear = resources.wear.get()
          const broken = room.pillars.map((p, i) => wear[i] !== 0 && p.breaks === "cracked" && wedgeTouches(p, at, facing, spec.reach + COVER.swingBite, spec.arc))
          if (broken.some((b) => b)) resources.wear.set(wear.map((w, i) => (broken[i] === true ? 0 : w)))
          // oxlint-disable-next-line ritmo/no-float-timers -- world time, scaled by the slow motion
          const left = blade.left - dt
          if (left > 0) data.blade.update({ state: "swing", data: () => ({ left }) })
          else data.blade.transition({ from: "swing", to: "recover", data: { left: spec.recover } })
          break
        }
        case "recover": {
          // oxlint-disable-next-line ritmo/no-float-timers -- world time, scaled by the slow motion
          const left = blade.left - dt
          if (left > 0) data.blade.update({ state: "recover", data: () => ({ left }) })
          else data.blade.transition({ from: "recover", to: "chase", data: { x: me.x, y: me.y } })
          break
        }
      }
    }
  }
)

/**
 * Runners: while one sees you it weighs `RUNNER.ways` directions and runs
 * the one whose landing point is furthest from you, with a pull to keep its
 * heading (so it does not dither). Out of sight it stands still.
 */
export const RunnersSystem = Game.System(
  "Slap/Runners",
  {
    when: playing,
    queries: { players: PlayerRead, runners: RunnerQuery },
    resources: fightResources
  },
  ({ queries, resources }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const step = RUNNER.speed * worldDt(resources.time.get(), resources.pace.get())
    for (const { data } of queries.runners.each()) {
      const at = data.body.get()
      if (!canSee(at.x, at.y, me.x, me.y, TUNING.sight, walls)) continue
      const away = Ops.atan2(at.y - me.y, at.x - me.x)
      let best = away, score = -1
      for (let i = 0; i < RUNNER.ways; i++) {
        const a = away + (i / RUNNER.ways) * Math.PI * 2
        const land = settle(at.x + Ops.cos(a) * RUNNER.look, at.y + Ops.sin(a) * RUNNER.look, RUNNER.radius, room.w, room.h, walls)
        const s = Ops.hypot(land.x - me.x, land.y - me.y) + 0.4 * Ops.cos(angleDiff(a, away))
        if (s > score) { score = s; best = a }
      }
      data.body.set(settle(at.x + Ops.cos(best) * step, at.y + Ops.sin(best) * step, RUNNER.radius, room.w, room.h, walls))
    }
  }
)

/**
 * Stalkers: each creeps straight at you in real time, as fast as you are
 * still (frozen you, full speed; a full push, none), sliding along walls.
 * While you are still enough, it strikes when you are within its reach.
 */
export const StalkersSystem = Game.System(
  "Slap/Stalkers",
  {
    when: playing,
    queries: { players: PlayerRead, stalkers: StalkerQuery },
    resources: fightResources,
    events: { hit: Game.System.writeEvent(PlayerHit) }
  },
  ({ queries, resources, events }) => {
    const me = queries.players.each()[0]?.data.body.get()
    if (me === undefined) return
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const still = 1 - Math.max(0, Math.min(1, (resources.pace.get().scale - TUNING.slow) / (1 - TUNING.slow)))
    const step = STALKER.speed * still * resources.time.get().dt
    for (const { data } of queries.stalkers.each()) {
      const at = data.body.get()
      const d = Ops.hypot(me.x - at.x, me.y - at.y)
      if (still >= STALKER.wakes && d <= STALKER.reach) { events.hit.emit({ by: "touch" }); continue }
      if (step === 0 || d === 0) continue
      const move = Math.min(step, d - TUNING.player.radius - STALKER.radius)
      data.body.set(settle(at.x + ((me.x - at.x) / d) * move, at.y + ((me.y - at.y) / d) * move, STALKER.radius, room.w, room.h, walls))
    }
  }
)

/** Solid bodies: overlapping enemies are pushed apart (each kind gives way by its share), then out of walls. */
export const CrowdSystem = Game.System(
  "Slap/Crowd",
  {
    when: playing,
    queries: { shooters: ShooterQuery, melee: MeleeQuery, runners: RunnerQuery, stalkers: StalkerQuery },
    resources: { run: Game.System.readResource(Run), doors: Game.System.readResource(Doors), wear: Game.System.readResource(Wear) }
  },
  ({ queries, resources }) => {
    const room = roomOf(resources.run.get().room)
    const walls = wallsOf(room, resources.doors.get(), resources.wear.get())
    const bodies = [
      ...queries.shooters.each().map((m) => ({ cell: m.data.body, radius: radiusOf(m.data.enemy.get().kind), give: GIVE[m.data.enemy.get().kind] })),
      ...queries.melee.each().map((m) => ({ cell: m.data.body, radius: radiusOf(m.data.enemy.get().kind), give: GIVE[m.data.enemy.get().kind] })),
      ...queries.runners.each().map((m) => ({ cell: m.data.body, radius: RUNNER.radius, give: GIVE.runner })),
      ...queries.stalkers.each().map((m) => ({ cell: m.data.body, radius: STALKER.radius, give: GIVE.stalker }))
    ]
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j]
          if (a === undefined || b === undefined) continue
          const pa = a.cell.get(), pb = b.cell.get()
          const d = Ops.hypot(pb.x - pa.x, pb.y - pa.y)
          const overlap = a.radius + b.radius - d
          if (overlap <= 0) continue
          const nx = d === 0 ? 1 : (pb.x - pa.x) / d, ny = d === 0 ? 0 : (pb.y - pa.y) / d
          const share = a.give / (a.give + b.give)
          a.cell.set(settle(pa.x - nx * overlap * share, pa.y - ny * overlap * share, a.radius, room.w, room.h, walls))
          b.cell.set(settle(pb.x + nx * overlap * (1 - share), pb.y + ny * overlap * (1 - share), b.radius, room.w, room.h, walls))
        }
      }
    }
  }
)
