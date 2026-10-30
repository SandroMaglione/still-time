# Combat motion and effects

This pass follows the code-driven motion-study approach in
[Sprite Fusion's effects article](https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude).
The effects are original project code using the existing 24×24 art and palette.

## Weapons and body poses

`scripts/art.mjs` now exports six `*-body.png` assets through ritmo-tools. The
baked-in weapons are removed, along with disconnected pixels left by their
masks. These sources remain editable sprite text and must pass `pixel lint`.
Original standing PNGs remain available as references.

`src/host/combat-art.ts` draws short weapons from a hand anchor. Cuffs meet
the torso, hands cover the grip, and the rifle has a supporting forehand.
Weapons aiming behind the body are drawn first. The poses use integer rows
and mirror the existing body art.

- Rifle: wood stock, metal barrel, two hands, recoil, muzzle flash and casing.
- Sword: raised anticipation, torso brace, a short blade and a fast tapered
  sweep, followed by recovery. A travelling cut edge reaches the actual
  attack boundary, matching the ground telegraph.
- Bow: rotated curved limbs, a drawn string and release.
- Knife: raised ready hand, release with an empty-hand follow-through.

## Death timing

Deaths use real time and keep their own last position after entity removal.

| Phase | Seconds after contact |
| --- | --- |
| Ivory silhouette flash | 0–0.065 |
| Recoil and lift | 0–0.20 |
| Eight-step hinged fall | 0.12–0.44 |
| Landing dust and floor pose | 0.32–0.58 |
| Clustered dissolve and drifting fragments | 0.56–1.01 |
| Cosmetic record removed | 1.05 |

Fallen sprites are sampled back onto integer pixels, with vertical compression
to put the body on the ground plane. Player fragments are teal; enemy
fragments retain their role colors. The retry caption appears after 0.52 s,
below the action. The existing simulation retry deadline still applies.
Threat overlays stop after death so they do not cover the fall.

Rifle recoil lasts 0.16 world seconds and its muzzle flash lasts 0.065 world
seconds. Fire shape changes are quantized at 14 steps per world second.
Flames, smoke, embers and firing recoil slow with the world; death playback
and contact debris continue in real time.

## Ownership and resets

`src/host/fx.ts` observes every simulation tick, including multiple ticks in a
render frame. `FightView` exposes the simulation step, entity IDs and slash
birth steps. Removed enemies create one death record, reload rollovers create
recoil, and disappearing projectiles create impact chips. Projectile kills
are distinguished from melee cuts so bullets do not create sword crescents.

The simulation continues to own collisions, damage and attack phases. The
presentation clock owns cosmetic playback. A changed player identity, room
change, rewind or restart clears all pending cosmetics. Records are bounded
to 24 deaths and 48 impact bursts. Tests cover actual cut and fatal-swing
paths, repeated observations, multiple deaths, frozen time and resets.

## Review and regenerate

With the app running, use `pnpm record:fx http://localhost:5302`. This requires
Playwright and ffmpeg. It writes:

- `output/fx-motion-review.gif` and `.mp4`: six labelled motion studies.
- `output/fx-live.webm`: a real Duel guarded-front death and retry.
- `output/fx-live-*.png`: captured fall, floor pose, completed death and retry.
- `output/fx-frames/`: the native-resolution frames used to encode the studies.

The studies isolate grip/recoil, sword timing, player death, enemy deaths,
live/frozen fire, and impact debris. The real-game capture checks their
integration separately. `pnpm shots:art` checks native integer scaling at
phone, desktop and landscape sizes.
