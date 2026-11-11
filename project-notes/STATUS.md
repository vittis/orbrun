# Project status

Release **0.3.8 is LIVE** at https://dcss-client.vittis.workers.dev.
Production commit `853a85bb34c8c87a04b04ba0dd0f497487d52188` and immutable source
tag `cloudflare-online-v1.4`. Cloudflare build
`b5325d8f-088a-4e49-9ad0-f84ec920bd0b` deployed successfully; Worker version
`ee1bd592-271d-4865-9bfa-f645f31ed5ea` serves 100% of traffic. Live Chrome shows
0.3.8; the entry bundle matches the tested local build byte for byte, with the
expected strict CSP and immutable source links. CBRG 0.34 spectating rendered
with textures, HUD and minimap; live evidence is under `evidence/release-038-*.png`.

User confirmed the original comparison was offline. Follow-up original online
screenshots on CBRG show response p50 147–150 ms (one p95 343 ms), consistent
with our online response delay. The user authorized the recommended movement
tweaks: a bounded camera preview and faster completion after delayed confirmation.

Implemented an online-only 18%-tile eye preview on visible ordinary empty floor,
without changing player position or commands. Repeats cannot accumulate distance
or refresh the timeout; missing replies return within 430 ms. Refusals, prompts,
visible monsters, status effects, overlays and connection closure cancel it.
Reduced motion, offline play and 2D retain their behavior. Confirmed single manual
steps subtract response wait from their 100–140 ms glide, keeping a 60 ms minimum.
Batched paths, travel and monster timing retain their existing cadence.

Validation: 1,987 tests passed / 2 optional engine skips; forced TypeScript check,
production build and Worker dry-run passed. Optional engine E2E: 44 skips.
Chrome camera simulation: first visible motion 4 ms, response at 154 ms,
landing 67 ms later, max unconfirmed offset 0.18 tiles. This is a desktop
simulation, not an Odin or live server latency measurement. Screenshot:
`evidence/release-038-preview.png`. Temporary testbed removed.

0.3.7 rollback: commit `2aada9317dedd33108d675466890068a9cebb488`, tag
`cloudflare-online-v1.3`, Worker `73ea14db-a8a4-478d-a859-c0fc2e5ec793`.
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
