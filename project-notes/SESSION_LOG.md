# Session log

## 2026-11-11 — 0.3.9 smooth movement correction and connection diagnostics

- User reports two-phase forward motion after 0.3.8. Confirmed exact cause in
  our implementation: the bounded preview saturates at 100 ms, then waits for
  confirmation; the rest is completed in 60 ms. Prior first-motion/landing tests
  measured responsiveness but missed this mid-step plateau.
- Removed 0.3.8 preview/latency-subtraction code and its obsolete tests. Restored
  the camera/runner/game presentation paths from verified 0.3.7, preserving its
  input scheduling and receipt-time improvements. New integration regressions
  test 150/250/350 ms replies: no pre-response movement, strictly advancing
  confirmed glide, full 100 ms first-step duration, exactly one command.
- Checked direct client WSS send path: no game-command delay timer. Read official
  DCSS ws_handler/process_handler sources at db4a5d7c48a0f64f07877f388aa74329e1e89d15.
  Lobby requests flush directly; gameplay buffers flush on the engine marker.
  No inference about deployed CBRG TCP configuration or game CPU from this alone.
- Anonymous host-only probe (8 samples): CBRG transport ping p50 37.9 ms, WebTiles
  go_lobby p50 42.1 ms. No login or active game, so go_lobby cannot stop a game.
  Control ping may be answered by a proxy; lobby reply reaches WebTiles.
- Added bundled-server-only /connection-check.html with a separate anonymous
  connection and eight 300-ms-spaced go_lobby requests. It closes after completion,
  timeout, cancel, socket closure or backgrounding. No account/game state read.
  Chrome validation: lobby median 38 ms, fastest 35, slowest 74. Device-side
  comparison is needed to separate Odin network conditions from turn processing.
- Validation: 1,960 tests pass / 2 optional engine skips; forced tsc, production
  multi-page build, Worker dry-run pass. Seven diagnostic tests cover bounded
  requests, unrelated traffic, cancellation, timeouts and socket closure. The
  first test run exposed a missing close-event payload in its fake; corrected.
- Prepared version 0.3.9, immutable source tag cloudflare-online-v1.5. No claim of
  reduced actual network delay; publication and live verification follow.

## 2026-11-11 — 0.3.8 online movement anticipation

- Follow-up original screenshots show online CBRG (`/play/cbrg/dcss-git`),
  response p50 147–150 ms and one p95 343 ms. User confirms offline comparison
  explained the difference, then authorizes the recommended responsiveness tweaks.
- Added a presentation-only 0.18-tile preview, capped to one direction without
  renewing its timeout on held inputs. Visible ordinary empty floor only; any
  visible monster, special terrain, item/cloud, status effect or prompt disables
  it. Diagonals cannot peek around blocked corners. Offline/2D/reduced motion
  are excluded. Missing replies return after 350 ms plus an 80 ms ease back.
- Runner provides a direction hint through the existing synchronous send path;
  no new commands, input queue or change to authoritative position. Readiness
  markers reconcile after scene flush so a confirmation in the same response
  consumes the preview before refusal handling. Outstanding input prevents fresh
  previews after timeout. Wrong-direction confirmations return through the real
  cell; level changes/teleports clear it.
- Attributed single online manual steps reduce their remaining camera glide by
  time spent awaiting confirmation, bounded to 60 ms. Unattributed/batched paths
  and monster timing remain unchanged.
- Added 37 regression tests, including 60/120 Hz first-frame progress, repeat and
  timeout limits, refused/corrected moves, modes/hazards/reduced motion, command
  count and response-batch ordering. Updated existing game-movement fixture with
  its missing server descriptor after the first full run exposed the omission.
- Final local suite: 1,987 passed / 2 optional engine skips. Forced tsc/build and
  Worker dry-run passed; optional engine E2E explicitly skips all 44 tests.
- Chrome real-renderer camera simulation: preview visible at 4 ms, maximum offset
  0.18 tiles before simulated reply at 154 ms; landed 67 ms after the reply.
  Screenshot evidence/release-038-preview.png. Temporary testbed removed. This
  measures desktop presentation, not physical Odin or actual online response time.
- Prepared package/changelog 0.3.8 and source links cloudflare-online-v1.4.
  Publication and live smoke verification follow.
- Rollout verified: source `853a85bb34c8c87a04b04ba0dd0f497487d52188`, tag
  `cloudflare-online-v1.4`; build `b5325d8f-088a-4e49-9ad0-f84ec920bd0b`
  deployed Worker `ee1bd592-271d-4865-9bfa-f645f31ed5ea` at 100% traffic.
  Live home shows 0.3.8; entry bundle matches local build byte for byte, strict
  CSP/source tag verified. CBRG 0.34 spectator scene rendered with textures, HUD
  and minimap. Saved release-038-live.png and release-038-spectating.png. No
  gameplay commands or chat sent. Browser reused its existing account state.
- Refused-step Chrome simulation returned exactly to the original position
  83 ms after refusal, first visible motion 3.2 ms. Actual network/server delay
  remains unchanged; physical Odin assessment is still required.

## 2026-11-11 — Odin screenshot evidence

- Inspected all 13 supplied photographs; user identifies original by its Chrome
  bar. All legible original URLs are `/play/offline/dcss-git?perf#Player`.
  Checked route/server/session/local connection code: this selects a local
  WebAssembly engine, not an online DCSS server. The generic overlay `net up`
  and `rtt` labels also apply to that local connection.
- Original representative interval p50/p95 16.5/17.0 ms, response 7.6/8.0 ms,
  time-to-draw 19.1/20.6 ms. Fork representative interval 8.3/8.6 ms, response
  152/235 ms, time-to-draw 164/244 ms; other fork windows show response
  169/263 and 205/274 ms. Idle zero-sample captures excluded.
- Evidence explains the captured difference as local-engine versus online
  response latency, consistent with immediate camera motion. RTT includes
  transport/server/application response work; it is not a pure network ping.
  No measured rendering bottleneck or justified additional production fix.
- Updated investigation evidence/status only. No application edit, test run,
  commit, push or deployment in this screenshot review. Request comparison
  with original explicitly connected to the same online server before further
  latency changes. Restoring offline support is a separate scope decision.

## 2026-11-11 — Remaining Odin-only latency investigation

- User says 0.3.7 may help but remains slower than original on Odin, while desktop
  keyboard matches original. Clarified that both comparisons use installed apps
  and touchscreen movement also lags. This invalidates a controller-only diagnosis.
- Investigated independent command polling; discarded the uncommitted experiment
  after the touch clarification. No polling or gameplay production changes remain.
- Added offline replay tools: `node_modules/.bin/vite-node tools/perf/scene-replay.ts`
  and `node_modules/.bin/vite-node tools/perf/transport-replay.ts`. Only pinned local
  fixtures and trusted repository history are executed for the upstream reference.
  Seven alternating-order runs after warm-up: 425-message/1,161-cell scene replay
  medians 84.43 ms upstream / 79.66 ms current. Transport 265,624-byte recording:
  1.147 / 1.411 ms per replay, same dispatch count. These desktop measurements
  do not establish device performance or explain a perceptible input pause.
- Tested native versus shared frame scheduling in Chrome at observed ~120 Hz,
  with 0/12/22 ms controlled callback work for 1.5 seconds per case. Frame counts
  and p50/p95 gaps were comparable. Removed temporary testbed afterward; retained
  result data in evidence/odin-latency-investigation.json. No scheduler change.
- Asked for Odin interval/rtt/ttd p50/p95 values from each app's existing ?perf
  overlay, and whether local camera turns/drags also lag. No answer yet. Ensure
  any on-device comparison preserves installed/display mode. ADB is not available
  on this host. No physical measurements, identified root cause, additional fix,
  commit, push, or deployment in this follow-up so far.
- Follow-up answer: camera turns/drags are immediate; forward steps lag. User
  will attach the requested performance screenshots next. Narrow the comparison
  to server-response latency and confirmed-step scene work, rather than general
  controller/display responsiveness. Await screenshots before choosing a fix.

## 2026-11-11 — Authorized 0.3.7 publication and launch fullscreen

- User explicitly requested deploying 0.3.7 and making fullscreen automatic on
  every launch. Added launch/resume requests plus capture-phase touch, mouse and
  keyboard fallback when browser user activation is required. No input is consumed,
  no setting needs persistence, pending requests are deduplicated, and explicit
  fullscreen exits remain possible until the app is visited again.
- Added seven fullscreen lifecycle tests. Updated immutable source links to
  `cloudflare-online-v1.3`. Final prepublication validation: 1,950 tests passed,
  two optional-engine tests skipped; forced TypeScript build, production build,
  Worker dry-run, and diff whitespace checks passed. Original latency evidence
  and physical-device limitation remain as documented below.
- Verified remote main is the previous deployed code `970cdda`; v1.3 is unused.
  Publishing via the configured main-branch Cloudflare build pipeline next.
- Rollout completed: commit `2aada9317dedd33108d675466890068a9cebb488` pushed
  atomically to main/working branch with `cloudflare-online-v1.3`. Cloudflare
  build `a2664106-0498-4bb8-897d-5ed9ec3504ca` deployed Worker version
  `73ea14db-a8a4-478d-a859-c0fc2e5ec793` at 100% traffic (02:01 local time).
  Root/source/CSP checks passed; live entry JavaScript matches the local build
  byte for byte. Chrome showed 0.3.7 and rendered CBRG anonymous 0.34 spectating
  without console errors. Screenshots saved under evidence/release-037-*.png.
  No gameplay commands, account credentials or chat messages were sent.
  Physical Odin verification remains with the user. Post-rollout notes do not
  advance production main or the immutable source tag.

## 2026-11-11 — Odin 3 input latency follow-up

- User reports a perceptible movement delay with analog and d-pad, and confirmed
  both this fork and original Orbrun use online play on the same DCSS server.
- Traced GamepadInput -> GameScreen.pad -> Runner -> Session -> RemoteConnection:
  first direction events send synchronously; repeats have intentional hold delays;
  commands connect directly to the selected server, not through Cloudflare.
- Downloaded original public app bundles/source maps read-only. Deployed
  `game-DtsQQ4du.js` and `index-Dkqmhn4R.js` contain game/runner/camera/main sources
  identical to the fork baseline. Fork-specific controller changes correct Android
  mapping; transport changes validate/bound traffic. No measured evidence yet
  attributes the whole physical-device difference to a particular fork change.
- Removed two concrete frame waits: a shared FrameScheduler polls controls before
  rendering regardless of registration order and admits a screen woken by input
  into that same frame; Session records scene-update receipt time so camera and
  monster motion progress on the first eligible frame instead of starting at zero.
  Animation time is bounded to the current frame interval, and frame dt cannot
  become negative when a same-frame wake follows the browser's rAF timestamp.
- Added 60/120 Hz ordering/wake/repeat/cancellation tests, first-frame camera and
  monster synchronization tests, stale/future clock bounds, and a session test
  proving unrelated UI messages cannot postpone the movement timestamp.
- App/lockfile/changelog prepared as 0.3.7. An initial Unreleased changelog heading
  failed three existing What's new tests; corrected to the app's numbered-release
  format. Final `npm test`: 134 files / 1,943 tests passed, one optional engine
  file / two tests skipped. `npm run typecheck`, `npm run build`, and
  `git diff --check` passed. Build retains the existing >500 kB chunk advisory.
- No deployment, push or commit performed. Production remains 0.3.6. Before
  publication, update immutable source-release links/tag according to DEPLOYMENT.
  Physical Odin validation remains pending; automated timing tests are not a
  hardware latency measurement or proof that the entire reported difference is gone.

## 2026-11-11 — Phase 0 initialization

- Read the complete user initialization brief from its attachment.
- Inspected `/Users/vittis/dev/dcss-client`: empty directory, not a Git repository; no parent AGENTS.md found.
- Confirmed Node v24.11.1, npm 11.6.2, Git and GitHub CLI availability.
- `gh auth status` exited 1: configured `vittis` token invalid. Proceeding with local clone; hosted fork remains blocked.
- Initialized STATUS.md and this log before source acquisition. No application code changed.
- Acquired complete Orbrun history at b65fc15ca1b58969cb061a7749db8cbdb92b8f4d after sandbox DNS retry. Copied into workspace without overwriting project notes; Git metadata copy/branch/remotes required approved execution.
- Established chore/phase-0-foundation and upstream remote. No origin because no authenticated hosted fork.
- Read README, CONTRIBUTING, ABOUT, INSTALL, root package metadata, .npmrc and .gitignore. Upstream ignores AGENTS.md; no repository AGENTS.md found.
- Launched independent architecture, controls and security/licensing agents (three concurrent slots); build investigator queued.
- Started locked npm ci with isolated temporary npm cache. Application remains unmodified.
- npm ci passed (116 added / 127 audited); lockfile unmodified. npm audit returned 10 vulnerable package nodes; security reviewer triaging.
- Unmodified npm test failed at suite registration despite 1,836 passing tests; missing local WebAssembly engine causes empty describe.each in offline engine suite.
- Typecheck and production build passed; build reports >500 kB chunk warnings.
- npm run e2e failed (6 failed, 38 skipped) because spell-bar/helpdump tests assume absent engine/dist/stable/engine.json. No production changes made to conceal baseline failures.
- Dev server first launch hit sandbox EPERM; approved retry binds loopback only. Browser tool connected for runtime verification.
- Browser validation: local shell, Accounts/server picker, login form without submission, keyboard Escape back, CDI anonymous lobby and active 0.34 spectating. Live textured 3D scene, Canvas minimap, HUD/messages/level changes observed; queried console warning/error logs empty. No credentials/chat/gameplay commands sent.
- Local room testbed rendered Canvas map and Three scene; Face south changed yaw to 180 degrees. Saved two small screenshots under project-notes/evidence. Physical and browser-emulated gamepad testing unavailable; unit inputs remain separate.
- Received all four reports. Controls independently passed 11 files/388 tests; build reviewer reproduced both failures and corrected early E2E attribution (spell-bar/helpdump, stable engine). Updated baseline accordingly.
- Architecture and controls agents challenged proposal: current state is not strictly single-writer; preserve scene only provisionally; test complete direction/target/context slice before broad extraction; live spectate is remote execution, not isolated fixture work. Integrated into architecture/ADRs/roadmap.
- Security reviewer safely demonstrated global gamedata execution, internal-destination route acceptance using mock fetch and a null-batch exception. Copied portable mock-only probe into evidence and reran exit 0. Recorded licensing provenance uncertainties without claiming specific infringement.
- Rechecked GitHub authentication with approved keyring access: succeeded. Original invalid-token result was sandbox-only. Existing vittis/orbrun lookup failed; created requested hosted fork, added origin and fetched it; verified parent Caeous/orbrun. Earlier hosted-fork blocker is resolved.
- Ran explicit partial engine-free test selection: 130 files/1,836 tests passed, exit 0. Default command remains failed; no source/test/lockfile modifications used to hide failures.
- Wrote README, ARCHITECTURE, DECISIONS, MASTER_PLAN, RISKS, BACKLOG, RUNBOOK, AGENT_REPORTS; reconciled BASELINE and STATUS; retained four detailed reports. Final independent review and local documentation commit pending.
- Final independent reviewer found no blocking architecture/security documentation defect; checked source equality, notes/links and both screenshots without claiming a separate browser run. Corrected P1-007 acceptance wording from "baseline remains passing" to "no new failures, default green after P1-001" so the known failing baseline is not contradicted.
- Root final checks: all eleven required notes present, relative Markdown links resolve, tracked source diff against b65fc15 empty, no credential-pattern matches in notes. Development server remains loopback-only at 127.0.0.1:5173 (observed PID 29880); temporary browser validation tab closed. No background automation created.
- Final closure: Phase 0 accepted with explicit engine/hardware/authenticated/compatibility exceptions. All required baseline commands executed, failing commands remain documented. Final review report retained; STATUS, BACKLOG and MASTER_PLAN reconciled. Next session begins P1-001 and source-backed security stabilization; no UI/renderer rewrite begun.
- Local initialization checkpoint contains only project-notes (11 root notes, 5 independent reports, 2 screenshots and 1 safe probe). Branch is not pushed; hosted fork contains upstream history. Verify checkpoint with git log -1 and cleanliness with git status --short. Development server left on loopback for local use.

## 2026-11-11 — Cloudflare deployment feasibility

- User asked whether deployment to Cloudflare would be straightforward and supplied an open Chrome dashboard as context. Read-only dashboard inspection confirmed Workers & Pages access and an existing workers.dev subdomain; no Orbrun or orbrun-engine service listed. No Cloudflare application, permissions or deployment changed.
- Inspected root wrangler.jsonc and apps/orbrun/worker/index.ts: existing Worker serves static build, gamedata/morgue proxy, optional event counts and /engine routes. Config requires ENGINE service `orbrun-engine` and EVENTS analytics dataset. Static-only upload is insufficient for current cross-origin gamedata flow.
- Ran npm run deploy:check (Wrangler deploy --dry-run): bundled 93 asset files and 16.25 KiB Worker (5.27 KiB gzip), exit 0; log-location sandbox EPERM reported. Repeat with `WRANGLER_LOG_PATH=/private/tmp/dcss-wrangler-readiness.log WRANGLER_SEND_METRICS=false npm run deploy:check` passed exit 0 without the log-write error. Dry-run validates local packaging, not remote binding existence, permissions or deployed runtime.
- Deployment recommendation: online-only Worker initially; unique fork name/source URLs, remove offline binding and handle disabled offline routes/UI, decide whether to omit analytics, then address documented proxy/loader exposure gates. Git build root repository `/`, build `npm ci --include=dev && npm run build`, deploy `npx wrangler deploy`; these settings already appear in upstream config and match current Cloudflare documentation. No main-account credential or public-release safety claim made.

## 2026-11-11 — Authorized online Cloudflare deployment

- User authorized implementation/deployment, completed GitHub login in Chrome, and explicitly approved a dedicated Cloudflare build token after automatic approval review blocked credential creation. No credentials were read or committed.
- Removed hosted engine/analytics bindings; production server policy is bundled HTTPS/WSS only. Preserved development workflows and inherited first-person presentation.
- Replaced remote AMD execution with bounded Acorn parsing and locally implemented accessors/flag decoding. Pinned fixture parity plus current CDI stable/trunk modules passed. Added Acorn MIT notice.
- Hardened Node/Worker proxies (allowlist, no redirects, bounded time/bytes/concurrency/cache), validated Worker cache destinations before lookup, normalized query-free keys. Added malformed-wire/resource-limit coverage and explicit Session load failure handling.
- Default full suite before final Session edits: 132 files / 1,912 tests passed, 2 engine skips. Optional E2E: 44 explicit engine skips, no real-engine gameplay claim. Typecheck/build passed; Worker dry-run20.86KiB, onlyASSETS binding.
- Production preview connected to CBRG (Brazil) and anonymously watched a live 0.34 game with rendered textures, HUD, minimap and changing messages. No login, chat or gameplay commands sent.
- Full audit retains ten development-tool advisories. Production-only audit must override repository include=dev: npm audit --include=prod --omit=dev; this reported zero.
- Fork source links target cloudflare-online-v1 release tag, with upstream credit retained. Corrected unsupported blanket tile-art CC0 assertion; provenance inventory remains incomplete, no specific infringement established.
- Deployment settings prepared in Chrome: vittis/orbrun, dcss-client, root/, pinned Node24.11.1, install/typecheck/test/build pipeline, npx wrangler deploy, preview builds off. Final commit/push and hosted smoke checks pending.

- Final integrated suite after Session changes:1,916 passed/2skipped. Independent release review caught unsafe-inline CSP permitting server-dialog handlers; removed it, externalized About controls as /site-controls.js, added frame-src none and script-src-attr none.18 site/analytics tests, full typecheck/build and final dry-run passed (96assets,20.86KiB Worker).

- Published initial source31bfef3/tag cloudflare-online-v1. Cloudflare build a56e43d7 failed before deployment: clean TypeScript consumers lacked allowImportingTsExtensions (TS5097); previous incremental local checks missed it. Moved the setting to shared base (all projects emit declarations only). Kept v1 immutable, updated source links for corrective release cloudflare-online-v1.1, and forced full typecheck.

- Corrective source8fe675d/tag cloudflare-online-v1.1 pushed to main; automatic Cloudflare build af20b64e passed install, clean typecheck, full tests, Vite build and Wrangler deploy. Live Worker version d62c2edf-0b19-4bb5-940b-a3c9fb99a9d5 at https://dcss-client.vittis.workers.dev.
- Hosted checks passed: strict script/frame CSP, immutable source offer, external About JS MIME+interactive slider, license notice, rejected unlisted proxy/offline paths, real CDI enums and CBRG0.34 anonymous rendering. Screenshot and sanitized HTTP evidence retained. Python's local certificate store failed; Node's verified TLS fetch succeeded without disabling validation.
- No main-account login, new character, chat, save/rc mutation or physical-controller test performed. Production-only runtime remains first person and bundled-server only. Documentation follow-up stays off production main to avoid a redundant deployment.

- Initial 0.3.9 rollout: c057b2b / cloudflare-online-v1.5, build
  fb70ba69-80a2-4a3d-abd8-a92b33a068e7, Worker 14f04cc1-9dfb-4f15-97ab-f03103070b2c.
  Live entry matches local. Hosted smoke exposed Cloudflare's .html-to-extensionless
  redirect: diagnostic rendered but our route classifier set HTTP 404 at the
  canonical /connection-check URL. Added that exact route and test coverage;
  source links advance to immutable v1.6, retaining v1.5 unchanged. App version
  remains 0.3.9; no further gameplay code changed.

- Final 0.3.9 rollout verified: d293a56bbade3e5ceeb80feb0fb74f0cecd2b570 /
  cloudflare-online-v1.6. Build 13ee2d51-d14c-4752-8451-452de0d9b3c9 succeeded;
  Worker 23664951-4aa6-472e-ab2a-a88cd9c4889b at 100% traffic. Canonical
  /connection-check HTTP 200, noindex and strict CSP. Live main-D5W5a3b2.js
  matches local validated build. 0.3.9 home and CBRG spectating rendered.
- Route correction validated with 20 focused site/Worker/Markdown tests, forced
  tsc/build/dry-run and hosted pipeline. Optional engine E2E: 44 skips.
  Live diagnostic completed at 43 ms median on desktop before the route-only
  correction; actual Odin game latency remains unmeasured by this new check.
  User should compare Odin CBRG Wi-Fi/hotspot results with game response timings.


## 2026-11-11 — 0.3.10 predictive movement

- User requested conservative client-side movement prediction with correction.
  Added an opt-in Settings / Controls / Predictive movement toggle, default Off.
- A plain manual step sent by the real session can animate its entire 100 ms
  path immediately. Camera eye coordinates are speculative; camera grid position,
  player state, map, minimap, targeting and game results remain authoritative.
  Matching confirmation preserves the exact curve/deadline. A refused step eases
  back; mismatched movement returns via the source tile before the real path.
- Separate PredictiveMovement coordinator gates plain online 3D movement to
  visible ordinary floor, with no visible monsters, status effects, occupied
  cells, hazards or diagonal occluding corners. At most one predicted step.
  Input bookkeeping never generates, queues, replays or drops game commands.
- WebTiles has no per-input sequence acknowledgements. Command-ready boundaries
  and actual position/hops reconcile the visual step; ambiguous outstanding
  commands suppress new predictions. Missing replies return the eye after
  1.5 seconds without freeing outstanding-command bookkeeping. Menus/prompts,
  disconnect, new games, level changes, teleports and setting changes cancel it.
- Full suite: 2,005 passed, 2 optional engine skips. Forced TypeScript check,
  production build and Worker dry-run passed. Optional engine E2E: 44 skips.
  Tests cover 30/75/150/250/350 ms replies, exact curve preservation, refusal,
  unrelated messages, repeated/different inputs, coalesced hops, later turns,
  teleport/level transitions, timeout/late reply, unsafe tiles and preferences.
- No actual server latency reduction, server configuration changes, game commands
  or Odin hardware measurements. Prediction can still visibly correct a wrong
  guess and a long reply can leave a pause between complete steps.


## 2026-11-11 — 2.5D item markers and visibility

- The user's screenshot matches the separate active 2.5D worktree at
  `/Users/vittis/.codex/worktrees/60b1/dcss-client`, rather than the chat's older
  `/Users/vittis/dev/dcss-client` checkout. Applied changes to the matching
  renderer branch `codex/2-5d-presentation` on `956681d`; left the older checkout
  unchanged. Worktree writes and checks used approved sandbox escalation.
- Exposed the server cursor tile separately among SceneCell icons, preserving
  the original icon list for existing renderers. The 2.5D renderer uses the
  item sprite's anchor for that cursor, leaving other badges on the ground.
- Replaced the blue unknown-space fill with neutral world-anchored dark mist.
  The fog uses no hidden terrain data and stays static, preserving idle sleep
  and reduced motion. Memory tiles/art keep 44% of ambient brightness plus
  their existing subtle fog; visible LOS stays uniformly lit.
- Removed player light emission and distance falloff for upright art. Existing
  environmental emitters and their occlusion remain covered by regressions.
- `npm test`: 138 files pass / 1 optional file skipped; 2,034 tests pass /
  2 optional engine skips. `npm run typecheck -- --force` and `npm run build`
  pass. Build retains JSON import-attribute and chunk-size warnings.
  `git diff --check` passes. Local browser `/testbed/dungeon-checks.html`:
  504/504 pixel checks pass (162 new marker/LOS/fog checks, 342 existing).
  Preview `/testbed/dungeon.html` visibly shows aligned green item frames,
  darker memory and textured unknown space; no warning/error browser logs.
- Pixel-test samples avoid the intentional screen vignette; synthetic cursors
  use a wider stroke so sub-texel atlas sampling does not obscure placement.
  Production cursor artwork remains server supplied. No commit, push,
  deployment, authenticated session or gameplay commands performed.


## 2026-11-11 — Authorized 0.3.17 publication

- User requested commit and deploy. Committed the visibility fixes and rebased
  the new commit on production `97b49ee` (0.3.16), retaining all combat-popup
  work. Prepared app 0.3.17 and immutable tag `cloudflare-online-v1.14` with
  matching public source links, changelog and lockfile metadata.
- Integrated checks: `npm test` 2,072 pass / 2 optional engine skips (141 files
  pass, one optional file skipped); forced typecheck, build and Worker dry-run
  pass. Worker is 20.95 KiB with ASSETS only. Optional engine E2E 44 skips.
  Local browser real Canvas checks remain 504/504. Build retains its existing
  JSON import-attribute and chunk-size warnings.
- Main and source tag are published atomically. Live deployment verification
  is recorded after rollout, without advancing main for documentation alone.


## 0.3.17 live verification — 2026-11-11

- Production source `896dcfc3945e75cb7ff299c6331f191acb0dcbd5`, immutable
  `cloudflare-online-v1.14`. GitHub main and source tag point to that same commit.
- Workers Builds `f177b373-2ddb-4bdf-8a05-72efc41040c0` completed successfully.
  Worker `7a3baecf-4bd5-4b3c-842b-8024ccfcc183` serves 100% of traffic,
  deployed at 16:50:53 UTC (13:50:53 America/Sao_Paulo).
- Public home shows 0.3.17. Root, About and What's New return 200 with strict
  CSP and v1.14 source links. Main, shared renderer and gameplay JavaScript
  bundles match the validated local build byte for byte. Allowed versioned
  gamedata returns 200; an unlisted loopback proxy destination returns 404.
- Browser loaded CBRG's public lobby and anonymous live 2.5D spectating with
  textured terrain/HUD and no warning/error logs. The observed player had a
  character status popup open over part of the map; no commands were sent.
  Individual highlight/fog/LOS regressions are covered by 504 local real Canvas
  pixel checks and the deployed asset hash comparison. HTTP evidence:
  `evidence/release-0317-http-checks.json`.
- Local Python's bundled CA store could not verify HTTPS; repeated the HTTP
  verification with system curl and normal certificate checks, which passed.
  No certificate verification was disabled.
- Post-rollout notes are committed only on the working branch; main and the
  immutable source tag stay on the verified code release, avoiding a second
  production build. Previous production 0.3.16 Worker for rollback:
  `ac9eeef0-29a4-45d2-9296-94b131e22363`.
