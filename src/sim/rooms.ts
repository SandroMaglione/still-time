/**
 * The hand-made rooms: open floors bigger than the screen, with walls and
 * crates to hide behind (enemies only shoot what they can see). Coordinates
 * in metres from the top-left; `delay` is seconds before an enemy's first
 * shot, to stagger them.
 */
import type { EnemyKind } from "./tuning.ts"

export interface Pillar { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface EnemySpawn { readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly delay: number }
export interface Room {
  readonly name: string
  readonly w: number
  readonly h: number
  readonly start: { readonly x: number; readonly y: number }
  readonly pillars: ReadonlyArray<Pillar>
  readonly enemies: ReadonlyArray<EnemySpawn>
}

const crate = (x: number, y: number, size = 1.2): Pillar => ({ x: x - size / 2, y: y - size / 2, w: size, h: size })

export const ROOMS: ReadonlyArray<Room> = [
  {
    name: "Duel",
    w: 12,
    h: 18,
    start: { x: 6, y: 16 },
    pillars: [crate(3, 9), crate(9, 9)],
    enemies: [{ kind: "brute", x: 6, y: 4, delay: 0 }]
  },
  {
    name: "Two Blades",
    w: 14,
    h: 22,
    start: { x: 7, y: 20 },
    pillars: [crate(4, 14), crate(10, 14), { x: 5, y: 7, w: 4, h: 0.8 }],
    enemies: [
      { kind: "brute", x: 3, y: 9, delay: 0 },
      { kind: "brute", x: 11, y: 9, delay: 0 },
      { kind: "gunner", x: 7, y: 2.5, delay: 0.5 }
    ]
  },
  {
    name: "Courtyard",
    w: 14,
    h: 24,
    start: { x: 7, y: 22 },
    pillars: [crate(4, 17), crate(10, 17), crate(7, 12.5, 1.6), crate(3, 8), crate(11, 8), { x: 5, y: 4, w: 4, h: 0.8 }],
    enemies: [
      { kind: "gunner", x: 2.5, y: 12, delay: 0.3 },
      { kind: "gunner", x: 11.5, y: 12, delay: 0.7 },
      { kind: "gunner", x: 7, y: 2.5, delay: 0.5 },
      { kind: "archer", x: 1.5, y: 2, delay: 1.0 }
    ]
  },
  {
    name: "Market",
    w: 18,
    h: 28,
    start: { x: 9, y: 26 },
    pillars: [
      // Two rows of stalls with gaps between them.
      { x: 2, y: 19, w: 4, h: 1 }, { x: 7.5, y: 19, w: 3, h: 1 }, { x: 12, y: 19, w: 4, h: 1 },
      { x: 2, y: 12, w: 3, h: 1 }, { x: 6.5, y: 12, w: 5, h: 1 }, { x: 13, y: 12, w: 3, h: 1 },
      crate(4, 6), crate(14, 6), crate(9, 4, 1.8)
    ],
    enemies: [
      { kind: "gunner", x: 3, y: 16, delay: 0.3 },
      { kind: "gunner", x: 15, y: 16, delay: 0.6 },
      { kind: "thrower", x: 9, y: 9, delay: 0.8 },
      { kind: "brute", x: 9, y: 16, delay: 0 },
      { kind: "archer", x: 2, y: 3, delay: 0.5 },
      { kind: "archer", x: 16, y: 3, delay: 0.9 },
      { kind: "gunner", x: 9, y: 1.5, delay: 0.4 }
    ]
  },
  {
    name: "Warehouse",
    w: 20,
    h: 30,
    start: { x: 10, y: 28 },
    pillars: [
      // Long shelves: aisles that archers watch end to end.
      { x: 3.5, y: 6, w: 1, h: 16 }, { x: 8, y: 4, w: 1, h: 9 }, { x: 8, y: 15.5, w: 1, h: 8 },
      { x: 11, y: 4, w: 1, h: 9 }, { x: 11, y: 15.5, w: 1, h: 8 }, { x: 15.5, y: 6, w: 1, h: 16 },
      crate(6, 25), crate(14, 25)
    ],
    enemies: [
      { kind: "archer", x: 1.5, y: 2, delay: 0.4 },
      { kind: "archer", x: 18.5, y: 2, delay: 0.8 },
      { kind: "archer", x: 10, y: 1.5, delay: 0.6 },
      { kind: "gunner", x: 6, y: 14, delay: 0.3 },
      { kind: "gunner", x: 14, y: 14, delay: 0.5 },
      { kind: "thrower", x: 10, y: 14, delay: 0.7 },
      { kind: "brute", x: 6, y: 20, delay: 0 },
      { kind: "brute", x: 14, y: 8, delay: 0 },
      { kind: "gunner", x: 1.5, y: 24, delay: 0.9 }
    ]
  },
  {
    name: "Friendly Fire",
    w: 16,
    h: 26,
    start: { x: 8, y: 24 },
    pillars: [crate(4, 19), crate(12, 19), crate(8, 15, 1.4), { x: 1, y: 9, w: 3, h: 0.8 }, { x: 12, y: 9, w: 3, h: 0.8 }],
    enemies: [
      // Lined up: make the far ones shoot the near ones.
      { kind: "gunner", x: 8, y: 2, delay: 0.3 },
      { kind: "gunner", x: 8, y: 5.5, delay: 0.7 },
      { kind: "gunner", x: 8, y: 9, delay: 0.5 },
      { kind: "thrower", x: 2, y: 13, delay: 0.6 },
      { kind: "thrower", x: 14, y: 13, delay: 0.9 }
    ]
  },
  {
    name: "Fortress",
    w: 22,
    h: 36,
    start: { x: 11, y: 34 },
    pillars: [
      // Outer wall with a gate, inner keep with side doors, crates for cover.
      { x: 0, y: 24, w: 9, h: 1 }, { x: 13, y: 24, w: 9, h: 1 },
      { x: 5, y: 8, w: 1, h: 10 }, { x: 16, y: 8, w: 1, h: 10 }, { x: 5, y: 7, w: 5, h: 1 }, { x: 12, y: 7, w: 5, h: 1 },
      crate(4, 29), crate(18, 29), crate(11, 28.5, 1.6), crate(9, 20), crate(13, 20), crate(2.5, 14), crate(19.5, 14)
    ],
    enemies: [
      { kind: "gunner", x: 3, y: 21, delay: 0.3 },
      { kind: "gunner", x: 19, y: 21, delay: 0.6 },
      { kind: "archer", x: 11, y: 16, delay: 0.5 },
      { kind: "brute", x: 6, y: 28, delay: 0 },
      { kind: "brute", x: 16, y: 28, delay: 0 },
      { kind: "thrower", x: 8, y: 11, delay: 0.8 },
      { kind: "thrower", x: 14, y: 11, delay: 1.0 },
      { kind: "archer", x: 2, y: 3, delay: 0.4 },
      { kind: "archer", x: 20, y: 3, delay: 0.7 },
      { kind: "gunner", x: 11, y: 3, delay: 0.5 }
    ]
  }
]
