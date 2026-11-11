# Independent investigations and orchestration

Date: 2026-11-11. Source b65fc15. Native subagents used as requested. Environment has three child slots; architecture, controls and security ran concurrently, followed by build review after a slot freed. All investigated read-only, with isolated temporary reports/probes; the orchestrator alone wrote repository notes. No overlapping application edits.

| Agent | Assignment | Completed evidence | Unresolved / scope limit | Durable report |
|---|---|---|---|---|
| A architecture | Packages, lifecycle/state, scene/renderers, app coupling, A/B/C comparison | Source/file/function references, concrete mutation/render coupling, limited official client.js/game.js comparison; no tests claimed | Full official build/test audit, source-pinned comparator, actual performance, SDC unavailable | [architecture](reviews/architecture.md) |
| B controls | Devices/repeat/directions/context/UI/keyboard/test reuse | Source review + 11 existing files/388 tests passed, exit 0; explicit top-down blockers | Synthetic events and mock/prototype UI; no physical/gamepad-browser/live gameplay validation | [controls](reviews/controls.md) |
| C build | Toolchain/install/test/E2E/fixtures/proxy/runtime facilities | Reviewed root command logs; independently reproduced empty suite and six missing-stable-engine failures; identified absent emsdk/PyYAML/JSPI | No engine build, independent browser test or production deployment | [build](reviews/build.md) |
| D security | Loader/proxy/login/socket/resource/dependency/license boundaries | Real-loader/mock-IO global execution, route acceptance, malformed null batch; audit triage and primary-source license checks | No deployed exploitation, internal network fetch, credential test, exhaustive per-asset/advisory precondition audit | [security](reviews/security.md) |

## Orchestrator verification and integration

The orchestrator independently read root/package docs and inspected state reduction, connection, proxy, renderer contract, control settings and test harness sources, executed install/default tests/typecheck/build/E2E/audit, and performed local browser shell/picker/CDI spectating/room/keyboard checks. Later a partial no-engine invocation passed 130 files/1,836 tests. Source and runtime evidence were compared; README claims were not accepted as validation.

Security probes were inspected, retained with repository-relative root resolution, and rerun by the orchestrator (exit 0, expected weaknesses). No real token access or attack occurred. Four investigation reports are preserved as evidence rather than presented as undifferentiated consensus.

## Two independent critiques of proposed architecture

Agents A and B explicitly reviewed the orchestrator's proposal after their initial reports; their appended critique sections are retained. Proposal: full fork; provisional Scene/MapRenderer; mutable revision-based state; narrow world-direction/interaction boundary; Canvas primary; measured Pixi decision; no triple-backend commitment; scoped security gates.

| Agreement or dissent | Source and reasoning | Orchestrator resolution |
|---|---|---|
| Full fork strongest initial choice, not permanent | Both: reusable controller/menu stack resides in app, selected-package approach loses it | ADR-001 conditional through Phase 2; revisit based on actual integration burden |
| “Single writer” is not existing fact | A found menu.ts directly writes state.exit | ARCHITECTURE separates current behavior from proposed owner rule; P1-009 inventory and narrow fixes |
| Avoid broad Runner extraction before a working slice | A: preserve sequencing/confirmations/raw keys; B: all direction/context modes must move together | ADR-004/P2-001 complete movement+targeting+interaction slice first, extraction afterward |
| Scene cannot be frozen as permanent generic contract | Both: raw refs/camera requirements remain; fake camera would hide command coupling | Provisional reuse only; explicit interaction target and copied effect history, no universal framework |
| Canvas tests do not prove browser visual parity | A and C: mocked contexts and E2E without pixels | Phase 2 actual browser/official visual gate; Phase 0 Canvas testbed/minimap described narrowly |
| Pixi is conditional, not a promised milestone outcome | Both: required effects/readability, performance and migration effort all matter | Phase 3 measurable same-workload decision, Canvas retention valid |
| No permanent Canvas/Pixi/Three feature matrix | Both: unnecessary maintenance before need | One primary production renderer; optional 2.5D gate |
| Live spectating is not isolated local work | B and D: remote gamedata executes despite loopback host | BASELINE/ADR-005 record trusted public anonymous exposure; no credentials; fixture exception separate |
| E2E failure attribution was wrong in early draft | C reproduced spell-bar/helpdump + stable, not probe/trunk | Corrected BASELINE/SESSION_LOG before acceptance; retained correction history here |
| Asset CC0 blanket claim insufficient | D verified official exclusions, no specific infringement established | LIC-02/P1-008 per-asset inventory gate; keep upstream attribution while flagging uncertainty |

No reviewer supported an immediate UI rewrite, immutable state rewrite or unconditional Pixi adoption. Disagreements changed ordering and precision rather than the overall fork recommendation.

## Final independent review

Build investigator performed the final read-only review of the complete notes and implementation state; see [final report](reviews/final-review.md). Verified all eleven files/relative links and unchanged upstream source; visually inspected both saved screenshots, without claiming an independent browser run. No blocking architecture/security documentation issue found.

Required closure findings: remove pending review/commit markers and reconcile STATUS/BACKLOG/SESSION_LOG. Resolved in this local checkpoint. Minor inconsistency: P1-007 said the baseline should "remain passing" although default tests fail; changed to "no new failures, default green after P1-001". Named engine/hardware/auth/server/browser exceptions remain accepted for Phase 0 only, with future acceptance gates intact. The final reviewer did not certify gameplay, licensing provenance or deployment safety.
