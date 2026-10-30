# Still Time art sources

Character bodies and equipped exports are native 24×24 sprites on the shared
16-color palette in `pixel.config.json`. `source/*.sprite.txt` is canonical.
The original v2 roles keep their role colors and proportions. Batch 2 adds:

- Sniper: pointed violet hood and a long rifle with a raised scope.
- Knight: a wider, square full helm, plate shoulders and gold armour trim.
- Shield-bearer: teal crest and a tall tower shield that turns with its aim.

`scripts/batch2-art.mjs` authors the new source files, full equipped PNGs and
the three-frame `batch2` atlas. Runtime weapon/body layering remains in
`src/host/combat-art.ts`; each role has its own body. Every living body gets
a one-source-pixel light rim inside the renderer, outside its dark outline.

## Rebuild

Run `pnpm art` for characters and environment, or `pnpm art:environment` for
materials and decorations alone. `@typeonce/ritmo-tools@0.19.1` renders each
source and lints every final PNG. Non-clean results fail the command.

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
dash without ink. Idle/chasing knights have no extra ring under their boots.
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

`pnpm shots:art <url>` checks phone/desktop/landscape integer pixel scaling;
`pnpm record:fx <url>` records isolated motion studies and a live death/retry.
All captures stay in ignored `output/`. No gameplay assertions are changed
by the art workflow.
