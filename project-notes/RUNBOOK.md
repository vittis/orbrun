# Development and verification runbook

Run commands from the repository root. Read [STATUS.md](STATUS.md) and [DEPLOYMENT.md](DEPLOYMENT.md) before release work. Do not commit `.env`, credentials, tokens, raw recordings or generated logs.

## Inspect and install

```sh
git status --short --branch
git remote -v
git rev-parse HEAD
node --version
npm --version
npm ci --include=dev
```

Verified web toolchain: Node 24.11.1/npm 11.6.2. Vite requires Node ^20.19.0 or >=22.12.0; Wrangler requires >=22. The optional WASM engine has separate requirements below. Preserve unrelated edits. Fetch and integrate current `origin/main` before substantial changes and again before publication; origin is the user's fork, upstream is Caeous's repository.

## Run locally

```sh
npm run dev -w apps/orbrun -- --host 127.0.0.1
```

Open [development](http://127.0.0.1:5173/). Keep development listeners loopback-only. The production bundle is built and served separately:

```sh
npm run build
npm run preview -w apps/orbrun -- --host 127.0.0.1
```

Open [preview](http://127.0.0.1:4173/). Vite preview includes the gamedata proxy. `apps/orbrun/dist` is generated; the build does not provision offline engine artifacts. Network/listener/keychain sandbox refusals must be distinguished from application failures.

## Automated checks

```sh
npm run typecheck -- --force
npm test
npm run e2e
npm run build
```

Run focused suites for changed behavior before the integrated suite. Keep test isolation enabled. The normal suite explicitly skips absent optional engine artifacts; `REQUIRE_ENGINE=1 npm test` and `REQUIRE_ENGINE=1 npm run e2e` make missing stable engine artifacts fatal. Report skips instead of claiming engine coverage.

Security-focused regressions include `packages/gamedata/test/parse.test.ts`, `packages/webtiles/test/connection.test.ts`, and app tests for gamedata proxy, session loading and Worker routes. `npm audit --json` can report current advisories; assess exposure before changing dependencies and never use `npm audit fix --force` as a routine verification step.

## Browser acceptance

Exercise the actual app at desktop and narrow/mobile viewport sizes:

1. Confirm 2.5D menu scenery, settings, resize and repeated navigation lifecycle. No projection selector or first-person setting should remain.
2. Confirm fresh settings and migrated saved projection settings use Dungeon (2.5D), preserving unrelated preferences.
3. Open `/watch/cdi`, wait for the anonymous lobby and spectate an active player when available. Check real tiles, HUD, messages, minimap and server-driven updates. Never send chat or gameplay commands to another player's session.
4. Use deterministic local fixtures to check level-map entry/exit, repeated transitions, cursor/selection, settings changes while open and resize. Check `X` separately from `Ctrl+X`.
5. Check compass movement and targeting through keyboard/gamepad/touch simulation, then report hardware coverage separately.
6. Check Still/reduced motion, visibility, wall/corridor behavior, confirmed combat effects and cleanup. Inspect console and failed network requests.
7. Run retained development rendering fixtures such as `/testbed/dungeon.html`, `/testbed/dungeon-checks.html`, `/testbed/arrival-checks.html`, `/testbed/impact-checks.html`, `/testbed/projectile-checks.html`, `/testbed/room.html` and `/testbed/combat.html`. Record current results, not historical counts.
8. Repeat representative shell, settings and spectating checks against production preview; this verifies production flags and emitted assets.

DOM/canvas mocks do not prove raster correctness. Spectating does not prove login, character creation, save/restore or physical-controller behavior. Obtain explicitly authorized disposable-account coverage separately, with secrets entered securely and never stored in evidence.

## Fixtures and optional engine

`npm run record -- wss://crawl.dcss.io/socket 60 out.ndjson` captures anonymous spectating. `node tools/record/menus.mjs wss://crawl.dcss.io/socket 30 outdir` records menus. Keep recordings small and free of private credentials/chat where possible. Do not inject malformed traffic into public servers; use mocks.

Read [engine deployment](../engine/DEPLOYMENT.md) before provisioning: emsdk 6.0.10, Node 25+ JSPI, PyYAML and native build prerequisites are separate from the web toolchain. `engine/build.sh stable`, `node engine/smoke.mjs` and `npm run e2e` are the optional workflow. Engine scripts manage/clean their own worktrees; never point `ENGINE_WORK` at user work. Record resolved source identity and artifact recipe. Do not expand hosted production to offline mode as part of routine checks.

## Release

Follow [DEPLOYMENT.md](DEPLOYMENT.md). Commit before the guarded dry-run; do not bypass its cleanliness/freshness checks. Preserve unrelated upstream changes and never force-push. After release record exact commit, immutable tag, build/deployment identity, hosted source/version and explicit limitations.


## Retained browser fixtures

Use this checkout's actual Vite port (another checkout may occupy 5173).

- `/testbed/dungeon-checks.html`: full raster acceptance matrix. On constrained browsers use `?lane=tiles`, `markers`, `surfaces`, `movement`, `depth`, `visibility`, `arrival`, `coherence`, and `corridors`; together these execute the same assertions. Detached large canvases are released between cases and loops yield to keep the browser responsive.
- `/testbed/living-checks.html`: 12 retained Dungeon/flat atmosphere, Still and impact assertions at desktop and narrow/DPR sizes.
- `/testbed/live-animation.html`: actual GameScreen scheduler, combat receipt timing and reduced-motion controls.
- `/testbed/map-lifecycle.html`: local message-driven GameScreen transitions, overview hold, cursor, settings changes, cleanup and input evidence. Renderer factory injection supplies fixture tiles; production preview separately exercises default selection.
- `/testbed/room.html`: authored 2.5D scenery/flat overview; `?poster` for committed poster/card generation.

Never treat simulated controller input or these local server fixtures as authenticated play or physical-controller validation.
