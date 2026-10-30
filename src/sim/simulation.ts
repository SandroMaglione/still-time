/**
 * The fight without a browser: the runtime, the schedules, and the inputs.
 * The page, the tests, the fuzzer and `ritmo-devtools lint` all build it here.
 */
import { InputCapture } from "@typeonce/ritmo-browser"
import { Clock, type HostClock } from "@typeonce/ritmo"

import { Flow, Game, Input, IntentEvent, STEP, ThumbInput, Time, type Intent, type Thumb } from "./schema.ts"
import type { Best } from "./progress.ts"
import { ROOMS } from "./rooms.ts"
import { CrowdSystem, MeleeSystem, RunnersSystem, ShootersSystem, StalkersSystem } from "./systems/enemies.ts"
import { CutSystem, MovePlayerSystem, PaceSystem } from "./systems/player.ts"
import { BombsSystem } from "./systems/bombs.ts"
import { HazardsSystem } from "./systems/hazards.ts"
import { ApplyIntentSystem, BuildRoomSystem, FadeSlashesSystem, LocksSystem, OpenRunSystem, OutcomeSystem } from "./systems/run.ts"
import { ShotsSystem } from "./systems/shots.ts"
import { FightViewInspector, type FightView } from "./view.ts"

const AdvanceTime = Clock.system(Game, { name: "Slap/AdvanceTime", resource: Time })
const CaptureThumb = InputCapture.system(Game, { name: "Slap/CaptureThumb", source: ThumbInput, resource: Input })

/** Builds the first room. */
export const setupSchedule = Game.Schedule(OpenRunSystem, BuildRoomSystem, Game.Schedule.applyDeferred(), Game.Schedule.applyStateTransitions())

/** One step: input, the run, you, the enemies, the shots, the locks, the outcome. */
export const updateSchedule = Game.Schedule(
  AdvanceTime,
  CaptureThumb,
  ApplyIntentSystem,
  BuildRoomSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions(),
  PaceSystem,
  MovePlayerSystem,
  CutSystem,
  Game.Schedule.applyDeferred(),
  ShootersSystem,
  MeleeSystem,
  RunnersSystem,
  StalkersSystem,
  CrowdSystem,
  ShotsSystem,
  BombsSystem,
  HazardsSystem,
  FadeSlashesSystem,
  Game.Schedule.applyDeferred(),
  LocksSystem,
  OutcomeSystem,
  Game.Schedule.applyStateTransitions()
)

/** A thumb at rest: what the input holds before the first capture. */
export const IDLE_THUMB: Thumb = { x: 0, y: 0, tap: false }

type DebugOption = { readonly hostClock: HostClock.HostClock } | undefined

/**
 * How a run starts: the device's saved best per room (none on a new device),
 * and whether every room is open regardless of progress (testing).
 */
export interface RunStart {
  readonly best?: Best
  readonly open?: boolean
}

/** The runtime for a run starting at `room`, reading the thumb from `thumb`. */
export const makeRuntime = <const Debug extends DebugOption>(options: { readonly room: number; readonly thumb: { readonly snapshot: () => Thumb }; readonly debug: Debug } & RunStart) => {
  const made = Game.Runtime.make({
    services: Game.Runtime.services(Game.Runtime.service(ThumbInput, options.thumb)),
    resources: {
      Time: Clock.start(STEP),
      Run: { room: options.room, deaths: 0, hits: 0, world: 0, best: ROOMS.map((_, i) => options.best?.[i] ?? null), open: options.open ?? false },
      Pace: { scale: 1 },
      Slashes: [],
      Blasts: [],
      Doors: [],
      Wear: [],
      Plates: { down: [], on: null, missed: null },
      Keys: [],
      Input: IDLE_THUMB
    },
    machines: Game.Runtime.machines(Game.Runtime.machine(Flow, { _tag: "Playing" })),
    debug: options.debug
  })
  if (!made.ok) throw new Error(`Slap: invalid setup ${JSON.stringify(made.error)}`)
  return made.value
}

/** A run: tick it, send page commands, read the view. Setup has already run. */
export class Fight<const Debug extends DebugOption = undefined> {
  readonly runtime: ReturnType<typeof makeRuntime<Debug>>

  constructor(room: number, thumb: { readonly snapshot: () => Thumb }, debug: Debug, start: RunStart = {}) {
    this.runtime = makeRuntime({ room, thumb, debug, ...start })
    const ran = this.runtime.tick(setupSchedule)
    if (!ran.ok) throw new Error(`Slap: setup failed ${JSON.stringify(ran.error)}`)
  }

  /** One step of the simulation, 1/60 s of real time. */
  tick(): void {
    const ran = this.runtime.tick(updateSchedule)
    if (!ran.ok) throw new Error(`Slap: tick failed ${JSON.stringify(ran.error)}`)
  }

  view(): FightView {
    return this.runtime.inspect(FightViewInspector)
  }

  /** A page command, applied on the next tick. */
  send(intent: Intent): void {
    this.runtime.send(IntentEvent, intent)
  }
}

export const createFight = (room: number, thumb: { readonly snapshot: () => Thumb }, start: RunStart = {}): Fight => new Fight(room, thumb, undefined, start)

/** The lint entry: a debug runtime and the schedules the page ticks. */
export const lintTarget = async () => {
  const { HostClock } = await import("@typeonce/ritmo")
  const runtime = makeRuntime({ room: 0, thumb: { snapshot: () => IDLE_THUMB }, debug: { hostClock: HostClock.test() } })
  return { runtime, schedules: { setup: setupSchedule, update: updateSchedule }, hostEvents: [IntentEvent] }
}

export { STEP }
export type { Intent, Thumb }
