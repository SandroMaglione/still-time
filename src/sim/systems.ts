/**
 * The rules: intents from the page, building a room, and one step of the
 * fight (world speed, moving, shooting, cutting, getting hit).
 */
import { canSee, insidePillar, pushOut } from "./geometry.ts"
import { ROOMS } from "./rooms.ts"
import { Body, Enemy, Flow, Melee, Game, IntentEvent, Pace, Player, RoomScope, Run, Shot, Slashes, Stick, Time } from "./schema.ts"
import { BRUTE, SHOOTERS, SHOTS, TUNING, VARIANTS, VARIANT_IDS, radiusOf } from "./tuning.ts"

const PlayerQuery = Game.Query({ selection: { body: Game.Query.write(Body), player: Game.Query.write(Player) } })
const ShooterQuery = Game.Query({ selection: { body: Game.Query.read(Body), enemy: Game.Query.write(Enemy) }, without: [Player, Shot, Melee] })
const BruteQuery = Game.Query({ selection: { body: Game.Query.write(Body), enemy: Game.Query.read(Enemy), melee: Game.Query.write(Melee) }, without: [Player, Shot] })

/** The signed difference between two angles, in -π..π. */
const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const ShotQuery = Game.Query({ selection: { body: Game.Query.write(Body), shot: Game.Query.read(Shot) }, without: [Player, Enemy] })

export const ApplyIntentSystem = Game.System(
  "Slap/ApplyIntent",
  {
    resources: { run: Game.System.writeResource(Run), pace: Game.System.writeResource(Pace), stick: Game.System.writeResource(Stick) },
    machines: { flow: Game.System.machine(Flow) },
    nextMachines: { flow: Game.System.nextState(Flow) },
    events: { intents: Game.System.readEvent(IntentEvent) }
  },
  ({ resources, machines, nextMachines, events }) => {
    const flow = machines.flow.get()
    const rebuild = (room: number): void => {
      const run = resources.run.get()
      resources.run.set({ room, deaths: run.deaths, rebuild: true })
      nextMachines.flow.set({ _tag: "Playing" })
    }
    for (const intent of events.intents.all()) {
      switch (intent.kind) {
        case "stick": {
          const len = Math.hypot(intent.x, intent.y)
          resources.stick.set(len > 1 ? { x: intent.x / len, y: intent.y / len } : { x: intent.x, y: intent.y })
          break
        }
        case "tap":
          if (flow._tag === "Dead" && flow.wait <= 0) rebuild(resources.run.get().room)
          else if (flow._tag === "Cleared") rebuild(resources.run.get().room + 1)
          else if (flow._tag === "Won") rebuild(0)
          break
        case "restart":
          rebuild(resources.run.get().room)
          break
        case "goToRoom":
          if (intent.room >= 0 && intent.room < ROOMS.length) rebuild(intent.room)
          break
        case "nextVariant": {
          const pace = resources.pace.get()
          const next = VARIANT_IDS[(VARIANT_IDS.indexOf(pace.variant) + 1) % VARIANT_IDS.length] ?? "glide"
          resources.pace.set({ scale: pace.scale, variant: next })
          resources.stick.set({ x: 0, y: 0 })
          rebuild(resources.run.get().room)
          break
        }
      }
    }
  }
)

export const BuildRoomSystem = Game.System(
  "Slap/BuildRoom",
  {
    resources: { run: Game.System.writeResource(Run), pace: Game.System.writeResource(Pace), stick: Game.System.writeResource(Stick), slashes: Game.System.writeResource(Slashes) },
    commands: Game.System.commands(Game.System.spawns(Body, Player, Enemy, Melee), Game.System.despawnsScope(RoomScope))
  },
  ({ resources, commands }) => {
    const run = resources.run.get()
    if (!run.rebuild) return
    const room = ROOMS[run.room]
    if (room === undefined) return
    commands.despawnScope(RoomScope)
    commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: room.start.x, y: room.start.y }], [Player, { vx: 0, vy: 0 }]))
    for (const e of room.enemies) {
      if (e.kind === "brute") {
        const facing = Math.atan2(room.start.y - e.y, room.start.x - e.x)
        commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, { kind: e.kind, cooldown: 0 }], [Melee, { facing, phase: "idle", t: 0, tx: e.x, ty: e.y }]))
      } else commands.spawnIn(RoomScope, Game.Command.spawn([Body, { x: e.x, y: e.y }], [Enemy, { kind: e.kind, cooldown: e.delay }]))
    }
    resources.run.set({ room: run.room, deaths: run.deaths, rebuild: false })
    resources.pace.set({ scale: VARIANTS[resources.pace.get().variant].slow, variant: resources.pace.get().variant })
    resources.stick.set({ x: 0, y: 0 })
    resources.slashes.set([])
  }
)

export const FightSystem = Game.System(
  "Slap/Fight",
  {
    when: [Game.Condition.inState(Flow, "Playing")],
    queries: { players: PlayerQuery, enemies: ShooterQuery, brutes: BruteQuery, shots: ShotQuery },
    resources: {
      time: Game.System.readResource(Time),
      run: Game.System.writeResource(Run),
      pace: Game.System.writeResource(Pace),
      stick: Game.System.readResource(Stick),
      slashes: Game.System.writeResource(Slashes)
    },
    nextMachines: { flow: Game.System.nextState(Flow) },
    commands: Game.System.commands(Game.System.spawns(Body, Shot), Game.System.despawns(Enemy, Shot))
  },
  ({ queries, resources, nextMachines, commands }) => {
    const realDt = resources.time.get().dt
    const run = resources.run.get()
    const room = ROOMS[run.room]
    if (room === undefined || run.rebuild) return
    const { w, h } = room
    const pace = resources.pace.get()
    const variant = VARIANTS[pace.variant]
    const stick = resources.stick.get()

    const player = queries.players.each()[0]
    if (player === undefined) return

    // How hard the thumb pushes, 0 to 1, shaped for finer control near the press point.
    const push = Math.pow(Math.min(1, Math.hypot(stick.x, stick.y)), TUNING.player.curve)
    const dir = Math.hypot(stick.x, stick.y)

    // World speed: follows your speed (or snaps to real time once you move), slow while you are still.
    const target = push === 0 ? variant.slow : variant.time === "follow" ? variant.slow + (1 - variant.slow) * push : 1
    const ease = Math.min(1, TUNING.timeEase * realDt)
    const scale = pace.scale + (target - pace.scale) * ease
    resources.pace.set({ scale, variant: pace.variant })
    const dt = realDt * scale

    // Move the player, in real time: the world is what slows down, not you.
    const speed = TUNING.player.speed * push
    const vx = dir === 0 ? 0 : (stick.x / dir) * speed
    const vy = dir === 0 ? 0 : (stick.y / dir) * speed
    const r = TUNING.player.radius
    let { x, y } = player.data.body.get()
    x = Math.max(r, Math.min(w - r, x + vx * realDt))
    y = Math.max(r, Math.min(h - r, y + vy * realDt))
    for (const p of room.pillars) {
      const out = pushOut(x, y, r, p)
      if (out !== null) { x = out.x; y = out.y }
    }
    player.data.body.set({ x, y })
    player.data.player.set({ vx, vy })

    // Enemies: cut down the close ones, the rest count down and shoot.
    const killed = new Set<unknown>()
    const slashes = resources.slashes.get().map((s) => ({ ...s, age: s.age + realDt })).filter((s) => s.age < 0.35)
    let alive = 0
    for (const { entity, data } of queries.enemies.each()) {
      const at = data.body.get()
      const enemy = data.enemy.get()
      if (Math.hypot(at.x - x, at.y - y) <= TUNING.attackRange) {
        commands.despawn(entity)
        killed.add(entity)
        slashes.push({ x: at.x, y: at.y, angle: Math.atan2(at.y - y, at.x - x), age: 0 })
        continue
      }
      alive++
      if (enemy.kind === "brute") continue
      const spec = SHOOTERS[enemy.kind]
      // Reload runs always; a shot needs sight, and a short reaction after you step out of cover.
      const sees = canSee(at.x, at.y, x, y, TUNING.sight, room.pillars)
      const cooldown = sees ? enemy.cooldown - dt : Math.max(TUNING.reaction, enemy.cooldown - dt)
      if (cooldown > 0) {
        data.enemy.set({ kind: enemy.kind, cooldown })
        continue
      }
      data.enemy.set({ kind: enemy.kind, cooldown: cooldown + spec.period })
      const aim = Math.atan2(y - at.y, x - at.x)
      const shot = SHOTS[spec.shot]
      for (const offset of spec.spread) {
        const a = aim + offset
        const ux = Math.cos(a), uy = Math.sin(a)
        const start = spec.radius + shot.radius + 0.05
        commands.spawnIn(
          RoomScope,
          Game.Command.spawn([Body, { x: at.x + ux * start, y: at.y + uy * start }], [Shot, { kind: spec.shot, vx: ux * shot.speed, vy: uy * shot.speed }])
        )
      }
    }

    // Brutes: guarded in front, cut from the side or behind; they chase, wind up, swing, recover.
    let hit = false
    for (const { entity, data } of queries.brutes.each()) {
      const at = data.body.get()
      const m = data.melee.get()
      const toYou = Math.atan2(y - at.y, x - at.x)
      const dist = Math.hypot(x - at.x, y - at.y)
      const flank = Math.abs(angleDiff(toYou, m.facing)) > BRUTE.guard
      if (dist <= TUNING.attackRange && flank) {
        commands.despawn(entity)
        killed.add(entity)
        slashes.push({ x: at.x, y: at.y, angle: toYou + Math.PI, age: 0 })
        continue
      }
      alive++
      const sees = canSee(at.x, at.y, x, y, TUNING.sight, room.pillars)
      const t = m.t - dt
      switch (m.phase) {
        case "idle":
        case "chase": {
          if (m.phase === "idle" && !sees) break
          const tx = sees ? x : m.tx, ty = sees ? y : m.ty
          if (sees && dist <= BRUTE.trigger) {
            data.melee.set({ facing: m.facing, phase: "windup", t: BRUTE.windup, tx, ty })
            break
          }
          // Turn toward you at a limited rate, walk where it faces.
          const want = Math.atan2(ty - at.y, tx - at.x)
          const turn = Math.max(-BRUTE.turn * dt, Math.min(BRUTE.turn * dt, angleDiff(want, m.facing)))
          const facing = m.facing + turn
          const step = Math.hypot(tx - at.x, ty - at.y) > 0.3 ? BRUTE.speed * dt : 0
          let bx = Math.max(BRUTE.radius, Math.min(w - BRUTE.radius, at.x + Math.cos(facing) * step))
          let by = Math.max(BRUTE.radius, Math.min(h - BRUTE.radius, at.y + Math.sin(facing) * step))
          for (const p of room.pillars) {
            const out = pushOut(bx, by, BRUTE.radius, p)
            if (out !== null) { bx = out.x; by = out.y }
          }
          data.body.set({ x: bx, y: by })
          data.melee.set({ facing, phase: "chase", t: 0, tx, ty })
          break
        }
        case "windup":
          data.melee.set(t > 0 ? { ...m, t } : { ...m, phase: "swing", t: BRUTE.swing })
          break
        case "swing":
          if (dist <= BRUTE.reach + r && Math.abs(angleDiff(toYou, m.facing)) <= BRUTE.arc) hit = true
          data.melee.set(t > 0 ? { ...m, t } : { ...m, phase: "recover", t: BRUTE.recover })
          break
        case "recover":
          data.melee.set(t > 0 ? { ...m, t } : { ...m, phase: "chase", t: 0 })
          break
      }
    }

    // Shots fly; walls and pillars stop them; they hit you and other enemies alike.
    const enemyBodies = [
      ...queries.enemies.each().map((m) => ({ entity: m.entity as unknown, at: m.data.body.get(), radius: radiusOf(m.data.enemy.get().kind), kill: () => commands.despawn(m.entity) })),
      ...queries.brutes.each().map((m) => ({ entity: m.entity as unknown, at: m.data.body.get(), radius: BRUTE.radius, kill: () => commands.despawn(m.entity) }))
    ].filter((e) => !killed.has(e.entity))
    for (const { entity, data } of queries.shots.each()) {
      const s = data.shot.get()
      const at = data.body.get()
      const nx = at.x + s.vx * dt, ny = at.y + s.vy * dt
      const sr = SHOTS[s.kind].radius
      if (nx < 0 || ny < 0 || nx > w || ny > h || insidePillar(nx, ny, sr, room.pillars)) {
        commands.despawn(entity)
        continue
      }
      data.body.set({ x: nx, y: ny })
      if (Math.hypot(nx - x, ny - y) < r + sr) hit = true
      const victim = enemyBodies.find((e) => !killed.has(e.entity) && Math.hypot(nx - e.at.x, ny - e.at.y) < e.radius + sr)
      if (victim !== undefined) {
        victim.kill()
        killed.add(victim.entity)
        commands.despawn(entity)
        alive--
        slashes.push({ x: victim.at.x, y: victim.at.y, angle: Math.atan2(s.vy, s.vx), age: 0 })
      }
    }
    resources.slashes.set(slashes)

    if (hit) {
      resources.run.set({ room: run.room, deaths: run.deaths + 1, rebuild: false })
      nextMachines.flow.set({ _tag: "Dead", wait: TUNING.deadLock })
    } else if (alive <= 0) {
      nextMachines.flow.set(run.room + 1 >= ROOMS.length ? { _tag: "Won" } : { _tag: "Cleared" })
    }
  }
)

/** The short lock after a hit, so a tap that was moving you does not restart at once. */
export const DeadLockSystem = Game.System(
  "Slap/DeadLock",
  {
    when: [Game.Condition.inState(Flow, "Dead")],
    resources: { time: Game.System.readResource(Time) },
    machines: { flow: Game.System.machine(Flow) },
    nextMachines: { flow: Game.System.nextState(Flow) }
  },
  ({ resources, machines, nextMachines }) => {
    const flow = machines.flow.get()
    if (flow._tag === "Dead" && flow.wait > 0) nextMachines.flow.set({ _tag: "Dead", wait: Math.max(0, flow.wait - resources.time.get().dt) })
  }
)
