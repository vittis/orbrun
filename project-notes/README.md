# Current engineering baseline

Read [STATUS.md](STATUS.md), then the [refactor checklist](DUNGEON_REFACTOR.md). These documents describe the current 2.5D-only product and its retained flat supporting views. Superseded plans, reports and screenshots were removed; Git history preserves them.

| Document | Purpose |
|---|---|
| [STATUS.md](STATUS.md) | Current implementation/release state and limitations |
| [DUNGEON_REFACTOR.md](DUNGEON_REFACTOR.md) | Approved scope, ownership, acceptance criteria and progress |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package responsibilities and state/presentation boundaries |
| [DECISIONS.md](DECISIONS.md) | Decisions introduced by the simplification |
| [BASELINE.md](BASELINE.md) | Measured starting point and validation evidence |
| [RUNBOOK.md](RUNBOOK.md) | Development and verification commands |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production safeguards, source identity, release and rollback |
| [BACKLOG.md](BACKLOG.md) | Remaining actionable work and known limits |

Before continuing: inspect repository and ancestor instructions, status, HEAD and remotes; preserve unrelated work. Never infer current test results or deployment identity from historical releases. Keep server state authoritative and record measured checks and untested cases separately. No credentials, tokens, raw private recordings or local environment files belong in Git.
