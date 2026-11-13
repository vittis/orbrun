# Contributing

This fork preserves DCSS WebTiles behavior with a 2.5D dungeon and keyboard, gamepad and touch controls. Report issues at [vittis/orbrun](https://github.com/vittis/orbrun/issues). Upstream Orbrun is [Caeous/orbrun](https://github.com/Caeous/orbrun).

## Layout and scope

The npm workspace contains the Vite app in `apps/orbrun`, focused libraries in `packages`, optional offline sources in `engine`, fixture recorders in `tools/record` and build/asset utilities in `tools/build`. See [architecture](project-notes/ARCHITECTURE.md) and package READMEs.

Dungeon (2.5D) is the only gameplay presentation. Flat rendering supports the minimap, temporary level maps and development comparisons. Keep authoritative state server-derived, commands responsive and combat/visibility effects based on confirmed information. Preserve Still/reduced-motion behavior. Do not introduce another renderer framework or rewrite the protocol/UI for routine changes.

## Commands

Use Node 24.11.1/npm 11.6.2 for the verified web workflow.

```sh
npm ci --include=dev
npm run dev -w apps/orbrun -- --host 127.0.0.1
npm run test:changed # while editing
npm run verify # incremental types + retained unit tests, no browser/build
```

For UI changes, install Chromium once with `npx playwright install chromium`, then run `npm run verify:browser`. Renderer/scene/artwork changes use `npm run verify:render` instead. Build/Worker/production changes use `npm run verify:production`; deployment tools also need `npm run test:deploy`. Before release or after shared harness/config/dependency changes, use `npm run verify:release` (full types, both test projects, one build, full browser matrix and production preview).

[AGENTS.md](AGENTS.md) is the concise agent workflow. [RUNBOOK.md](project-notes/RUNBOOK.md) explains selection caveats, optional engines, CI and acceptance limits. [BASELINE.md](project-notes/BASELINE.md) records measured performance. Changed-test selection does not establish CSS/asset/build coverage; use the relevant broader gate. No automatic retries or disabled isolation. Add tests for meaningful behavior and regressions; remove duplicated cases and cosmetic implementation assertions.

Test workers use bounded isolated threads. `node tools/perf/vitest-workers.mjs --rounds 2` compares repeated timings and identical test inventories when runner tuning is justified. Do not benchmark concurrently with other test/build workloads.

## Fixtures and live testing

Prefer recorded fixtures where appropriate. `npm run record -- wss://crawl.dcss.io/socket 60 out.ndjson` captures anonymous spectating; `node tools/record/menus.mjs wss://crawl.dcss.io/socket 30 outdir` records menus. The recorders use the server's `no-compression` WebSocket subprotocol.

Never commit passwords, tokens, `.env` or private recordings. Authorized login scripts may read unprefixed variables from ignored `.env`; `VITE_` variables are public bundle configuration and must never hold secrets. Anonymous spectating and synthetic device events do not replace physical-controller or authenticated acceptance. Use local mocks for malformed/slow/flood cases.

## Bundled scenery and artwork

`tools/build/pack-room.mjs` packs the pinned DCSS tiles used by scenery. `tools/build/poster.mjs` captures the existing 2.5D room fixture for the committed poster. `tools/build/brand.mjs` generates orb/wordmark artwork using the retained font and tile attribution; it needs ImageMagick and librsvg. Ordinary builds ship committed assets and do not regenerate them.

Keep screenshot copy consistent with current 2.5D behavior. Retain exact tile/version provenance, fonts, license notices and source offers; see [ATTRIBUTION.md](ATTRIBUTION.md).

## Release

Follow [DEPLOYMENT.md](project-notes/DEPLOYMENT.md). Commit before guarded dry-run, integrate current `origin/main`, use a new immutable source tag and update every corresponding-source link. Atomic main/tag publication triggers Workers Builds; avoid duplicate manual deployment. Never bypass cleanliness/freshness checks or force-push. Record hosted identity and production checks before claiming release success.
