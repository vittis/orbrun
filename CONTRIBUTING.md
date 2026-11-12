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
npx playwright install chromium
npm run verify
npm run e2e # optional engine artifacts required for execution
```

Run focused regressions during work and the integrated checks before release. Absent optional engine artifacts cause explicit skips; `REQUIRE_ENGINE=1` makes stable-artifact absence fatal. The verification command includes real Chromium fixture checks and production preview; browser config/tests are typechecked too. [RUNBOOK.md](project-notes/RUNBOOK.md) describes acceptance and coverage limits.

Test workers use isolated threads with at most four workers. To compare settings, run `node tools/perf/vitest-workers.mjs --rounds 2`; compare repeated timings and equal collected cases/skips on the target machine. Recording helpers share parsed immutable fixture input and clone mutable messages/state. Do not remove isolation or weaken assertions to improve timings.

## Fixtures and live testing

Prefer recorded fixtures where appropriate. `npm run record -- wss://crawl.dcss.io/socket 60 out.ndjson` captures anonymous spectating; `node tools/record/menus.mjs wss://crawl.dcss.io/socket 30 outdir` records menus. The recorders use the server's `no-compression` WebSocket subprotocol.

Never commit passwords, tokens, `.env` or private recordings. Authorized login scripts may read unprefixed variables from ignored `.env`; `VITE_` variables are public bundle configuration and must never hold secrets. Anonymous spectating and synthetic device events do not replace physical-controller or authenticated acceptance. Use local mocks for malformed/slow/flood cases.

## Bundled scenery and artwork

`tools/build/pack-room.mjs` packs the pinned DCSS tiles used by scenery. `tools/build/poster.mjs` captures the existing 2.5D room fixture for the committed poster. `tools/build/brand.mjs` generates orb/wordmark artwork using the retained font and tile attribution; it needs ImageMagick and librsvg. Ordinary builds ship committed assets and do not regenerate them.

Keep screenshot copy consistent with current 2.5D behavior. Retain exact tile/version provenance, fonts, license notices and source offers; see [ATTRIBUTION.md](ATTRIBUTION.md).

## Release

Follow [DEPLOYMENT.md](project-notes/DEPLOYMENT.md). Commit before guarded dry-run, integrate current `origin/main`, use a new immutable source tag and update every corresponding-source link. Atomic main/tag publication triggers Workers Builds; avoid duplicate manual deployment. Never bypass cleanliness/freshness checks or force-push. Record hosted identity and production checks before claiming release success.
