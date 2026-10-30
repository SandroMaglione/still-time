# Still Time

A Slapjam AI #2 entry (theme: Speed): top-down rooms where time nearly stops while you stand still and runs as fast as you move. Built on [`@typeonce/ritmo`](https://www.npmjs.com/package/@typeonce/ritmo). Design and rules: [`docs/design.md`](docs/design.md).

```sh
pnpm install
pnpm dev      # http://localhost:5301 (also on the LAN, for a phone)
pnpm check    # typecheck, oxlint, ritmo-devtools lint, tests (rules + fuzzing)
pnpm shots    # phone-size screenshots into output/ (with pnpm dev running)
```

Controls: drag anywhere (the further, the faster); lift to freeze time; tap to continue. On desktop: arrows or WASD, space to continue, R to restart, 1–9 and 0 to jump to rooms 1–10, `[` and `]` for the previous and next room. `?room=N` opens a room.

## Layout

- `src/sim`: the simulation, headless. `schema.ts` (the world), `tuning.ts` (every number), `rooms.ts` (the rooms: walls, doors and their locks, goals, pars), `geometry.ts`, `systems/` (one file per concern), `view.ts` (what the page reads), `simulation.ts` (runtime and schedules).
- `src/host`: the page. `main.ts` (thumb, keys, loop) and `draw.ts` (the canvas renderer).
- `test`: rule tests (`fight`, `locks`, `blades`), room-data checks (`rooms`: locks can be met, every room can be finished), invariants, and fuzzing over every room.
