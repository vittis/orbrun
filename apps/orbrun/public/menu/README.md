# Recorded menu gameplay

The menu plays three curated, anonymous WebTiles spectator captures through
Orbrun's normal 2.5D renderer and confirmed combat presentation. No game engine,
video, external replay player, gameplay commands or public spectator connection
is used by the backdrop. The home screen's ordinary server lobby is independent.

## Provenance

Captured read-only from https://crawl.dcss.io on 2026-11-16:

- Alchemy in the Lair: 22.596 seconds, source capture 18–45 seconds.
- Dungeon skirmish: 18.960 seconds, source capture 1–24 seconds.
- Ice and allies: 29.287 seconds, source capture 17.5–63 seconds.

All use DCSS `0.34.1-5-gfd259fce64`, source commit
[`fd259fce6465398a06f508afb75072a828756a5b`](https://github.com/crawl/crawl/tree/fd259fce6465398a06f508afb75072a828756a5b),
and server gamedata version `0703b2fa62e821390161d95cf52f9da1183761d4`.
Artwork and generated tile tables are exact downloads from
`https://crawl.dcss.io/gamedata/0703b2fa62e821390161d95cf52f9da1183761d4/`.
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

The playlist is silent, renders at most 30 fps/1280×720, pauses its clock and
renderer while covered or hidden, and releases artwork/renderer state for Still
or OS reduced motion. Loading/failure retains the CSS entrance. The retired
menu-engine CacheStorage caches are deleted without touching offline saves.

## Preparing replacement clips

Use `npm run record -- wss://crawl.dcss.io/socket 120 /tmp/capture.ndjson PLAYER`
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

DCSS code and generated metadata are GPL-2.0-or-later; see the exact
[upstream license](https://github.com/crawl/crawl/blob/fd259fce6465398a06f508afb75072a828756a5b/LICENSE).
DCSS artwork has mixed upstream licensing; retain
[ATTRIBUTION.md](../../../../ATTRIBUTION.md) and the
[tile licensing notes](https://github.com/crawl/tiles/blob/master/README.md).
Version/rectangle provenance is not a blanket CC0 assertion for the artwork.
