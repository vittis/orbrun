# Contributing

Bug reports and questions go to [GitHub
issues](https://github.com/Caeous/orbrun/issues). Pull requests are welcome;
the contract every change is held to is: match WebTiles, work with a
controller, and never break the keyboard.

## Layout

npm workspaces. `apps/orbrun` is the Vite app; `packages/*` are the
libraries, each with a README (see "DCSS as a library" in the
[README](README.md)); `tools/record` captures fixtures from a live server;
`tools/build` packs the front room's tiles and renders its poster and the
brand artwork. All of those outputs are committed, so an ordinary build never
runs the tools.

## Commands

```
npm test            # vitest run
npm run typecheck   # tsc -b
npm run build       # build apps/orbrun
npm run dev         # dev server (Vite, with the gamedata proxy)
```

Run `npm test` and `npm run typecheck` before calling a change done.

To compare test worker settings, run
`node tools/perf/vitest-workers.mjs --rounds 2`. It runs the complete suite
sequentially with processes and threads, preserves file isolation and timeouts,
and checks that every variant collects the same tests and skips. JSON reports
and logs go to a temporary directory printed at the end; use `--output` to
choose one, or `--cases forks-2,threads-2` for a smaller comparison. Round order
alternates to reduce warm-cache bias. Compare repeated wall times on the target
machine; changing the worker count locally does not reproduce a CI CPU quota.

The default uses isolated threads and up to four workers, including both cores
on a two-core runner. Keep isolation enabled. Scene recording helpers parse tile
tables once per file and clone messages/final state for consumers; tests of the
replay itself still process every message. Deployment tests copy a committed Git
template, then use independent checkouts and real bare remotes for each case.

Before deploying, commit your changes and integrate the latest `origin/main`.
`npm run deploy` and direct `npx wrangler deploy` fetch main and reject stale,
diverged or dirty source, rebuild assets, then recheck freshness before upload.
`npm run deploy:guard` runs only the Git checks. Do not deploy from an older
checkout that predates the guard. See [deployment notes](project-notes/DEPLOYMENT.md).

## Fixtures

Prefer a recorded fixture over a hand-written one.

- `npm run record -- wss://crawl.dcss.io/socket 60 out.ndjson` spectates the
  least idle player for 60 seconds and writes every server message to NDJSON.
  Spectating needs no login. The reducer tests replay such files.
- `node tools/record/menus.mjs wss://crawl.dcss.io/socket 30 outdir` collects
  every menu the spectated players open, each from its `menu` message to its
  `close_menu`, as one JSON fixture per menu type.

crawl.dcss.io is the recording target: it is the public server whose
WebSocket accepts the `no-compression` subprotocol from Node, which both
recorders need.

## Live testing

Anything that logs in to a real server reads its credentials from `.env`,
which is gitignored. Copy `.env.example` to `.env`, fill it in, and run such
scripts with `node --env-file=.env ...`. Vite only exposes `VITE_`-prefixed
variables to the browser bundle, so keep these unprefixed. Never commit `.env`
and never paste a password into a fixture.

## The front room and the brand

The Antechamber (`apps/orbrun/src/room/antechamber.des`) is drawn from a
small atlas of DCSS's own tiles, packed from one pinned gamedata version;
`apps/orbrun/public/room/README.md` says how to regenerate it. The poster
the menus stand on before WebGL is up comes from `npm run room:poster`. The
favicon, wordmark and Steam artwork come from `node tools/build/brand.mjs`,
which needs `rsvg-convert` and `magick` on the PATH. Tune the room at
`/testbed/room.html` on the dev server; `/testbed/walls.html` and
`/testbed/grid.html` exercise the wall geometry and the console grid.

## Changelog

`CHANGELOG.md` is public facing. Keep entries short: one line per change,
what changed and why it matters to a player, no implementation detail.
