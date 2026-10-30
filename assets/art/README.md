# Still Time art sources

Character bodies and equipped exports are native 24×24 sprites on the shared
16-color palette in `pixel.config.json`. `source/*.sprite.txt` is canonical.
The original v2 roles keep their role colors and proportions. Batch 2 adds:

- Sniper: pointed violet hood and a long rifle with a raised scope.
- Shield-bearer: teal crest and a tall tower shield that turns with its aim.

`scripts/batch2-art.mjs` authors the new source files, full equipped PNGs and
the two-frame `batch2` atlas. Runtime weapon/body layering remains in
`src/host/combat-art.ts`; each role has its own body. Every living body gets
a one-source-pixel light rim inside the renderer, outside its dark outline.

The live `player-body.png` is the 24×24 split-cowl assassin: a covered face,
fitted navy clothing, one teal scarf and an ivory-edged reverse-grip knife.
The scarf separates it from the hooded sniper at native size. The shared
16-colour palette and runtime anchor `[12,23]` are unchanged. Only this player
body is replaced; the legacy equipped player and packed atlas stay as they were.

`pnpm art` renders and lints every source sprite; a sprite with its own
`assets/art/<name>.pixel.config.json` (the player) is rendered against that
palette. `scripts/art-hero.mjs` is no longer run: it drew the earlier hat hero.
`scripts/art-assassin.mjs` authors the selected body, a crouched violet stalker,
and batch-3–5 object sources. Its three 1×/4× player studies, phone captures,
reports and assembled tile fixtures stay under ignored `output/review-7/`.

## Batch-3–5 draw hooks

The native sprites are loaded by `loadArt`. The player and stalker bodies,
stalker eye brightness and the grenadier's held bomb are already integrated.
The grenadier and clockwork body sprites are unchanged. The five functions
below are exported for the owner of `draw.ts`; no gameplay or telegraph logic
needs to change. Keep existing depth-sort entries and threat buffers.

| Export | Replacement in `src/host/draw.ts` |
| --- | --- |
| `pressurePlate(ctx, P, plate)` from `room-art.ts` | Replace the body of `for (const plate of view.plates)` after the conveyor loop. Includes the digit slot and plate light. |
| `conveyorBelt(ctx, P, belt)` from `room-art.ts` | Replace the body of `for (const belt of view.belts)` after open-door thresholds. Uses `belt.run`, tiles slats, fixes rails/rollers, handles all four directions. |
| `spinningBlade(ctx, P, hz)` from `room-art.ts` | In the standing-hazards loop, replace the contents of `paintBlade`; call for both `ctx` and `glow` as now. Keep the floor reach arc. Native teeth repeat along the actual endpoints with integer inverse sampling. |
| `laserPost(ctx, P, x, y, hz.state)` from `room-art.ts` | Replace each laser endpoint actor's `paint` body. Includes the post light. Keep the existing beam and its on/warn/off telegraph. |
| `bombActor(ctx, P, b, view.world)` from `combat-art.ts` | Replace the bomb actor's `paint` body in `for (const b of view.bombs)`. Includes shadow, flight height, two-frame fuse and light. Keep the existing blast/fuse rings. |

Remove `draw.ts`'s local `digit` and `DIGITS` if unused after wiring. Every
new emitting object registers `emitLight` at its floor footprint. The stalker
uses the existing eye light at 14 px above its feet; its native eye pixels
brighten in three steps with `charge`. Canvas caches use `willReadFrequently`.

## Rebuild

Run `pnpm art` for characters and environment, or `pnpm art:environment` for
materials and decorations alone. `@typeonce/ritmo-tools@0.19.1` renders each
source and lints every final PNG. Non-clean results fail the command.

For this pass alone, run `node scripts/art-assassin.mjs`, then
`node scripts/art-review7.ts http://localhost:5350` for the lit phone captures,
4× sheets and pose assertions. The legacy bulk rebuild currently rejects the
existing 48×24 `batch2` atlas, which is missing from the root allowed sizes.
That unrelated atlas and the shared configuration are left unchanged.

- `assets/art/`: sprite-text sources, palette/configuration, manifests and README files.
- `public/art/`: final native PNGs and atlas metadata.
- `output/art/`: generated enlarged previews, SVGs, JSON reports, intermediate fixes and old versions.

The original generation prompts remain as provenance. Previous image drafts,
fixer recipes and the v1 folder have been moved to ignored `output/art/`.
Rebuilding does not recreate previews or reports under `assets/art/`.

## Rendering and effects

The game renders to a low-resolution canvas and enlarges it by an integer
physical-pixel factor with smoothing disabled. Hand grips, recoil, weapon
turning, attack arcs, impacts and fire are integer raster art. The simulation
continues to own contacts and attack timing.

`src/host/fx.ts` observes stable entity identities every tick. Cosmetic deaths
continue after despawn: flash, flinch, fall, a brief floor pose and clustered
dissolution, ending after 1.05 real seconds. Weapon recoil and flame motion
use world time. Retry, room changes and rewinds clear presentation records.

Danger paths and committed attacks are red/orange with ink outlines;
projectiles have larger bright heads. Idle/chase reach is a dim orange 1px
dash without ink. Idle/chasing melee enemies have no extra ring under their boots.
Reload is a 2px red raster band with 1px ink edges at the feet. Guard arcs use
steel and gold in a compact foot ellipse, leaving the tower shield to carry
the silhouette. The player's reach uses teal. Tracking lasers are dashed and
locked lasers solid; the distinction does not depend on seeing a blink.

See [environment/README.md](environment/README.md) for floor and room materials.

## Review captures

With Vite running, `node scripts/review-shots.ts http://localhost:5350 --before`
records baseline fixtures. Running without `--before` captures rooms 4, 9,
11 and 12 at 390×844 @2x, holds ArrowUp for 0.9 seconds, releases it, and
captures a simulation-driven frozen wind-up. It also writes a matched floor,
telegraph and enemy comparison to `output/review-1/comparison.png`.

Add `--round-2` to capture those four rooms plus room 1, the wind-up, and
matched floor/cover and reload/chase comparisons against the retained
`output/review-1/after` fixtures. Results go to `output/review-2/`, preserving
the previous review's captures.

Use `--round-3` for the same six captures and matched fixtures in
`output/review-3/`, compared with `output/review-2/after`.

Use `--round-4` for lit phone captures of rooms 1, 4, 9 and 11, plus an unlit
room 9. `node scripts/art-review.ts <url>` makes the player options sheet,
4× production-renderer crops and a matching unlit scene in `output/review-4/`.

Use `--round-5` for rooms 1, 4, 5, 9 and 11, unlit room 9, and an 844×390
landscape capture after moving to the left boundary. Results stay in
`output/review-5/`.

`pnpm shots:art <url>` checks phone/desktop/landscape integer pixel scaling;
`pnpm record:fx <url>` records isolated motion studies and a live death/retry.
All captures stay in ignored `output/`. No gameplay assertions are changed
by the art workflow.
