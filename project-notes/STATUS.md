# Current status

Updated 2026-11-12. Baseline version: **0.3.68**, source tag **`cloudflare-online-v1.65`**.

Dungeon (2.5D) is the sole gameplay presentation. Flat tiles remain supporting maps/minimap. Stabilization consolidates map transitions, separates validated preferences from server persistence, fixes narrow-window HUD clipping and adds repeatable browser/CI checks. Existing renderer artwork and algorithms are preserved.

The local verification gate passes: **2,292 unit tests**, **14 browser tests**, **4,072 raster assertions**, forced TypeScript and production build. Optional engine artifacts remain unavailable. [BASELINE.md](BASELINE.md) records measurements and coverage limits; [the release record](releases/0.3.68.md) links source/deployment evidence.

Current architecture and procedures are in [ARCHITECTURE.md](ARCHITECTURE.md) and [RUNBOOK.md](RUNBOOK.md). Prior release evidence is consolidated under [releases/0.3.67](releases/0.3.67.md), with no dependency on the old refactor branch for that history.

Production remains online-only on bundled servers. Development retains optional offline/custom-server capabilities. Physical devices, authenticated acceptance, broader compatibility and remaining performance/provenance work are in [BACKLOG.md](BACKLOG.md).
