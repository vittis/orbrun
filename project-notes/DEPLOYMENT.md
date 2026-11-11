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
