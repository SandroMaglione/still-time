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

/** A wall or crate that can break: a crate splinters under shots, a cracked wall gives to a brute's swing or a blast. */
export type Breaks = "crate" | "cracked"

/** A piece of the room's cover: solid for good unless it `breaks`. */
export interface Cover extends Pillar { readonly breaks?: Breaks }

/**
 * What opens a door. Chambers and keys are small numbers, set per spawn;
 * plates are indices into the room's plates (each plate belongs to one
 * lock), pressed in any order, or in the listed order when `ordered`.
 */
export type Lock =
  | { readonly kind: "clear"; readonly chamber: number }
  | { readonly kind: "captain"; readonly chamber: number }
  | { readonly kind: "key"; readonly key: number }
  | { readonly kind: "plates"; readonly plates: ReadonlyArray<number>; readonly ordered: boolean }

/** A pressure plate on the floor, pressed by stepping onto it. */
export interface Plate { readonly x: number; readonly y: number }

/**
 * A hazard, running on the attempt's world clock (frozen with the world):
 * a blade bar spinning round its centre, or a laser gate between two posts
 * that is on for `on` of every `period` world seconds. Either takes anyone it
 * touches.
 */
export type Hazard =
  | { readonly kind: "blade"; readonly x: number; readonly y: number; readonly length: number; readonly speed: number; readonly phase: number }
  | { readonly kind: "gate"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly period: number; readonly on: number; readonly offset: number }

export interface Door extends Pillar { readonly lock: Lock }

/** Down every enemy, reach the exit, or last `seconds` of world time (which only pass while you move). */
export type Goal = { readonly kind: "clear" } | ({ readonly kind: "exit" } & Pillar) | { readonly kind: "survive"; readonly seconds: number }

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
  readonly pillars: ReadonlyArray<Cover>
  readonly doors: ReadonlyArray<Door>
  readonly plates?: ReadonlyArray<Plate>
  readonly hazards?: ReadonlyArray<Hazard>
  readonly enemies: ReadonlyArray<EnemySpawn>
  readonly goal: Goal
  /** World seconds for the third star. */
  readonly par: number
  /** One line shown under the room, for rooms that teach something. */
  readonly tip?: string
}

const crate = (x: number, y: number, size = 1.2): Pillar => ({ x: x - size / 2, y: y - size / 2, w: size, h: size })
/** A wooden crate that splinters under fire. */
const box = (x: number, y: number, size = 1.2): Cover => ({ ...crate(x, y, size), breaks: "crate" })

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
const switchyard = gate(14, 6, 7, 3, { kind: "plates", plates: [0], ordered: false })
const combination = gate(16, 6, 8, 3, { kind: "plates", plates: [0, 1, 2], ordered: true })
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
      { kind: "brute", x: 11, y: 9, delay: 0 }
    ],
    goal: CLEAR,
    par: 5,
    tip: "two at once: take them one at a time"
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
      { kind: "gunner", x: 11.5, y: 12, delay: 0.7 }
    ],
    goal: CLEAR,
    par: 6,
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
      // Lined up: make the thrower at the back shoot the gunners in front of it.
      { kind: "thrower", x: 8, y: 2, delay: 0.6 },
      { kind: "gunner", x: 8, y: 5.5, delay: 0.7 },
      { kind: "gunner", x: 8, y: 9, delay: 0.5 }
    ],
    goal: CLEAR,
    par: 7,
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
      { kind: "brute", x: 7, y: 16, delay: 0 },
      { kind: "gunner", x: 2, y: 2, delay: 0.6, chamber: 1 },
      { kind: "gunner", x: 12, y: 2, delay: 1.0, chamber: 1 }
    ],
    goal: CLEAR,
    par: 8,
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
      { kind: "brute", x: 11, y: 17, delay: 0 }
    ],
    goal: { kind: "exit", x: 6.5, y: 0.7, w: 3, h: 2.2 },
    par: 7,
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
      { kind: "gunner", x: 13, y: 5.5, delay: 0.8 }
    ],
    goal: { kind: "exit", x: 6.5, y: 0.7, w: 3, h: 2.2 },
    par: 8,
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
      { kind: "brute", x: 9, y: 16, delay: 0 },
      { kind: "archer", x: 2, y: 3, delay: 0.5, chamber: 1 },
      { kind: "archer", x: 16, y: 3, delay: 0.9, chamber: 1 },
      { kind: "gunner", x: 9, y: 1.5, delay: 0.4, chamber: 1 }
    ],
    goal: CLEAR,
    par: 11,
    tip: "archers: fast arrows, slow to reload"
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
      { kind: "gunner", x: 14, y: 16, delay: 0.5 },
      { kind: "brute", x: 6, y: 22, delay: 0 }
    ],
    goal: { kind: "exit", x: 8.5, y: 0.5, w: 3, h: 2.2 },
    par: 12
  },
  {
    name: "Shieldwall",
    w: 14,
    h: 22,
    start: { x: 7, y: 20 },
    pillars: [crate(3, 14), crate(11, 14), crate(3, 5), crate(11, 5)],
    doors: [],
    enemies: [
      { kind: "shield", x: 7, y: 9, delay: 0 },
      { kind: "gunner", x: 7, y: 3, delay: 0.6 }
    ],
    goal: CLEAR,
    par: 9,
    tip: "the shield stops cuts and shots: go round it"
  },
  {
    name: "Watchtower",
    w: 16,
    h: 30,
    start: { x: 8, y: 28 },
    pillars: [crate(5, 24, 1.6), crate(11, 20.5, 1.6), crate(5, 16.5, 1.6), crate(11, 12.5, 1.6), crate(5, 8.5, 1.6)],
    doors: [],
    enemies: [{ kind: "sniper", x: 8, y: 2.5, delay: 0 }],
    goal: CLEAR,
    par: 8,
    tip: "the laser locks before it fires: step off the line"
  },
  {
    name: "Splinters",
    w: 14,
    h: 22,
    start: { x: 7, y: 20 },
    pillars: [box(4, 13), box(10, 13), box(7, 9.5), box(4, 6), box(10, 6), crate(7, 16.5)],
    doors: [],
    enemies: [
      { kind: "gunner", x: 3.5, y: 2.5, delay: 0.3 },
      { kind: "gunner", x: 10.5, y: 2.5, delay: 0.7 }
    ],
    goal: CLEAR,
    par: 7,
    tip: "wooden crates splinter under fire"
  },
  {
    name: "Breach",
    w: 14,
    h: 24,
    start: { x: 7, y: 22 },
    pillars: [
      // The only way out is through the cracked middle of the wall: let the brute's swing break it.
      { x: 0, y: 6.6, w: 5.5, h: 0.8 }, { x: 8.5, y: 6.6, w: 5.5, h: 0.8 }, { x: 5.5, y: 6.6, w: 3, h: 0.8, breaks: "cracked" },
      crate(3, 16), crate(11, 16)
    ],
    doors: [],
    enemies: [{ kind: "brute", x: 7, y: 12.5, delay: 0 }],
    goal: { kind: "exit", x: 5.5, y: 1, w: 3, h: 2.4 },
    par: 6,
    tip: "lure the brute's swing into the cracked wall"
  },
  {
    name: "Powder Room",
    w: 16,
    h: 24,
    start: { x: 8, y: 22 },
    pillars: [box(4, 15), box(12, 15), crate(8, 11.5, 1.4), box(4, 7), box(12, 7)],
    doors: [],
    enemies: [
      { kind: "grenadier", x: 8, y: 3, delay: 0.6 },
      { kind: "gunner", x: 3, y: 4, delay: 0.9 }
    ],
    goal: CLEAR,
    par: 8,
    tip: "the ring is the blast: be out of it when the fuse runs out"
  },
  {
    name: "Switchyard",
    w: 14,
    h: 22,
    start: { x: 7, y: 20 },
    pillars: [...switchyard.walls, crate(7, 12), crate(4, 16)],
    doors: [switchyard.door],
    plates: [{ x: 11.5, y: 14 }],
    enemies: [{ kind: "gunner", x: 3, y: 9.5, delay: 0.5 }],
    goal: { kind: "exit", x: 5.5, y: 1, w: 3, h: 2.4 },
    par: 7,
    tip: "step on the plate to open the gate"
  },
  {
    name: "Combination",
    w: 16,
    h: 24,
    start: { x: 8, y: 22 },
    pillars: [...combination.walls, crate(8, 15, 1.4), crate(4, 12), crate(12, 19)],
    doors: [combination.door],
    plates: [{ x: 13, y: 16 }, { x: 3, y: 18 }, { x: 4, y: 9 }],
    enemies: [
      { kind: "brute", x: 8, y: 11, delay: 0 },
      { kind: "gunner", x: 13, y: 8.5, delay: 0.6 }
    ],
    goal: { kind: "exit", x: 6.5, y: 1, w: 3, h: 2.4 },
    par: 10,
    tip: "press the plates in order: a wrong one resets them"
  },
  {
    name: "Mill",
    w: 14,
    h: 26,
    start: { x: 7, y: 24 },
    // A corridor the blades sweep from wall to wall: cross while a bar lies along it.
    pillars: [{ x: 0, y: 5, w: 4, h: 16 }, { x: 10, y: 5, w: 4, h: 16 }],
    doors: [],
    hazards: [
      { kind: "blade", x: 7, y: 16, length: 2.8, speed: 1.4, phase: 0 },
      { kind: "blade", x: 7, y: 9, length: 2.8, speed: -1.7, phase: 1.2 }
    ],
    enemies: [],
    goal: { kind: "exit", x: 5.5, y: 0.8, w: 3, h: 2.4 },
    par: 7,
    tip: "the blades turn only while you move: time your crossing"
  },
  {
    name: "Gauntlet",
    w: 16,
    h: 26,
    start: { x: 8, y: 24 },
    pillars: [crate(4, 20), crate(12, 13), crate(5, 7)],
    doors: [],
    hazards: [
      { kind: "gate", x1: 0.2, y1: 17, x2: 15.8, y2: 17, period: 2.4, on: 0.5, offset: 0 },
      { kind: "gate", x1: 0.2, y1: 10.5, x2: 15.8, y2: 10.5, period: 2, on: 0.5, offset: 0.9 }
    ],
    enemies: [{ kind: "gunner", x: 12, y: 4, delay: 0.6 }],
    goal: { kind: "exit", x: 6.5, y: 0.8, w: 3, h: 2.4 },
    par: 8,
    tip: "a laser gate warns before it lights"
  },
  {
    name: "Hold Out",
    w: 16,
    h: 20,
    start: { x: 8, y: 17 },
    pillars: [crate(3.5, 5), crate(12.5, 5), crate(3.5, 15), crate(12.5, 15)],
    doors: [],
    hazards: [
      { kind: "blade", x: 8, y: 10, length: 2.6, speed: 1.3, phase: 0.4 },
      { kind: "gate", x1: 0.2, y1: 13, x2: 15.8, y2: 13, period: 3, on: 0.4, offset: 1.5 }
    ],
    enemies: [
      { kind: "gunner", x: 2, y: 2, delay: 0.8 },
      { kind: "gunner", x: 14, y: 2, delay: 1.2 },
      { kind: "archer", x: 8, y: 1.5, delay: 1.6 }
    ],
    goal: { kind: "survive", seconds: 9 },
    par: 9,
    tip: "survive 9 s: time only passes while you move"
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
      { kind: "runner", x: 11, y: 18, delay: 0, chamber: 1, key: 0 },
      { kind: "archer", x: 2, y: 12.5, delay: 0.5, chamber: 1 },
      { kind: "gunner", x: 11, y: 13, delay: 0.6, chamber: 1 },
      { kind: "brute", x: 4, y: 22, delay: 0, chamber: 1 },
      { kind: "brute", x: 11, y: 6.5, delay: 0, chamber: 2, captain: true },
      { kind: "thrower", x: 4, y: 5, delay: 0.7, chamber: 2 }
    ],
    goal: { kind: "exit", x: 9.5, y: 0.2, w: 3, h: 2 },
    par: 18
  }
]
