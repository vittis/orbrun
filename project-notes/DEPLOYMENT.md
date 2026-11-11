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

Source links for 0.3.9 point at the `cloudflare-online-v1.6` release tag in
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

## Controller and fullscreen release — 2026-11-11

Prepared release `cloudflare-online-v1.2` (app 0.3.6) corrects Android canonical
controller input being mistaken for raw Linux Bluetooth input. The PWA requests
fullscreen at launch and Settings > Interface includes Go fullscreen for existing
installs. Source links advance with the immutable release tag.

Validation: 1,932 tests passed, two optional-engine tests skipped; TypeScript and
production build passed. Android-shaped synthetic controllers cover each button,
LT/RT isolation, d-pad repeat/release and front-menu navigation. Physical Odin 3
verification remains with the user.

Rollout succeeded: commit `970cddacf9cd6ef68dcd4701b6416a6e7d9eeb2e`,
Cloudflare build `c3d604fc-ce8d-4772-a923-d47ae7374c07` completed successfully,
and Worker version `e9312e9b-c339-45fd-9ba7-6fd2149cf4b1` serves 100% of traffic.
Root/About source links and strict CSP, fullscreen manifest, allowed gamedata
(200) and unlisted proxy rejection (404) passed live checks. Chrome showed 0.3.6,
the Interface fullscreen action, and a loaded anonymous CBRG 0.34 game. Automated
fullscreen activations were rejected and displayed the retry guidance; actual
touch activation and Odin system-bar behavior remain unverified.

This post-rollout record is on `codex/odin-controller-fullscreen`; production
`main` and immutable `cloudflare-online-v1.2` remain at the deployed code commit.

## Input latency and automatic fullscreen release — 2026-11-11

User authorized deploying 0.3.7 with fullscreen enabled automatically at launch.
Prepared source tag: `cloudflare-online-v1.3`. Controller input precedes game
rendering; confirmed movement uses update receipt time. Fullscreen requests
hidden navigation immediately and retries on ordinary touch/keyboard input when
the browser requires activation. Returning to the app requests fullscreen again;
an explicit Escape/Back is respected until the next visit. No setting is required.

Prepublication checks: `npm test` passed 1,950 tests (two optional engine tests
skipped), `npx tsc -b --force`, `npm run build`, `npm run deploy:check`, and
`git diff --check` passed. Deployment and physical Odin checks are pending at
this release checkpoint; the post-rollout entry records the actual result.

Rollout succeeded: commit `2aada9317dedd33108d675466890068a9cebb488`, immutable
tag `cloudflare-online-v1.3`, Cloudflare build
`a2664106-0498-4bb8-897d-5ed9ec3504ca`, Worker version
`73ea14db-a8a4-478d-a859-c0fc2e5ec793` at 100% traffic. Production main and the
release tag remain on that exact commit; verification notes are committed only
on the working branch to avoid an unnecessary second production build.

Live checks: root 200 with strict CSP and v1.3 source links; entry bundle
`index-BqHFsOKe.js` byte-identical to the validated local build. Chrome showed
0.3.7, loaded the CBRG public lobby and a fully rendered anonymous 0.34 game with
no console errors. Evidence: `evidence/release-037-live.png` and
`evidence/release-037-spectating.png`. Fullscreen activation and Odin input
latency are covered by synthetic tests but physical Odin system bars/latency
are not measured by this browser smoke check.

## 0.3.8 rollout — 2026-11-11

- Source `853a85bb34c8c87a04b04ba0dd0f497487d52188`, immutable tag
  `cloudflare-online-v1.4`; pushed atomically with main and working branch.
- Cloudflare build `b5325d8f-088a-4e49-9ad0-f84ec920bd0b` completed in 2m31s.
- Worker `ee1bd592-271d-4865-9bfa-f645f31ed5ea`, 100% traffic, 05:55:38 UTC.
- Live home shows 0.3.8. Entry `index-ChuGCf4h.js` matches the validated local
  production build byte for byte; root returns HTTP 200, strict CSP, source v1.4.
- Local validation: 1,987 passing tests / 2 optional engine skips, forced clean
  TypeScript check, build, Worker dry-run. Optional engine E2E: 44 skips.
- Camera preview simulation and hardware limits are recorded in SESSION_LOG.
  Rollback: 0.3.7 Worker `73ea14db-a8a4-478d-a859-c0fc2e5ec793`.
