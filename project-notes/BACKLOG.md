# Prioritized backlog

Updated 2026-11-11. Status: done / partial / ready / queued / blocked / optional. P0 is foundation, P1 stabilization, P2 top-down, P3 rendering, P4 optional depth, P5 release. Complexity S/M/L/XL is effort, not time. Risks use RISKS IDs.

| ID | Priority / size | Status | Task and affected area | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| P0-001 | P0 / S | done | Clone/fork, preserve history, remotes and branch | none | Exact upstream SHA and actual fork identity documented; no unrelated work overwritten |
| P0-002 | P0 / M | done | Unmodified install/test/type/build/runtime baseline | P0-001 | Commands executed; failures/exceptions recorded; browser evidence stored; no false green claim |
| P0-003 | P0 / M | done | Four independent investigations + two architecture critiques | P0-001 | Reports with source evidence, severity/confidence and dissent retained |
| P0-004 | P0 / M | done | Final independent review and documentation reconciliation | P0-002,003 | Reviewer findings addressed/tracked; 11 notes complete and links valid |
| P0-005 | P1 / S | done | Local initialization commit | P0-004 | Only notes/evidence changed; clean tree; origin/upstream verified; no application rewrite |
| P1-001 | P0 / S | done | Correct absent-engine test gating | P0-002 | Default no-engine suite green with explicit skip; spell-bar/helpdump guard; required-engine lane fails if artifacts missing |
| P1-002 | P1 / M | queued | Pin web tools and reproducible CI; separate engine lane | P1-001 | npm ci/test/type/build reproducible; engine revision/recipe pinned for optional smoke/E2E |
| P1-003 | P0 / L | done | Remove privileged remote gamedata execution (SEC-01) | P0-003 | Global/storage/network escape fixtures blocked; schema/bounds tested; legitimate server exports supported |
| P1-004 | P0 / M | partial | Restrict proxy destinations/redirects, add limits (SEC-02,03) | P0-003 | Allowlisted hosts; private/encoded/redirect/DNS cases rejected; byte/time/cache/rate bounds; dev/Worker parity |
| P1-005 | P0 / M | done | Validate frames and bound connection/session work (SEC-03,04) | P0-003 | Null/malformed/oversized batches diagnostic without uncaught error; bounded queue; explicit reconnect/reset semantics |
| P1-006 | P0 / S | done | WSS/account trust policy (SEC-05) | P1-003,004 | Insecure remote login prevented; explicit local exception; token expiry/rotation/logout fixtures preserved |
| P1-007 | P1 / M | ready | Dependency advisory remediation (SEC-06) | P0-002 | Review prerequisites; upgrade groups/lockfile; no new failures, default green after P1-001; remaining advisories scoped |
| P1-008 | P0 before release / M | partial | License/source offer and exact asset provenance (LIC-01,02) | P0-003 | Room/orb/fonts/engine origin/license inventory; unresolved assets replaced/omitted before distribution; exact source offer |
| P1-009 | P1 / M | ready | Mutation ownership, option-only invalidation and stale docs (ARC-01,02) | P0-003 | Reproduce suspected scene bug; direct writes inventoried; targeted fix if confirmed; README reflects actual state/render/input behavior |
| P1-010 | P1 / M | ready | Characterize outbound commands and input mode transitions | P0-003 | Eight-way/heading/device/mode matrix; raw keyboard/OSK/macro preserved; focus/disconnect repeat cases |
| P2-001 | P0 / L | queued | Complete absolute movement/target/context slice | P1-001,005,009,010 | All 8 directions invariant to heading/render; target/look/door prompts correct; contextual target explicit; server outcomes unchanged |
| P2-002 | P0 / M | queued | Restore and default Canvas top-down UI | P2-001 | 2D available/default; first-person controls absent from mode; keyboard parity; no production rewrite |
| P2-003 | P0 / L | blocked | Complete controller-only interaction matrix | P2-002,P1-003,004,006 | Inventory/spells/shops/prompts/OSK/login/save/rc verified; authorized test account + hardware needed for final acceptance |
| P2-004 | P1 / M | queued | Repeat, latency, focus/device handoff safety | P1-010,P2-001 | No stale held input across modes/blur/reconnect; measured command queue behavior under delayed replies |
| P2-005 | P0 / M | queued | Real-browser Canvas/official visual parity | P2-002 | Captured visibility/layers/dolls/targeting/cursors/level-map cases match agreed references; picks map correctly |
| P2-006 | P1 / S | queued | Revisit foundation and incremental extraction scope | P2-003,005 | ADR updated with actual migration effort; remove legacy code only after verified replacement |
| P3-001 | P1 / M | queued | Record workload/device budgets and Canvas profile | P2-005 | p50/p95 latency/frame, memory/upload/idle baseline; requirements fixed before experiment |
| P3-002 | P2 / M | optional | Pixi comparison spike and decision | P3-001 | Same scenes/effects; measured benefit and migration cost; Canvas retention valid |
| P3-003 | P1 / L | queued | Confirmed-state motion/effects | P3-001, renderer decision | Bounded/cancellable effects; no authoritative prediction or hidden-state leak; reduced motion |
| P3-004 | P1 / M | queued | Renderer resource/recovery/visual regression gates | P3-003 | Repeat mount/unmount and context/atlas failures handled; no growth; parity preserved |
| P4-VIS-001 | P1 / S | done locally | 2.5D pickup cursor alignment, neutral unexplored mist, stronger LOS contrast, remove player spotlight | 0.3.13 renderer | 2,034 tests + 504 Canvas pixel checks + typecheck/build pass; publication not requested |
| P4-001 | P2 / M | optional | Depth/shadow sprite prototype | P3-004 | Readability and performance compared with flat baseline |
| P4-002 | P2 / M | optional | Projection/picking/accessibility review | P4-001 | Coordinates/control semantics unchanged; no occluded tactical information |
| P4-003 | P2 / L | optional | Geometry/Three decision if simpler approach fails | P4-002 | ADR justifies cost and supported-renderer count; no automatic hybrid stack |
| P5-001 | P0 release / L | queued | Supported browser/server/controller matrix | P2-003,005,P3-004 | Named versions/hardware, stable/trunk, reconnect/auth/save/rc; unsupported cases explicit |
| P5-002 | P1 / M | queued | Accessibility and settings polish | P2-003 | Focus, OSK, readable HUD, scaling/reduced motion and migration pass |
| P5-003 | P0 release / M | queued | Secure deployment and source/license packaging | P1-003..008,P5-001 | Release risks closed; source/attribution match artifact; smoke/rollback pass |
| P5-004 | P1 / M | queued | Upstream/release maintenance | P5-003 | Reproducible release/update/rollback procedures and ownership documented |

## Explicit unfinished work

- Odin 3 latency follow-up: local input-before-render scheduling and receipt-timed
  movement fixes have automated 60/120 Hz coverage and are live in 0.3.7. Compare on physical
  hardware with the same server/settings; the full reported difference from the
  original is not yet reproduced. This does not close the broader P2-004 matrix.

- No-engine harness gating is fixed; the historical Phase 0 command still failed as recorded. Current totals and hosted-deployment scope are in DEPLOYMENT.md.
- Proxy policy/limits are implemented; DNS resolution pinning and distributed abuse budgets remain open. Source offer is prepared; exact bundled-art provenance remains open.
- Engine E2E not executed successfully: artifacts, emsdk/PyYAML and JSPI-capable Node absent. Provision only for the dedicated test lane; do not block ordinary online-client development on a WASM build.
- Physical gamepad, browser gamepad emulation, real login/gameplay, rc/save/stat continuity, all-server and cross-browser checks remain open; unit input success and CDI anonymous spectating cover narrower claims.
- Super Dungeon Crawl source/license unresolved; inspiration only, no copied code/assets.
- No Pixi benchmark or performance superiority conclusion; no guaranteed choice of future renderer.
