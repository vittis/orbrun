# Recorded menu gameplay

The menu shuffles seventeen spectator recordings and seventeen staged engine recordings through
Orbrun's normal 2.5D renderer and confirmed combat presentation. No game engine,
video, external replay player, gameplay commands or public spectator connection
is used by the backdrop. The home screen's ordinary server lobby is independent.

## Scripted Volcano encounters

**Volcano Temple (scripted)** follows a level-19 Deep Elf Ice Elementalist through a
generated Volcano in Crawl 0.34.1, seed 180. In the entrance hall, the caster
summons an ice beast, freezes the walls and raises two hoarfrost cannons.
A phial of floods knocks a salamander back and floods the hall. On the lava
causeway, the caster uses Freeze at close range, then advances inside Polar
Vortex as Permafrost Eruption and Ozocubu's Refrigeration hit the guards.
Behind the temple doors, a red draconian breathes fire into the doorway.
Hailstorm, cannon shards and Refrigeration finish the fight before the caster
collects the treasure.

Wizard mode staged the character, skills, spell list, equipment and Volcano
portal before recording. A WebTiles spectator snapshot opens the clip on turn
11. Ordinary movement, casting and evocation commands drive the rest of the
run. The final gold pickup coincides with a volcanic eruption on turn 67.
The clip preserves all 254 player, map and message packets in order. Its 100
timed updates and final hold play in 19.695 seconds.

**Volcano Lake (scripted)** follows a level-20 Tengu Air Elementalist flying
along a lava island in a different generated Volcano (seed 147). A phial of
floods knocks back a fire bat. The Tengu uses Shock, Arcjolt and Plasma Beam
against the bats and lava snakes, then uses Iskenderun's Mystic Blast to push
snakes away as the volcano erupts. An early Chain Lightning miscasts. The
final cast kills a sun demon, a fire bat and two lava snakes.

The lake recording uses the same wizard setup process and starts from a
spectator snapshot on turn 28. Its 206 ordered packets follow the encounter
through turn 54. The 96 timed updates and final hold play in 10.992 seconds.

## Other staged encounters

These level-21 and level-24 characters enter different generated locations
in Crawl 0.34.1. Wizard mode prepared the characters and branch entrances
before capture. Each clip opens with a full spectator snapshot and retains
the ordered player, map and message packets through its final turn.

| Scene | Seed | Turns | Encounter |
| --- | ---: | ---: | --- |
| Storm on the Shoals | 31 | 41–67 | A Merfolk Air Elementalist swims through kelp with harpies in pursuit. Freezing Cloud spreads across the water and ball lightning catches a manticore. |
| Silk and Cinders | 92 | 24–44 | A Minotaur Fighter cracks open a tin of tremorstones, then cleaves through spiders and their simulacra with a flaming broad axe. A blink lands on gold as Aizul comes into view. |
| The Walking Grove | 58 | 2–176 | A Barachi Summoner calls a forest, a hydra and a cactus giant. A swamp worm harpoons the hydra. Later, tree roots strike an alligator that drags the caster through the shallows. |
| Breaking the Crypt | 115 | 25–42 | A Gargoyle Earth Elementalist uses Shatter in a vaulted hall. Bombard destroys a vampire mage and its summons vanish. A final quake destroys a vampire knight. |
| Fire Under the Ice | 83 | 4–25 | A Deep Elf Fire Elementalist follows a tunnel through the Ice Cave. Foxfire and Starburst melt dragon simulacra, and a rime drake encases the caster in ice before it falls. |
| The Dead March in Orc | 45 | 16–47 | A Demonspawn Necromancer pins a two-headed ogre with zombie hands. Animate Dead and Death Channel turn the orc patrol into a crowd of zombies and spectral allies. |
| Crossfire in the Snake Pit | 89 | 30–44 | A Coglin Hunter fires paired flaming and freezing hand cannons at a black mamba, a guardian serpent and naga magi. One mage constricts the hunter before the last volley. |
| Mirrors of the Tomb | 174 | 62–122 | A Mountain Dwarf uses a phantom mirror on a mummy priest. The reflection smites the original. Farther down the gallery, the dwarf meets a swarm of death scarabs with a holy axe. |
| Ignition in the Slime Pits | 228 | 9–23 | A Deep Elf Alchemist pushes past corrosive walls and mutating eyes. Ignition sets off a series of blasts across the converging slimes. The caster blinks clear and reaches the stairs. |
| Dragons at the Zot Gate | 318 | 67–129 | A Deep Elf Conjurer calls up dragons and tentacled monstrosities. A moth of wrath sends allies berserk against a quicksilver dragon. Beyond the gate, Orbs of Destruction intercept a white draconian breathing frost. |
| Saint Roka’s Ultimatum | 383 | 25–46 | A Troll Monk throws boulders at an orc knight and claws Saint Roka. When the priests offer quarter, the Troll converts to Beogh. The orcs cheer and their summoned demons vanish. |
| Unseen in the Bailey | 522 | 16–62 | A Spriggan Enchanter slips through the gate, confuses an orc and puts a gnoll to sleep. A potion of invisibility lets the Spriggan carry the ambush into the next room. |
| Clockwork in the Salt | 735 | 26–85 | A Mountain Dwarf Forgewright winds a clockwork bee in the salt fog. A lightning spire fires on the saltlings while a blazeheart golem fights beside the dwarf. Its exposed core explodes and kills a guardian serpent. |
| Firestorm on Cocytus | 917 | 23–35 | A Deep Elf Fire Elementalist follows the narrow footing between pools with Plasma Beam and Starburst. Scalding steam and fire vortices catch a harpy simulacrum before Fire Storm melts a quicksilver dragon and an alligator simulacrum. |
| Butterflies in Pandemonium | 628 | 37–117 | A Gargoyle Hunter shoots down a reaper and a ynoxinul with a holy triple crossbow. After scouting two gates, the hunter reads a scroll of butterflies to make room against the Pandemonium lord Tatacsir and a Brimstone Fiend. |

In Breaking the Crypt, each Shatter animation shares a single frame with the
map that restores the room to its original coordinates. The player stays visible through all five casts.

All seventeen staged clips use the existing 0.34 artwork bundle. The seven tile
tables, enums and status icon table match the recording build byte for byte.
The manifest pins the [engine commit](https://github.com/crawl/crawl/tree/1eebc1a2892e1c89776a0d7a10691f8dac8d9796).

## Recording provenance

Captured read-only from https://crawl-br.roguelikes.gg on 2026-11-17.
The Lair recording contains 1,268 complete, ordered messages over 92.094
seconds, with an initial full map and 280 map updates, all in Lair:1.

- Yaks in the Lair: 24.406 seconds, source capture 1–30 seconds.
- Wolves and Gastronok: 32.621 seconds, source capture 30–66 seconds.
- Snakes in the Lair: 24.828 seconds, source capture 66–92.253 seconds.

The Djinni recording contains 2,346 complete, ordered messages over 111.706
seconds, with 454 map updates across Dungeon:1–3. Its three Foxfire combat
clips join the existing Lair clips in the same shuffled playlist:

- Djinni descent: 28.864 seconds, source capture 1–30 seconds.
- Foxfire in the Dungeon: 29.023 seconds, source capture 48–78 seconds.
- Djinni on Dungeon:3: 22.959 seconds, source capture 90.5–111.859 seconds.

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

- Octopode in the Vaults: 16.564 seconds, source capture 8–29 seconds.
- Lightning in the Vaults: 18.894 seconds, source capture 66–93 seconds.
- Vaults skirmish: 24.782 seconds, source capture 93–119.603 seconds.

These use DCSS `0.34.1-5-gfd259fce64` and gamedata version
`0703b2fa62e821390161d95cf52f9da1183761d4`. Its matching artwork and tile tables
are restored byte-for-byte from the previously bundled, checksummed CDI
downloads in commit `db6c39d`. The manifest lists each clip's version and both
asset sources; playback switches tile tables with the recording, never reuses
tile IDs from a different DCSS version.

Seven additional clips come from the November 17 captures. The Brazilian server supplied the three Djinni clips “Foxfire at the entrance”, “Blastmotes on Dungeon:5” and “Stand against Jeremiah”. CDI supplied two Formicid clips from the Vaults and Swamp, a Mummy recording from the Elven Halls and a Demonspawn recording from the Abyss. The shorter Demonspawn capture contains only the opening snapshot. Each playable excerpt has its original time range in the manifest. The three additional artwork versions use downloads from the versioned CDI gamedata directories.

The Tengu Air Elementalist clip uses seconds 61–92 of a November 17 Brazilian server capture. It shows Shock and lightning arcs against an adder and shares the Lair recording’s artwork version.

`../../data/menu-replays.json` pins every recording and artwork file by size and
SHA-256. The Vite build verifies these files; it never downloads or compiles an
engine. Clip filenames contain content hashes; artwork paths contain their
server version. HTTP caching handles repeat visits.

The spectator recordings retain only map/player/message state, anonymize the watched
player as Adventurer, and discard lobby, spectator lists, chat, server HTML,
menus and outgoing commands. All preceding gameplay deltas form a silent
bootstrap; no terrain, visibility or combat result is fabricated. The curator uses the original packet timestamps and WebTiles animation
delays, including delays between maps delivered in a single socket batch.
Spectator idle gaps are capped at 900 ms. Staged clips use short pauses
between inputs and the captured map timings within each action. The menu
delivers each authored frame to the 2.5D renderer before its next canvas
paint. In the Snake Pit recording, one hand-cannon slug advances across
five confirmed cells in 71 ms. In Butterflies in Pandemonium, the opening crossbow bolt
appears on six successive cells at 0, 19, 37, 57, 77 and 97 ms from its first appearance.
Clip boundaries rebuild state and clear presentation, followed by
a fresh copy of the next bootstrap. The final frame holds for 1.6 seconds.

Every clip plays once per shuffled round, starting with a random clip on each
menu load. The first clip of a new round cannot repeat the last clip of the
previous round. The playlist is silent, renders at most 30 fps/1280×720, and pauses its clock and
renderer while covered or hidden. Startup loads one clip and its matching artwork. The
Orb of Zot shrine remains visible while loading and on failure. Its status offers a retry on failure. The retired
menu-engine CacheStorage caches are deleted without touching offline saves.

A temporary **Choose scene** selector above the tilt slider loads a chosen
clip and loops it until **Shuffle all** is chosen. Selection lasts
only for the current menu instance, survives pauses while covered or hidden,
and is never written to settings, accounts or saves.

The fallback uses the [original Orb of Zot tile](../orb.png) over a text-mode
altar. The Orb floats while a visible menu is loading with motion enabled.
See [tile provenance](../../../../ATTRIBUTION.md#tile-art-in-the-front-room).

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
