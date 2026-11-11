# Cloudflare online deployment

Prepared 2026-11-11 at the user's request following Phase 0.

## Scope

`dcss-client` is a Cloudflare Worker with static assets. Production builds offer
online play and anonymous spectating on the bundled HTTPS/WSS servers only.
Offline play, custom servers, ENGINE service and EVENTS dataset are disabled.
Development retains the upstream offline/custom UI for local work.

Cloudflare serves the client and bounded gamedata/morgue proxies. The browser
connects directly to the selected DCSS server over WSS; accounts and saves stay
on that server. No player's credentials are needed to deploy or smoke-test.

Source links point at the public `cloudflare-online-v1.1` release tag in
`vittis/orbrun`, which must exist at the exact code being deployed. Retain that
tag unchanged. A later release must update the source links and use a new tag.
Upstream credits, source licenses and fonts are retained; Acorn's MIT notice
is shipped at `/licenses/acorn.txt`.

## Build settings

- Repository: `vittis/orbrun`; production branch: `main`.
- Root/path: `/` (the monorepo root).
- Node: `24.11.1` via `NODE_VERSION`.
- Build: `npm ci --include=dev && npm run typecheck && NODE_ENV=test npm test && npm run build`.
- Deploy: `npx wrangler deploy`.
- Preview builds: disabled for the initial deployment.
- No game credentials or application secrets are required.

Cloudflare's automatic build-token form grants account-level Worker and storage
permissions plus zone routes; it offers no per-project narrowing. The user
explicitly approved creation of a dedicated token. Token contents must never
be committed or copied into these notes.

## Local verification and rollback

Run `npm run typecheck`, `npm test`, `npm run e2e`, `npm run build`, and
`WRANGLER_SEND_METRICS=false WRANGLER_LOG_PATH=/private/tmp/dcss-wrangler.log npm run deploy:check`.
The optional engine lanes explicitly skip absent artifacts; they do not prove
offline gameplay. `REQUIRE_ENGINE=1` makes missing stable engine artifacts fatal.

Use `npm run preview -w apps/orbrun -- --host 127.0.0.1` for the production bundle's Vite proxy.
After deployment, check the root, About source link, anonymous lobby/spectating,
one real versioned gamedata file, and rejection of an unlisted proxy host.
The hosted response must include the no-unsafe-eval CSP from `public/_headers`.

Rollback through Cloudflare Workers > dcss-client > Deployments to a previously
verified deployment. The initial release has no prior version; disabling its
workers.dev route takes it offline without touching unrelated applications.

## Limits and remaining work

- This is the inherited first-person Orbrun UI, not the planned top-down client.
- Parser helper formats are deliberately checked against known generated forms;
  changed upstream algorithms fail closed and require compatibility updates.
- Proxy deadlines/size/concurrency limits apply per isolate. Distributed rate
  limiting and a broader server/browser compatibility matrix remain follow-ups.
- Anonymous spectating does not verify account login, character creation, save
  restoration, rc editing, or physical controller behavior.
- Production-only npm audit (`--include=prod --omit=dev`, overriding `.npmrc`)
  reports zero advisories. Full audit still reports ten development-tool nodes
  (1 moderate, 7 high, 2 critical); update tooling separately with validation.
- Packed-art provenance inventory remains incomplete. The unsupported blanket
  CC0 assertion was corrected; no specific infringing asset was established.

See `reviews/CLOUDFLARE_SECURITY.md` for hardening and independent review.

## Integrated checks before publication

After Session failure handling: full suite **1,916 passed / 2 skipped**,132 files
passed and one optional engine file skipped. Optional engine E2E reports44 skips.
Typecheck passed. Production preview successfully spectated CBRG0.34. Final site/CSP tests pass18/18; typecheck and rebuilt production bundle pass.
Final Worker dry-run:96 asset files,20.86KiB Worker (6.24KiB gzip),ASSETS only.
The release review records external About-script delivery and strict script CSP.

## Successful rollout — 2026-11-11

- Public client: https://dcss-client.vittis.workers.dev
- Deployed commit: `8fe675d9059bc5a262b7f2acc2439783aa72da0f`.
- Public immutable tag: `cloudflare-online-v1.1` (verified GitHub ref).
- Worker version: `d62c2edf-0b19-4bb5-940b-a3c9fb99a9d5`.
- Cloudflare successful build: `af20b64e-bd5e-4d31-a86b-643b34920dfa`.
- Pushes to fork `main` now trigger install/typecheck/test/build/deploy. Cloudflare
  completed all stages on Node24.11.1/npm10.9.2. Preview branch builds are off;
  Wrangler still enables per-version preview URLs by default.
- Initial release31bfef3/v1 failed CI TypeScript before deployment. Local incremental
  state had hidden TS5097 in consumers. The correction moves the `.ts` import
  option to the shared base (declaration-only projects); `tsc -b --force` passed.
  Keep v1 unchanged; it is historical, not the live release.
- Hosted GET checks: root/About200 with strict CSP and v1.1 source link;
  site-controls.js200 JavaScript; Acorn notice200; offline engine404; unlisted
  proxy host404; live CDI stable enums200 generated AMD data.
- Chrome successfully loaded the public home, CBRG lobby and anonymous0.34
  spectating, including textured3D, minimap, HUD and messages. About comparison
  slider changed from50 to51 and its rendered split updated to51%, verifying
  the external page script under CSP. No credentials/chat/gameplay commands sent.
- Evidence: `evidence/cloudflare-http-checks.json` and
  `evidence/cloudflare-live-spectating.jpg`.

Post-rollout documentation is committed on the initialization branch without
advancing production `main`; the live code remains exactly the release tag.
