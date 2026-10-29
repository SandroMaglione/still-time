# Prototype: still time

Slapjam AI #2 (theme: Speed), mobile portrait browser game.

## Question

When time barely moves while you stand still and runs at full speed while you move, does picking *when* and *where* to move through an open room (camera follows you, walls and crates to hide behind) of incoming bullets, arrows and knives feel tense and smart? You clear a room by getting close enough to cut every enemy down (one hit kills, either way); a hit restarts the room.

Movement is analog: how far the thumb is from where it pressed sets your speed (top speed at 72 px).

Variants (V or the bottom button): **Glide** (time runs as fast as you move), **Glide·snap** (time jumps to full speed as soon as you move), **Realtime** (no slow-motion: the control).

## Rounds

- Round 1: first build, 5 rooms, three enemy kinds (gunner, archer, thrower), enemy shots also kill enemies. Verdict: "Flick (the first one where I keep pressing) is the one" (the hold-and-drag Glide). "A little hard, too fast when I move." Wants speed controlled by how far the thumb is from the press point, and a slightly lower top speed.
- Round 2: analog stick (dead zone 8 px, full at 72 px, curve 1.4), top speed 6.5 → 5 m/s, the player moves in real time; Flick removed; new default makes time follow your speed, Glide·snap keeps the round-1 time rule with analog movement. Verdict: "This works." Wants it frenetic: faster bullets (speed and reload). Wants open rooms bigger than the screen, camera following the player, places to move and hide.
- Round 3: shot speeds doubled (bullet 9, arrow 18, knife 12 m/s), reloads about halved (0.85 / 1.3 / 1.1 s); rooms 14×24 up to 22×36 m with walls, shelves and crates; camera eased on the player with a little lead; enemies shoot only with line of sight within 13 m, firing 0.25 s after you step out if reloaded; off-screen enemy markers at the edge. Verdict: _not played yet_
