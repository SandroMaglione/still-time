/** Written by `pnpm audio` from `assets/audio/`: do not edit by hand. */

/** Every sound in the bank: whether it ducks the others, and the least seconds between two plays. */
export const SOUNDS = {
  "player.slash": { heavy: false, interval: 0.06 },
  "player.kill": { heavy: false, interval: 0.05 },
  "player.guarded": { heavy: false, interval: 0.08 },
  "player.death": { heavy: true, interval: 0.4 },
  "player.step": { heavy: false, interval: 0.08 },
  "player.dash": { heavy: false, interval: 0.35 },
  "time.stop": { heavy: false, interval: 0.4 },
  "shot.bullet": { heavy: false, interval: 0.04 },
  "shot.arrow": { heavy: false, interval: 0.04 },
  "shot.knife": { heavy: false, interval: 0.06 },
  "shot.slug": { heavy: true, interval: 0.1 },
  "sniper.charge": { heavy: false, interval: 0.3 },
  "sniper.lock": { heavy: false, interval: 0.3 },
  "brute.windup": { heavy: false, interval: 0.2 },
  "brute.swing": { heavy: false, interval: 0.15 },
  "clockwork.windup": { heavy: false, interval: 0.2 },
  "bomb.throw": { heavy: false, interval: 0.1 },
  "bomb.land": { heavy: false, interval: 0.1 },
  "bomb.fuse": { heavy: false, interval: 0.1 },
  "bomb.blast": { heavy: true, interval: 0.15 },
  "crate.hit": { heavy: false, interval: 0.05 },
  "crate.break": { heavy: false, interval: 0.1 },
  "wall.break": { heavy: true, interval: 0.15 },
  "shot.impact": { heavy: false, interval: 0.04 },
  "shield.block": { heavy: false, interval: 0.06 },
  "enemy.death": { heavy: false, interval: 0.05 },
  "door.open": { heavy: false, interval: 0.2 },
  "plate.press": { heavy: false, interval: 0.1 },
  "plate.wrong": { heavy: false, interval: 0.3 },
  "key.pickup": { heavy: false, interval: 0.2 },
  "key.drop": { heavy: false, interval: 0.2 },
  "gate.warn": { heavy: false, interval: 0.15 },
  "gate.on": { heavy: false, interval: 0.15 },
  "room.clear": { heavy: false, interval: 0.5 },
  "star.1": { heavy: false, interval: 0.1 },
  "star.2": { heavy: false, interval: 0.1 },
  "star.3": { heavy: false, interval: 0.1 },
  "run.won": { heavy: true, interval: 1 },
  "ui.click": { heavy: false, interval: 0.04 },
  "ui.back": { heavy: false, interval: 0.04 }
} as const satisfies Record<string, { readonly heavy: boolean; readonly interval: number }>
export type SoundName = keyof typeof SOUNDS

/** Every song, a looping WAV under `public/audio/music/`. */
export const SONGS = ["dungeon", "title"] as const
export type SongName = (typeof SONGS)[number]
