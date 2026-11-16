# Live menu encounter

The home runs the full DCSS engine in a disposable Web Worker and renders its
confirmed WebTiles messages with the normal 2.5D renderer and combat presentation.
It has no account, persistent filesystem, gameplay input handlers or audio.
A lightweight CSS dungeon entrance appears immediately while the live encounter
loads. No recorded poster or video ships or plays. The loading hint disappears
on the first rendered frame, failure, Still or unsupported browsers.

The source is DCSS 0.34.1, commit `1eebc1a2892e1c89776a0d7a10691f8dac8d9796`,
pinned in `engine/menu-commit`. `engine/wasm/menu-demo.des` is a small authored
Sprint encounter. Its epilogue spawns randomized creatures after Crawl clears
initial line of sight. Crawl's native autofight supplies movement and attacks;
the host advances only after an engine idle acknowledgement. Death, a cleared
room, unexpected prompts and bounded stalled/long runs end the encounter and
start a fresh seed. Engine/loading failures keep the static fallback.

Build from the repository root:

```sh
node engine/prepare-menu.mjs
# Or with the documented engine toolchain already active:
sh engine/build.sh menu
REQUIRE_MENU_ENGINE=1 npm run verify:release
```

The Vite plugin serves the local artifact in development and copies only a
closed set of matching engine and gamedata files into `dist/menu-engine` during
production builds. The manifest includes the source commit and recipe identity.
Ordinary builds without artifacts warn and retain the entrance; deployments
reuse matching local or published artifacts before compiling a changed engine. There is no
engine service binding or runtime upstream-version lookup. First load still
requires downloading these assets; this is not an offline-play offering.

The initial pinned build's full artifact set is approximately 43 MiB before
HTTP compression. The menu starts loading immediately,
caps rendering at 30 fps/1280×720 pixels, and never requests an engine under
Still, reduced motion or missing JSPI support. Covered/hidden menus stop issuing
actions and rendering. Still and teardown release the worker and atlas memory.
The Wasm heap starts at 64 MiB and can grow; this is not a measured total-memory
budget. Real-device performance remains a separate acceptance step.

DCSS engine source is GPL-2.0-or-later; its matching source is available at
https://github.com/crawl/crawl/tree/1eebc1a2892e1c89776a0d7a10691f8dac8d9796 .
The complete bridge, patches, scenario and build recipe are in this release's
`engine/` directory. Retain [ATTRIBUTION.md](../../../../ATTRIBUTION.md), the
[upstream license](https://github.com/crawl/crawl/blob/1eebc1a2892e1c89776a0d7a10691f8dac8d9796/LICENSE)
and [tile provenance](https://github.com/crawl/tiles/blob/master/README.md).
DCSS artwork has mixed upstream licensing; this does not create a blanket
license for its source art.

Startup URLs are pinned in the app bundle, avoiding a manifest request. Artwork,
engine data and streaming Wasm compilation overlap. Immutable data and atlas
responses are kept in a separate `orbrun-menu-assets-v1-<build>` CacheStorage
cache; the current and one previous build are retained. The small engine JS
module uses the browser's normal HTTP/module cache. Cache denial or eviction
falls back to downloads. This stores only immutable assets, never saves or
encounter state. The menu adds no opacity or color overlay to the live canvas.
