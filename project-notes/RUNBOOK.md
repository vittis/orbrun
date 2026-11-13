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

## Automated checks: use the smallest relevant gate

```sh
# While editing: affected tests since HEAD (or a specific test file).
npm run test:changed
npm test -- settings.test.ts
npm run test:watch -- settings.test.ts
# Before finishing an ordinary code change:
npm run verify
# Install Chromium once, only when browser checks are needed:
npx playwright install chromium
npm run verify:browser
# Renderer/scene/artwork/fixture changes: full raster, same interaction tests.
npm run verify:render
# Build/Worker/production flags/embedded docs: build once + production preview.
npm run verify:production
# Deployment tooling: real Git remote/cleanliness/freshness tests.
npm run test:deploy
# Shared harness/config/dependencies, and before releasing:
npm run verify:release
```

`verify` runs incremental workspace and verification-tool TypeScript checks plus the retained unit suite. It needs no Chromium, server, production build or Git-remote fixtures. Warm TypeScript state lives in ignored build-info files; a clean checkout still checks everything. `typecheck:full` deliberately forces the workspace rebuild and remains part of the release gate.

`test:changed` uses Vitest's import dependency graph against HEAD, including staged/unstaged/untracked files. It checks both unit and deployment projects when affected. For committed branch changes use `npx vitest run --changed origin/main` (fetch the comparison ref first). Missing bases fail. A zero-test result is allowed for editing convenience and is not acceptance. CSS, readFile fixtures, assets and build configuration can escape dependency selection: explicitly run the appropriate wider command above. `verify` runs the whole retained unit suite regardless of selection.

`verify:browser` starts only the strict dev server on 5286. Its smoke profile runs 298 raster assertions across all nine concerns, 12 atmosphere assertions, native reduced-motion/Still/On behavior, and actual narrow mouse/touch HUD and map/overview/settings/resize/targeting. `verify:render` substitutes the complete 4,504 raster matrix. Both profiles assert exact counts and fixture completion. `verify:production` builds once, starts only preview on 5287 and checks the online-only production shell. Public WebSockets are intercepted. `verify:release` runs forced TypeScript, both Vitest projects, one production build, then the full browser/production suite with both servers. No duplicate build inside Playwright.

Ports are strict and never reuse another checkout's server. Browser contexts and unit files remain isolated; browser retries stay at zero. Reports and failure traces/screenshots go to ignored `test-results/`. Do not install Chromium or run full release verification for ordinary unit-only edits. Retain deliberate browser quiet windows proving that animation stops; use fake time for unit timing.

CI runs once per PR update and on main, plus manual dispatch; it no longer runs a duplicate feature-branch push job. PRs always check retained units for code changes. `tools/testing/change-scope.mjs` adds smoke/full rendering, production and deployment checks based on changed paths, with conservative full checks for unknown paths or shared config. Repository prose-only PRs skip dependency/browser setup; embedded ABOUT/INSTALL/STEAM/CHANGELOG pages still get a production build. Main/manual dispatch run release verification. CI installs pinned Chromium/Linux dependencies only when a browser gate is needed. Main CI is not a deployment interlock: perform release verification before publishing, as in DEPLOYMENT.md.

Keep tests for meaningful behavior and regression boundaries. Remove duplicated storage cases, exact cosmetic wording/layout assertions and redundant matrix combinations rather than perpetuating every historical test. Preserve protocol/input/storage, independent raster oracles, accessibility and security checks. [AGENTS.md](../AGENTS.md) is the short agent policy; [BASELINE.md](BASELINE.md) records measured speed and deliberate tradeoffs.

Optional engine checks remain separate: `REQUIRE_ENGINE=1 npm run e2e` requires provisioned stable artifacts; without the flag, absent artifacts produce explicit skips. Recording describes is a manual tool: `E2E_RECORD=1 npm run e2e -- record-describes`; it is not collected by normal engine acceptance. The assertion-free probe/help dumps were removed. Never claim engine coverage from skips.

Security-focused regressions include gamedata parsing, WebSocket connection, proxy/session loading and Worker routes. Dependency audits are separate maintenance, not part of the editing loop; never use `npm audit fix --force` as routine verification.

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

- `/testbed/dungeon-checks.html`: full raster acceptance matrix. On constrained browsers use `?lane=tiles`, `markers`, `surfaces`, `movement`, `depth`, `visibility`, `arrival`, `coherence`, and `corridors`; together these execute the same assertions. The full profile is the manual fixture default and release/render gate; routine browser checks explicitly select smoke. `&profile=smoke` is explicitly representative, never reported as full acceptance. `&capture=1` retains visual captures; default runs release canvases and yield between bounded cases. JSON in `#result`/`window.__orbrunFixture` reports status, profile, checks, failures and duration.
- `/testbed/living-checks.html`: 12 retained Dungeon/flat atmosphere, Still and impact assertions at desktop and narrow/DPR sizes.
- `/testbed/live-animation.html`: actual GameScreen scheduler, combat receipt timing and reduced-motion controls. `?native-motion=1&motion=auto` uses browser media emulation; default synthetic controls support manual inspection. Pixel sampling is opt-in and bounded (`sample=1`), so the probe does not stall the scheduler.
- `/testbed/map-lifecycle.html`: local message-driven GameScreen transitions, overview hold, cursor, settings changes, cleanup and input evidence. The renderer factory receives the actual presentation requested by GameScreen, supplies fixture tiles and reports applied Dungeon options. Production preview separately exercises default selection.
- `/testbed/room.html`: authored 2.5D scenery/flat overview; `?poster` for committed poster/card generation.

Never treat simulated controller input or these local server fixtures as authenticated play or physical-controller validation.
