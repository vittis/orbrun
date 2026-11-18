# Production deployment

Production URL: [dcss-client.vittis.workers.dev](https://dcss-client.vittis.workers.dev/). Cloudflare Worker: **dcss-client**. Repository: **vittis/orbrun**, production branch **main**. Publish to `origin`, never `upstream`.

## Scope and safeguards

Production serves the client and bounded gamedata/morgue proxies. It offers online play and anonymous spectating on bundled HTTPS/WSS servers. Offline/custom-server UI, ENGINE binding and EVENTS dataset are disabled. Development retains its optional offline integration. The menu serves bundled recordings and matching artwork at `/menu/*`; both `/engine/*` and the retired `/menu-engine/*` return 404. Browser game WebSockets connect directly to DCSS; accounts and saves stay there. Deployment and anonymous smoke checks need no player's credentials.

Preserve `apps/orbrun/public/_headers`: same-origin executable scripts, blocked inline script attributes, objects and frames, no JavaScript `unsafe-eval`, no Wasm evaluation permission, nosniff and referrer restrictions. Preserve the Acorn MIT notice at `/licenses/acorn.txt`, all font/DCSS/upstream notices and the exact corresponding-source offer. Packed-art rectangle/version provenance is not a per-tile license certification; [ATTRIBUTION.md](../ATTRIBUTION.md) retains this limitation.

The proxy validates exact bundled HTTPS host:port destinations before cache lookup, rejects redirects, drops query variants from cache identity and applies deadlines, byte/concurrency limits and bounded development caching. Parser, transport and session queues remain bounded. Residual limits: bundled-host DNS/TLS trust, no DNS pinning, no distributed abuse budget, and no exhaustive semantic validation of every nested protocol field. Generated gamedata syntax/helper changes fail closed. These are independent of renderer choice.

## Workers Builds configuration

Checked-in `wrangler.jsonc` defines the Worker and guarded custom build. Dashboard Workers Builds settings are separate and must match:

- Root: `/` (monorepo root).
- Production branch: `main`; preview builds disabled in the established configuration.
- Node: `24.11.1` via `NODE_VERSION`.
- Variable: `SKIP_DEPENDENCY_INSTALL=1`.
- Build: `npm ci --include=dev --prefer-offline --no-audit --no-fund`.
- Deploy: `npm run deploy`.

Do not append tests or an asset build to the build command. Wrangler packages changed app inputs once. `--include=dev` overrides Cloudflare's production-only install environment.

## Fast publishing

1. Review the diff and fetch `origin/main` before publishing; integrate intervening work. Preserve source links and use a new immutable release tag. Never force-push or move source tags.
2. Run focused checks for the changed behavior and inspect UI manually. A full release gate and deployment dry-run are optional, not prerequisites. Main pushes no longer trigger the duplicate GitHub release suite; PR checks and manually dispatched broad checks remain available.
3. Commit, then push main and its source tag atomically. This triggers Workers Builds. Do not race an active automatic build with a manual deployment.
4. Verify the hosted version/source, relevant behavior and deployment identity. A queued build is not a successful deployment.

`npm run deploy` performs no test suite or repeated Git/network guard. `npm run deploy:guard` remains an optional explicit source-freshness check. The app build is reused when its source fingerprint and output files are unchanged. A fresh Cloudflare checkout still bundles the app once; changing only docs outside embedded pages or tests does not invalidate an existing local bundle.

The menu recordings and matching artwork are checked into the repository. `menu-replay-assets.ts` verifies their sizes and SHA-256 hashes during Vite builds. Publishing needs no engine artifact service, Emscripten, prewarm files or engine compilation. Development-only offline builds remain separate.

## Production checks

Check root and About, the intended version and immutable source links, 2.5D replay menu/gameplay, anonymous lobby/spectating, supporting flat maps and restoration where local/production fixtures permit, and desktop/narrow layouts. Retrieve a representative real versioned gamedata file. Confirm response CSP and rejection of an unlisted proxy host. Avoid disruptive public tests, chat sends and credential use.

Report hardware, authenticated-play, unavailable live games and unprovisioned development-engine checks honestly. Capture small evidence without secrets. Do not call deployment successful without observed hosted identity matching the intended release.

## Rollback

In Cloudflare Workers → dcss-client → Deployments, select a previously verified deployment. Confirm its source/version and repeat essential smoke checks. Do not move source tags or force-push history. Disabling this Worker's workers.dev route takes only this app offline if necessary. Keep the repository/main and deployed rollback decision documented, and avoid overwriting a newer healthy release from an older checkout.

## Release records

Current source baseline: **0.3.69** / `cloudflare-online-v1.66`. [Release record](releases/0.3.69.md) contains verified source/build/deployment identities and production evidence. Release commit `070f829`, automatic Workers Build and clean-install branch/main CI all succeeded.

Previous verified releases: [0.3.68 — Baseline stabilization](releases/0.3.68.md) and [0.3.67 — Dungeon-only simplification](releases/0.3.67.md). Their final evidence is included in this release source.
