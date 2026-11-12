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

Source links for 0.3.63 point at the `cloudflare-online-v1.60` release tag in
`vittis/orbrun`, which must exist at the exact code being deployed. Retain that
tag unchanged. A later release must update the source links and use a new tag.
Upstream credits, source licenses and fonts are retained; Acorn's MIT notice
is shipped at `/licenses/acorn.txt`.

## Build settings

- Repository: `vittis/orbrun`; production branch: `main`.
- Root/path: `/` (the monorepo root).
- Node: `24.11.1` via `NODE_VERSION`.
- Build variable: `SKIP_DEPENDENCY_INSTALL=1` (disable Cloudflare's automatic dependency install).
- Build: `npm ci --include=dev --prefer-offline --no-audit --no-fund && npm run typecheck && NODE_ENV=test npm test`.
- Deploy: `npm run deploy` (direct `npx wrangler deploy` also uses the guard).
- Preview builds: disabled for the initial deployment.
- No game credentials or application secrets are required.

The build command installs dependencies once and retains the full typecheck and
test suite. The deploy command then runs the guarded asset build once through
Wrangler's custom build hook. Do not append `npm run build` to the build command:
that would build the same assets twice. The build variable and commands above
must also be saved in the Worker's dashboard settings; Wrangler does not apply
Workers Builds settings from this file. `--no-audit` skips npm's install-time
advisory lookup, not tests; run dependency audits separately when needed.

On 2026-11-12, the production Workers Builds settings were updated to the
single-install/single-build configuration above; the build cache was already
enabled. The preceding build `ed164992-325b-43e0-962e-24c62b34a5db`
(commit `b7a686d`, 0.3.46) took approximately 305 seconds: environment setup
53 seconds, automatic dependency installation 13 seconds, explicit installation
8 seconds, typecheck 15 seconds, tests 172 seconds, and the first Vite build
approximately 10 seconds including script startup. Wrangler then rebuilt assets
again. Removing the automatic install and first build should save approximately
20–25 seconds on a comparable run; this has not yet been measured in a new
Cloudflare build. Tests and the before/after deployment guard remain enabled.

The slowest test files in that Cloudflare run were scene incremental equivalence
(16.44 seconds), recorded scene construction (10.82 seconds), chunked geometry
(10.57 seconds), and the deployment guard (4.37 seconds). These file timings
are not additive estimates of deployment-time savings. Before deleting coverage,
benchmark Vitest worker settings and repeated fixture setup. The ordinary suite
already excludes the engine E2E lane and skips missing engine artifacts.

Vitest worker and fixture benchmarks were completed locally on 2026-11-12;
[the evidence](evidence/vitest-workers-benchmark.json) records both rounds,
machine details and rejected variants. The suite now uses isolated threads,
one minimum worker and at most four workers, using both CPUs on a two-core
runner. With four threads, fixture reuse reduced the full-suite median from
17.41 to 14.66 seconds (approximately 16%). All original 2,433 collected cases
remain, with the same two skips; three additional checks cover cached fixture
equivalence and mutation isolation. All 262 existing `expect` calls in the
modified files are unchanged. The selected two- and four-worker thread pools
passed both before/after rounds; all-CPU settings produced geometry timeouts
and were rejected. These are local measurements, not a new Cloudflare timing.

`node tools/perf/vitest-workers.mjs --rounds 2` reproduces the comparison.
Recording data and final-state snapshots are cloned for each mutable consumer;
tests exercising full/incremental replays still run every original message and
flush cadence. Guard tests retain real Git operations against separate remotes,
copying only their initial committed history from a shared template.

Cloudflare's automatic build-token form grants account-level Worker and storage
permissions plus zone routes; it offers no per-project narrowing. The user
explicitly approved creation of a dedicated token. Token contents must never
be committed or copied into these notes.

## Local verification and rollback

Every Wrangler deployment runs `tools/build/deploy-build.mjs` through the
checked-in custom build command. It refuses uncommitted tracked or untracked
files, fetches `origin/main` explicitly, and requires that fetched commit to be
an ancestor of HEAD. Fetch/authentication failures stop the deployment rather
than trusting an old tracking ref. Clean feature branches ahead of main and
detached CI checkouts are supported; behind or diverged branches are rejected.

The hook then rebuilds the production assets, fetches and checks main again,
and refuses to continue if HEAD or source files changed during the build. This
prevents a current branch from uploading an older `dist` and catches main
advancing while the build runs. It does not merge, rebase or stash automatically.
Run `npm run deploy:guard` for just the Git checks. To resolve a refusal, merge
or rebase the latest main, commit the integrated source, then retry deployment.
Commit before running the guarded `deploy:check` dry run, too.

These checks run immediately before Wrangler packages/uploads the release;
they do not lock main during the network upload. They protect commands using
this configuration, not older checkouts predating the hook, alternate configs
or dashboard rollbacks. Keep production releases integrated into main; strict
account-wide enforcement requires allowing production writes only through CI.
Local `wrangler dev` builds assets without requiring production Git cleanliness.

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


### Successful 0.3.23 rollout

- Main and immutable source tag `cloudflare-online-v1.20` point to
  `ac3a4c063c422914685ff3824d088f3b3f487742`, pushed atomically after validation.
- Cloudflare build `7be02191-43c7-4476-acb3-217bef2f3738` succeeded. Worker
  `c420b95c-c942-4c55-a622-b96852572c9c` serves 100% of traffic; deployment
  created 2026-11-11 at 17:02:28 America/Sao_Paulo.
- All 15 hosted checks pass: release/source/CSP, scripts/licenses/fonts,
  allowed gamedata and rejected offline/unlisted proxy routes. Three JavaScript
  and two CSS entry bundles match the local production build byte for byte.
- Evidence: `evidence/release-0323-http-checks.json`,
  `evidence/release-0323-game-loop.json`,
  `evidence/release-0323-canvas-checks.json`.
- Rollback: 0.3.22 Worker `6e108e3a-538a-4dc8-8b68-c95c6035740a`.

Post-rollout evidence remains on the working branch; main and the immutable
tag retain the exact deployed source commit.


## 0.3.24 Ice Thorns / no-damage feedback — prepared 2026-11-11

User confirmed the spell is Ice Thorns from trunk and explicitly requested
commit/deployment. New source tag: `cloudflare-online-v1.21`. Official Crawl
`terrain.cc:ice_thorns_trigger` sets the plural beam verb to “skewer”;
`zap-data.h` names the beam “ice thorns” with BEAM_ICE flavour. `beam.cc` emits
“The ice thorns skewer …” and “… but do no damage” for a post-AC zero.

The parser now recognizes plural hit verbs and preserves known zero damage.
NO DAMAGE text is quiet, unestimated, and skips damage-impact ripples. Positive
Ice Thorns damage keeps the cold tone and existing marked estimates. Explicit
incoming no-damage hits also produce feedback despite having no HP delta.
Tests cover moving targets, exact/estimated/zero amounts, message rollback,
crumbling thorns, and concise/normal popup rendering. The real GameScreen
fixture shows NO DAMAGE and ≈4 with only one damage-impact call. Verification
uses source-confirmed local protocol events; no player account or gameplay was
used. Release checks passed: forced TypeScript, 2,185 unit tests/two optional
engine skips, production build, and ASSETS-only Worker dry-run (20.95 KiB).
Optional engine E2E reports 44 skips. Evidence:
`evidence/release-0324-ice-thorns.json`. Hosted rollout follows publication.


## 0.3.25 2.5D animation and combat polish — prepared 2026-11-11

User explicitly requested committing to main and deploying the animation changes.
New immutable source tag: `cloudflare-online-v1.22`. Adds slightly stronger,
crisper idle motion; wound-dependent strain; confirmed player/enemy melee with
five weapon gestures; faint elemental spell traces; compact emitter cores and
capped embers/motes/fountain spray. Presentation histories are visibility-gated,
bounded, and cleared by Still mode and level transitions. Damage popups remain
independent of melee effects. The dungeon testbed previews all variants.

Feature checks: 2,204 unit tests pass / two optional-engine skips, 900 real Canvas
checks pass, typecheck and production build pass. Full tests use two workers to
avoid unrelated 3D mesh timeouts under concurrent build/Canvas load. Final release
validation passed: forced TypeScript, 2,204 unit tests/two optional-engine skips,
production build, ASSETS-only Worker dry-run (104 asset files, 20.95 KiB), and
diff checks. Optional engine E2E reports 44 explicit skips. Prior production
Worker `2f08c8fc-f899-417b-a546-4f43133e7304` is the rollback target. Hosted
rollout follows publication.


### Successful 0.3.25 rollout

- Main and immutable source tag `cloudflare-online-v1.22` point to
  `41dc68b51bf11a681e9497b1d36bd664ceb0c13b`, pushed atomically after validation.
- Cloudflare build `a433f31b-d289-48a9-b3ec-8ad8ef204908` succeeded. Worker
  `f39a789a-660a-4371-bbfd-d10072e9e6e7` serves 100% of production traffic;
  deployed 2026-11-11 at 17:48:48 America/Sao_Paulo.
- All 15 hosted checks pass: 0.3.25 notes, immutable source links, strict CSP,
  scripts/fonts/licenses, allowed gamedata and rejected offline/unlisted proxy
  routes. Three JavaScript and two CSS bundles match local production bytes.
- Evidence: `evidence/release-0325-http-checks.json`.
- Rollback: Worker `2f08c8fc-f899-417b-a546-4f43133e7304` (0.3.24).

Post-rollout evidence is committed on the working branch; main and the source
release tag retain the exact deployed code commit.

## 0.3.26 multi-cell movement — prepared 2026-11-11

User authorized committing to main and deployment, with post-deployment checks
left to the user. Source tag: `cloudflare-online-v1.23`. Confirmed multi-cell
movement now tweens in Dungeon (2.5D), first-person monsters and the camera,
including fast enemies, projectiles and rampage. Repeated updates preserve the
drawn position and animate the remaining confirmed route over one duration.
Level resets, visibility rules and reduced motion retain their existing behavior.

Release checks passed: 2,219 unit tests / two optional-engine skips, forced
TypeScript rebuild, production build, ASSETS-only Worker dry-run (104 assets,
20.95 KiB), and diff checks. Optional engine E2E reports 44 explicit skips.
The atomic main/source-tag push triggers Cloudflare Workers Builds. No
deployment polling or hosted checks will be performed, as requested.


## 0.3.27 2.5D wall depth — prepared 2026-11-11

User authorized committing to main and deployment, with post-deployment checks
left to the user. Source tag: `cloudflare-online-v1.24`. Exposed wall bases
have stronger contact shadows and soft cast shadows that scale with wall height.
Faces darken toward their feet and exposed roof edges have subtle bevels;
connected roofs remain continuous. Transparent walls cast lighter shadows,
and unseen geometry does not affect visible depth cues.

Feature validation: 1,062 real Canvas checks passed. After integrating main,
2,219 unit tests / two optional-engine skips, forced TypeScript rebuild,
production build, ASSETS-only Worker dry-run (104 assets, 20.95 KiB), and diff
checks passed. Optional engine E2E reports 44 explicit skips. The atomic
main/source-tag push triggers Cloudflare Workers Builds. No deployment polling
or hosted checks will be performed, as requested.


## 0.3.29 brief projectile and physical spell effects — prepared 2026-11-11

User requested fixing invisible Sandblast visuals, covering similar cases and
deploying the result. Source tag: `cloudflare-online-v1.26`. Integrated main's
0.3.26 multi-cell movement and 0.3.27 wall-depth and 0.3.28 breathing releases before publication.

Root causes: Session batched map rebuilding until RAF, so a complete projectile
flight could be overwritten by later map deltas. Residue depended exclusively
on transient light emitters, excluding Sandblast/Stone Arrow/Iron Shot. All
projectiles also received alpha thinning intended for continuous beam segments.
Session now publishes confirmed projectile map frames immediately (excluding
historical load-queue replay); 2.5D keeps removed artwork for up to 180 ms and
uses independent projectile semantics for impact/dust/chip traces. Compact art
keeps its texels. Histories remain bounded and respect visibility, remote maps,
level changes, Still mode and explicitly invisible black bolt tiles.

Official source confirms Sandblast uses TILE_BOLT_SANDBLAST rather than a fire
or magical light. The ordinary WebTiles client honors presentation delays;
this fix preserves effects without blocking this client's authoritative updates:
- https://github.com/crawl/crawl/blob/master/crawl-ref/source/zap-data.h
- https://github.com/crawl/crawl/blob/master/crawl-ref/source/webserver/static/scripts/client.js

Regression coverage drives real Session/reducer/builder/renderer wiring with
Sandblast, Stone Arrow, Iron Shot, Magic Dart and Frost added and removed in one
synchronous message burst. `/testbed/projectile-checks.html` uses actual public
server artwork: 20 pixel checks verify projectile, impact, residue and complete
expiry. Existing terrain/movement/wall Canvas checks are retained. Final release
checks and rollout evidence follow below.


Final integrated validation: forced TypeScript, 2,239 unit tests/two optional
engine skips, production build, ASSETS-only Worker dry-run (104 assets,
20.95 KiB) and diff checks passed. Optional engine E2E reports 44 explicit skips.
All 1,062 terrain/movement/wall Canvas checks and 20 real-art spell checks pass.
Evidence: `evidence/release-0329-{canvas-checks,projectiles}.json` and
`evidence/release-0329-projectiles.png`. The source tag and main will be pushed
atomically, followed by a production asset/source/CSP/proxy verification.

## 0.3.28 smoother idle breathing — prepared 2026-11-11

User authorized committing and deploying the completed breathing changes.
Source tag: `cloudflare-online-v1.25`. Integrates the 0.3.27 wall-depth release.
Breathing is slower and shallower without sideways stretching. Crisp sprites
are enlarged by whole pixels before narrow edge smoothing eases row transitions;
the cache retains its bounded pixel budget. Still mode and explicit filtering
preferences remain supported.

The actual GameScreen preview confirms animated frames and a single frozen
frame in Still mode. Integrated release checks passed: forced TypeScript rebuild,
2,220 unit tests / two optional-engine skips, production build, ASSETS-only
Worker dry-run (104 assets, 20.95 KiB), and diff checks. Optional engine E2E
reports 44 explicit skips. The atomic main/source-tag push triggers Cloudflare
Workers Builds; the GitHub check reports the hosted deployment result.


## 0.3.30 stronger wall bases and smooth LOS — prepared 2026-11-11

User authorized committing to main and deployment, leaving post-deployment
checks to the user. Immutable source tag: `cloudflare-online-v1.27`. Wall-base
contact shadows and face bottoms are darker. LOS brightness fades over 220 ms
for floors, roofs, faces and standing art, with matching memory fog and exposure
to visible lights. Rapid reversals continue from the drawn brightness. Initial
views, level transitions, remote maps and Still mode snap; hidden entities
disappear immediately and picking follows confirmed visibility.

Integrated the latest main, retaining crisp breathing raster sizes, bounded
cache pixel budgets and short-lived spell projectile effects. Feature
validation passed 1,157 real Canvas checks before integration. Final integrated
checks passed: 2,250 unit tests / two optional-engine skips, 1,158 real Canvas
checks (including enlarged breathing rasters), forced TypeScript rebuild,
production build, ASSETS-only Worker dry-run (104 assets, 20.95 KiB), and diff
checks. Optional engine E2E reports 44 explicit skips. The atomic main/source-tag
push triggers Cloudflare Workers Builds. No deployment polling or hosted checks
will be performed, as requested.

## 0.3.31 compact combat icons — prepared 2026-11-11

User authorized committing to main and deploying. Immutable source tag:
`cloudflare-online-v1.28`. Zero-damage player and enemy hits show a muted armor
symbol with a quiet fade and shorter rise. Shield blocks, misses, kills, damage
types, healing, status changes and leveling use distinct SVG symbols. Numeric
damage and estimates remain visible; unknown statuses retain their wording.
Popup sizes, stacking gaps and travel are smaller. Existing concise and reduced
motion preferences remain supported.

Integrated current main, retaining 0.3.29 spell effects and 0.3.30 wall/LOS
changes. Release checks pass: forced TypeScript rebuild, 2,271 unit tests with
two optional-engine skips, production build, ASSETS-only Worker dry-run
(104 assets, 20.95 KiB), and diff checks. The optional engine E2E lane reports
44 explicit skips because engine artifacts are absent. Headless Chrome verified
the combat preview at 1280×800 and 390×844, including player/enemy armor,
readable numeric damage, statuses and a gallery of all expression symbols.

Push main and the source tag atomically to trigger Workers Builds, then verify
that the hosted release source, popup bundles and strict CSP match this build.

## 0.3.32 coherent 2.5D walls — prepared 2026-11-11

User requested fixing wall lines and undersized terrain, committing to main and
deploying. Immutable source tag: `cloudflare-online-v1.29`. Integrates 0.3.30's
LOS fading and stronger base shadows. Walls now use one consistent raised
height for drawing, picking, lighting and shadows. Original artwork maps once
over the whole silhouette instead of restarting on a compressed face. Removed
cap bevels and the hard recess line; foot shading starts transparently. Ground
fog now renders before standing geometry, preventing remembered neighbours from
projecting rectangular mist boundaries over visible walls and creatures.

Real Canvas regressions cover textured cap continuity, original foot texels,
corner/foreground picking and stable geometry when neighbouring LOS changes,
across tilts, zooms, fractional DPR and both filtering settings. Existing terrain,
visibility, lighting and movement regressions remain in the browser harness.

Final integrated checks: 2,271 unit tests passed / two optional-engine skips;
1,374 real Canvas checks passed; forced TypeScript rebuild, production build,
ASSETS-only Worker dry-run (104 assets, 20.95 KiB) and diff checks passed.
Optional engine E2E reports 44 explicit skips because engine artifacts are absent.
Integrated main's 0.3.31 compact combat icons. Pixel results and real-art dungeon
captures are in `evidence/release-0332-{canvas-checks.json,d1-fountains.png,room.png}`.
Main and the immutable source tag will be pushed atomically; production rollout
and hosted asset/source checks follow the Cloudflare Workers Builds result.


## 0.3.33 combat celebration and receiver colors — prepared 2026-11-11

User authorized committing to main and triggering deployment, with no deployment
polling or hosted verification. Immutable source tag: `cloudflare-online-v1.30`.
Physical damage numbers no longer carry a sword. Level-ups have larger gold
text, 48 colorful confetti pieces and sparks, an expanding ring, and a 2.4-second
lifetime. Confetti follows the popup frame clock and is suppressed in Still
mode. Popup bounds and cleanup apply to the celebration as well.

Player defenses use cyan and enemy defenses use amber; player damage is pink
and player healing mint. Elemental/status feedback blends its type tint with
the recipient palette so the affected actor remains distinguishable.

Integrated the 0.3.32 wall-tile release. Local validation passed: forced
TypeScript rebuild, 2,275 unit tests with two optional-engine skips, production
build, ASSETS-only Worker dry-run (104 assets, 20.95 KiB), and diff checks.
Optional engine E2E reports 44 explicit skips for absent engine artifacts.
Local Chrome checks confirmed distinct computed defense colors, no sword or
level icon, 48 confetti pieces, readable desktop/phone presentation, and fully
suppressed text/confetti motion in Still mode. Push main and the source tag
atomically to trigger Workers Builds. The user will verify the deployment.


## 0.3.34 non-projectile spell VFX — prepared 2026-11-11

User authorized committing and deploying the completed VFX changes. Integrated
0.3.33's combat colors and level-up celebration. Immutable source tag:
`cloudflare-online-v1.31`. Confirmed spell and ability feedback now produces
bounded, depth-sorted bursts independently of projectile artwork and combat
popup settings. Includes Freeze, Airstrike, Scorch, draining, smiting, electrical
and hex effects, healing, buffs, transformations and summoning confirmations.
Incoming abilities and zero-damage results also animate. Short server cell
flashes survive receipt/clear between frames. Visibility, level transitions,
remote maps and Still mode clear the histories.

Feature validation passed 2,307 unit tests with two optional-engine skips,
typecheck, production build and 19 real Canvas checks. The pixel checks cover
all 14 effect families, complete expiry, four confirmed result sentences and a
synchronous server flash. Evidence: `evidence/release-0334-spell-checks.json`.
Final integrated checks passed: forced TypeScript rebuild, 2,311 unit tests
with two optional-engine skips, production build, ASSETS-only Worker dry-run
(104 assets, 20.95 KiB) and diff checks. Optional engine E2E reports 44 explicit
skips because engine artifacts are absent. Push main and the immutable source
tag atomically to trigger Cloudflare Workers Builds, then verify the hosted
version, source links, bundle identity, CSP and proxies.


## 0.3.35 recovery of stale corridor deployment — 2026-11-11

The direct corridor deployment `67d38e30-5bdd-457f-bcc2-d347b9319975`
was built from `codex/living-dungeon` at 2a0a1bb, based on 0.3.24.
It replaced production 0.3.34 (`8efe30a9-98df-448f-989b-4470018812d8`)
and therefore omitted 0.3.25–0.3.34, including compact popup icons, receiver
colors, level confetti, projectile fixes, LOS fades, coherent walls and spell VFX.
The Git source remained intact. The earlier HTTP/bundle comparison only proved
that production matched the stale local artifact; it did not establish release
freshness. Recovery integrates origin/main e45c669 before rebuilding and publishing.

0.3.35 retains all 0.3.34 application features and adds deeper ground rows plus
a low foreground lip only for single-cell horizontal passages. Drawing, lights,
picking and shadows share that height, independent of visible/remembered LOS;
room walls retain the current coherent texture and depth behavior.
Immutable source tag: `cloudflare-online-v1.32`. Publish this integrated source
to main so subsequent releases inherit the corridor fix. Future releases must
fetch main and compare against the currently deployed release before building.


## 0.3.36 confirmed damage and contact feedback — prepared 2026-11-11

User authorized committing to main and deploying. Integrated origin/main
4abf3c7, retaining 0.3.35's corridor clearance and the deployment freshness
checks. Immutable source tag: `cloudflare-online-v1.33`.

Enemy damage is numeric only when explicitly reported. Unknown hits use
light/solid/heavy physical or elemental cues; player HP changes remain exact
net changes between updates. Dungeon (2.5D) melee uses attacker/defender IDs,
wind-up, directional contact and recovery. Recoil, popups, elemental bursts
and explicit impact rings share the contact clock. Still mode and views
without melee animation show feedback immediately. Game state and input
are never delayed.

Integrated validation: 2,331 unit tests passed with two optional-engine skips;
forced TypeScript rebuild passed. Optional engine E2E reports 44 skips because
engine artifacts are absent. Browser checks covered all three views, confirmed
numbers, unknown Magic Dart damage, incoming HP loss and Still mode. Guarded
production build/dry-run precedes the atomic main/source-tag push; hosted
source, bundle identity and CSP checks follow the Workers Builds result.



## 0.3.37 more pronounced idle breathing — prepared 2026-11-12

User authorized committing to main and deploying. Based on current origin/main
987e8f2, retaining all prior releases and the LOS arrival fix. Immutable source
tag: `cloudflare-online-v1.34`. Idle breathing has 50% more range with unchanged
rhythm; overhead breathing retains smooth edges and no sideways stretching.

Validation: 2,338 unit tests passed with two optional-engine skips, forced
TypeScript rebuild and production build passed. One geometry test timed out
during the first release suite; the full suite passed with four workers.
Optional engine E2E reports 44 skips because engine artifacts are absent.
The guarded Worker dry-run precedes the atomic main/source-tag push, which
triggers Cloudflare Workers Builds. Hosted source and bundle checks follow
the deployment result.

## 0.3.38 dungeon depth and atmosphere — prepared 2026-11-12

User authorized committing to main and deploying. Integrated origin/main
`d6589a4`, preserving 0.3.37's idle breathing and earlier combat, corridor and
LOS fixes. Immutable source tag: `cloudflare-online-v1.35`.

Dungeon (2.5D) keeps wall artwork on raised roofs and extends its bottom edge
into a shaded vertical face. Ambient grading follows the drawn player, warming
nearby stone and cooling distant terrain; the warm lift clips to known geometry.
Semantic torch/magic light pools reach neighbouring cells and retain occlusion.
Frontier fog feathers both floor edges and raised roofs into darker black.

Before integration, all 2,338 unit tests and 3,866 Canvas pixel checks passed;
typecheck and production build passed. Release checks repeat against integrated
main and updated metadata, including the guarded Worker dry-run. Hosted source,
bundle identity and CSP checks follow production rollout.


## 0.3.39 faster idle breathing — prepared 2026-11-12

User explicitly authorized pushing to main and deploying the faster idle
breathing update. Integrated origin/main 12b51a4, preserving 0.3.38's wall
extrusion, lighting and unexplored-space atmosphere. Immutable source tag:
`cloudflare-online-v1.36`. Breathing runs about 23% faster in all views,
retaining the movement range from 0.3.37. Overhead breathing stays smooth
and does not stretch sideways; other idle motions retain their timing.

Integrated validation passed a forced TypeScript rebuild and 2,338 unit tests
with two optional-engine skips. The guarded production build/dry-run precedes
the atomic main/tag push, which triggers Cloudflare Workers Builds. Verify hosted source links
and bundle identity after deployment.


## 0.3.40 creature-specific death VFX — prepared 2026-11-12

User authorized committing to main and deploying. Integrated origin/main
`8cc3953`, retaining 0.3.38's wall extrusion and atmosphere and 0.3.39's faster
idle breathing. Immutable source tag: `cloudflare-online-v1.37`.

Confirmed visible kills spawn directional bursts and fading debris in Dungeon
(2.5D) and first-person views. Ten creature materials use distinct colors,
shapes and motion, including bone shards, slime splashes, rubble, embers, ice
fragments, leaves, chitin and rising spectral wisps. Effects expire in
1.5–2.8 seconds, respect visibility/level transitions and Still mode, and do
not depend on combat popups. Melee deaths share the contact clock. Same-name
victims and explicit damage-over-time deaths receive separate effects.

Integrated validation passed a forced TypeScript rebuild and 2,368 unit tests
with two optional-engine skips. Optional engine E2E reports 44 explicit skips
because engine artifacts are absent. Browser checks covered both views. The
guarded production build/dry-run precedes the atomic main/tag push, which
triggers Cloudflare Workers Builds. Hosted version, source links, bundle
identity, CSP and proxy checks follow production rollout.

## 0.3.41 directional travel arrivals — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
agents' work. Integrated origin/main `feb5628`, including 0.3.38's wall depth
and atmosphere, 0.3.39's faster breathing, and 0.3.40's creature-specific death
effects. Still-mode cleanup retains both death effects and the arrival cue.
Immutable source tag: `cloudflare-online-v1.38`.

Fast explore/travel arrivals retain immediate LOS brightness and add a 320 ms
directional sweep, capped at 14% shade. It clears from the origin side toward
the destination, supports diagonal travel, preserves targeting/input, replaces
repeated arrivals without queues, and stops for normal steps and Still mode.

Integrated validation passed a forced TypeScript rebuild and 2,390 unit tests
with two optional-engine skips. Optional engine E2E reports 44 explicit skips
because engine artifacts are absent. The feature passed 96 focused real Canvas
checks before integration. Guarded production build/dry-run precedes the atomic
main/source-tag push. Use the existing main-triggered Workers Builds pipeline;
do not upload a second local build over a potentially newer main deployment.
Verify the hosted source tag and bundle after rollout; if main advances, retain
the newer release when it includes this change instead of redeploying older code.


## 0.3.42 pixel gore in Dungeon (2.5D) — prepared 2026-11-12

User authorized committing to main and deploying the 2.5D-only gore remake.
Integrated origin/main `e0ef8b7`, preserving directional travel arrivals and
all preceding releases. Immutable source tag: `cloudflare-online-v1.39`.

Dungeon death effects use shaded pixel stamps with dark outlines and exposed
bone, larger gibs, denser blood trails and ragged floor splatters. Residue
lasts up to 4.6 seconds and dissolves whole texels. Bone, slime, stone,
elemental and spectral deaths retain distinct colors and motion. Death bursts
replace the smooth impact ring; floor stains draw below actors and terrain.
Visibility, Still mode, level cleanup, bounded histories and sprite caches
remain enforced. First-person effects are unchanged.

Integrated validation passed a forced TypeScript rebuild and 2,399 unit tests
with two optional-engine skips. Optional engine E2E reports 44 explicit skips
because engine artifacts are absent. Browser checks covered blood, slime and
complete expiry. The guarded production build/dry-run precedes the atomic
main/source-tag push, which triggers Cloudflare Workers Builds. Hosted version,
source links, bundle identity and proxy checks follow rollout.

## 0.3.43 character overview and web scale — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
agents’ work. Integrated origin/main `aaad668`, retaining the concurrent pixel-gore
release, directional arrivals, wall depth and prior releases. Immutable
source tag: `cloudflare-online-v1.40`.

Djinni reserve the absent Magic row so AC/Str align with the other stats below
the portrait. Overhead views keep whole-cell web/net art on the character;
the large central overlay is reserved for first person. Switching projections
updates the overlay without waiting for a game-state change.

Integrated validation: 2,403 unit tests passed with two optional-engine
skips; the forced TypeScript rebuild passed. Optional engine E2E reports
44 explicit skips because engine artifacts are absent. A guarded production
build/dry-run precedes publication. Publish
main and the source tag atomically through the existing Workers Builds
pipeline. Re-fetch and integrate main if another agent advances it; never
force-push or upload a separate stale local build. Verify hosted source and
bundle identity after rollout.


## 0.3.44 weapon-specific pixel melee swings — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
agents' work. Integrated origin/main `548f1aa`, retaining 0.3.43's HUD/web
fixes, 0.3.42's pixel gore, travel arrivals and all prior releases. Merge resolution preserves
both the melee renderer and the new pixel-death renderer, with separate
attack-progress and death-phase controls in the development preview.
Immutable source tag: `cloudflare-online-v1.41`.

Dungeon (2.5D) melee uses shaded pixel ribbons for slashes, broad cleaves,
narrow thrusts, overhead crushes and short unarmed strikes. Weapon families
and natural cutting, piercing and crushing attacks select the gesture.
Trail weight and contact sparks follow confirmed hit strength and damage
type. Misses pass beside the defender without contact flashes or debris.
Existing contact timing, recoil, visibility limits and Still mode remain.

Integrated validation passed a forced TypeScript rebuild and 2,426 unit tests
with two optional-engine skips. One unrelated geometry test timed out during
concurrent validation; the full suite passed with four workers. Optional
engine E2E reports 44 explicit skips because engine artifacts are absent.
Browser checks confirmed melee swings, pixel-gore kills and complete expiry
coexist after integration. A guarded production build/dry-run precedes the
atomic main/source-tag push to the existing Workers Builds pipeline. Verify
hosted source links, bundle identity, CSP and proxy checks after rollout;
retain any newer main release that includes this change.


## 0.3.45 single traveling projectiles — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
agents' changes. Integrated origin/main `1e61c83`, retaining 0.3.44's pixel melee
swings, 0.3.43's HUD/web fixes, 0.3.42's pixel gore,
0.3.41's directional arrivals and all previous features. Immutable source tag:
`cloudflare-online-v1.42`.

Dungeon (2.5D) groups confirmed projectile samples into one interpolated sprite,
including flights received and cleared before a render. Magic darts, bow arrows
and other missiles retain their artwork and produce arrival VFX only at the
endpoint, including walls. Physical missiles use physical impact effects;
projectile lighting follows the head. Separate launches and visibility, level,
remote-map and Still cleanup remain covered.

Feature validation passed 2,395 unit tests with two optional-engine skips,
typecheck, production build and all 24 real-art browser checks. Integrated
validation passed a forced TypeScript rebuild and 2,431 tests with two
optional-engine skips. Optional engine E2E reports 44 explicit skips because
engine artifacts are absent. The guarded Worker dry-run precedes an atomic
main/source tag push. Use main-triggered Workers Builds only, preserving any
newer release that includes this change. Verify hosted source links and bundle identity after
rollout.


## 0.3.46 immediate death VFX — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
worktree releases. Integrated origin/main `cef0b23`, retaining single traveling
projectiles, weapon-specific pixel melee, HUD/web fixes, pixel gore, directional
arrivals and all previous releases. Immutable source tag:
`cloudflare-online-v1.43`.

Confirmed kill effects start on the frame the server removes the enemy,
instead of waiting 135–170 ms for the melee presentation contact point.
Other melee feedback keeps its contact timing. Regression checks cover
multiple weapon families and visible debris on the exact spawn frame.
The development preview retains both concurrent attack-progress controls
and death-phase controls, including a new first-frame option.

Integrated validation passed a forced TypeScript rebuild and 2,434 unit tests
with two optional-engine skips. Optional engine E2E reports 44 explicit skips
because engine artifacts are absent. The guarded production build/dry-run
precedes the atomic main/source-tag push. Use main-triggered Workers Builds only. A normal
non-forced push must succeed; re-fetch, integrate and revalidate if main moves.
After rollout, verify live source links, bundle identity, CSP and proxies.
Any later main release must include this fix before being accepted as current.


## 0.3.47 projectile direction, speed and facing — prepared 2026-11-12

Follow-up correction to the authorized projectile release. Based on current
origin/main `b7a686d`, retaining the concurrent death timing, pixel melee,
HUD/web and earlier releases. Immutable source tag: `cloudflare-online-v1.44`.

Launch extension requires an actor behind the confirmed travel direction;
nearby targets cannot become shooters. Displayed missiles never jump back to
an inferred origin, and consecutive short shots cannot join into a return
flight. Directional overlay batches follow native headings instead of map
cell order. Exact server tile variants preserve their artwork heading and
family; animation/distance variants are not mistaken for directions.

Travel doubles from 20 to 40 cells per second. Directional art rotates in the
ground plane to face from origin to destination, with camera foreshortening
applied afterwards. Endpoint VFX no longer wait through the old arrival hold.
Regressions cover incoming shots, repeated close shots, late updates, all
eight directions, unsorted batches, tile semantics and actual render rotation.
All 56 real-art browser checks and 2,450 unit tests pass, with two
optional-engine skips. Forced TypeScript rebuild passes. The guarded
production dry-run precedes the atomic main/source-tag push. Follow the
existing main deployment pipeline and preserve any newer integrated release.


## 0.3.48 indirect-kill death VFX — prepared 2026-11-12

User authorized committing to main and deploying. Integrated origin/main
`5a19fd8`, preserving projectile direction/speed/facing corrections and the
concurrent build-speed improvements, along with all earlier releases.
Immutable source tag: `cloudflare-online-v1.45`.

Combat feedback recognizes passive indirect deaths, named uniques without
articles and explicit explosion deaths. A bounded two-second history retains
visible victims when map removal precedes the kill message. It is used only
with explicit death evidence; walking, blinking, expired Foxfires and leaving
sight never infer kills. Histories expire, clear on level/session transitions,
and reject hidden destinations. Same-name victims retain separate identities.

Integrated validation passed a forced TypeScript rebuild and 2,468 unit tests
with two optional-engine skips. Optional engine E2E reports 44 explicit skips
because engine artifacts are absent. The guarded production dry-run precedes
the atomic, non-forced main/source-tag push to the existing Workers Builds pipeline.
Preserve any newer integrated release, and verify live source links, bundle
identity, CSP and proxies after rollout.


## 0.3.49 pixel impact art and recorded Magic Dart correction — prepared 2026-11-12

Continues the authorized projectile release, preserving origin/main `2ea2859`
and its indirect-kill death effects and build optimizations and all preceding gameplay changes. Immutable
source tag: `cloudflare-online-v1.46`.

Dungeon (2.5D) replaces generic impact rings, vector spell bursts and floor
traces with shaded, outlined pixel stamps at the dungeon's 32-texel scale.
Physical sparks, stone/sand, flame/smoke, ice splinters, forked lightning,
acid/poison splashes, arcane fragments, healing/holy runes and other spell
families have distinct silhouettes and colour ramps. Melee contact and generic
damage/arrival feedback share the art; natural water motion has separate pixel
splashes. Whole texels dissolve on expiry and cached frames are bounded.

A public, anonymous spectator capture reproduced the reported Magic Dart issue:
Crawl sent full rays in map order, with six distance variants wrapping on long
casts. The renderer now matches distance phases against the caster and orders
batched rays correctly. Session publishes removals immediately, preserving
cast boundaries even without a RAF. Confirmed endpoint effects claim generic
hit feedback so it cannot trigger a second delayed burst. Presentation runs
at 240 cells/second with a 20 ms minimum, typically 20–50 ms, without queuing
input or delaying game state. A normalized fixture keeps only coordinates,
variant phases and timings from 35 captured casts; no account data or chat.

Validation passed 2,525 unit tests with two optional-engine skips, a forced
TypeScript rebuild, all 68 pixel-art gallery checks and all 56 actual projectile
Canvas checks. The captured casts each produce one forward sprite and exactly
one endpoint impact, including wrapped variants and repeated casts. Final
release checks and the guarded production dry-run precede an atomic main/tag
push. Follow the existing main deployment pipeline; integrate newer main and
preserve concurrent work if it advances before publication.


## 0.3.50 readable projectiles and auto-explore impact correction — prepared 2026-11-12

User authorized committing, merging to main and deploying. Based on origin/main
`fe520f3`, retaining the integrated pixel impacts, recorded Magic Dart correction,
indirect death effects and earlier releases. Immutable source tag:
`cloudflare-online-v1.47`.

Projectiles travel at 72 cells/second with a 50 ms minimum, keeping short flights
visible for several frames while longer flights remain brief. Shaded pixel trails
follow the confirmed path, with material/element colours, drift and fade times;
trails briefly outlive the head without creating another endpoint impact. Hidden
cells, level transitions and Still mode clear or suppress the trail.

Batched auto-explore/travel movement no longer infers an impact from distance
alone. Water footsteps and confirmed teleport effects retain their own cues.
Regressions cover the batched Session-to-renderer path, one head/one impact,
all ten trail materials, fading and visibility/reset cleanup. All 56 actual
projectile Canvas checks passed during implementation. Release validation and
the guarded production dry-run precede an atomic non-forced main/tag push through
the existing Workers Builds pipeline; verify hosted version, source links, CSP
and proxies after rollout.


## 0.3.51 native projectile paths and unified impacts — prepared 2026-11-12

User authorized committing, merging to main and deploying. Based on origin/main
`e382e65`, preserving the auto-explore arrival-impact correction and all earlier
integrated gameplay and build changes. Immutable source tag:
`cloudflare-online-v1.48`.

Dungeon (2.5D) draws every native WebTiles projectile overlay at its supplied
path cell, briefly retaining sub-frame updates. Single-head interpolation,
custom flight speed/rotation and particle trails are removed. Clearing an
overlay no longer guesses an endpoint hit. Confirmed damage, flashes, wound
changes and melee share one impact owner and clock; explicit results take
priority over inferred colour or generic damage. Rapid later hits replace the
visible stamp rather than stacking different effects on the same recipient.

Spell feedback carries the recipient identity and confirmed turn. Impact
anchors follow that actor's confirmed location and interpolated body position,
including an approaching step in the hit's turn. Recent previous cells bind
late flashes to their visible recipient. Melee gestures use the same rendered
actor positions and leave contact stamps to the shared owner.

Implementation validation passed 2,518 tests with two optional-engine skips,
a forced TypeScript rebuild, production build and all 42 native projectile
Canvas checks. Regressions cover recorded batched rays, different-type duplicate
reports, shared melee contact, visibility/reset cleanup and an approaching
creature's body-centred impact. Release validation and the guarded deployment
dry-run precede the atomic, non-forced main/source-tag push through the existing
Workers Builds pipeline. Verify live version, source links, exact bundle, CSP,
proxies and anonymous spectating after rollout.


## 0.3.52 dungeon FPS counter — prepared 2026-11-12

User authorized committing to main and deploying. Based on origin/main
`80cf1d6`; immutable source tag: `cloudflare-online-v1.49`.

Dungeon (2.5D) shows a compact FPS counter in the upper-left of the map. It
counts actual map draws over half-second samples on the existing frame clock,
without requesting additional frames or timers. Visible animations continue to
count while the player stands still; genuinely sleeping scenes settle to zero.
The counter hides in the level map and other projections and resets when the
dungeon view returns. Timing tests cover 30/60/120 FPS, skipped draws, idle
samples and view changes.

Release validation precedes an atomic, non-forced main/source-tag push through
the existing Workers Builds pipeline. Verify the hosted release, source links,
exact bundles, CSP and proxy restrictions after deployment.


## 0.3.53 hybrid projectile travel and recipient overlay — prepared 2026-11-12

User authorized committing and deploying. Integrated origin/main `5cae987`,
preserving the concurrent 0.3.52 FPS counter, unified impacts, moving-recipient
anchors and the auto-explore correction. Immutable source tag:
`cloudflare-online-v1.50`.

One head follows the confirmed native path and blends its last segment onto
the recipient's upright tile footprint, briefly remaining over that creature
at contact. The recipient identity follows interpolated movement; terrain
projectiles retain their ground-plane endpoint. No repeated path artwork or
particle trail is added. Native artwork variants and ray ordering are retained.

Session records cumulative native animation delays without delaying game state
or input. Each flight uses that batch budget once, with a short minimum travel
time and landing exposure; missing delays fall back to distance-based travel.
Confirmed feedback retains one impact owner and clock, held until the head's
contact point. Clear boundaries keep successive casts separate.

Implementation validation passed 2,522 tests with two optional-engine skips,
a forced TypeScript rebuild, production build and all 56 actual-art Canvas
checks. Recorded Magic Dart batches produce one forward head and one impact.
Regression checks cover native timing, landing over a moving creature at full
upright size, draw order, incoming missiles, repeated casts and cleanup.
Integrated validation passed 2,527 tests with two optional-engine skips and a
forced TypeScript rebuild; optional engine E2E reports 44 explicit skips because
artifacts are absent. The guarded dry-run precedes an atomic, non-forced
main/source-tag push through the existing Workers Builds pipeline.
Verify live version, source links, exact bundle, CSP, proxies and anonymous
spectating after rollout.


## 0.3.54 pronounced idle motion and flight — prepared 2026-11-12

User authorized committing and deploying. Integrated origin/main `a6097b1`,
preserving hybrid projectile travel and recipient overlays. Immutable source
tag: `cloudflare-online-v1.51`.

Dungeon (2.5D) increases breathing amplitude by approximately 60% and other
creature idle motion by 20%. Flying monsters and players hover above their
ground marker with a smooth vertical bob and gentle sideways drift. Player
flight follows foreground flags, flight status and innate Djinni flight;
species and status changes refresh the player without requiring map updates.
Held creatures and Still/reduced-motion presentation remain stationary.

Integrated validation passed TypeScript and 2,533 unit tests, with two optional
engine skips. Optional engine E2E reports 44 skips because engine artifacts are
absent.

Release validation and the guarded production dry-run precede an atomic,
non-forced main/source-tag push through the existing Workers Builds pipeline.
Verify hosted version, immutable source links, bundle identity, CSP and proxies
after deployment.


## 0.3.55 snappy, more readable projectile timing — prepared 2026-11-12

User authorized committing to main and deploying with explicit care for
concurrent worktrees. Integrated origin/main `b206f78`, preserving 0.3.54's
stronger idle motion and flying hover, the FPS counter, hybrid recipient
overlays and all previous integrated work. Immutable source tag:
`cloudflare-online-v1.52`.

Hybrid projectile travel scales its native/fallback timing by 1.35, with a
70 ms minimum instead of 40 ms. The 300 ms travel cap and 60 ms landing
exposure remain; impact timing follows the slower arrival. Timing regressions
and the actual-art preview use the new contact clock.

Implementation validation passed 2,527 tests and typecheck before integration.
Integrated validation passed 2,533 tests with two optional-engine skips and a
forced TypeScript rebuild; the optional engine E2E reports 44 explicit skips
because artifacts are absent. The guarded production dry-run precedes the
atomic, non-forced main/source-tag push. If main advances, fetch, integrate and
revalidate; never force-push or replace a newer deployment from this worktree.
Use the existing Workers Builds pipeline and verify live version, source links,
exact bundles, CSP, proxies and anonymous spectating after rollout.


## 0.3.56 actual flight versus water clipping — prepared 2026-11-12

Corrects the deployed idle-flight feature after the user reported a grounded
Gnoll hovering. Integrated origin/main `ce6a7b3`, preserving the projectile
timing release. Immutable source tag: `cloudflare-online-v1.53`.

Crawl's tileidx_player sets TILE_FLAG_FLYING whenever the player is not in
water, including on dry land. Player hover now uses the authoritative Fly /
flying status, including innate, temporary, expiring and form-suppressed flight.
Species alone does not imply current flight. All grounded species share the
correction. The monster flag remains meaningful for flight except orc apostles
and sacred lotuses, where tileidx_monster also sets it for water clipping;
these exceptions use monster/tile identity, including named apostles.

Primary source: crawl-ref/source/tilepick-p.cc (tileidx_player), tilepick.cc
(tileidx_monster) and status.cc (_describe_airborne) in crawl/crawl.
Regressions cover nine player species with a misleading tile flag, flight
activation and removal without map updates, Djinni in a grounded form, expiring
flight, misleading status text, seven grounded monsters and the water-clipping
monster exceptions. Existing immobilisation and reduced-motion checks remain.

Integrated validation passed TypeScript and 2,559 unit tests, with two optional
engine skips.

The validated release follows the existing guarded build and atomic main/tag
push through Workers Builds. Verify production assets, source links, CSP and
anonymous spectator access after rollout.


## 0.3.57 subtle entity hit flashes — prepared 2026-11-12

User authorized committing and deploying the melee/spell hit effect. Integrated
origin/main `74d3af6`, preserving the grounded-flight correction and prior
projectile timing changes. Immutable source tag: `cloudflare-online-v1.54`.

Confirmed damage briefly brightens the recipient for 160 ms in tile, Dungeon
(2.5D) and first-person views, with an opacity blink on Canvas implementations
without filter support. Melee uses its contact time; Dungeon projectiles share
their arrival clock. Stable identities keep flashes on moving creatures, while
misses, zero damage, resisted spells, healing and utility effects do not flash.
Reduced motion and Still mode suppress flashes. First-person player damage
flashes the hands; badges remain steady. Direct damaging spell result sentences
also enter the existing confirmed-damage feedback path.

Validation passed TypeScript and 2,568 unit tests with two optional-engine
skips. Optional engine E2E reports 44 skips because engine artifacts are absent.
Coverage includes identity, contact timing, coalescing, expiry, visibility, level
cleanup, projectile arrival and first-person batch restoration. The guarded
production dry-run precedes an atomic, non-forced
main/source-tag push through Workers Builds. Verify the hosted version, source
links, asset identity, CSP and proxy restrictions after rollout.


## 0.3.58 varied 2.5D enemy death effects — prepared 2026-11-12

User authorized committing to main and deploying while preserving concurrent
worktrees. Based on origin/main `c34fea5`, retaining entity hit flashes, flight
corrections and all earlier integrated changes. Immutable source tag:
`cloudflare-online-v1.55`.

Each Dungeon death now has a stable seeded profile: particle density varies
from 75–130%, launch speed from 75–135%, with varied lift, size, impact push,
origin scatter and spray width. Bursts alternate between radial, forward fan
and opposing fan distributions. Impact silhouettes and floor pool sizes and
fleck counts also vary. Actor ID mixing keeps consecutive enemies distinct.
Material palettes, pixel art, first-frame timing, clipping, reduced-motion
cleanup and the bounded 24-death history remain in place. Sampling never uses
frame-dependent randomness.

Validation passed TypeScript and 2,570 unit tests with two optional-engine
skips. New regressions cover count, travel and spread variation over 24
consecutive enemies for all ten materials, plus frame-cadence independence.
Optional engine E2E reports 44 skips because engine artifacts are absent.
The guarded production dry-run precedes an atomic, non-forced main/source-tag
push through Workers Builds. Fetch and integrate again if main advances;
preserve any newer deployment that already contains this change.


## 0.3.59 aligned foreground walls — prepared 2026-11-12

User authorized committing to main and deploying. Based on origin/main
`d25ee1e`, preserving 0.3.58's varied death effects and all previous releases.
Immutable source tag: `cloudflare-online-v1.56`.

Dungeon (2.5D) shares the low passage cutaway across each continuous foreground
wall edge, including junctions and widened sections. This removes isolated
raised tiles such as the wall below the shield in the reported case. Gaps,
corners and unknown terrain stop propagation. Drawing, picking, lighting and
shadows consume the same height; remembered terrain preserves the silhouette.

Regression coverage includes one-, three- and five-cell junctions, passage and
roof picking, remembered terrain, and propagation boundaries. The new Canvas
alignment assertion passed all 54 tilt/zoom/DPR/filter combinations. An existing
LOS crop assertion reported one mismatch; the original fixture has no narrow
cross-sections, so all its wall heights remain unchanged by this fix.

Release metadata advances to 0.3.59 and restores the missing 0.3.58 changelog
entry so the What's new screen agrees with the app version. Publication uses
the guarded production dry-run and atomic, non-forced main/source-tag push
through Workers Builds. Fetch and integrate again if main advances.

Integrated validation passed a forced TypeScript rebuild and 2,577 unit tests
with two optional-engine skips. The optional engine E2E lane reports 44 skips
because engine artifacts are absent.


## 0.3.60 subtle material-specific melee sprays — prepared 2026-11-12

Continues the user's authorized commit-to-main and deployment workflow, with
explicit care for concurrent worktrees. Integrated origin/main `6fa0c6e`,
retaining the foreground-wall alignment release and all earlier changes. The
renderer-test import conflict was resolved by retaining both test additions.
Immutable source tag: `cloudflare-online-v1.57`.

Dungeon (2.5D) melee contact now emits a small directional spray from the
recipient's body instead of the conventional impact stamp. Flesh sheds blood,
skeletons bone shards, slimes droplets, stone creatures chips, spectral and
fiery creatures wisps, ice creatures shards, plants fragments and insects
ichor. Wounds and deaths share one material classifier and shaded pixel art.
Each hit varies density, speed, cone width, launch position, size, spin and
lifetime using a stable seeded profile; approximately 4–12 fragments dissolve
within half a second. Sparse stamps retain a four-CSS-pixel footprint so their
coloured texels remain visible at normal tile scales.

The effect uses weapon contact timing, detaches from the creature, coalesces
flash/generic/brand feedback into one spray and yields to death effects. Misses
and zero-damage contacts emit no spray. Existing clipping, visibility, Still
mode and level cleanup remain. Other renderers and projectile/spell impacts
retain their presentation. The combat preview's material selector covers hits
and deaths.

Integrated validation passed 2,602 unit tests with two optional-engine skips,
including all ten materials, five attack directions, repeated hits, stable
redraws, detached debris, duplicate reports and cleanup. TypeScript passed;
optional engine E2E reports 44 skips because engine artifacts are absent. The
real Canvas preview rendered flesh and slime contact effects without browser
errors. The initial full-suite run encountered the preceding release's missing
changelog entry and two resource-contention timeouts; integrating main restored
the changelog, and all tests passed with two workers.

Release validation and the guarded production dry-run precede an atomic,
non-forced main/source-tag push through Workers Builds. If main advances,
integrate and revalidate; preserve any newer deployment containing this change.


## 0.3.61 fading near-death vignette — prepared 2026-11-12

User authorized committing to main and deploying, with explicit care for
concurrent agents and worktrees. Integrated origin/main `b05393b`, preserving
the material-specific melee sprays, foreground-wall alignment and all earlier
releases. Immutable source tag: `cloudflare-online-v1.58`.

Confirmed damage leaving the character at 30% HP or below now triggers a subtle
red corner vignette. It eases in over 160 ms and fades completely within
2.8 seconds even while HP remains low. The centre stays clear, the layer passes
pointer input through, rapid damage shares one envelope, and reduced motion
lowers its intensity. Menus and remote level maps hide it. Death, level changes,
new games and disconnection clear it. The animation releases the frame loop
when it expires and does not depend on combat-popup settings.

At low health, uniform view-wide red server flashes are removed before renderer
receipt-time observations can turn each tile into a fire burst. Local flashes,
other flash colours and confirmed fire spell effects retain their presentation.
The source scene remains unchanged.

Integrated validation passed a forced TypeScript rebuild and 2,608 unit tests,
with two optional-engine skips. The optional engine E2E lane explicitly skipped
44 tests because engine artifacts are absent. The existing isolated headless
Chrome harness passed six viewport, gradient, pointer, peak, fade and expiry
checks. The guarded production dry-run precedes an atomic, non-forced main and
source-tag push through Workers Builds. If main advances, integrate and
revalidate; preserve any newer deployment containing this change. Verify hosted
version, source links, exact assets and CSP after rollout.


## 0.3.62 ranged material splatters and quieter deaths — prepared 2026-11-12

User explicitly authorized committing to main and deploying while preserving
concurrent worktrees. Integrated origin/main `eacec26`, retaining the near-death
vignette, foreground-wall alignment, melee material sprays and earlier work.
Immutable source tag: `cloudflare-online-v1.59`.

Confirmed ranged damage uses the same small, varied material splatters as melee.
Flesh, bone, slime, stone, spirit, fire, ice, plant, insect and water targets
shed their own material instead of a generic or spell-coloured impact stamp.
Projectile contacts expose their incoming path segment as well as their arrival
clock, so both incoming and outgoing hits follow native travel. A later native
path can update the direction before emission without reseeding. Reports for
one recipient and turn coalesce into one spray; launched fragments detach from
the actor. Misses, resisted/zero-damage casts and utility effects do not emit
body material without confirmed damage. Existing melee contact timing remains.

Death effects retain their profiles and material identities with 10% fewer
particles, 20% less launch speed and directional push, 10% less lift, 8% smaller
fragments/impact silhouettes, and 15% smaller floor pools with fewer flecks.
A before/after comparison across 240 material/actor profiles at 0.6 seconds
measured 9.95% fewer launch particles, a 19.79% smaller mean radius, and maximum
reach shrinking from 1.72 to 1.37 cells. Every sampled profile had a smaller
average footprint.

Pre-integration validation passed 2,626 unit tests with two optional-engine
skips and TypeScript. New regressions cover all ten ranged target materials,
five path directions, incoming player hits, late native paths, contact timing,
repeat-hit variation, duplicate/flash reports, cleanup and compact death bounds.
The renderer test retains moving-target projectile sizing and ordering while
checking material debris replaces the old impact stamp. The actual-art
projectile gallery now exercises confirmed-damage splatters. Optional engine
E2E reports 44 skips because engine artifacts are absent.

Integrated release validation passed TypeScript and 2,632 unit tests with two
optional-engine skips. The guarded production dry-run precedes an atomic,
non-forced main/source-tag push through Workers Builds. Fetch, integrate and
revalidate if main advances; preserve newer deployments containing this change.


## 0.3.63 stronger hit splatters and compact, snappy deaths — prepared 2026-11-12

Continues the user's authorized main/deployment workflow while preserving
concurrent worktrees. Based on origin/main `74786ec`, retaining ranged material
splatters, melee timing, the near-death vignette and all earlier changes.
Immutable source tag: `cloudflare-online-v1.60`.

Melee and ranged splatters now emit roughly 6–16 fragments with a six-CSS-pixel
minimum stamp instead of four. Samples across 24 repeated solid hits showed
32.6% more particles and 47.9% larger fragments. Direction, contact timing,
material identity, per-hit variation and the half-second lifetime remain.

Death effects now use substantially fewer fragments, less launch energy and
push, stronger drag, smaller pools with fewer flecks, and a 100 ms impact stamp.
Their motion settles 35% faster while drag restrains travel. Material-specific
lifetimes are now 0.65–1.3 seconds instead of 2–4.6 seconds. A before/after
comparison across 240 material/actor profiles at 0.3 seconds measured 37.4%
fewer launch particles and a 51.9% smaller mean radius; maximum sampled reach
shrank from 1.04 to 0.50 cells.

Validation passed TypeScript and 2,632 unit tests with two optional-engine
skips. Compactness checks cover ten materials, 24 profiles and three creature
heights at four points in the effect, bound particle centres to 0.7 cells and
require complete expiry by 1.31 seconds. Hit tests enforce the larger stamp and
updated count/size bounds while retaining material, direction, deterministic
redraw, duplicate-report and contact-clock checks. Optional engine E2E reports
44 skips because engine artifacts are absent.

The guarded production build/dry-run precedes an atomic, non-forced main/source
tag push through Workers Builds. Fetch and integrate again if main advances;
preserve newer deployments that already contain this tuning.
