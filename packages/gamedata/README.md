# @orbrun/gamedata

Loads a DCSS WebTiles server's own version-specific data at runtime, the way
the official client does: `enums.js`, the `tileinfo-*.js` modules for every
atlas, `status-icon-sizes.js`, and the atlas images themselves. Nothing
version-specific is hardcoded, so stable and trunk both work and a new
release needs no update here.

- `loadGamedata({ base, version, io })` fetches and parses the generated data
  and returns a `Gamedata`; `skipImages` leaves the atlases out for headless
  use, `onProgress` and `onDiagnostic` report along the way.
- `Gamedata` answers `tile(id, layer)` with the atlas and source rect of a
  tile, `atlas(name)` with its image, `tileCount(id)` with its variants, and
  `statusIconSize(id)` with how a status icon lays out. Its name indices
  (`dngn`, `main`, `player`, `icons`, `gui`) map `name(id)`, `id(name)` and
  `baseName(id)`; `ranges` gives each module's id span; `fg()` and `bg()`
  decode cell flag words locally using the server's flag masks;
  `enums` holds every enum table.
- `verifyEnums(gd, expected)` reports any enum value a client assumed that
  the server disagrees with, so fallback tables can be cross-checked at load.
- `browserIo()` is the default `GamedataFetch` for a browser; supply your own
  `fetchText` / `loadImage` pair in Node or behind a proxy.
- `TileId`, `TileRect` and `TileSource` are the tile-provider contract;
  `Gamedata` implements it, and `@orbrun/scene` declares the same shape
  without depending on this package.

Public servers serve gamedata without CORS headers, so a browser needs a
same-origin proxy in front of them; Orbrun's is `apps/orbrun/gamedata-proxy.ts`
in the repository.

Remote JavaScript is never executed. Acorn parses a bounded subset of generated
AMD declarations into data. Local functions implement tile lookup and flag
decoding; helper ASTs must match the reviewed templates in `src/enum-template.ts`
and `src/parse.ts`. Unknown algorithms, executable top-level statements, dynamic
properties, getters, prototype access, loops and arbitrary calls are rejected.
The optional status-icon module is read as a switch lookup table; a missing or
unsupported one reports a diagnostic and uses tile widths as before.

Script downloads are capped at 4 MiB. Parsing additionally bounds tokens,
syntax/AST depth, arrays, properties and per-tile flag work. The checked-in
fixture tests compare all tile accessors and mixed low/high flag words with the
pinned official modules. Current CDI stable and trunk modules were also parsed
during deployment preparation; a future server algorithm change may require a
reviewed compatibility update. Custom `GamedataFetch` implementations must bound
their own network buffers; the parser still enforces source limits.

Depends on Acorn (MIT). Part of [Orbrun](https://github.com/Caeous/orbrun).
AGPL-3.0-or-later.
