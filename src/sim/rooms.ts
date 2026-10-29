/**
 * The hand-made rooms. Coordinates in metres from the top-left of a 9 × 16
 * room; the player enters at the bottom. `delay` is seconds before an
 * enemy's first shot, to stagger them.
 */
import type { EnemyKind } from "./tuning.ts"

export interface Pillar { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface EnemySpawn { readonly kind: EnemyKind; readonly x: number; readonly y: number; readonly delay: number }
export interface Room {
  readonly name: string
  readonly start: { readonly x: number; readonly y: number }
  readonly pillars: ReadonlyArray<Pillar>
  readonly enemies: ReadonlyArray<EnemySpawn>
}

export const ROOMS: ReadonlyArray<Room> = [
  {
    name: "Doorway",
    start: { x: 4.5, y: 14.5 },
    pillars: [],
    enemies: [
      { kind: "gunner", x: 2.5, y: 3, delay: 0.6 },
      { kind: "gunner", x: 6.5, y: 3, delay: 1.4 }
    ]
  },
  {
    name: "Crossfire",
    start: { x: 4.5, y: 14.5 },
    pillars: [{ x: 3.5, y: 7.2, w: 2, h: 1.2 }],
    enemies: [
      { kind: "gunner", x: 1, y: 9, delay: 0.5 },
      { kind: "gunner", x: 8, y: 9, delay: 1.3 },
      { kind: "archer", x: 4.5, y: 2, delay: 1.0 }
    ]
  },
  {
    name: "Knife Hall",
    start: { x: 4.5, y: 14.5 },
    pillars: [
      { x: 1.2, y: 6, w: 1.4, h: 1.4 },
      { x: 6.4, y: 6, w: 1.4, h: 1.4 }
    ],
    enemies: [
      { kind: "thrower", x: 4.5, y: 3, delay: 0.8 },
      { kind: "archer", x: 1.5, y: 2, delay: 1.6 },
      { kind: "archer", x: 7.5, y: 2, delay: 2.2 }
    ]
  },
  {
    name: "Friendly Fire",
    start: { x: 4.5, y: 14.5 },
    pillars: [],
    enemies: [
      { kind: "gunner", x: 4.5, y: 2, delay: 0.6 },
      { kind: "gunner", x: 4.5, y: 5, delay: 1.5 },
      { kind: "gunner", x: 1.2, y: 8, delay: 1.0 },
      { kind: "gunner", x: 7.8, y: 8, delay: 2.0 }
    ]
  },
  {
    name: "Gauntlet",
    start: { x: 4.5, y: 14.8 },
    pillars: [
      { x: 0.8, y: 10, w: 2.2, h: 0.8 },
      { x: 6, y: 10, w: 2.2, h: 0.8 },
      { x: 3.6, y: 5.5, w: 1.8, h: 0.8 }
    ],
    enemies: [
      { kind: "archer", x: 1.2, y: 7.5, delay: 0.7 },
      { kind: "archer", x: 7.8, y: 7.5, delay: 1.9 },
      { kind: "thrower", x: 4.5, y: 3.5, delay: 1.2 },
      { kind: "gunner", x: 1.5, y: 1.5, delay: 0.4 },
      { kind: "gunner", x: 7.5, y: 1.5, delay: 1.1 }
    ]
  }
]
