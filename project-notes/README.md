# Persistent engineering memory

Read [STATUS.md](STATUS.md) first. These notes record the inspected source, executed checks, decisions and remaining work for a controller-first, top-down DCSS WebTiles client. The server remains authoritative. Phase 0 changes documentation and evidence only; it does not begin a renderer/UI rewrite.

## Resume instructions

1. Read STATUS, then BACKLOG, DECISIONS and the latest SESSION_LOG entry.
2. Run `git status --short --branch`, `git remote -v`, and `git rev-parse HEAD`. Preserve any user changes. Check for new repository/ancestor agent instructions.
3. Read BASELINE before interpreting test failures. Default tests and engine E2E are **not green** on the engine-free upstream checkout.
4. Follow RUNBOOK for locked install, loopback startup, verification and upstream management. Do not publish or enter valuable credentials before resolving the relevant RISKS gates.
5. Select the first ready backlog task, protect its behavior with focused tests, and make one small change. Phase 1 begins with test-gating and security work, not UI replacement.
6. Keep GameState server-derived; presentation effects cannot predict moves, damage, turns or hidden information. See ARCHITECTURE for current mutable ownership and proposed constraints.
7. Update these notes as work occurs. Before ending, reconcile STATUS, BACKLOG and SESSION_LOG; record exact commands/results and explicit exceptions. Append decisions rather than silently reversing them.
8. The original Phase 0 brief required independent investigations and final review. Their durable reports and scope limitations are in AGENT_REPORTS and reviews/. Future agents need no chat history.

## Index

| File | Purpose |
|---|---|
| [STATUS.md](STATUS.md) | Authoritative snapshot, exceptions and next actions |
| [MASTER_PLAN.md](MASTER_PLAN.md) | Phases 0–5, dependencies, deliverables and acceptance gates |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Observed package/data flow, alternatives, target boundaries |
| [DECISIONS.md](DECISIONS.md) | Dated architectural decisions and revisit criteria |
| [BASELINE.md](BASELINE.md) | Revision, toolchain, command exits and runtime evidence |
| [RISKS.md](RISKS.md) | Security, licensing, integration and maintenance risks |
| [BACKLOG.md](BACKLOG.md) | Stable IDs, priority, dependencies and acceptance criteria |
| [RUNBOOK.md](RUNBOOK.md) | Exact install/run/check/reproduction/upstream/manual procedures |
| [AGENT_REPORTS.md](AGENT_REPORTS.md) | Assignments, independent findings, critique and resolution |
| [SESSION_LOG.md](SESSION_LOG.md) | Chronological work and continuation record |
| [reviews/](reviews/) | Complete independent reports, including unresolved questions |
| [evidence/](evidence/) | Small browser captures and safe offline security probes |

Temporary raw logs under `/private/tmp` are not required to resume. Summaries and durable probes remain here. Screenshots show public anonymous spectating or bundled room assets; no credentials were used.
