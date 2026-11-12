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
3. Run forced TypeScript rebuild, all unit tests, production build, optional E2E lanes, browser fixtures and production preview checks. Record counts, failures/skips and coverage limits. Independently review the actual integrated diff.
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

## Release ledger

Starting source: `91bf21a182e75e5ac46a4b0f656ef03296f381b7`, app 0.3.66, immutable source tag `cloudflare-online-v1.63`. These are the inspected source baseline, not a fresh production verification.

Released **0.3.67** at source commit **`a37449b0749bbbf3c241a55e099947f646c4a860`**, immutable tag **`cloudflare-online-v1.64`**. Implementation commit: `6d04873018701e06ecbb5fda82b509e07760a695`; subsequent source-release commit records browser evidence. Fresh origin/main was unchanged at `91bf21a` before atomic publication. Clean guarded dry-run passed on the final source commit; no guard bypass or manual duplicate deployment.

- [Workers Build](https://dash.cloudflare.com/7892eeada7b3f36b0a8b4a5e9ab1b0e3/workers/services/view/dcss-client/production/builds/311efdf6-0a49-45d2-a1de-9fb56007f704): **success**, reported by the GitHub check on the release commit.
- Deployment: `a93acdf8-e472-4b33-975c-f9cd42b541b4`, created `2026-11-12T20:17:12.947Z`.
- Worker version: `3f558834-b256-4815-a751-55a02c4feb26`, 100% traffic. ASSETS binding only; no ENGINE or EVENTS.
- Production UI displays **0.3.67**, Dungeon menu scenery and anonymous CBRG gameplay at desktop/narrow viewport sizes. No observed console errors. Supporting flat transitions/overview/targeting were verified locally; spectating did not send map commands to a public player.
- Root/About source links reference the immutable tag. `/assets/main-xbF7spjz.js` is byte-identical to the guarded local build, SHA-256 `dfd34862d2870678677302d7062b6873cbbb9261f7d02e657b95d14303524421`.
- HTTP root/About, Acorn notice and representative versioned gamedata: 200. Strict CSP preserved. Unlisted proxy host and `/engine/health`: 404. [HTTP evidence](evidence/production-http.json), [menu](evidence/production-menu.png), [desktop game](evidence/production-game.png), [narrow game](evidence/production-mobile.png).

Validation limits and the pre-existing raster assertion mismatch are in [BASELINE.md](BASELINE.md). Final post-deployment evidence is published on the [codex/dungeon-only branch](https://github.com/vittis/orbrun/blob/codex/dungeon-only/project-notes/DEPLOYMENT.md). This documentation-only follow-up does not change deployed runtime/build files, move the immutable tag, or trigger another main deployment.
