/**
 * The hand-made rooms: open floors bigger than the screen, with walls and
 * crates to hide behind (enemies only shoot what they can see). Coordinates
 * in metres from the top-left; `delay` is seconds before an enemy's first
 * shot, to stagger them.
 *
 * A room can be split into chambers by walls with doors. Each door has a
 * lock: its chamber cleared, its chamber's captain down, or its key brought
 * to it. A room is won by clearing every enemy, or by reaching its exit.
 * `par` is the world seconds a good clear takes, for the third star.
 */
import type { EnemyKind } from "./tuning.ts"

export interface Pillar { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** What opens a door. Chambers and keys are small numbers, set per spawn. */
export type Lock =
  | { readonly kind: "clear"; readonly chamber: number }
  | { readonly kind: "captain"; readonly chamber: number }
  | { readonly kind: "key"; readonly key: number }

export interface Door extends Pillar { readonly lock: Lock }

export type Goal = { readonly kind: "clear" } | ({ readonly kind: "exit" } & Pillar)

export interface EnemySpawn {
  readonly kind: EnemyKind
  readonly x: number
  readonly y: number
  readonly delay: number
  /** The chamber it belongs to (0 when the room has one). */
  readonly chamber?: number
  /** Wears a crown: a `captain` lock opens when its chamber's captains are down. */
  readonly captain?: boolean
  /** Runners only: the key it carries. */
  readonly key?: number
}

export interface Room {
  readonly name: string
  readonly w: number
  readonly h: number
  readonly start: { readonly x: number; readonly y: number }
  readonly pillars: ReadonlyArray<Pillar>
  readonly doors: ReadonlyArray<Door>
  readonly enemies: ReadonlyArray<EnemySpawn>
  readonly goal: Goal
  /** World seconds for the third star. */
  readonly par: number
  /** One line shown under the room, for rooms that teach something. */
  readonly tip?: string
}

const crate = (x: number, y: number, size = 1.2): Pillar => ({ x: x - size / 2, y: y - size / 2, w: size, h: size })

/** A wall across the room at `y`, `thick` deep, with a door of width `gap` centred on `at`. */
const gate = (w: number, y: number, at: number, gap: number, lock: Lock, thick = 0.8): { readonly walls: ReadonlyArray<Pillar>; readonly door: Door } => ({
  walls: [{ x: 0, y, w: at - gap / 2, h: thick }, { x: at + gap / 2, y, w: w - at - gap / 2, h: thick }],
  door: { x: at - gap / 2, y, w: gap, h: thick, lock }
})

const CLEAR = { kind: "clear" } as const

const gatehouse = gate(14, 12.6, 7, 3, { kind: "clear", chamber: 0 })
const throne = gate(16, 3.6, 8, 3, { kind: "captain", chamber: 0 })
const thief = gate(16, 3.6, 8, 3, { kind: "key", key: 0 })
const market = gate(18, 12, 9, 3, { kind: "clear", chamber: 0 }, 1)
const warehouse = gate(20, 3.2, 10, 3, { kind: "key", key: 0 })
const fortressYard = gate(22, 26, 11, 4, { kind: "clear", chamber: 0 }, 1)
const fortressKeep = gate(22, 10, 11, 3, { kind: "key", key: 0 }, 1)
const fortressThrone = gate(22, 2.4, 11, 3, { kind: "captain", chamber: 2 })

export const ROOMS: ReadonlyArray<Room> = [
  {
    name: "Duel",
    w: 12,
    h: 18,
    start: { x: 6, y: 16 },
    pillars: [crate(3, 9), crate(9, 9)],
    doors: [],
    enemies: [{ kind: "brute", x: 6, y: 4, delay: 0 }],
    goal: CLEAR,
    par: 4,
    tip: "step out of the swing, then cut back in"
  },
  {
    name: "Two Blades",
    w: 14,
    h: 22,
    start: { x: 7, y: 20 },
    pillars: [crate(4, 14), crate(10, 14), { x: 5, y: 7, w: 4, h: 0.8 }],
    doors: [],
    enemies: [
      { kind: "brute", x: 3, y: 9, delay: 0 },
      { kind: "brute", x: 11, y: 9, delay: 0 },
      { kind: "gunner", x: 7, y: 2.5, delay: 0.5 }
    ],
    goal: CLEAR,
    par: 7
  },
  {
    name: "Courtyard",
    w: 14,
    h: 24,
    start: { x: 7, y: 22 },
    pillars: [crate(4, 17), crate(10, 17), crate(7, 12.5, 1.6), crate(3, 8), crate(11, 8), { x: 5, y: 4, w: 4, h: 0.8 }],
    doors: [],
    enemies: [
      { kind: "gunner", x: 2.5, y: 12, delay: 0.3 },
      { kind: "gunner", x: 11.5, y: 12, delay: 0.7 },
      { kind: "gunner", x: 7, y: 2.5, delay: 0.5 },
      { kind: "archer", x: 1.5, y: 2, delay: 1.0 }
    ],
    goal: CLEAR,
    par: 9,
    tip: "they only shoot what they can see"
  },
  {
    name: "Friendly Fire",
    w: 16,
    h: 26,
    start: { x: 8, y: 24 },
    pillars: [crate(4, 19), crate(12, 19), crate(8, 15, 1.4), { x: 1, y: 9, w: 3, h: 0.8 }, { x: 12, y: 9, w: 3, h: 0.8 }],
    doors: [],
    enemies: [
      // Lined up: make the far ones shoot the near ones.
      { kind: "gunner", x: 8, y: 2, delay: 0.3 },
      { kind: "gunner", x: 8, y: 5.5, delay: 0.7 },
      { kind: "gunner", x: 8, y: 9, delay: 0.5 },
      { kind: "thrower", x: 2, y: 13, delay: 0.6 },
      { kind: "thrower", x: 14, y: 13, delay: 0.9 }
    ],
    goal: CLEAR,
    par: 9,
    tip: "any shot kills anyone it touches"
  },
  {
    name: "Gatehouse",
    w: 14,
    h: 26,
    start: { x: 7, y: 24 },
    pillars: [...gatehouse.walls, crate(4, 20.5), crate(10, 20.5), crate(4, 8), crate(10, 8), crate(7, 10.2)],
    doors: [gatehouse.door],
    enemies: [
      { kind: "gunner", x: 2.5, y: 15.5, delay: 0.4 },
      { kind: "gunner", x: 11.5, y: 15.5, delay: 0.8 },
      { kind: "brute", x: 7, y: 16, delay: 0 },
      { kind: "archer", x: 2, y: 2, delay: 0.6, chamber: 1 },
      { kind: "archer", x: 12, y: 2, delay: 1.0, chamber: 1 },
      { kind: "thrower", x: 7, y: 5, delay: 0.8, chamber: 1 }
    ],
    goal: CLEAR,
    par: 11,
    tip: "a door opens once its side is clear"
  },
  {
    name: "Throne",
    w: 16,
    h: 28,
    start: { x: 8, y: 26 },
    pillars: [...throne.walls, crate(4, 21), crate(12, 21), crate(8, 15, 1.4), crate(3.5, 9), crate(12.5, 9)],
    doors: [throne.door],
    enemies: [
      { kind: "gunner", x: 8, y: 6.5, delay: 0.6, captain: true },
      { kind: "gunner", x: 2.5, y: 13, delay: 0.3 },
      { kind: "gunner", x: 13.5, y: 13, delay: 0.7 },
      { kind: "brute", x: 5, y: 17, delay: 0 },
      { kind: "brute", x: 11, y: 17, delay: 0 },
      { kind: "thrower", x: 8, y: 10.5, delay: 0.9 }
    ],
    goal: { kind: "exit", x: 6.5, y: 0.7, w: 3, h: 2.2 },
    par: 8,
    tip: "down the crowned captain to open the gate"
  },
  {
    name: "Thief",
    w: 16,
    h: 24,
    start: { x: 8, y: 22 },
    pillars: [...thief.walls, crate(4, 8.5), crate(12, 8.5), crate(4, 16), crate(12, 16), crate(8, 12.5, 1.4)],
    doors: [thief.door],
    enemies: [
      { kind: "runner", x: 8, y: 10, delay: 0, key: 0 },
      { kind: "brute", x: 3, y: 6, delay: 0 },
      { kind: "gunner", x: 13, y: 5.5, delay: 0.8 }
    ],
    goal: { kind: "exit", x: 6.5, y: 0.7, w: 3, h: 2.2 },
    par: 10,
    tip: "catch the thief: it drops the key"
  },
  {
    name: "Market",
    w: 18,
    h: 28,
    start: { x: 9, y: 26 },
    pillars: [
      // A row of stalls with gaps, then the closed row that walls off the back of the market.
      { x: 2, y: 19, w: 4, h: 1 }, { x: 7.5, y: 19, w: 3, h: 1 }, { x: 12, y: 19, w: 4, h: 1 },
      ...market.walls,
      crate(4, 6), crate(14, 6), crate(9, 4, 1.8)
    ],
    doors: [market.door],
    enemies: [
      { kind: "gunner", x: 3, y: 15.5, delay: 0.3 },
      { kind: "gunner", x: 15, y: 15.5, delay: 0.6 },
      { kind: "brute", x: 9, y: 16, delay: 0 },
      { kind: "thrower", x: 9, y: 9, delay: 0.8, chamber: 1 },
      { kind: "archer", x: 2, y: 3, delay: 0.5, chamber: 1 },
      { kind: "archer", x: 16, y: 3, delay: 0.9, chamber: 1 },
      { kind: "gunner", x: 9, y: 1.5, delay: 0.4, chamber: 1 }
    ],
    goal: CLEAR,
    par: 14
  },
  {
    name: "Warehouse",
    w: 20,
    h: 32,
    start: { x: 10, y: 30 },
    pillars: [
      // Long shelves: aisles that archers watch end to end, and a thief hiding among them.
      { x: 3.5, y: 8, w: 1, h: 16 }, { x: 8, y: 6, w: 1, h: 9 }, { x: 8, y: 17.5, w: 1, h: 8 },
      { x: 11, y: 6, w: 1, h: 9 }, { x: 11, y: 17.5, w: 1, h: 8 }, { x: 15.5, y: 8, w: 1, h: 16 },
      crate(6, 27), crate(14, 27),
      ...warehouse.walls
    ],
    doors: [warehouse.door],
    enemies: [
      { kind: "runner", x: 10, y: 16, delay: 0, key: 0 },
      { kind: "archer", x: 1.5, y: 5, delay: 0.4 },
      { kind: "archer", x: 18.5, y: 5, delay: 0.8 },
      { kind: "gunner", x: 6, y: 16, delay: 0.3 },
      { kind: "gunner", x: 14, y: 16, delay: 0.5 },
      { kind: "thrower", x: 10, y: 5.5, delay: 0.7 },
      { kind: "brute", x: 6, y: 22, delay: 0 },
      { kind: "brute", x: 14, y: 10, delay: 0 }
    ],
    goal: { kind: "exit", x: 8.5, y: 0.5, w: 3, h: 2.2 },
    par: 14
  },
  {
    name: "Fortress",
    w: 22,
    h: 40,
    start: { x: 11, y: 38 },
    pillars: [
      // The yard, its gate; the court, the keep's key door; the keep, the captain's door to the exit.
      ...fortressYard.walls, ...fortressKeep.walls, ...fortressThrone.walls,
      crate(4, 34), crate(18, 34), crate(11, 33, 1.6), crate(6, 29.5), crate(16, 29.5),
      crate(9, 20.5), crate(13, 20.5), crate(2.5, 17), crate(19.5, 17), crate(7, 14), crate(15, 14),
      crate(7, 7), crate(15, 7)
    ],
    doors: [fortressYard.door, fortressKeep.door, fortressThrone.door],
    enemies: [
      { kind: "gunner", x: 2.5, y: 30, delay: 0.3 },
      { kind: "gunner", x: 19.5, y: 30, delay: 0.6 },
      { kind: "brute", x: 7, y: 32, delay: 0 },
      { kind: "brute", x: 15, y: 32, delay: 0 },
      { kind: "thrower", x: 11, y: 29, delay: 0.8 },
      { kind: "runner", x: 11, y: 18, delay: 0, chamber: 1, key: 0 },
      { kind: "archer", x: 2, y: 12.5, delay: 0.5, chamber: 1 },
      { kind: "archer", x: 20, y: 12.5, delay: 0.9, chamber: 1 },
      { kind: "gunner", x: 11, y: 13, delay: 0.6, chamber: 1 },
      { kind: "brute", x: 4, y: 22, delay: 0, chamber: 1 },
      { kind: "brute", x: 11, y: 6.5, delay: 0, chamber: 2, captain: true },
      { kind: "thrower", x: 4, y: 5, delay: 0.7, chamber: 2 },
      { kind: "thrower", x: 18, y: 5, delay: 1.0, chamber: 2 }
    ],
    goal: { kind: "exit", x: 9.5, y: 0.2, w: 3, h: 2 },
    par: 22
  }
]
