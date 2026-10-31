# Still Time

A Slapjam AI #2 entry (theme: Speed): top-down rooms where time stops while you stand still and runs while you move. Built on [`@typeonce/ritmo`](https://www.npmjs.com/package/@typeonce/ritmo). Design and rules: [`docs/design.md`](docs/design.md).

```sh
pnpm install
pnpm dev      # http://localhost:5301 (also on the LAN, for a phone)
pnpm check    # typecheck, oxlint, ritmo-devtools lint, tests (rules + fuzzing)
pnpm shots    # phone-size screenshots into output/ (with pnpm dev running)
```

Controls: drag anywhere to move; let go and time stops; tap to continue. ☰ opens the rooms. On desktop: arrows or WASD, space to continue, R to restart, M or Escape for the rooms, 1–9 and 0 to jump to rooms 1–10, `[` and `]` for the previous and next room (open rooms only).

Every room is open from the start (PLAY continues at the first one not cleared); progress (each room's best stars and time) is saved in the browser's local storage under `still-time/`. For testing: `?room=N` opens a room straight away (skipping the title).

`pnpm build` writes `dist/` with relative paths. `pnpm package` builds and zips it into `output/still-time-itch.zip` (`index.html` at the zip's root): upload that to itch.io as an HTML game, viewport 720×1280, mobile friendly, with the fullscreen button.

## Layout

- `src/sim`: the simulation, headless. `schema.ts` (the world, as Effect schemas through `codec.ts`), `tuning.ts` (every number), `rooms.ts` (the rooms: walls, doors and their locks, goals, pars), `progress.ts` (which rooms are open), `geometry.ts`, `systems/` (one file per concern), `view.ts` (what the page reads), `simulation.ts` (runtime and schedules).
- `src/host`: the page. `main.ts` (thumb, keys, loop), `draw.ts` (the canvas renderer), `menu.ts` (title and room select), and the save through Effect: `storage.ts` (local storage as a `KeyValueStore`), `persisted.ts` (read and write a value through its schema, never losing a save), `progress.ts` (the `Progress` service and its versioned format).
- `test`: rule tests (`fight`, `locks`, `blades`, `progress`), room-data checks (`rooms`: locks can be met, every room can be finished), invariants, and fuzzing over every room.
