# Production deployment

Production URL: [dcss-client.vittis.workers.dev](https://dcss-client.vittis.workers.dev/). Cloudflare Worker: **dcss-client**. Repository: **vittis/orbrun**, production branch **main**. Publish to `origin`, never `upstream`.

## Scope and safeguards

Production serves the client and bounded gamedata/morgue proxies. It offers online play and anonymous spectating on bundled HTTPS/WSS servers. Offline/custom-server UI, ENGINE binding and EVENTS dataset are disabled. Development retains its optional offline integration. Browser game WebSockets connect directly to DCSS; accounts and saves stay there. Deployment and anonymous smoke checks need no player's credentials.

Preserve `apps/orbrun/public/_headers`: same-origin executable scripts, blocked inline script attributes, objects and frames, no `unsafe-eval`, nosniff and referrer restrictions. Preserve the Acorn MIT notice at `/licenses/acorn.txt`, all font/DCSS/upstream notices and the exact corresponding-source offer. Packed-art rectangle/version provenance is not a per-tile license certification; [ATTRIBUTION.md](../ATTRIBUTION.md) retains this limitation.

The proxy validates exact bundled HTTPS host:port destinations before cache lookup, rejects redirects, drops query variants from cache identity and applies deadlines, byte/concurrency limits and bounded development caching. Parser, transport and session queues remain bounded. Residual limits: bundled-host DNS/TLS trust, no DNS pinning, no distributed abuse budget, and no exhaustive semantic validation of every nested protocol field. Generated gamedata syntax/helper changes fail closed. These are independent of renderer choice.

## Workers Builds configuration

Checked-in `wrangler.jsonc` defines the Worker and guarded custom build. Dashboard Workers Builds settings are separate and must match:

- Root: `/` (monorepo root).
- Production branch: `main`; preview builds disabled in the established configuration.
- Node: `24.11.1` via `NODE_VERSION`.
- Variable: `SKIP_DEPENDENCY_INSTALL=1`.
- Build: `npm ci --include=dev --prefer-offline --no-audit --no-fund && npm run typecheck && NODE_ENV=test npm test`.
- Deploy: `npm run deploy`.

Do not append an asset build to the build command: Wrangler's hook builds once. `--include=dev` overrides Cloudflare's production-only install environment. The `prebuild` dependency check remains a backstop. No application secrets are required; Cloudflare/GitHub publishing authentication must stay outside the repository. Historical token authorization is not permission to change unrelated account resources.

## Release procedure

1. Inspect status, HEAD, remotes and current remote main. Integrate `origin/main`, preserve intervening changes and rerun affected verification.
2. Choose the next semantic version and a new immutable `cloudflare-online-v1.N` source tag. Do not reuse or move a tag. Update app version/lockfile, changelog and every source link, including `ABOUT.md`, `apps/orbrun/index.html`, `site-pages.ts`, `src/markdown.ts` and relevant tests.
3. Run `npm run verify:release`: forced TypeScript, both unit/deployment projects, one production build, full raster/interaction checks and production preview. Run optional engine E2E when provisioned or affected. `npm run verify` alone is only the fast development gate. Record counts, failures/skips and coverage limits. Independently review the actual integrated diff.
4. Commit the reviewed source. With a clean tree, run:

```sh
WRANGLER_SEND_METRICS=false WRANGLER_LOG_PATH=/private/tmp/dcss-wrangler.log npm run deploy:check
```

5. Refetch `origin/main` before publication. If it advanced, integrate, resolve conflicts and rerun affected checks and the guarded dry-run. Create the new immutable tag at the intended release commit.
6. Push the release commit to `origin/main` and its source tag atomically, without force. The main push triggers Workers Builds. Monitor that build's GitHub/Cloudflare result; **do not race it with a second manual deployment**.
7. Verify hosted source/version, app bundle identity and production behavior before reporting success. Record the exact commit/tag, build/deployment identifier and checks below. A push or queued build is not proof of deployment.

`tools/build/deploy-guard.mjs` rejects tracked or untracked changes, explicitly fetches current `origin/main` and requires it to be an ancestor of HEAD. Network/auth failure fails closed. `deploy-build.mjs` runs the guard before and after rebuilding assets and rejects a changed HEAD. Clean feature branches ahead of main and detached CI builds are supported; dirty, stale or diverged builds are refused. Commit before dry-run too. Fix source/freshness problems rather than bypassing the hook. `npm run deploy:guard` runs only Git checks.

The guard cannot lock main during upload or constrain alternate configs/old checkouts/dashboard operations. Preserve any newer verified deployment. Use the established main-triggered pipeline for ordinary releases.

## Production checks

Check root and About, the intended version and immutable source links, 2.5D menu/gameplay, anonymous lobby/spectating, supporting flat maps and restoration where local/production fixtures permit, desktop/narrow layouts and Still/reduced motion. Retrieve a representative real versioned gamedata file. Confirm response CSP and rejection of an unlisted proxy host. Avoid disruptive public tests, chat sends and credential use.

Report hardware, authenticated-play, unavailable live games and absent engine artifacts honestly. Capture small evidence without secrets. Do not call deployment successful without observed hosted identity matching the intended release.

## Rollback

In Cloudflare Workers → dcss-client → Deployments, select a previously verified deployment. Confirm its source/version and repeat essential smoke checks. Do not move source tags or force-push history. Disabling this Worker's workers.dev route takes only this app offline if necessary. Keep the repository/main and deployed rollback decision documented, and avoid overwriting a newer healthy release from an older checkout.

## Release records

Current source baseline: **0.3.69** / `cloudflare-online-v1.66`. [Release record](releases/0.3.69.md) contains verified source/build/deployment identities and production evidence. Release commit `070f829`, automatic Workers Build and clean-install branch/main CI all succeeded.

Previous verified releases: [0.3.68 — Baseline stabilization](releases/0.3.68.md) and [0.3.67 — Dungeon-only simplification](releases/0.3.67.md). Their final evidence is included in this release source.
