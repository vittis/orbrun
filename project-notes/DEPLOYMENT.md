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

Source links for 0.3.23 point at the `cloudflare-online-v1.20` release tag in
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

## 0.3.9 rollout — 2026-11-11

- Corrective final source `d293a56bbade3e5ceeb80feb0fb74f0cecd2b570`, immutable
  `cloudflare-online-v1.6`. Initial v1.5/source c057b2b fixed the gameplay but
  marked the diagnostic's extensionless URL 404; corrected and both tags retained.
- Build `13ee2d51-d14c-4752-8451-452de0d9b3c9`, Worker
  `23664951-4aa6-472e-ab2a-a88cd9c4889b`, 100% traffic at 06:19:43 UTC.
- Live main-D5W5a3b2.js matches local build. Home 0.3.9 and CBRG spectator
  scene verified; /connection-check returns 200, noindex and strict CSP.
- Full suite 1,960 pass / 2 optional engine skips; route correction 20 focused
  tests pass. Forced typecheck/build/dry-run pass; optional E2E 44 skips.
- One continuous confirmed glide restored; actual RTT not reduced. Diagnostic
  is a separate anonymous connection, eight finite lightweight requests only.
- Smooth-motion rollback if needed: 0.3.7 Worker
  `73ea14db-a8a4-478d-a859-c0fc2e5ec793`; 0.3.8 contains the reported choppiness.


## 0.3.11 renderer release — 2026-11-11

Prepared on current fork main (`60ee664` base), with the user's authorization
to commit and deploy. The immutable source tag is `cloudflare-online-v1.8`.
App 0.3.11 adds the selectable Dungeon (2.5D) renderer, compass controls and
flat level-map switching while preserving the deployed transport, controller,
fullscreen and first-person prediction behavior. Source links advance together.

Prepublication validation: forced typecheck, 2,023 tests passed / two optional
engine skips, production build, ASSETS-only Worker dry-run and diff checks.
Optional engine E2E: 44 skips. The renderer was browser-checked at desktop and
phone sizes; physical controller and authenticated gameplay checks remain manual.
Push main and the source tag atomically, wait for Workers Builds to succeed,
then verify hosted source links, 0.3.11 settings and anonymous 2.5D spectating.
Testing instructions are in STATUS.md and packages/render-2.5d/README.md.

## 0.3.12 presentation release — 2026-11-11

Prepared at the user's request to commit on main and deploy. Immutable source
tag: `cloudflare-online-v1.9`. Removes raised-tile outlines and the duplicate
corner view in Dungeon (2.5D), replaces blue memory tint with a faint black
haze, and makes fullscreen an explicit main-menu action. The installed-app
manifest now uses standalone display rather than automatic fullscreen.

Validation: 2,020 tests passed / two optional engine skips before release
metadata and manifest updates. Final forced typecheck, 22 site/news/Markdown
checks (including standalone display), production build, ASSETS-only Worker
dry-run and diff checks passed. Push main and the source tag atomically, then
verify the deployed version, source links and fullscreen control.

## 0.3.13 seam and sprite-scale correction — 2026-11-11

Follow-up to the user's screenshot of remaining seams and request for stronger
2.5D presentation inspired by Super Dungeon Crawl. Source tag:
`cloudflare-online-v1.10`. Shared terrain boundaries snap to device pixels and
flat terrain composites have no transparent padding. The flat-view wall-shadow
decals and targeting grid are replaced by the raised view's contact shadows and
single-cell cursor. Continuous lighting avoids per-cell distance-shade bands.
Monsters and upright items use the same original atlas scale as the player;
first-person HP-derived heights no longer shrink monster art again. Corpses
remain flat. Water ripples cross cell boundaries, fountains ripple, and faint
black fog drifts along remembered terrain. Reduced motion freezes atmosphere.

The development preview includes a recorded fountain dungeon and an Original
2D comparison. `/testbed/dungeon-checks.html` runs 342 real Canvas pixel checks
for floor/wall joins, filtering, fractional DPR/zoom and sprite proportions and
picking. Unit tests cover shared edges and fountain visibility as well.
Validation: full unit suite 2,029 passed / two optional-engine skips; after
the final snapped-edge picking correction, all 23 renderer tests passed. All
342 real Canvas pixel checks, forced TypeScript check, production build,
ASSETS-only Worker dry-run and diff checks passed. Desktop/phone previews and
the recorded fountain scene were inspected; live rollout is checked after push.


## 0.3.14 combat feedback release — 2026-11-11

User authorized integration into main, commit and deployment. Rebased onto
0.3.13 (`956681d`) to retain the shared terrain edges and original sprite
proportions. Immutable source tag: `cloudflare-online-v1.11`.

Combat popups use each renderer's world-to-screen projection, follow the camera,
expire after 1.1 seconds and respect reduced motion. Settings → View → Combat
popups toggles the layer. Message rollbacks append only new text; health deltas,
status transitions, kills and same-name multi-target attacks have regression
coverage. No changes to transport, input dispatch or authoritative game state.

Validation: forced TypeScript check; full suite 2,046 passed / two optional
engine skips; production build; ASSETS-only Worker dry-run (102 assets,
20.95 KiB Worker / 6.26 KiB gzip); diff checks. Optional engine E2E: 44 skips
because no engine artifacts are installed. All three views were visually
checked locally. The new engine patches apply to upstream source and preserve
native-build messages behind Emscripten guards; no engine binary was built or
deployed. Hosted production remains online-only, with HIT when the server does
not expose exact monster damage. Player HP changes are numeric.

Previous production Worker for rollback: `5e34462f-f97a-4016-b640-c91067cbd148`.
Push main and the source tag atomically, wait for Workers Builds, then verify
source links, the live entry bundle, strict CSP, proxy restrictions and anonymous
spectating with combat feedback enabled.

## 0.3.15 live combat integration correction — 2026-11-11

The 0.3.14 source (`6317b15`, `cloudflare-online-v1.11`) was deployed as Worker
`b6c64958-48b2-466e-909d-545c53138c6b`. Root/About source links, strict CSP,
allowed/prohibited proxy routes and byte-identical entry bundle passed. Live
anonymous CBRG spectating loaded the dungeon without console errors, but showed
a crowded burst of combat buffered during gamedata loading.

Corrected before finishing this rollout: no popup emission before a populated
scene is presented; three popups per anchor and ten total; unknown weapon-brand
follow-ups recolor the original hit; kills replace generic hit labels while
retaining numeric damage. Ordinary crossbow bolts keep physical coloring.
Regression tests exercise startup batches, delayed brands, limits and stacking.
The corrective immutable source tag is `cloudflare-online-v1.12` (app 0.3.15).

Validation: forced typecheck; 2,050 unit tests passed / two optional-engine
skips; production build and ASSETS-only dry-run; diff check. Optional engine
E2E remains 44 skips without artifacts. Publish the committed source and verify
the corrected live spectator path before calling this task complete.

## 0.3.16 approximate public-server damage — 2026-11-11

User explicitly requested approximate damage numbers with clear presentation.
Prepared immutable source tag: `cloudflare-online-v1.13`. Estimates carry a
small ≈ prefix and a contextual legend; server-reported damage and explicit
zero damage remain exact. The existing combat-popup toggle controls the layer.

The estimate starts with the standard attack-punctuation damage interval,
then uses compatible visible wound intervals and species-average HP to refine
it. Average HP is never treated as an individual's exact maximum. Conflicting
wound information falls back to the attack-strength prior; an unchanged wound
category never becomes a false zero. Estimated kills cap excessive overkill to
estimated remaining health. Multiple hits combine per actor/turn, while exact
reported components stay distinct. Same-name targeting uses wound/death evidence
and actor IDs. A visible wound decline without a hit sentence can produce an
estimate for damage over time; spawn, healing, polymorph and disappearance do
not manufacture damage events. Delayed wound observations refine existing text.

Validation: 2,070 tests passed / two optional-engine skips; forced typecheck,
production build, ASSETS-only Worker dry-run and diff checks. Estimator and
popup regressions cover same-band damage, wound refinement, invalid average HP,
per-turn grouping, same-name targets, exact damage, zero damage, kills, brands,
stack limits and delayed observations. All three views were inspected, with a
phone-sized viewport and reduced-motion presentation. Engine binary artifacts
remain absent; this release changes only client feedback and is not a new engine.


## 0.3.17 visibility correction — 2026-11-11

User authorized commit and deployment. Visual fix commit rebased on production
0.3.16 (`97b49ee`) to preserve combat feedback. App version 0.3.17; immutable
source tag `cloudflare-online-v1.14`. Includes raised item cursor alignment,
neutral unexplored mist, stronger LOS/memory contrast and removal of player
lighting. Current release validation and rollout results are recorded in STATUS
and SESSION_LOG; automatic Workers Builds follows the main-branch push.


## 0.3.18 living dungeon release — 2026-11-11

User authorized commit to main and deployment. Prepared immutable source tag:
`cloudflare-online-v1.15`. Adds shared semantic lighting, material/creature
motion, clouds, cold memory and impact rings to all three dungeon views, and
removes independent wound-status damage popups that duplicate reported hits.
Source links advance together with the app version. The prior production
source is 0.3.17 (`896dcfc`, `cloudflare-online-v1.14`).

Feature validation: 2,109 unit tests pass, two optional engine tests skipped;
TypeScript, production build, 14 real-browser behavior checks and all 504
raster acceptance checks pass. Final release checks run before the atomic
main/source-tag push; hosted verification is recorded after rollout.


### Successful 0.3.18 rollout

- Production main/source tag: `621485462e6755f1e4b5bec369e3b939c54a0805`,
  `cloudflare-online-v1.15`, app 0.3.18. Main, branch and tag were pushed atomically.
- Cloudflare build `08d707e7-ce5c-4287-80e0-1224450f9923` succeeded in 3m 2s;
  the deployment stage completed at approximately 14:37:49 America/Sao_Paulo.
- Root/About return 200 with strict CSP and the v1.15 source link. Entry
  `/assets/main-aNu1QrgP.js` matches the validated local build byte for byte
  (SHA-256 `6eba075ea5facd33c8c3193d3f73b8cca5b2cf87b08f2404fc9dd319d501d5e4`).
- Allowed versioned gamedata returns generated AMD data, the unlisted proxy
  host returns 404, and offline engine delivery remains 404.
- Chrome displayed the 0.3.18 release notes, loaded the CBRG lobby and a live
  spectator dungeon, including terrain, entities, fog, HUD and messages.
  No warning/error console entries were captured. No gameplay or chat was sent.
- Evidence: `evidence/release-0318-http-checks.json`,
  `evidence/release-0318-live.png`, `evidence/release-0318-spectating.png`.

Post-rollout evidence is committed on the working branch only, keeping main
and the immutable source tag at the exact deployed code commit.


## 0.3.19 2.5D refinement release — 2026-11-11

User authorized commit to main and deployment. Prepared immutable source tag:
`cloudflare-online-v1.16`, app 0.3.19. Removes player lighting bands and the
blue memory overlay from 2.5D, uses faint black fog, strengthens and smooths
living motion, suppresses redundant SLAIN/HIT labels while retaining damage
numbers, moves the character panel to the top right with the list below it,
and restores right-click item descriptions in server menus.

Feature verification: the full unit suite and added wrapped-status regression
pass, along with TypeScript, the production build, 558 real Canvas checks,
14 animation/impact browser checks and desktop/phone panel placement checks.
Final release validation precedes the atomic main/source-tag push. The
previous verified deployment is 0.3.18 (`6214854`, `cloudflare-online-v1.15`).

Final release checks: 2,118 unit tests passed / two optional engine skips;
forced TypeScript, production build, ASSETS-only dry-run and diff checks pass.
Optional engine E2E: 44 skips because local engine artifacts are absent.


### Successful 0.3.19 rollout

- Main and immutable source tag `cloudflare-online-v1.16` point to
  `76d8357f0f7bc2753990ce7033c0333781669f55`; the main/branch/tag push was atomic.
- Cloudflare build `301f8794-e0bc-4738-ab5d-2e968ba3af73` succeeded. Worker
  `7cb1ac6d-32d5-4dcf-a350-215734799308` serves 100% of traffic; deployment
  created at 15:10:12 America/Sao_Paulo on 2026-11-11.
- Root, About and release notes serve the new version/source tag with strict
  CSP. All three production JS bundles match the validated local build byte
  for byte. Allowed gamedata works; unlisted proxy/offline routes return 404.
- Live browser verified 0.3.19, the CBRG lobby and an anonymous 2.5D game.
  At 1280px viewport width, character bounds are x=871..1276, y=8..236;
  the nearby column starts at y=274. No warning/error console logs were captured.
  No gameplay or chat commands were sent.
- Evidence: `evidence/release-0319-http-checks.json` and
  `evidence/release-0319-spectating.png`. Rollback: 0.3.18 Worker
  `949eb1af-d00e-4224-b08e-1f7b5ea53656`.

Post-rollout evidence stays on the working branch, preserving production main
and the immutable source tag at the exact deployed code commit.


## 0.3.20 smooth lighting and effects release — 2026-11-11

User authorized commit and production deployment after implementation.
Prepared source tag `cloudflare-online-v1.17`, app 0.3.20. Brighter uniform
LOS ambience, lifted dark atlas texels and reduced vignette/shadows improve
readability. One continuous light texture supplies floors, wall roofs/faces
and masked sprites; reachability remains occlusion-aware, while flicker and
afterglows update every frame without per-cell tint quantization.

Spell bolts use their server art on the ground plane with softened, thinned
alpha and connected segment edges. Clouds, impact rings and particles are
smaller/quieter. Self-hosted Barlow Condensed Bold supplies damage numbers;
physical, fire, cold, poison, acid, electric and magic get distinct bounded
trajectories and glow. Reduced motion freezes movement and glow motion.

Local browser preview: `/testbed/effects.html`; 18 added real-pixel checks
cover brightness, continuity over floor/raised-wall joins, alpha masking,
memory protection, smooth flicker and thin connected beam segments at DPR1/2.
The full raster suite now contains 576 checks. Final release checks and
hosted rollout verification are recorded below after execution.

Final release checks: forced TypeScript, 2,120 unit tests/two optional-engine
skips, production build and ASSETS-only Worker dry-run pass. Engine E2E: 44
explicit skips. All 558 original raster checks, the 18 new surface/beam checks
and 14 animation/impact checks pass; the complete current raster suite is 576.
The effects preview shows the new font and seven damage styles without
console warnings/errors. Rollout follows the atomic main/source-tag push.


### Successful 0.3.20 rollout

- Main and immutable source tag `cloudflare-online-v1.17` point to
  `114c077c9822aec4cfc6cb1c8948306c1b7c2ad5`; main, branch and tag were pushed
  atomically after the user authorized publication.
- Cloudflare build `fad70707-ac6d-4ef7-b4c7-3090e1926a8a` succeeded. Worker
  `b49a55cf-3c28-454a-ba06-923fb45ff43c` serves 100% traffic; deployment
  created at 15:36:58 America/Sao_Paulo on 2026-11-11.
- Thirteen hosted checks pass: version/source links and strict CSP on
  root/About/release notes; public scripts/licenses; allowed versioned gamedata
  and rejected unlisted/offline routes; the font/license and all three entry
  JS bundles are byte-identical to the validated local build.
- Live browser loaded 0.3.20, CBRG lobby and an anonymous live 2.5D game.
  Brighter floor/terrain, right-side character pane and nearby list verified;
  no warning/error logs captured. No gameplay or chat was sent.
- Current full real Canvas run: 576 passed / zero failures. Eighteen focused
  checks cover continuous surface lighting, wall occlusion, protected memory,
  transparent sprite masks, smooth flicker/afterglows and connected thin beams.
- Evidence: `evidence/release-0320-http-checks.json`,
  `evidence/release-0320-canvas-checks.json`,
  `evidence/release-0320-surface-checks.json`,
  `evidence/release-0320-effects-preview.png` and
  `evidence/release-0320-spectating.png`.
- Rollback: 0.3.19 Worker `7cb1ac6d-32d5-4dcf-a350-215734799308`.

Post-rollout evidence is on the working branch only; main and the release tag
remain at the exact deployed source commit.


## 0.3.21 original exposure, compact glows and live motion — prepared 2026-11-11

User explicitly authorized commit to main and production deployment after
verification. App 0.3.21 uses immutable source tag `cloudflare-online-v1.18`.
Visible atlas pixels keep their native WebTiles brightness. Compact circular
light fields originate at the visible emitter art; floors, roofs, faces and
masked sprites sample their actual screen coordinates. Blurred reachability
masks soften shadows without illuminating remembered art. Wall faces no
longer stretch a one-pixel strip of light across their entire surface.

Dungeon animation now offers Auto/On/Still. Auto follows device reduced
motion; explicit On enables animation even with that device setting. Living
sprites use smooth subpixel sampling independently of static tile scaling.
Smaller damage numbers have a CSS entrance with rise, overshoot and settle;
late brand updates preserve the entrance wrapper and do not restart it.

The `/testbed/live-animation.html` fixture uses the actual GameScreen loop,
with no testbed RAF or server updates. It records rendered actor pixels,
advancing clock and active popup animation for On/Auto/Still checks.
Release checks pass: forced TypeScript, 2,128 unit tests/two optional-engine
skips, production build, and ASSETS-only Worker dry-run. Eighteen updated
surface checks and all 576 Canvas checks pass. Optional engine E2E reports 44
explicit skips. The real GameScreen fixture shows continuously changing actor
pixels with no incoming messages. Explicit On continues under simulated device
reduced motion, Auto/Still stop the clock, and the popup entrance is confirmed
in computed CSS (initial scale 0.25 with an 8px rise; 21px maximum normal size).
Production rollout verification is recorded below.


### Successful 0.3.21 rollout

- Main and immutable source tag `cloudflare-online-v1.18` point to
  `a8c5fbb0c7921f523fce1dcbc17a65ae0f661a66`; main, branch and tag were pushed
  atomically after the user's explicit commit/deploy instruction.
- Cloudflare build `1f87c358-94af-4863-91f5-a3b462b3faa4` succeeded. Worker
  `086e982a-3e9c-4c7d-bf09-4ef4e0d12a3b` serves 100% of traffic; deployment
  created at 16:05:47 America/Sao_Paulo on 2026-11-11.
- All 13 hosted checks pass: version, immutable source, strict CSP, public
  scripts/licenses, allowed gamedata and rejected unlisted/offline routes.
  Both font/license assets and all three entry JS bundles match local bytes.
- Browser verified 0.3.21 release notes/source tag and anonymous CBRG 2.5D
  spectating (yunli). Native LOS floor colors, black remembered terrain,
  compact torch glow, right-side character panel and nearby list are visible.
  No gameplay or chat was sent. Earlier vittisXX spectating had ended; the
  current roster's public game was opened through its normal UI.
- Evidence: `evidence/release-0321-http-checks.json`,
  `evidence/release-0321-canvas-checks.json`,
  `evidence/release-0321-surface-checks.json`,
  `evidence/release-0321-live-animation.json`,
  `evidence/release-0321-live-loop.png`,
  `evidence/release-0321-effects-preview.png`, and
  `evidence/release-0321-spectating.png`.
- Rollback: 0.3.20 Worker `b49a55cf-3c28-454a-ba06-923fb45ff43c`.

Post-rollout evidence remains on the working branch only; main and the
immutable tag retain the exact deployed source commit.


## 0.3.22 configurable 2.5D movement — prepared 2026-11-11

User authorized commit and deployment to main. App 0.3.22 uses new immutable
source tag `cloudflare-online-v1.19`. Entity movement and the following camera
use a configurable, bounded tween on the existing presentation clock. Shadows,
glows, depth order, badges, item cursors and picking follow the drawn position.
Fast travel retargets without a queue; teleports, level changes and ambiguous
anonymous matches snap. Still mode and Auto reduced motion disable tweening.

Feature verification: 2,153 tests passed / two optional-engine skips; all 738
real Canvas checks passed; TypeScript and production build passed. The first
unbounded-worker suite timed out once in the unchanged 3D geometry test; that
test passed in isolation, and the complete suite passed with four workers.
Release verification also passed: forced TypeScript rebuild, 2,153 unit tests
(two optional-engine skips), production build and ASSETS-only Worker dry-run
(20.95 KiB Worker). Hosted rollout verification follows publication.


### Successful 0.3.22 rollout

- Main and immutable source tag `cloudflare-online-v1.19` point to
  `ab1a9f5fbb97f6cc5532844aa59330c96bb75fd4`, pushed atomically.
- Cloudflare build `4e3ba95d-5d66-4a85-9dbb-67108e9d435e` succeeded.
  Worker `6e108e3a-538a-4dc8-8b68-c95c6035740a` serves 100% of traffic;
  deployment created 2026-11-11 at 16:37:47 America/Sao_Paulo.
- Thirteen hosted checks pass: 0.3.22 notes, immutable source, strict CSP,
  public scripts/licenses/fonts, allowed gamedata and rejected offline/unlisted
  proxy routes. All three entry JavaScript bundles match local SHA-256 hashes.
- Optional engine E2E: 44 explicit skips because the engine is not bundled.
- Evidence: `evidence/release-0322-http-checks.json`. Browser movement/raster
  verification was local before publication; no hosted gameplay was sent.
- Rollback: 0.3.21 Worker `086e982a-3e9c-4c7d-bf09-4ef4e0d12a3b`.

Post-rollout evidence is committed on the working branch; main and the
immutable tag retain the exact deployed source commit.


## 0.3.23 synchronized movement and combat text — prepared 2026-11-11

User authorized commit/deployment after fixing player movement and checking
missing combat text. New immutable source tag: `cloudflare-online-v1.20`.
Receipt-time, advance and draw paths now deliver the 2.5D centre with the scene.
The following camera uses the player's curve; repeated default-easing steps
carry velocity with bounded cadence adaptation. Teleports, targeting, custom
easing and reduced motion retain their existing behavior.

Popup parsing accepts native strong-hit verbs/descriptive suffixes verified
against official Crawl melee-attack.cc and an anonymous public CDI spectator
trace. Popup anchors use interpolated entity positions. No gameplay, login or
chat was sent; CBRG had no public games available for observation.

Feature checks: 2,170 unit tests / two optional-engine skips; 900 real Canvas
checks. The actual GameScreen local fixture confirms camera/player alignment
and visible text through protocol-style events. Source: receipt-path regression
tests at 60/120 Hz, velocity/cadence tests, recorded WebTiles message replay,
strong-hit/kill placement and popup anchor tests. Forced TypeScript, the full
release suite (2,170 pass / two optional-engine skips), production build and
ASSETS-only Worker dry-run (20.95 KiB) pass. Optional engine E2E: 44 skips.
The real game loop produces a visible ≈54 popup from native strong-hit wording;
three receipt-style steps keep player-centre drift within 0.24 CSS pixels
(including clientWidth rounding). Evidence: `evidence/release-0323-game-loop.json`
and `evidence/release-0323-canvas-checks.json`. Hosted rollout follows publication.
