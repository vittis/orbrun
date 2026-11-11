# Final independent Phase 0 review

Date: 2026-11-11. Reviewer: build-validation agent, independently reviewing the orchestrator's completed notes and repository state. Baseline revision `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`.

## Verdict

**Accept Phase 0 with the explicitly recorded exceptions, after the final status/commit reconciliation below.** No blocking architecture, source-change, unsupported-validation, or security/license-documentation defect was found. This is acceptance of a verified foundation and roadmap, not approval to deploy or a claim that the full test/application/controller matrix passes.

## Checks performed

- Read all eleven root project-notes documents, independent investigation summaries and substantive critique sections; compared the final findings with this reviewer's earlier independent no-engine reproductions.
- Ran `git status --short --branch`, `git remote -v`, and `git diff --exit-code upstream/main -- . ':!project-notes'`. At review time only `project-notes/` was untracked; production source and tests were unchanged. Working branch was `chore/phase-0-foundation`.
- `git rev-parse HEAD upstream/main origin/main` returned `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d` for all three. Remotes were `https://github.com/vittis/orbrun.git` and `https://github.com/Caeous/orbrun.git`. Hosted fork metadata verification was performed by the orchestrator, not independently queried again here.
- Checked all relative Markdown link targets under project-notes with a filesystem script: no missing targets. Eleven required root notes present.
- Visually inspected the retained live-spectating and room-renderer PNGs. They show a textured 3D dungeon/HUD/tiled minimap and the room's 3D/Canvas views with yaw 180 degrees. These corroborate the documented narrow visual smoke observations. I did not rerun the browser, verify live motion, measure GPU performance, or use a physical gamepad during this final review.
- Inspected the retained security probe: source-relative paths, mocked fetch/socket/asset IO, harmless global counter. No real credential read or network attack is part of that probe. Did not rerun it because the security investigator and orchestrator already recorded matching results and no source change warranted repetition.

## Findings and required closure

| ID | Severity | Finding | Resolution required |
|---|---|---|---|
| FR-001 | Low, required session closure | STATUS, AGENT_REPORTS and SESSION_LOG still say final review pending; P0-004/P0-005 are ready, and the local initialization commit has not yet been made at review time. This is correct intermediate state but must not remain in the final delivered snapshot. | Retain this review; record its resolutions; update acceptance ledger and P0-004; create/reconcile the intended notes-only local commit and P0-005; record clean final status and whether the branch was pushed. Keep all named validation exceptions visible. |
| FR-002 | Low, wording/dependency consistency | P1-007 is ready but acceptance says the baseline “remains passing”, while the default upstream test command presently fails. A tooling upgrade can be reviewed before P1-001, so “passing” is ambiguous. | Either depend on P1-001 for that acceptance gate or state “no new failures relative to the recorded baseline; default command green after P1-001”. Do not treat the partial excluded-suite command as full baseline success. |

No request for additional Phase 0 production refactoring is justified by these findings. Do not alter upstream tests or security code merely to turn this review green.

## Explicitly acceptable Phase 0 exceptions

1. Default tests fail at empty optional-engine suite registration despite 1,836 individual passes. E2E fails five spell-bar cases and one helpdump case reading missing **stable** engine artifacts; 38 cases skip. The corrected attribution is consistent throughout current authoritative notes. These are clearly tracked as P1-001 rather than hidden by the partial pass.
2. Real-engine execution is blocked by missing artifacts, emsdk/PyYAML and JSPI-capable Node. Provisioning an entire WASM toolchain is not needed to accept the online-client foundation; engine CI remains a separate task.
3. Physical/gamepad-browser tests, authenticated gameplay/save/rc/stat continuity, controlled network reconnect, primary full-screen Canvas gameplay, cross-browser and all-server compatibility remain unverified. The notes distinguish synthetic controls tests and single-server anonymous spectating from these claims.
4. Browser console checks were recorded, but no complete network waterfall or named GPU/browser-version performance baseline exists. The retained screenshots support smoke observations only.
5. Official WebTiles comparison was a limited live-source inspection, not a pinned full client audit/build. Super Dungeon Crawl could not be retrieved, so it is inspiration only and no code/license claim is made. The full-fork recommendation is appropriately conditional and includes a Phase 2 reconsideration gate.
6. Remote gamedata execution, proxy restrictions/resource limits, malformed frame validation, transport policy, dependency advisories and exact asset/source licensing remain unfinished. Current notes identify them as account-bearing/deployment/distribution gates and distinguish confirmed primitives from exploitability or infringement allegations.

## Architecture and roadmap assessment

The recommendation is coherent with source evidence: retain full fork because controls/menus/OSK are app-local; make a tested absolute-direction/context slice before broad extraction; preserve mutable revision-based state without claiming current strict single ownership; keep Scene/MapRenderer provisional; use Canvas first and benchmark Pixi against actual required effects; do not commit to three primary renderers. The roadmap avoids a framework/state rewrite and ties optional 2.5D to readability, picking and performance gates.

Material disagreements are preserved and resolved: source mutation versus stale immutability docs; contextual facing beyond movement; actual Canvas evidence scope; remote spectating versus isolated fixture work; and precise no-engine failure causes. Scope/acceptance/dependencies and manual continuation procedures are detailed enough for another engineer to resume without chat history.

After FR-001/FR-002 reconciliation, proceed to local Phase 1 stabilization. Public deployment and account-bearing testing remain gated as documented.
