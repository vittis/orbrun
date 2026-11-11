# Development runbook

All commands below run from the repository root unless otherwise stated. Use STATUS for current state, DEPLOYMENT.md for online Cloudflare operations, and BASELINE for historical results. Never commit `.env`, tokens, credentials, large recordings or generated logs.

## Resume and inspect

```sh
cd /Users/vittis/dev/dcss-client
cat project-notes/STATUS.md
git status --short --branch
git remote -v
git rev-parse HEAD
node --version
npm --version
```

Read BACKLOG and DECISIONS; preserve unrelated edits. Baseline web tools: Node 24.11.1/npm 11.6.2. Installed Vite needs Node ^20.19.0 or >=22.12.0; Wrangler >=22. Node for WASM tests has a separate requirement below. Tool pinning remains P1-002.

## Install, run, typecheck and build

```sh
npm ci --include=dev
npm run dev -w apps/orbrun -- --host 127.0.0.1
```

Visit [local app](http://127.0.0.1:5173/). Keep development listeners loopback-only. `npm run dev` upstream binds all interfaces; prefer the explicit workspace command above. Stop with Ctrl-C in its terminal. On this sandbox, listener/network/keychain/Git metadata operations required approved execution; DNS/EPERM alone did not indicate application failure. A temporary cache can be used with `npm ci --include=dev --cache /private/tmp/dcss-npm-cache`.

In another terminal:

```sh
npm run typecheck -- --force
npm run build
npm run preview -w apps/orbrun -- --host 127.0.0.1
```

Preview serves [production build](http://127.0.0.1:4173/). Build outputs `apps/orbrun/dist`; it does not build the offline engine. Phase 0 observed chunk-size warnings. Preview itself was not browser-validated in Phase 0.

## Tests and optional engine lane

```sh
npm test
npm run e2e
```

The default suite now passes with explicit skips when engine artifacts are absent.
The optional E2E lane reports skips rather than claiming gameplay coverage.
Historical upstream failures are retained in BASELINE.md. Require stable engine
artifacts in dedicated CI with `REQUIRE_ENGINE=1 npm test` and
`REQUIRE_ENGINE=1 npm run e2e`; these fail clearly when artifacts are absent.

Focused controls regression command:

```sh
npx --no-install vitest run apps/orbrun/test/gamepad-repeat.test.ts apps/orbrun/test/gamepad-look.test.ts apps/orbrun/test/bindings.test.ts apps/orbrun/test/game-controls.test.ts apps/orbrun/test/runner-controls.test.ts apps/orbrun/test/runner-step.test.ts apps/orbrun/test/keys.test.ts apps/orbrun/test/osk-cursor.test.ts apps/orbrun/test/menu-nav.test.ts apps/orbrun/test/movement-cadence.test.ts apps/orbrun/test/game-movement.test.ts
```

Phase 0: 11 files/388 tests passed. Synthetic events/happy-dom/prototype harnesses do not prove controller hardware or real-browser reachability. Canvas/Three unit contexts are mocked. Typecheck does not cover every test file.

## Browser verification without credentials

1. Open `/` and confirm shell. Production builds offer Play and Watch on bundled servers; development still offers Offline when engine artifacts are available.
2. Accounts → Add a server account shows bundled servers and their measured reachability; login form is viewable without submitting credentials. Escape returns to picker (verified).
3. Open [anonymous CDI lobby](http://127.0.0.1:5173/watch/cdi); wait for roster. Choose a currently active row (names change). Verify title/HUD, actual dungeon and minimap, tile assets, and ongoing server-driven updates. Do not send chat or game commands to other players.
4. Press Escape to open spectator menu and inspect Gamepad controls; returning to another route ends this test connection. Inspect console/network failures. Phase 0 captured no warning/error entries in queried logs; full network waterfall was not exported.
5. Open [room testbed](http://127.0.0.1:5173/testbed/room.html). Verify Three view and Canvas map, click Face south, and verify yaw 180° plus visual change. This uses bundled assets and no live server.
6. Other existing testbeds: `/testbed/grid.html`, `/testbed/walls.html`, `/testbed/menus.html`, `/testbed/compare.html`. Their availability is source-inspected; not all were exercised in Phase 0.

Primary 2D gameplay is not selectable in upstream UI (`VIEW_OPTIONS=false`); do not modify production simply to conceal this limitation in Phase 0. Testbed/minimap validation is narrower than gameplay parity. Use the environment's browser skill/tooling, and separate tool limitations from app failures. Supported browser tool did not expose gamepad emulation; no physical controller was supplied.

## Manual authenticated/controller acceptance (pending)

After P1 trust/transport gates, use an explicitly authorized test account. Have the user enter credentials securely; never invent or print them. If running an existing script, use unprefixed env variables in ignored `.env` per CONTRIBUTING; do not add VITE-prefixed secrets.

Record server/version/browser/controller model and outcome for: login, existing character resume, rc inspection (do not overwrite user settings), keyboard movement/modifiers, all eight pad directions, inventory multiselect/use/drop/equipment, spells/ability/quiver/fire/target/examine, shops/confirmations, more/CRT/skills, map/travel, OSK numeric/text/character creation, save/exit/reconnect and official save/morgue/stat continuity. Run only on a disposable test character with authorization. Capture exact outbound message expectations in local fixtures; physical checks remain separate from emulation.

Check drift, diagonal boundaries, unplug/replug, device switching, background/focus, held combat across menus, latency and reconnect. No artificial failure injection against public servers; use a local mock connection for malformed/slow/flood tests. For missing cases, record failed/blocked/not-tested rather than infer from another workflow.

## Safe security checks

```sh
npx --no-install vitest run packages/gamedata/test/parse.test.ts packages/webtiles/test/connection.test.ts apps/orbrun/test/gamedata-proxy.test.ts apps/orbrun/test/session-gamedata.test.ts apps/orbrun/test/worker.test.ts
npm audit --json > /private/tmp/dcss-audit.json
```

The historical evidence/security-probes.mjs applies only to the Phase 0 source snapshot; do not run it against the changed loader. Current security regression tests use fixtures/mock IO. They are not public exploit tests. Audit findings require exposure triage; do not run `npm audit fix --force` as a baseline step. Preserve recorded Phase 0 findings when Phase 1 fixes change outputs.

## Optional real-engine setup (not executed successfully here)

Read `engine/DEPLOYMENT.md` before provisioning. Requires emsdk 6.0.10 active, Node 25+ with JSPI (engine/.node-version = 25), PyYAML and native WebTiles build dependencies. Current web Node24 lacks WebAssembly.Suspending; no em++/PyYAML/engine artifacts were available.

Once the documented prerequisites are provisioned in a separate environment:

```sh
engine/build.sh stable
node engine/smoke.mjs
npm run e2e
```

These commands may fetch/build substantial engine sources. `engine/build.sh` manages and force-cleans its own worktrees; never point ENGINE_WORK at existing user work. Record resolved upstream commit and build recipe from `engine/dist/stable/engine.json` because the stable channel resolves dynamically. For future CI use pinned artifacts/refs and a required-engine check. Online-client development does not require this optional engine build.

## Upstream and fork workflow

Expected remotes: origin = `https://github.com/vittis/orbrun.git`; upstream = `https://github.com/Caeous/orbrun.git`. Initialization branch `chore/phase-0-foundation`; upstream baseline SHA `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`.

```sh
git fetch upstream
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main --stat
```

Review changes before merge; use a separate branch/worktree for upstream integration and run the relevant baseline. Do not force-push or reset user work. Creating the GitHub fork was requested and completed; no initialization branch push is implied by the local commit. When publishing that branch is intended:

```sh
git push -u origin chore/phase-0-foundation
```

GitHub authentication succeeded via keyring outside the sandbox after a sandbox-only invalid-token result. If it fails again, distinguish keychain/network restriction from truly expired credentials before asking the user to reauthenticate. Never emit token contents or change global Git config.
