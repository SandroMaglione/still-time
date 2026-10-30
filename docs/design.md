# Still Time: design notes

Entry for [Slapjam AI #2](https://itch.io/jam/slapjam-ai-2): theme **Speed**, a mobile portrait browser game, judged on theme, fun and visuals equally.

## The game

Top-down rooms full of enemies. **Time nearly stops while you are still and runs as fast as you move**: you read the bullets, arrows and knives coming at you, then choose when and where to move. One hit kills you (the room restarts), and one cut kills an enemy. Each room has a goal: down every enemy, or reach its exit. Doors split bigger rooms into chambers.

Every new piece must be readable **from a paused frame**: the player spends most of the game looking at frozen time, so what something does has to show on it (pips on a door, a crown, a key over a head), never hidden state. New things are taught one per room, alone first.

Speed is the choice the player makes: every move speeds the whole world up with you.

## Rules (each has a headless test in `test/fight.test.ts`)

- **Thumb:** a hidden floating stick, which starts wherever the thumb lands. The distance from the press point sets your speed: still within 8 px, top speed (5 m/s) at 72 px, on a 1.4 curve for fine control near the press point. Directions are screen directions.
- **World speed** follows your push: ×0.04 when still, real time at full push, eased quickly. You move in real time and the world is what slows down, so slow motion helps you *read* a threat, not outrun it.
- **Your cut:** any enemy within 1.15 m dies, except a brute you face while it attacks.
- **Shooters** (gunner: bullets; archer: fast arrows; thrower: a fan of three knives) fire only with line of sight within 13 m, 0.25 s after you step out of cover if already reloaded. They hold fire and sidestep when an ally is in any line of their shot, creep toward where they last saw you, and stay within 3.5 m of their post.
- **Brutes** stand until they see you, then chase faster than you (5.5 m/s, a 180° turn in about 0.3 s). Within 2.5 m they wind up for 0.5 s: they track you and step in to 1.6 m, then commit for the last 0.35 s. They swing a 2 m wedge of ±57° and recover for 0.8 s. Their front (±69°) is guarded only while they attack: step out of the swing, then cut back in during the recovery, even from the front.
- **Friendly fire:** any shot kills any enemy it touches.
- **Score:** each attempt has a clock in **world** seconds, so it only runs while you move. A clear earns up to three stars: one for the clear, one for no hit in the room since you came into it (retries count), one for beating the room's par. The run keeps each room's best; the last screen totals them.
- **Goals:** `clear` (down every enemy) or `exit` (stand on the glowing pad; enemies left standing don't matter).
- **Doors** are walls until their lock is met, then open for the rest of the attempt (a retry shuts them). Locks: a **chamber** cleared (steel door, one red pip per enemy it still waits on), the chamber's **captain** down (gold door with a crown), or its **key** brought to it (a door in the key's colour; it opens when you reach it holding the key, and keeps the key). Closed doors block movement, sight and shots for everyone.
- **Captain:** any enemy can wear a crown. Downing it opens its chamber's captain door; it fights like its kind.
- **Runner (thief):** harmless, carries a key over its head. While it sees you it runs (3.6 m/s, slower than you) toward whichever of 16 directions lands furthest from you; out of sight it stands still, so you sneak up behind cover. Wherever it falls (your cut, or a stray shot) it drops its key on the floor; walk over it to pick it up.
- **Solid bodies:** enemies never overlap each other or you. Brutes keep room from allies, steer round one in their path, and walk at 100% / 82% / 92% pace by spawn order, so they don't arrive in step.

## Look

An upright 2D room with a slight Pokémon-style camera lean: mostly tops, short fronts (floor depth ×0.86, heights at half their size). Decals on the floor (shot paths, swing wedges, guard rings), crates and walls as boxes, people as cylinders with shadows, and your outline always on top. The floor turns cold blue when time is frozen and warm when it runs. The camera follows you with a small lead and stays inside the room.

The iso and steeper tilts were tried and rejected ("too isometric").

## Rooms

Each room adds one thing, with few enemies, and the rooms grow from there:

1. Duel: one brute. 2. Two Blades: two brutes. 3. Courtyard: the first shooters (two gunners), sight and cover. 4. Friendly Fire: a thrower at the back of a line of two gunners. 5. Gatehouse: the first door (clear this side to open it), gunners and a brute. 6. Throne: the captain, and the first exit. 7. Thief: the runner and its key. 8. Market: two chambers, and the first archers. 9. Warehouse: a thief among shelves. 10. Fortress: yard gate, keep key, captain's door.

Pars are first guesses (a scripted dodge clears the Duel in 2.0 world s against a par of 4); tune them from play.

## How it was found (prototype rounds, October 2026)

1. Still-time rooms with three control variants. The player picked hold-and-drag ("Glide") over swipe-to-dash ("Flick"). It felt too fast, so it was asked to be analog.
2. Analog thumb, lower top speed, time following the push.
3. Made frenetic: shot speeds doubled, reloads halved. Open rooms bigger than the screen, a following camera, cover, line of sight.
4. The brute: a melee enemy you dodge and flank.
5. Brute made swordsman-fast. Shooters reposition and keep allies out of their fire. Found headless: the commit window is what makes a dodge possible.
6. Solid enemies, steering round allies, varied paces.
7–8. Projected view: iso rejected, the Pokémon-style low tilt kept.
9. Brute open from the front outside its attack. You can't walk through enemies. Camera edge fix.

## Roadmap

Ordered so each batch builds on the last, extensions before exceptions:

1. **Doors (done):** score and stars, doors and chambers, the captain, the runner and its key.
2. **Tougher enemies:** the knight (several hits, with a stagger in world time), the shield-bearer (a guarded front that also blocks shots), the sniper (a laser that charges while it sees you).
3. **Things that break:** cracked walls a brute's swing breaks, the grenadier (a fuse ring; the blast kills allies and breaks walls), crates that shots wear down, the splitter.
4. **Puzzles and pressure:** switches (one, then numbered sequences), survive-N-world-seconds rooms, timed hazards, alarms and chain bonuses.
5. **Rule-breakers:** the clockwork enemy (real time), the stalker (moves only while you are still), conveyors.

Also: brutes coordinating as a pack; sound and music; keeping the best stars across sessions.
