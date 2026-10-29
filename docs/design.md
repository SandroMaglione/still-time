# Still Time: design notes

Entry for [Slapjam AI #2](https://itch.io/jam/slapjam-ai-2): theme **Speed**, a mobile portrait browser game, judged on theme, fun and visuals equally.

## The game

Top-down rooms full of enemies. **Time nearly stops while you are still and runs as fast as you move**: you read the bullets, arrows and knives coming at you, then choose when and where to move. One hit kills you (the room restarts), and one cut kills an enemy. Clear every enemy to open the next room.

Speed is the choice the player makes: every move speeds the whole world up with you.

## Rules (each has a headless test in `test/fight.test.ts`)

- **Thumb:** a hidden floating stick, which starts wherever the thumb lands. The distance from the press point sets your speed: still within 8 px, top speed (5 m/s) at 72 px, on a 1.4 curve for fine control near the press point. Directions are screen directions.
- **World speed** follows your push: ×0.04 when still, real time at full push, eased quickly. You move in real time and the world is what slows down, so slow motion helps you *read* a threat, not outrun it.
- **Your cut:** any enemy within 1.15 m dies, except a brute you face while it attacks.
- **Shooters** (gunner: bullets; archer: fast arrows; thrower: a fan of three knives) fire only with line of sight within 13 m, 0.25 s after you step out of cover if already reloaded. They hold fire and sidestep when an ally is in any line of their shot, creep toward where they last saw you, and stay within 3.5 m of their post.
- **Brutes** stand until they see you, then chase faster than you (5.5 m/s, a 180° turn in about 0.3 s). Within 2.5 m they wind up for 0.5 s: they track you and step in to 1.6 m, then commit for the last 0.35 s. They swing a 2 m wedge of ±57° and recover for 0.8 s. Their front (±69°) is guarded only while they attack: step out of the swing, then cut back in during the recovery, even from the front.
- **Friendly fire:** any shot kills any enemy it touches.
- **Solid bodies:** enemies never overlap each other or you. Brutes keep room from allies, steer round one in their path, and walk at 100% / 82% / 92% pace by spawn order, so they don't arrive in step.

## Look

An upright 2D room with a slight Pokémon-style camera lean: mostly tops, short fronts (floor depth ×0.86, heights at half their size). Decals on the floor (shot paths, swing wedges, guard rings), crates and walls as boxes, people as cylinders with shadows, and your outline always on top. The floor turns cold blue when time is frozen and warm when it runs. The camera follows you with a small lead and stays inside the room.

The iso and steeper tilts were tried and rejected ("too isometric").

## How it was found (prototype rounds, October 2026)

1. Still-time rooms with three control variants. The player picked hold-and-drag ("Glide") over swipe-to-dash ("Flick"). It felt too fast, so it was asked to be analog.
2. Analog thumb, lower top speed, time following the push.
3. Made frenetic: shot speeds doubled, reloads halved. Open rooms bigger than the screen, a following camera, cover, line of sight.
4. The brute: a melee enemy you dodge and flank.
5. Brute made swordsman-fast. Shooters reposition and keep allies out of their fire. Found headless: the commit window is what makes a dodge possible.
6. Solid enemies, steering round allies, varied paces.
7–8. Projected view: iso rejected, the Pokémon-style low tilt kept.
9. Brute open from the front outside its attack. You can't walk through enemies. Camera edge fix.

## Ideas not built yet

- Brutes coordinating as a pack (one flanks while another comes from the front).
- Sound and music, and a look pass.
