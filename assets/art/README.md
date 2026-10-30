# Still Time pixel art

Six static 24×24 character sprites: ivory player, red gunner, orange archer,
violet thrower, red armored brute, gold thief. Characters share a 16-color
palette, upper-left lighting, dark outlines and a feet anchor at (12,23).
The captain uses the brute with a separate 16×16 crown.

Revision 2 follows the supplied compact RPG references: heads occupy roughly
half the sprite height, bodies and feet are short, and broad color clusters
carry the design. The earlier slimmer set and its recipe are kept in `v1/`.

The floor, slab, key, crown and exit are 16×16. Stone and gate blocks are
24×24. Runtime PNGs and a character-atlas manifest live in `public/art/`.
Editable sprite text, the generated draft, previews and reports live here.
The atlas is 72×48, three columns by two rows in the order listed above.

## Rebuild

Run `pnpm art`. This uses the pinned `@typeonce/ritmo-tools@0.19.1` CLI:

1. Fix the generated draft with an explicit 21⅓-source-pixel cell and the
   project palette. Automatic detection could not confidently resolve its
   inconsistent grid. This intermediate deliberately reduces detail.
2. Separate the six 24×24 cells, restore both player eyes, recover the
   thrower's knife from the cell margin, simplify the knight's metal colors,
   remove the neighbouring knife tip, and align feet.
3. Render sprite text through `pixel render`, then `pixel lint` every PNG.
4. Write 8× nearest-neighbor previews and JSON reports for inspection.

The final assets must report `clean`; the generated intermediate does not.
Some one-pixel highlights produce lint warnings; they are retained as facial,
fabric and metal details. There are no gradients or partial alpha in assets.

For an art change, edit the character touch-ups or tile definitions in
`scripts/art.mjs`; it rewrites sprite text on rebuild. For one-off manual
edits, edit a `.sprite.txt` and use `pnpm exec ritmo-tools pixel render`.
Keep the canonical recipe in the script if the change should survive rebuilds.

The renderer loads the PNGs before starting the loop, draws at low resolution,
and enlarges to integer physical pixels with smoothing disabled. Existing
telegraphs, aim indicators, key colors and attack arcs remain dynamic. The
pixel grid applies to the world; the HTML HUD remains readable at screen size.

The source atlas contains standing poses with horizontal mirroring. Combat
poses are derived procedurally; the atlas has no four-direction walk cycles.

The combat renderer now uses separate empty-hand body PNGs with integer
poses, held weapons, recoil, and procedural death animations. The original
standing PNGs and atlas remain available. See [FX.md](FX.md) for timing,
ownership and motion-study recordings.

## Generation

The draft was generated with the built-in imagegen tool using the three user
images as style references, then corrected and rendered with ritmo-tools.
The current prompt is in `source/prompt-v2.txt`; the previous prompt remains
in `source/prompt.txt`. The active draft is `source/characters-generated-v2.png`.

## Room and effect pass

The active room renderer now uses the 22 native tiles and effects documented
in [environment/README.md](environment/README.md). Run `pnpm art:environment`
to rebuild them independently; `pnpm art` rebuilds both character and room sets.
The earlier floor and block assets remain available but are no longer loaded
by the game.
