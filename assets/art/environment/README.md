# Room art

Floor flagstones are drawn in world space by `src/host/room-art.ts`. Their
widths, row heights and offsets vary deterministically. Three close olive-grey
shades form broad facets on each flag. Fill values are close to grout values,
and corners interrupt the seams. Most stones are plain;
rare cracks and moss favor walls and cover. Camera movement and retries do
not reroll the pattern or consume simulation randomness.

Cover uses a warm limestone slab over cool blue-grey dressed stone, distinct
from the green floor. Its cap has an upper-left bevel, a dark lower edge and
two small chips above a darker brick face. Timber crates
have a thick frame, an X brace and metal fasteners across one whole box.
Short offset shadows ground both materials. Clay pots sit beside cover on
the floor; rubble and loose chain links dress other bases. Every back wall
has 2–4 unevenly spaced torches and banners, with stretches left undecorated.

Source textures and decorations use the coordinated 16-color palette in
`pixel.config.json`. `scripts/environment.mjs` writes sprite text, calls
`ritmo-tools pixel render`, then `pixel lint`. Final PNGs go to `public/art/`;
4× previews, SVGs and reports go to `output/art/environment/`.

Run `pnpm art:environment` to rebuild this set. Procedural floor, crate and
combat geometry stays on the same integer source-pixel grid. Fire uses
quantized tongues, drifting embers and smoke in world time. No decoration
adds collision geometry.
