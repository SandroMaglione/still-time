# Still Time: audio

The sources of the game's sound, made with `ritmo-tools` (`@typeonce/ritmo-tools`):

| File | What it is |
| --- | --- |
| `still-time.sounds.json` | The sound bank: every sound effect as a JSON recipe (layers of tones, noise, swishes, metal), each with an `about`. |
| `dungeon.song.json` | The rooms' loop: a heartbeat kick, a dark pad, low bass, a few cold bells (D harmonic minor, 68 bpm, 8 bars). |
| `title.song.json` | The title's loop: a slow flute over strings, same key (64 bpm, 8 bars). |
| `*.review.json` | What the person said on the review pages (status, notes, comments). Written by the pages; keep them. |

The game plays the rendered WAVs in `public/audio/` (do not edit those), through `src/host/audio.ts`.

## Re-render after an edit

```sh
pnpm audio
```

`scripts/audio.mjs` renders every sound and song with `ritmo-tools`, shrinks them for the web (mono 16-bit; sounds at 22 050 Hz with their silent tails cut, songs at 16 000 Hz, loops kept seamless), writes them to `public/audio/sfx/<name>.wav` and `public/audio/music/<song>.wav`, and regenerates `src/host/audio-bank.ts` (the sound names the code may play, with each one's `heavy` and `interval`). Then reload the game. A new sound in the bank needs a line in `src/host/audio-cues.ts` to be played.

Check before re-rendering:

```sh
npx ritmo-tools sound check assets/audio/still-time.sounds.json
npx ritmo-tools music check assets/audio/dungeon.song.json
npx ritmo-tools music check assets/audio/title.song.json
```

Keep the total under about 3 MB (`du -sh public/audio`): most of it is the two songs, so a longer song costs the most.

## Listen and leave notes

```sh
npx ritmo-tools sound review assets/audio/still-time.sounds.json --host          # http://localhost:5190
npx ritmo-tools music review assets/audio/dungeon.song.json --host               # http://localhost:5191
npx ritmo-tools music review assets/audio/title.song.json --host --port 5192     # http://localhost:5192
```

`--host` also serves them on the network, for a phone. On the sound page, mark each sound approved or changes, write a note, try the takes, or tune it with the sliders; on the music page, comment on bars, edit notes, swap instruments. Everything is saved to the files as you go. Re-render (`pnpm audio`) to hear it in the game.

## Read the notes back

```sh
npx ritmo-tools sound notes assets/audio/still-time.sounds.json
npx ritmo-tools music notes assets/audio/dungeon.song.json
npx ritmo-tools music notes assets/audio/title.song.json
```

Each prints JSON: every sound's status and note (changes asked first), or the song's status, note, comments by bar, and the edits made by hand. A take picked on the page is already the sound in the bank, and a tune is the recipe's `tune`: keep both when changing a recipe. To offer choices for a sound, `npx ritmo-tools sound vary assets/audio/still-time.sounds.json <name> --toward heavier` (or `lighter`, `brighter`, `darker`, `punchier`, `softer`, `shorter`, `longer`, `wider`) puts four takes on its page.

## How time sounds in the game

`view.scale` (about 0.04 still, 1 at a full push), smoothed, drives:

- the music: playback rate 0.74 → 1 and a low-pass 380 Hz → 9 kHz;
- the room's air (brown noise made in code, not shipped): darker and quieter still, a rush when moving;
- every sound the world makes (shots, enemies, bombs, doors, plates, gates): rate 0.5 → 1, through a low-pass 650 Hz → 18 kHz, retuned live while it plays.

Your blade, steps, dash and death, the clockwork and the stalker keep real time (they ignore slowed time in the game too). The clear, the stars and the menus are not in the world: they play as they are. The numbers are `TIME` in `src/host/audio.ts`.
