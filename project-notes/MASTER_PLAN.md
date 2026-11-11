# Master implementation plan

Updated 2026-11-11. Scope: official-server, controller-first top-down client. Server authority is non-negotiable. Offline WASM is inherited optional functionality, not a substitute for online protocol validation. Complexity is relative engineering effort (S/M/L/XL), not a calendar estimate. Backlog IDs below define dependencies and acceptance checks.

## Phase 0 — Foundation and baseline (M; accepted with explicit exceptions)

**Objectives:** preserve upstream history; evaluate A/B/C foundations; establish reproducible unmodified local checks; observe runtime; document risks and a resumable plan.

**Dependencies:** Git/network, supported Node/npm, browser surface. Hosted fork additionally requires authenticated GitHub access. Hardware/login/WASM are explicitly limited below.

**Tasks/deliverables:** P0-001–P0-005: fork/remotes/branch; locked install and baseline; architecture/control/build/security investigations; two critiques plus final independent review; all eleven project notes and small evidence artifacts. No UI/renderer rewrite.

**Validation:** identify exact source SHA; verify tracked production tree unchanged; record every required command exit; browser shell/lobby/public spectating, room Canvas/Three and keyboard menu checks; focused synthetic input tests; mock trust-boundary reproductions. Check documentation links and reconciliation.

**Risks:** misleading upstream docs, missing engine artifacts, sandbox-only failures mistaken for external blockers, build success mistaken for gameplay success.

**Definition of done:** every Phase 0 acceptance item classified in STATUS; mandatory checks executed or named explicit exception recorded; review findings resolved or actionable backlog. Phase 0 acceptance with exceptions is not a green test/release claim. The no-engine suite failures, hardware/authenticated coverage and broad server/browser matrix continue into later phases.

## Phase 1 — Stabilization and trust boundaries (L, essential)

**Dependencies:** Phase 0 evidence/decision log. Work can proceed locally without user credentials; do not deploy the inherited proxy or use valuable accounts on the affected origin.

**Affected packages:** webtiles, gamedata, app proxy/worker/session/input tests; toolchain/test configuration; documentation.

**Implementation sequence:**

1. P1-001: fix empty no-engine test registration and missing skip guards; add a required-engine lane that fails clearly if expected artifacts are absent. Keep ordinary web lane independent of engine setup.
2. P1-002: pin a verified web Node/npm environment and add install/test/type/build CI; separate optional pinned-engine smoke/E2E workflow. Preserve unmodified Phase 0 baseline as historical evidence.
3. P1-003/P1-004: add malicious local module/proxy fixtures, choose bounded non-executing data conversion or genuinely restricted execution capability boundary, constrain server registry/proxy destinations/redirects, enforce resource and egress bounds. Explicit local-only server opt-in must not silently weaken hosted defaults.
4. P1-005/P1-006: validate protocol envelope/items, bound queues/frames and gamedata stalls, reject insecure remote credential submission, test close/reopen generation and canceled work.
5. P1-007/P1-008: update vulnerable tooling in reviewed groups; map license/asset provenance and exact source offer. Do not use forced audit upgrades or assume every tile CC0.
6. P1-009: document actual state mutation and owner methods; reproduce option-only scene invalidation before fixing. Inventory existing UI state writes. Keep revisions and incremental replay tests.
7. P1-010: characterize direction, targeting, contextual A, menu/text and repeat semantics before changing their policy; add browser reachability checks where available.

**Deliverables:** passing engine-free baseline; explicit artifact-gated engine CI; constrained loader/proxy and secure transport; documented state/command contracts; accurate controls/docs; distribution provenance checklist.

**Validation:** safe local hostile modules (global access, invalid exports, runaway tasks), private/encoded/IP/DNS/redirect routes with mocked/local servers, slow/oversized payloads, malformed JSON/null batches, replay/incremental equivalence, token rotation/expiry without real secrets, disconnect/focus/repeat transitions, dependency audit triage and build reproducibility.

**Risks:** restrictive data loader breaks server-specific function exports; network validation differs between Node and Worker; upgrade changes tests; overbroad ownership/input rewrite regresses menus. Solve concrete boundaries, not a new framework.

**Definition of done:** web CI green; expected engine coverage cannot disappear silently; critical trust-boundary reproductions rejected with diagnostics; account-bearing/deployment gates documented and verified; relevant dependency advisories fixed or explicitly assessed; no new authoritative simulation; minimal direction contracts ready for Phase 2. Open provenance questions block redistribution of affected assets, not unrelated fixture work.

## Phase 2 — Controller-first top-down gameplay (L/XL, essential)

**Dependencies:** P1-001, P1-005, P1-009, P1-010; secure loader/proxy before credentialed acceptance. Physical hardware or named manual validation exception is needed before claiming controller completion.

**Affected packages:** app game/context/bindings/runner/camera/settings/HUD/menus, scene/scene-webtiles, render-2d, input/browser fixtures.

**Implementation sequence:**

1. P2-001: one complete top-down slice through existing Runner/context: absolute N/NE/E/SE/S/SW/W/NW; targeting/examine/compass directions; explicit visible target policy for contextual actions. Preserve underfoot interactions; ambiguous adjacent actions get a visible chooser. Right-stick changes cannot rotate command axes.
2. P2-002: restore Canvas selection and make 2D primary only after that slice passes; remove first-person controls from top-down UI; preserve raw keyboard/macro/text routing and Shift/Ctrl run/attack semantics.
3. P2-003: complete and record controller/keyboard interaction matrix: character creation, inventory multiselect/use/drop, equipment, spells/abilities/evocables, quiver/fire/target/reach, shops and confirmations, more, skills/CRT, travel/level map, descriptions, numeric/text prompts, OSK, login, rc and save/exit. Retain existing menu/HUD until parity is demonstrated.
4. P2-004: protect held input across device change, disconnect, blur/background, mode change and delayed network echoes. Measure queued repeat commands before introducing throttling; no predicted authoritative position.
5. P2-005: browser screenshot/pixel comparisons against official output and recorded scenes; visibility/remembered/unseen, dolls, clouds, water/lava, cursor/target/flash/status overlays. Verify click-to-cell and keyboard parity.
6. P2-006: reassess full-fork choice; extract only boundaries proven by the slice. Remove unused first-person paths only after parity and upstream impact review.

**Deliverables:** usable top-down client with ordinary controller-only workflows, keyboard parity, minimal input/presentation boundary and recorded server/controller matrix.

**Validation:** all eight directions × heading × device × command/target/look/map/prompt modes; exact outbound message assertions; login/save/rc recovery on authorized test accounts; controller-only manual run on available devices; keyboard fallback; reconnect without stuck input; browser visual evidence and reduced-layout readability.

**Risks:** hidden first-person context, prompt text/version heuristics, selecting wrong adjacent action, repeat flooding under latency, tests that bypass real UI. Existing 388 input tests are regression assets, not acceptance for the new mode.

**Definition of done:** ordinary gameplay without keyboard on explicitly tested devices; all required interaction cases pass or release-blocking gaps named; no direction dependence on renderer; real server state remains sole authority; visual correctness baseline saved. Reopen ADR-001 if a bounded slice proves impossible without pervasive unrelated rewrites.

## Phase 3 — Modern rendering and effects (L, optional engine choice; essential polish subset)

**Dependencies:** Phase 2 correctness and replay/browser fixtures. Establish representative target hardware and required effects workload before selecting technology.

**Affected packages:** render-2d, scene motion data, app presentation scheduling/assets; optional new renderer only after decision.

**Tasks:** P3-001 profile Canvas and define budgets; P3-002 optional Pixi spike using same scenes and required effects; P3-003 implement confirmed-motion interpolation, finite particles, damage feedback and lighting without hiding gameplay cues; P3-004 resource lifecycle, atlas/context recovery, reduced motion and visual regression checks.

**Deliverables:** measured renderer decision, one primary implementation, effect policy and performance captures. Keep Canvas reference/minimap if it remains useful. No mandate to ship Pixi or maintain feature parity across Canvas/Pixi/Three.

**Validation:** identical recorded workload; p50/p95 frame and input-to-send latency, startup/atlas upload, memory growth and idle work; all visual-order/visibility/picking checks; teleport/level-change/reconnect/burst cancellation; hostile/missing assets; reduced motion; repeated mount/destroy. Confirmed movement only, no damage/move simulation.

**Risks:** GPU upload stalls, excessive filters/overdraw, optimistic animation misrepresenting state, duplicate history/state, renderer migration distracting from accessibility. Pixi benefits must exceed migration/support cost, not merely raise a synthetic FPS score.

**Definition of done:** required visual workload meets predeclared device budgets and parity; chosen renderer justified with evidence; effects respect authoritative updates and can be reduced/disabled; no leaks under repeated sessions. Staying with Canvas is a valid outcome.

## Phase 4 — Optional 2.5D presentation (L/XL, optional)

**Dependencies:** Phase 3 stable primary renderer; separate approved feature scope after readability prototype.

**Affected packages:** chosen renderer, presentation metadata, camera/picking; optional Three experiment if genuine geometry is required.

**Tasks:** P4-001 sprite/depth/shadow prototype; P4-002 compare projection/picking and sightline readability; P4-003 decide whether geometric/orthographic Three support is justified, with removal/migration plan instead of a third permanent stack.

**Deliverables:** optional toggleable depth treatment; decision record for geometry or rejection. Elevation is visual metadata unless reported by server; never invent traversability or line of sight.

**Validation:** same exact gameplay commands across projections; cell picking and targeting on edges/occluded cells; dangerous tiles/enemies never hidden; top-down fallback; reduced motion/accessibility; performance budgets from Phase 3.

**Risks:** obscured information, confusing world vs screen directions, extra art/provenance burden, doubled rendering test matrix.

**Definition of done:** optional presentation demonstrably improves intended experience without reducing tactical clarity, input correctness or baseline availability. Deferral/removal is acceptable if it fails these gates.

## Phase 5 — Polish and release readiness (L, essential)

**Dependencies:** Phase 2 complete; required Phase 3 effects stable; optional Phase 4 not required. All exposure/license gates closed.

**Affected packages:** app/settings/accessibility, deployment Worker/proxy, tests/docs/source offers; selected renderer/assets.

**Tasks:** P5-001 cross-browser/device/server matrix; P5-002 accessibility, font/HUD sizing, focus, reduced motion and settings migration; P5-003 secure deployment and exact corresponding-source release packaging; P5-004 update/upstream merge/release runbook and rollback drills.

**Deliverables:** tested release, supported server/version/controller/browser list, clear limitations, matching source/attribution, reproducible build and maintenance policy.

**Validation:** Chrome/Firefox/Safari online tests on named versions, hardware Xbox/PlayStation/Switch/Steam Deck as available, stable/trunk across supported official servers, login/rc/save/morgue/stat continuity with authorized test accounts, WSS/CORS/asset failure/reconnect behavior, performance/leak soak, audit/license checks, deployment smoke and rollback. Offline support has its own JSPI/artifact matrix; do not imply it works everywhere online does.

**Risks:** server drift, browser gamepad mapping changes, offline artifacts/tools diverge, stale source offers, proxy abuse, branding/attribution omissions.

**Definition of done:** no open critical release blockers; supported matrix backed by evidence; source/license obligations and release notes match shipped artifact; essential controller/keyboard workflows pass; rollback and upstream update path proven. Publish only within separately established release authorization.

## Phase 0 closure review

Four investigations, two architecture critiques and final independent documentation/source review completed. All mandatory baseline commands executed; failures and untested/hardware/auth/engine cases explicitly classified in STATUS/BASELINE. Final review required closure reconciliation and precise upgrade acceptance wording; both incorporated. Phase 1 begins with P1-001 and source-backed security work; Phase 0 acceptance does not waive any release/controller/gameplay gates.
