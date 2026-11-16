# Polished Crawl menu media

`crawl.webm` is a finished, muted VP9 recording (1280×720, about 24 seconds,
2.3 MB, no audio track). `poster.jpg` is a genuine frame of the same renderer
and composition. Only the dungeon canvas is captured: no account names, HUD,
chat, credentials, debugging overlays or health/magic bars. The right-side
composition and short fades give a quiet loop join behind the menu.

Source: the existing anonymized fixture
`packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson`, replayed from 35–57
seconds with one second of settling on each end. State and combat come from
its recorded server messages, through the normal reducer, scene builder,
GameScreen combat presentation and sole Render25d renderer. The final capture
observed seven confirmed impact events. There is no bot, simulation, network
play, or second renderer in the production menu.

Pinned gamedata: `acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8` from
`https://crawl.dcss.io/gamedata/`. Its parser fixtures are already in the repo.
DCSS artwork has mixed upstream licensing (mostly public domain/CC0, with
exceptions); retain the repository's ATTRIBUTION.md and the upstream
[DCSS license](https://github.com/crawl/crawl/blob/master/LICENSE) and
[tile provenance](https://github.com/crawl/tiles/blob/master/README.md).
The capture does not establish a new blanket license for the source art.

Reproduce from the repository root:

```sh
npm run dev -w apps/orbrun -- --host 127.0.0.1 --port 5290 --strictPort
# In another terminal; requires installed Playwright Chromium:
node tools/record/menu.mjs http://127.0.0.1:5290
```

The capture-only testbed is `apps/orbrun/testbed/menu-recording.html` and `.ts`.
The script downloads only the pinned tile atlases to a temporary directory,
serves them to the browser locally, refuses WebSockets, writes finished media,
and removes temporary files. It never writes another raw gameplay recording.
VP9 is encoded by Chromium MediaRecorder at a 1.6 Mbit/s target, 30 fps input;
actual frame timing follows renderer updates. Ordinary builds ship the finished
assets and never run capture tooling. Playback failure uses the poster.

Production browser checks load the media and local fonts under the shipped CSP;
interaction checks cover Still, OS reduced motion, hidden/covered menus and
resumption. Unit checks cover rejection, delayed playback and resource release.
