# The 2.5D front room

The live menu cycles the bundled `places/<id>.json` scenes and matching PNG
atlases through the same 2.5D renderer as gameplay. Format 2 stores a `center`
cell, classified scene data and tile atlas metadata; each file retains source
server/version/recording and license provenance. No remote server is needed.

`atlas.png` and `atlas.json` instead supply the authored
`src/room/antechamber.des` fixture, combat previews and poster generator: a
handful of DCSS's own tiles packed from one pinned gamedata version.
They are committed; an ordinary build ships them as they are.

Regenerate the authored fixture atlas only when that vault or pinned version changes:

```
V=acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8   # ROOM_GAMEDATA_VERSION in tools/build/pack-room.mjs
mkdir -p /tmp/gamedata-$V && cd /tmp/gamedata-$V
for f in floor wall feat main player; do curl -fsSO https://crawl.dcss.io/gamedata/$V/$f.png; done
cd - && node tools/build/pack-room.mjs /tmp/gamedata-$V
```

The tileinfo modules of that version are the checked-in fixture under
`packages/scene-webtiles/test/fixtures/gamedata/`. `atlas.json` records the
version, the atlases and the source rect and offsets of every tile; the
vault tests check that the room asks for nothing the atlas lacks.

The menu uses the existing 2.5D renderer. The committed poster and social card must be regenerated when the scenery changes. DCSS tile art has mixed provenance: most is public domain/CC0, with exceptions. The atlas records version and source rectangles, not a per-tile license audit. See the repository's ATTRIBUTION.md; do not infer a blanket CC0 license.
