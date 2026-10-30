# Room art

The floor uses six native 24×24 tiles with clustered stone grain and broken
mortar gaps. Cracked, moss and drain detail tiles are rare; cracks and moss
favor walls and cover. Hash placement stays anchored to the room as the camera
moves and never consumes simulation randomness. Three darker 24×24 rock tiles
fill everything beyond the walls, continuing the dungeon outside the playable
room. No environment texels are stretched or filtered.

Walls and cover share one warm grey stone family with an olive tint. Fronts
are mid-value, caps are lighter, and the floor is darker and greener. Slab
caps use native 24×24 sources with chunky bevels and clustered wear. Crate caps
and fronts use broad planks, a dark outline and one bold band. The renderer's
nine-slice helper repeats edge and middle texels at their native size, retaining
the corners for any footprint. Pots stay on the floor. Back walls have 2–4
irregularly spaced torches and simplified banners; extra side-wall torches and
two-frame braziers near cover light the room from within.

Material shading uses 3–4 flat colours without gradients. The live lighting
pass supplies shadows and light pools. Each brazier calls `emitLight` with its
floor footprint, a 3.7m radius, `[255,176,96]` and intensity 0.8. Existing
`torchFire` calls retain their own light registration. No prop adds collision.

Source textures and decorations use the coordinated 16-color palette in
`pixel.config.json`. `scripts/environment.mjs` writes sprite text, calls
`ritmo-tools pixel render`, then `pixel lint`. Final PNGs go to `public/art/`;
4× previews, SVGs and reports go to `output/art/environment/`.

Run `pnpm art:environment` to rebuild this set. Generated contact sheets and
reports stay under ignored `output/`. Compare room captures with `&nolight`
to inspect the material colours separately from the live light map.
