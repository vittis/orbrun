# Recorded menu gameplay

The menu shuffles sixteen clips from recorded gameplay through
Orbrun's normal 2.5D renderer and confirmed combat presentation. No game engine,
video, external replay player, gameplay commands or public spectator connection
is used by the backdrop. The home screen's ordinary server lobby is independent.

## Provenance

Captured read-only from https://crawl-br.roguelikes.gg on 2026-11-17.
The Lair recording contains 1,268 complete, ordered messages over 92.094
seconds, with an initial full map and 280 map updates, all in Lair:1.

- Yaks in the Lair: 24.474 seconds, source capture 1–30 seconds.
- Wolves and Gastronok: 32.988 seconds, source capture 30–66 seconds.
- Snakes in the Lair: 25.649 seconds, source capture 66–92.253 seconds.

The Djinni recording contains 2,346 complete, ordered messages over 111.706
seconds, with 454 map updates across Dungeon:1–3. Its three Foxfire combat
clips join the existing Lair clips in the same shuffled playlist:

- Djinni descent: 29.629 seconds, source capture 1–30 seconds.
- Foxfire in the Dungeon: 29.551 seconds, source capture 48–78 seconds.
- Djinni on Dungeon:3: 23.773 seconds, source capture 90.5–111.859 seconds.

Source ranges for these clips refer to the Djinni capture's own timestamps.
Both raw recordings are kept out of tracked source. These six clips share the
same artwork version; adding the Djinni clips does not duplicate tile assets.

The Lair and Djinni clips use DCSS `0.35-a0-1570-g3d2b70d1f1`, source commit
[`3d2b70d1f1`](https://github.com/crawl/crawl/tree/3d2b70d1f1),
and server gamedata version `5d79d81db7552a085647a74860d9842e4beb3d41`.
Artwork and generated tile tables are exact downloads from
`https://crawl-br.roguelikes.gg/gamedata/5d79d81db7552a085647a74860d9842e4beb3d41/`.

The Octopode capture is from **CUE (Amsterdam, Netherlands)** on 2026-11-17:
960 complete, ordered messages over 118.811 seconds, starting in Elven Halls:2
and continuing into Vaults:1. The long idle/menu interval is omitted:

- Octopode in the Vaults: 16.683 seconds, source capture 8–29 seconds.
- Lightning in the Vaults: 19.021 seconds, source capture 66–93 seconds.
- Vaults skirmish: 25.271 seconds, source capture 93–119.603 seconds.

These use DCSS `0.34.1-5-gfd259fce64` and gamedata version
`0703b2fa62e821390161d95cf52f9da1183761d4`. Its matching artwork and tile tables
are restored byte-for-byte from the previously bundled, checksummed CDI
downloads in commit `db6c39d`. The manifest lists each clip's version and both
asset sources; playback switches tile tables with the recording, never reuses
tile IDs from a different DCSS version.

Seven additional clips come from the November 17 captures. The Brazilian server supplied the three Djinni clips “Foxfire at the entrance”, “Blastmotes on Dungeon:5” and “Stand against Jeremiah”. CDI supplied two Formicid clips from the Vaults and Swamp, a Mummy recording from the Elven Halls and a Demonspawn recording from the Abyss. The shorter Demonspawn capture contains only the opening snapshot. Each playable excerpt has its original time range in the manifest. The three additional artwork versions use downloads from the versioned CDI gamedata directories.

`../../data/menu-replays.json` pins every recording and artwork file by size and
SHA-256. The Vite build verifies these files; it never downloads or compiles an
engine. Clip filenames contain content hashes; artwork paths contain their
server version. HTTP caching handles repeat visits.

The recordings retain only map/player/message state, anonymize the watched
player as Adventurer, and discard lobby, spectator lists, chat, server HTML,
menus and outgoing commands. All preceding gameplay deltas form a silent
bootstrap; no terrain, visibility or combat result is fabricated. Timestamp
batches under 40 ms are coalesced in order; gaps are bounded to 100–900 ms for
menu pacing. Clip boundaries rebuild state and clear presentation, followed by
a fresh copy of the next bootstrap. The final frame holds for 1.6 seconds.

Every clip plays once per shuffled round, starting with a random clip on each
menu load. The first clip of a new round cannot repeat the last clip of the
previous round. The playlist is silent, renders at most 30 fps/1280×720, pauses its clock and
renderer while covered or hidden, and releases artwork/renderer state for Still
or OS reduced motion. Loading/failure retains the CSS entrance. The retired
menu-engine CacheStorage caches are deleted without touching offline saves.

A temporary **Choose recording** selector above the tilt slider starts any
clip immediately and loops it until **Shuffle all** is chosen. Selection lasts
only for the current menu instance, survives covered/reduced-motion pauses,
and is never written to settings, accounts or saves.

## Preparing replacement clips

Enter your game first, then use
`npm run record -- wss://crawl-br.roguelikes.gg/socket 120 /tmp/capture.ndjson PLAYER`
for anonymous read-only capture. Never send chat or gameplay commands to a
spectated session. Keep raw captures outside the repository. Select a moving,
combat-containing segment, then run:

```
node tools/record/curate-menu.mjs /tmp/capture.ndjson START_MS END_MS /tmp/clip.json
```

Inspect the generated messages, verify movement/combat and view the whole clip
at desktop and narrow sizes. Bundle the matching game artwork, hash-name the
clip and update the manifest. Record source ranges and provenance here.
`menu-replay.test.ts` verifies every shipped clip through the real reducer,
scene builder and combat feedback, twice, with matching asset checksums.

## Attribution

DCSS code and generated metadata are GPL-2.0-or-later; see the upstream licenses
for [0.35](https://github.com/crawl/crawl/blob/3d2b70d1f1/LICENSE) and
[0.34](https://github.com/crawl/crawl/blob/fd259fce6465398a06f508afb75072a828756a5b/LICENSE).
DCSS artwork has mixed upstream licensing; retain
[ATTRIBUTION.md](../../../../ATTRIBUTION.md) and the
[tile licensing notes](https://github.com/crawl/tiles/blob/master/README.md).
Version/rectangle provenance is not a blanket CC0 assertion for the artwork.
