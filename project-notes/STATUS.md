# Current status

Updated 2026-11-12. Deployed and verified baseline: **0.3.68**, source tag **`cloudflare-online-v1.65`**.

Dungeon (2.5D) is the sole gameplay presentation. Flat tiles remain supporting maps/minimap. Stabilization consolidates map transitions, separates validated preferences from server persistence, fixes narrow-window HUD clipping and adds repeatable browser/CI checks. Existing renderer artwork and algorithms are preserved.

Released 0.3.68 verification and clean-install Linux CI passed: **2,296 unit tests**, **14 browser tests**, **4,072 raster assertions**, forced TypeScript and production build. Optional engine artifacts remain unavailable. [BASELINE.md](BASELINE.md) records measurements and coverage limits; [the release record](releases/0.3.68.md) links source/deployment evidence.

Current architecture and procedures are in [ARCHITECTURE.md](ARCHITECTURE.md) and [RUNBOOK.md](RUNBOOK.md). Prior release evidence is consolidated under [releases/0.3.67](releases/0.3.67.md), with no dependency on the old refactor branch for that history.

Production remains online-only on bundled servers. Development retains optional offline/custom-server capabilities. Physical devices, authenticated acceptance, broader compatibility and remaining performance/provenance work are in [BACKLOG.md](BACKLOG.md).

Release source commit: `858964a9bd263cd41720fdde7824953dca97f52f`. Automatic Cloudflare deployment and hosted checks succeeded; [release evidence](releases/0.3.68.md) records exact identities. Main and the immutable tag contain the deployed runtime source. The working branch also contains the fast-iteration verification changes and removal of floating combat text, its setting/assets and dedicated engine patches. Release 0.3.69 / `cloudflare-online-v1.66` is being prepared with these changes; [its release record](releases/0.3.69.md) tracks acceptance and deployment. See BASELINE.md for validation results.
