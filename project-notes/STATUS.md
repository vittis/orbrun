# Project status

## 0.3.22 configurable 2.5D movement — deployed 2026-11-11

User authorized commit to main and production deployment. New immutable source
tag: `cloudflare-online-v1.19`. Adds confirmed movement tweens for all billboard
kinds, a synchronized following camera, and View settings for movement, duration
and easing. Defaults to 100 ms ease-out. Visual anchors and picking follow the
tween; fast travel has no animation queue. Teleports/level changes snap, and
Still/Auto reduced motion stop movement. Feature verification: 2,153 unit tests
passed / two optional-engine skips, 738 real Canvas checks, typecheck and build.
Forced TypeScript, release suite/build and ASSETS-only dry-run also pass.
Main and tag point to `ab1a9f5`; Cloudflare build
`4e3ba95d-5d66-4a85-9dbb-67108e9d435e` succeeded. Worker
`6e108e3a-538a-4dc8-8b68-c95c6035740a` serves 100% of traffic.
All 13 hosted checks pass, including the immutable source links, 0.3.22 notes,
strict CSP, proxy restrictions and all three JavaScript bundles matching local
bytes. Optional engine E2E reports 44 explicit skips. Evidence:
`evidence/release-0322-http-checks.json`. Release details: DEPLOYMENT.md.

## 0.3.21 original exposure and live animation — deployed 2026-11-11

User authorized commit to main and production deployment. App 0.3.21 uses
immutable source tag `cloudflare-online-v1.18`. LOS retains original atlas
brightness; small sprite-centered lights and feathered visibility masks
replace stretched wall-face lighting. Explicit animation On overrides the
device motion preference; Auto follows it. Animated sprites use smooth
subpixel sampling. Smaller damage numbers rise, overshoot and settle on entry.

Forced TypeScript, 2,128 unit tests/two optional-engine skips, production build
and ASSETS-only Worker dry-run pass. All 576 Canvas checks pass. The actual
GameScreen fixture verifies idle actor animation, On overriding reduced motion,
Auto/Still stopping motion and the CSS popup entrance. Optional engine E2E:
44 explicit skips.

Main and immutable source tag point to `a8c5fbb`. Cloudflare build
`1f87c358-94af-4863-91f5-a3b462b3faa4` succeeded. Worker
`086e982a-3e9c-4c7d-bf09-4ef4e0d12a3b` serves 100% of traffic. Thirteen
hosted checks pass; fonts and all three JS entry bundles match local bytes.
Browser verified 0.3.21 release notes and anonymous CBRG 2.5D spectating with
native floor colors, compact torch glow and the right-side character panel.
Evidence: `evidence/release-0321-*`. No gameplay or chat was sent.

## 0.3.20 smooth lighting and effects — deployed 2026-11-11

User authorized commit and production deployment. App 0.3.20 uses immutable
source tag `cloudflare-online-v1.17`. 2.5D LOS ambience is brighter; floors,
wall roofs/faces and masked standing art sample one continuous light texture.
Torch flicker and spell afterglows are smooth per-frame effects. Beam art is
thinned and plane-aligned without breaking connected segments; other ambient
VFX are quieter. Damage numbers use self-hosted Barlow Condensed Bold with
bounded type-specific animation, distinct acid/electric tones and still mode.

Validation: 2,120 unit tests pass / two optional-engine skips; forced
TypeScript, production build and ASSETS-only Worker dry-run pass. Optional
engine E2E: 44 skips. The Canvas suite has 576 checks, including 18 targeted
surface-light/beam checks. 14 animation/impact checks and the interactive
`/testbed/effects.html` preview pass. Production main and immutable source tag
point to `114c077`; build `fad70707-ac6d-4ef7-b4c7-3090e1926a8a` succeeded.
Worker `b49a55cf-3c28-454a-ba06-923fb45ff43c` serves 100% of traffic. Thirteen
hosted checks pass, including source/version/CSP, bundled font/license,
proxy restrictions and all three JS bundles matching the local build.
Live browser verified 0.3.20 and a brighter anonymous CBRG 2.5D dungeon with
no warning/error console logs. Evidence: `evidence/release-0320-*`.

## 0.3.19 2.5D refinements — deployed 2026-11-11

User authorized commit to main and deployment. App 0.3.19 uses immutable
source tag `cloudflare-online-v1.16`. Removes player halo bands and blue
memory shading in 2.5D, uses faint black fog, smooths and strengthens living
motion, reduces popup clutter, moves the character pane to the top right,
and enables right-click item descriptions in server menus.

Release validation: 2,118 tests pass / two optional engine skips; forced
TypeScript, production build and ASSETS-only dry-run pass. Optional engine
E2E: 44 skips. Prior feature checks include 558 Canvas checks, 14 animation/
impact browser checks, and desktop/phone layout checks with wrapped statuses.
Production main and source tag point to `76d8357`. Cloudflare build
`301f8794-e0bc-4738-ab5d-2e968ba3af73` succeeded; Worker version
`7cb1ac6d-32d5-4dcf-a350-215734799308` serves 100% of traffic. Hosted source
links, release notes, strict CSP and proxy restrictions pass; all three
production JS bundles match the validated local build byte for byte.
The live browser loaded 0.3.19 and an anonymous CBRG 2.5D game with the character
pane on the right and the nearby list below it. No console warnings/errors.
Evidence: `evidence/release-0319-http-checks.json` and
`evidence/release-0319-spectating.png`.

## 0.3.18 living dungeon — deployed 2026-11-11

Production main and immutable tag `cloudflare-online-v1.15` point to `6214854`.
Cloudflare build `08d707e7-ce5c-4287-80e0-1224450f9923` succeeded. The live entry
bundle matches the local production build byte for byte. Chrome verified
0.3.18 release notes, CBRG lobby and live spectating without console errors.

Includes shared colored lighting, warm LOS/cool memory, living creatures,
materials/clouds and impact rings in all views. Wound-status changes no longer
create a second damage popup. Reduced motion freezes animations; remembered
materials/creatures remain still. Feature notes: `LIVING_DUNGEON.md`.

Validation: 2,109 tests passed / two optional engine skips; forced typecheck,
production build and ASSETS-only dry-run passed. Optional engine E2E: 44 skips.
Real-browser checks cover animation/still mode and isolated impacts on desktop
and phone; all 504 existing raster checks pass. Hosted CSP, source tag,
allowed/prohibited proxy paths and offline-route restrictions pass.


## 0.3.17 visibility release — 2026-11-11

Implemented in worktree `60b1/dcss-client`, branch `codex/2-5d-presentation`,
rebased on production `97b49ee` (0.3.16), preserving combat feedback.
Prepared source tag `cloudflare-online-v1.14`. Server item cursors now share the upright sprite
frame; travel/stair/exclusion markers keep their ground position. Unexplored
space uses neutral dark mist, remembered artwork is more strongly dimmed, and
the player lantern and distance-based sprite spotlight are removed.
Environmental lava/portal/altar lighting remains.

Integrated release validation: 2,072 unit tests pass, 2 optional engine skips; forced TypeScript
check and production build pass. All 504 real Canvas pixel checks pass across
elevation/zoom/DPR/filtering, including marker placement, LOS contrast, fog,
seams and sprite sizes. Local preview has synthetic pickup markers on real
item art; no browser warning/error logs. Existing build warnings about JSON
import attributes and large chunks remain. User authorized commit and deployment. Worker dry-run passes (ASSETS only,
20.95 KiB). Optional engine E2E reports 44 skips. Live rollout verification
follows publication. No user game/account commands were sent.

## 0.3.11 renderer release — 2026-11-11

Prepared on fork `main`, based on production source `60ee664`, for the user's
requested commit and deployment. Source tag: `cloudflare-online-v1.8`.
Adds an independent Canvas 2.5D renderer through the shared Scene contract,
projection/animation settings, compass input, and temporary flat level maps.
Preserves the current controller, transport, fullscreen and opt-in first-person
prediction behavior. Production stays online-only with the existing strict CSP.

Prepublication checks passed: forced TypeScript rebuild, 2,023 unit tests
(two optional-engine skips), production build, Worker dry-run and diff checks.
The optional engine E2E lane reports 44 skips because no engine is built.

Test the release at Settings → View → Projection → Dungeon (2.5D), then Watch
a public game or play an existing character. Change Dungeon tilt, zoom and
animation; reopen Settings to check persistence. In a playing game verify all
eight movement directions, targeting with `f`/`x`, and `X` opening a flat level
map and returning to 2.5D when closed. Cycle back to First person (3D) to check
the existing view. No account or gameplay input is needed for a spectator smoke
check. The standalone `/testbed/dungeon.html` preview is development-only.

Current implementation uses confirmed positions without interpolating 2.5D
movement. Atmospheric effects and server flashes are supported; element-specific
combat animations and camera rotation are future work. Physical Odin controls
still require the user's hardware check. Live rollout is verified after push;
the following notes record earlier releases and retain their historical status.


0.3.10 is prepared and validated; production remains 0.3.9 until rollout.
New opt-in Settings / Controls / Predictive movement: complete visual step,
matching confirmation without restart, smooth correction, one speculative step,
conservative visible-floor eligibility. Default Off; all game state remains
server-authoritative. No command buffering or replay, no actual RTT reduction.
Full suite 2,005 pass / 2 skips, forced typecheck/build/dry-run pass; optional
engine E2E 44 skips. Source release tag planned: cloudflare-online-v1.7.


Release **0.3.9 is LIVE** at https://dcss-client.vittis.workers.dev.
Final source `d293a56bbade3e5ceeb80feb0fb74f0cecd2b570`, immutable tag
`cloudflare-online-v1.6`; build `13ee2d51-d14c-4752-8451-452de0d9b3c9` succeeded.
Worker `23664951-4aa6-472e-ab2a-a88cd9c4889b` serves 100% of traffic.
Live entry matches local build byte for byte; 0.3.9 home and CBRG spectator
rendering verified. Canonical /connection-check returns HTTP 200 + noindex +
strict CSP. The .html URL redirects there. Initial v1.5 rollout had a diagnostic
HTTP 404 classification issue; corrected in v1.6 without further gameplay changes.

User reports 0.3.8's move–pause–move animation. Confirmed cause: preview stops at
0.18 tiles after 100 ms, waits for the reply, then the remaining move is squeezed
into 60 ms. Removed that entire preview and wait-subtraction path, restoring the
0.3.7 continuous confirmed glide. Input-before-render and receipt-timed first-frame
motion remain. No new commands or authoritative position changes.

Added `/connection-check.html`: eight spaced anonymous WebTiles lobby requests
on a separate connection, without login, account state or gameplay. Supports
bundled servers only; five-second timeout, cancel, and hidden-page cleanup.
Use it on Odin Wi-Fi versus hotspot, compare to game `?perf` response times.
The production app already sends commands directly over WSS without a timer.

Desktop CBRG observations: Node WebSocket control p50 37.9 ms (proxy may answer),
lobby response p50 42.1 ms; Chrome lobby median 38 ms, range 35–74 ms. This is
not Odin Wi-Fi or game-turn timing, so neither Wi-Fi nor server processing is
proven to be responsible for the remaining ~150 ms game response. Official
WebTiles code flushes directly; server TCP/turn processing changes require its
operator. No server configuration changed or credentials/game commands used.

Validation: 1,960 tests pass / 2 optional engine skips, forced TypeScript check,
production build, Worker dry-run. Added delayed-response glide regressions and
connection-check success/cancellation/timeout/closure coverage. Evidence:
`evidence/release-039-connection-check.png`, `evidence/release-039-latency.json`.
0.3.8 rollback: `853a85bb34c8c87a04b04ba0dd0f497487d52188`, tag v1.4, Worker
`ee1bd592-271d-4865-9bfa-f645f31ed5ea` (contains the reported choppiness).
The Phase 0 snapshot below is historical.

Updated: 2026-11-11 (America/Sao_Paulo). **Read this first when resuming.**

- Phase: **0 accepted with explicit exceptions** — foundation, investigations and roadmap complete; not a green release baseline.
- Current task: Phase 0 closed; next session starts Phase 1 stabilization (P1-001).
- Repository: [vittis/orbrun](https://github.com/vittis/orbrun), branch `chore/phase-0-foundation`; upstream baseline `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`. origin and upstream verified. GitHub authentication blocker resolved by approved keyring access.
- Recommendation: full fork through first top-down milestone; Canvas first, world-coordinate input/context slice before broad refactoring; Pixi benchmark-gated; optional 2.5D. See DECISIONS.
- Changes: project-notes only; upstream application/tests/lockfile/licenses unchanged. Four independent investigations, two critiques and final independent review complete. Initialization notes are a local Git checkpoint; branch is not pushed.
- Baseline: locked install, typecheck and build PASS; default tests FAIL (1 empty optional-engine suite, 1,836 individual passes); E2E FAIL (6 missing-engine failures/38 skipped). Partial engine-free command PASS (130 files/1,836 tests); focused controls PASS (11 files/388 tests).
- Runtime: shell, server picker, CDI anonymous stable spectating with real 3D/tiles/HUD and minimap, keyboard Escape, Canvas/Three room testbed PASS smoke. Primary 2D gameplay is hidden upstream and untested.
- Active limitations: no engine artifacts/emsdk/PyYAML/JSPI Node; no physical controller/available browser gamepad injection; no authorized test credentials; cross-browser/server/reconnect coverage incomplete. These do not block local Phase 1 work.
- Release/account-bearing gates: remote gamedata execution, proxy destination/redirect/resource controls, malformed message validation/transport, dependency triage, exact source/asset provenance. See RISKS.
- Pending decisions: specific safe gamedata architecture and hosted server policy (Phase 1); explicit top-down interaction-target UX (Phase 2); measured renderer choice (Phase 3); any 2.5D scope (Phase 4). No user decision needed to continue local stabilization.
- Next actions: P1-001 no-engine test gating; P1-003/004 loader/proxy security; P1-005 frame validation; P1-007 tools and P1-010 command characterization. No major UI rewrite authorized by Phase 0.

## Phase 0 acceptance ledger

| Requested criterion | Status | Evidence / explicit exception |
|---|---|---|
| Local Orbrun with exact upstream commit | PASS | BASELINE source identity/history |
| Fork and remotes documented | PASS | Actual GitHub fork verified, origin/upstream configured |
| Reproducible dependency install | PASS | npm ci exit 0, unchanged lockfile |
| Tests/typecheck/build executed and recorded | PASS execution; tests FAIL | Required commands run; upstream no-engine harness defect explicitly accepted as Phase 0 exception, P1-001 remains open |
| App launched and browser load checked | PASS | Local loopback browser shell and live scene |
| Public connection/spectating tested where possible | PASS limited | CDI 0.34 anonymous spectate; no claim about every official server |
| Controller behavior tested to supported extent | PASS synthetic; hardware BLOCKED | 388 focused tests; physical/gamepad-browser exception to later P2-003/P5-001 |
| Architecture/package boundaries | PASS | ARCHITECTURE + reviews |
| Independent agents / critical feedback | PASS | Four investigations, two explicit critiques |
| Alternatives compared/recommendation justified | PASS | A/B/C matrix + ADR-001; limited official source review disclosed |
| Security/license inventory | PASS inventory | RISKS and safe probes; fixes/provenance verification are unfinished release gates |
| Full multi-phase roadmap/prioritized backlog | PASS | MASTER_PLAN + BACKLOG |
| Resumable documentation | PASS | Eleven notes, reports, evidence, runbook and all relative links checked |
| Final independent review | PASS | No blocking finding; P1-007 wording corrected, closure state reconciled; AGENT_REPORTS |

Additional explicit exceptions: real-engine E2E is BLOCKED by documented prerequisites and FAILS as invoked; authenticated gameplay/save/rc/stat verification BLOCKED without authorized test account and hardening; controlled reconnect, all-server/browser matrix and primary 2D gameplay NOT TESTED. Phase 0 completion with these exceptions must never be described as a fully passing application or controller release.

## Local service / next-session handoff

Development server was left running at [127.0.0.1:5173](http://127.0.0.1:5173/) (observed PID 29880, log `/private/tmp/dcss-dev.log`). Check with `lsof -nP -iTCP:5173 -sTCP:LISTEN` before restarting; stop its terminal with Ctrl-C, or after verifying ownership use `kill 29880`. PIDs can change. Browser test tab was closed. No deployment, initialization-branch push or background automation was performed. Run `git log -1 --oneline` and `git status --short` for the checkpoint and cleanliness.

Cloudflare feasibility follow-up: existing Worker/static-assets packaging passes `npm run deploy:check` (dry-run only). Dashboard inspected read-only; no Orbrun deployment or engine service present. Online-only deployment needs removal/handling of inherited ENGINE binding/offline UI plus exposure gates above. Findings appended to SESSION_LOG; no deployment/config changes made.
