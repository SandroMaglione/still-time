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
- **Shooters** (gunner: bullets; archer: fast arrows; thrower: a fan of three knives; sniper, below) fire only with line of sight within 13 m, 0.25 s after you step out of cover if already reloaded. They hold fire and sidestep when an ally is in any line of their shot, creep toward where they last saw you, and stay within 3.5 m of their post.
- **Brutes** stand until they see you, then chase faster than you (5.5 m/s, a 180° turn in about 0.3 s). Within 2.5 m they wind up for 0.5 s: they track you and step in to 1.6 m, then commit for the last 0.35 s. They swing a 2 m wedge of ±57° and recover for 0.8 s. Their front (±69°) is guarded only while they attack: step out of the swing, then cut back in during the recovery, even from the front.
- **The melee family** shares the brute's cycle (chase, wind-up tracking then committed, swing, recover) with its own numbers in `MELEE`. A guarded front stops your cut **and shots**.
- **Shield-bearer:** slow (2.6 m/s) and slow to turn (1.5 rad/s), its shield always up (±72°): a steel plate in front. Circling it within 3 m at full speed outpaces its turn; its back is open. Shots on the shield throw a spark.
- **Sniper:** sees 24 m (others 13), holds its post. While it sees you a dashed laser tracks you and charges (1.5 world s); hiding starts it over. For the last 0.4 s the laser **locks** (solid, blinking) and stops tracking: step off the line. Then one fast slug (30 m/s) down the locked line. It starts uncharged.
- **Breakable cover:** wood is what breaks. A **crate** splinters after 3 shots (cracks show as it wears). A **cracked wall** (dark fissures with an orange glint) shrugs shots off but gives to a **brute's swing** (its blade bites 0.4 m past its reach) or a **blast**. A retry mends everything.
- **Grenadier:** lobs a bomb at where you stand, over its allies (it does not care who the blast takes). The bomb flies in world time, lands lit, and its fuse (1.3 world s) burns as a red sweep round a ring on the floor: the blast's reach (1.9 m). The blast takes everyone in that ring with nothing solid in between (you, any enemy, the grenadier), and breaks any cracked wall or crate it reaches.
- **Friendly fire:** any shot kills any enemy it touches (a guarded front blocks it: a shield always, a brute while it attacks).
- **Score:** each attempt has a clock in **world** seconds, so it only runs while you move. A clear earns up to three stars: one for the clear, one for no hit in the room since you came into it (retries count), one for beating the room's par. The run keeps each room's best; the last screen totals them.
- **Goals:** `clear` (down every enemy), `exit` (stand on the glowing pad; enemies left standing don't matter), or `survive` (last N world seconds, which only pass while you move; the HUD's clock counts toward it).
- **Plates:** a door can be locked by pressure plates (teal; its door shows a square per plate, lit as each goes down). A plate presses as you step onto it and stays down. Numbered plates must go in order: a wrong one pops them all back up with a red flash.
- **Hazards** run on the attempt's world clock, so they freeze with you. A **blade** bar spins round its hub (its sweep dotted on the floor); a **laser gate** between two posts is off (faint), warns (blinking dashes, 0.45 world s), then on (solid red). Either takes anyone it touches, enemies too.
- **Doors** are walls until their lock is met, then open for the rest of the attempt (a retry shuts them). Locks: a **chamber** cleared (steel door, one red pip per enemy it still waits on), the chamber's **captain** down (gold door with a crown), or its **key** brought to it (a door in the key's colour; it opens when you reach it holding the key, and keeps the key). Closed doors block movement, sight and shots for everyone.
- **Captain:** any enemy can wear a crown. Downing it opens its chamber's captain door; it fights like its kind.
- **Runner (thief):** harmless, carries a key over its head. While it sees you it runs (3.6 m/s, slower than you) toward whichever of 16 directions lands furthest from you; out of sight it stands still, so you sneak up behind cover. Wherever it falls (your cut, or a stray shot) it drops its key on the floor; walk over it to pick it up.
- **Solid bodies:** enemies never overlap each other or you. Brutes keep room from allies, steer round one in their path, and walk at 100% / 82% / 92% pace by spawn order, so they don't arrive in step.

## Look

An upright 2D room with a slight Pokémon-style camera lean: mostly tops, short fronts (floor depth ×0.86, heights at half their size). Decals on the floor (shot paths, swing wedges, guard rings), crates and walls as boxes, people as cylinders with shadows, and your outline always on top. The floor turns cold blue when time is frozen and warm when it runs. The camera follows you with a small lead and stays inside the room.

The iso and steeper tilts were tried and rejected ("too isometric").

## Progress

Rooms open one by one: the first always, each next once the one before is cleared (the simulation refuses a jump to a locked room). The game opens on a title (continue at the first room not cleared, or pick a room); the room select shows every room with its best stars and world time, locked rooms dimmed. A menu pauses the game.

Progress is saved on the device, in the browser's local storage (itch.io has no save API for HTML games): each room's best, by room name, so a build that adds or reorders rooms keeps it. itch.io serves every HTML game from one origin, so every key starts with `still-time/`. The format is versioned; a save that cannot be read is kept aside (`still-time/progress.unreadable`) and the game starts fresh; when the storage cannot be read at all, nothing is written over it. Saves are per browser and device (no sync), and a browser may clear them.

## Rooms

Each room adds one thing, with few enemies, and the rooms grow from there:

1. Duel: one brute. 2. Two Blades: two brutes. 3. Courtyard: the first shooters (two gunners), sight and cover. 4. Friendly Fire: a thrower at the back of a line of two gunners. 5. Gatehouse: the first door (clear this side to open it), gunners and a brute. 6. Throne: the captain, and the first exit. 7. Thief: the runner and its key. 8. Market: two chambers, and the first archers. 9. Warehouse: a thief among shelves. 10. Shieldwall: a shield-bearer guarding a gunner. 11. Watchtower: one sniper down a long room of cover. 12. Splinters: two gunners, and crates that splinter. 13. Breach: the way out is a cracked wall; lure the brute's swing into it. 14. Powder Room: a grenadier (and a gunner its blast can take). 15. Switchyard: a plate opens the gate. 16. Combination: numbered plates, a brute and a gunner. 17. Mill: two blades across a corridor, no enemies: a timing room. 18. Gauntlet: two laser gates and a gunner. 19. Hold Out: survive 9 s with a blade, a gate and three shooters. 20. Fortress: yard gate, keep key, and a crowned brute at the captain's door.

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
2. **Tougher enemies (done):** the shield-bearer (a front that also blocks shots), the sniper (a laser that charges in sight, locks, then fires). The knight (three hits with a daze) was built and cut: one cut kills, always.
3. **Things that break (done):** cracked walls a brute's swing breaks, the grenadier (a fuse ring; the blast kills allies and breaks walls), crates that shots wear down. The splitter was dropped: one cut kills, always.
4. **Puzzles and pressure (done):** plates (one, then numbered), survive rooms, timed hazards (blades, laser gates). Alarms and chain bonuses are not built: both hide state a frozen frame can't show.
5. **Rule-breakers:** the clockwork enemy (real time), the stalker (moves only while you are still), conveyors.

Also: brutes coordinating as a pack; sound and music; keeping the best stars across sessions.
