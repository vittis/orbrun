# Current engineering baseline

Read [STATUS.md](STATUS.md), then [ARCHITECTURE.md](ARCHITECTURE.md) and [RUNBOOK.md](RUNBOOK.md). These documents describe the current 2.5D-only product and its retained flat supporting views. Release-specific evidence lives under `releases/`; current procedures and status live here. Git history preserves superseded planning prose.

| Document | Purpose |
|---|---|
| [STATUS.md](STATUS.md) | Current implementation/release state and limitations |
| [../AGENTS.md](../AGENTS.md) | Fast iteration policy for coding agents |
| [STABILIZATION.md](STABILIZATION.md) | Completed 0.3.68 stabilization scope and review |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package responsibilities and state/presentation boundaries |
| [DECISIONS.md](DECISIONS.md) | Decisions introduced by the simplification |
| [BASELINE.md](BASELINE.md) | Current validation results and coverage limits |
| [RUNBOOK.md](RUNBOOK.md) | Development and verification commands |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production safeguards, source identity, release and rollback |
| [BACKLOG.md](BACKLOG.md) | Remaining actionable work and known limits |

Before continuing: inspect repository and ancestor instructions, status, HEAD and remotes; preserve unrelated work. Never infer current test results or deployment identity from historical releases. Keep server state authoritative and record measured checks and untested cases separately. No credentials, tokens, raw private recordings or local environment files belong in Git.
