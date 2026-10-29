/** The fight without a browser: the runtime, the schedules, and the intents. */
import { Clock, type HostClock } from "@typeonce/ritmo"

import { Flow, Game, IntentEvent, STEP, Time, type Intent } from "./schema.ts"
import { ApplyIntentSystem, BuildRoomSystem, DeadLockSystem, FightSystem } from "./systems.ts"
import type { VariantId } from "./tuning.ts"
import { FightViewInspector, type FightView } from "./view.ts"

const AdvanceTime = Clock.system(Game, { name: "Slap/AdvanceTime", resource: Time })

export const updateSchedule = Game.Schedule(
  AdvanceTime,
  ApplyIntentSystem,
  Game.Schedule.applyStateTransitions(),
  BuildRoomSystem,
  Game.Schedule.applyDeferred(),
  FightSystem,
  DeadLockSystem,
  Game.Schedule.applyDeferred(),
  Game.Schedule.applyStateTransitions()
)

type DebugOption = { readonly hostClock: HostClock.HostClock } | undefined

const makeRuntime = <const Debug extends DebugOption>(room: number, variant: VariantId, debug: Debug) => {
  const made = Game.Runtime.make({
    services: Game.Runtime.services(),
    resources: {
      Time: Clock.start(STEP),
      Run: { room, deaths: 0, rebuild: true },
      Pace: { scale: 1, variant },
      Stick: { x: 0, y: 0 },
      Slashes: []
    },
    machines: Game.Runtime.machines(Game.Runtime.machine(Flow, { _tag: "Playing" })),
    debug
  })
  if (!made.ok) throw new Error("Slap: invalid setup")
  return made.value
}

export class Fight<const Debug extends DebugOption = undefined> {
  readonly runtime: ReturnType<typeof makeRuntime<Debug>>

  constructor(room: number, variant: VariantId, debug: Debug) {
    this.runtime = makeRuntime(room, variant, debug)
  }

  view(): FightView {
    return this.runtime.inspect(FightViewInspector)
  }

  send(intent: Intent): void {
    this.runtime.send(IntentEvent, intent)
  }
}

export const createFight = (room: number, variant: VariantId): Fight => new Fight(room, variant, undefined)

export const lintTarget = async () => {
  const { HostClock } = await import("@typeonce/ritmo")
  const fight = new Fight(0, "glide", { hostClock: HostClock.test() })
  return { runtime: fight.runtime, schedules: { update: updateSchedule }, hostEvents: [IntentEvent] }
}

export { STEP }
export type { Intent }
