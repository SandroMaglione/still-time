# Room art

Floor flagstones are drawn in world space by `src/host/room-art.ts`. Their
widths, row heights and offsets vary deterministically. Fill values are close
to grout values, and corners interrupt the seams. Most stones are plain;
rare cracks and moss favor walls and cover. Camera movement and retries do
not reroll the pattern or consume simulation randomness.

Cover uses cool blue-grey dressed stone, distinct from the dark neutral
floor. Its single slab cap is pale above a darker brick face. Timber crates
have a thick frame, an X brace and metal fasteners across one whole box.
Short offset shadows ground both materials. Clay pots sit beside cover on
the floor. Back walls have unevenly spaced torches and broader readable
banners, with stretches left undecorated.

Source textures and decorations use the coordinated 16-color palette in
`pixel.config.json`. `scripts/environment.mjs` writes sprite text, calls
`ritmo-tools pixel render`, then `pixel lint`. Final PNGs go to `public/art/`;
4× previews, SVGs and reports go to `output/art/environment/`.

Run `pnpm art:environment` to rebuild this set. Procedural floor, crate and
combat geometry stays on the same integer source-pixel grid. Fire uses
quantized tongues, drifting embers and smoke in world time. No decoration
adds collision geometry.
