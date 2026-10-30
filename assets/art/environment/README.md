# Room and effect art

The room set uses 22 native-size assets. Floor slabs are 24×16 to suggest
depth, caps and material textures are 16×16, and tall wall decorations are
16×24. The exit rune is 24×24. All assets use a coordinated 16-color stone,
timber and moss palette with the characters' dark outline, ivory and gold.

Six floor variants include plain slabs, darker slabs, cracks, moss, worn
chips and broken corners. Plain slabs are more common than decorated ones.
Tile-coordinate hashes keep the pattern stable when the camera moves or
the room restarts. The hashes never read simulation randomness.

Raised cover has a pale upper edge, a darker brick or timber front, a dark
right edge and a short shadow cast down and right. Character feet anchor
to the same ground plane, above compact contact shadows. The projected floor
uses 0.78 vertical compression and 0.65 height rise; controls use the inverse
projection. Occluded players retain four ivory corner markers.

Torches now use procedural pixel tongues, embers and smoke driven by world
time, so they nearly stop while time is frozen. The earlier two-frame torch
PNGs remain in the asset set for reference. Banners, urns, chains, rubble and pots decorate walls and cover.
They are cosmetic and do not create new collision geometry.

Combat uses integer raster lines and arcs in `src/host/pixels.ts`:

- Red stipple and an advancing edge show a committed wind-up.
- Ivory edges and gold stipple show the swing.
- A gold ring shows the recovery opening; steel shows the guarded front.
- Projectiles have dark outlines, ivory or gold cores, and distinct shapes.
- Melee hits have a tapered crescent and debris; projectile hits have sparks
  and chips. Player and enemy deaths now have a complete fall and dissolve.
- Forecast lines are dashed and clipped to the floor. They remain below actors.
- The player's reach marks turn teal while time is nearly frozen.

## Rebuild and inspect

Run `pnpm art:environment` for this set, or `pnpm art` for all game assets.
`scripts/environment.mjs` writes editable sprite text, runs `ritmo-tools pixel
render`, and then runs `pixel lint` on every runtime PNG using this folder's
`pixel.config.json`. A non-clean result fails the command. The generator uses
no image-generation service. It extends the project's native tile sources.

PNG assets go to `public/art/`; sources, 4× previews and JSON reports stay here.
`previews/environment@4x.png` is the complete contact sheet.

With the game running, `pnpm shots:art http://localhost:5302` captures the live
game at phone, desktop and landscape sizes. It checks that enlarged pixels
are uniform integer blocks. The four labelled effect panels are render
fixtures covering committed wind-up, swing, recovery and occlusion, rather
than claims about a live playthrough. Identical views must render identically.
Captures and measurements are written to ignored `output/`.

See [../FX.md](../FX.md) for the combat rig, death timing and animated recordings.
