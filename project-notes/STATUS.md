# Current status

Updated 2026-11-12. Deployed and verified baseline: **0.3.69**, source tag **`cloudflare-online-v1.66`**.

Dungeon (2.5D) is the sole gameplay presentation. Flat tiles remain supporting maps/minimap. Floating combat popups, their setting/assets and dedicated engine patches are removed; confirmed world combat and spell effects remain. Existing renderer artwork and algorithms are preserved.

Everyday verification is substantially faster: incremental TypeScript and retained unit tests, focused iteration commands, representative browser smoke checks, and change-aware pull-request CI. Full rendering, production and deployment checks remain in the release gate. See [AGENTS.md](../AGENTS.md) and [RUNBOOK.md](RUNBOOK.md) for command selection and [BASELINE.md](BASELINE.md) for measured speedups and coverage tradeoffs.

Local release checks and clean-install Linux branch/main CI passed: **2,237 tests** (2,222 unit plus 15 deployment), **14 browser tests**, **4,072 raster assertions**, forced TypeScript and production build. Two optional-engine tests skipped; absent engine artifacts prevent rebuilt-WASM acceptance.

Release source commit: `070f8295af206c92b60d8943ef5d15aadd9ecdba`. Automatic Cloudflare deployment, hosted bundle identity, HTTP/security checks, settings and anonymous live spectating succeeded. [Release evidence](releases/0.3.69.md) records exact identities. Main and the immutable tag contain the deployed runtime source; final evidence is published on the working branch.

Production remains online-only on bundled servers. Development retains optional offline/custom-server capabilities. Current ownership is in [ARCHITECTURE.md](ARCHITECTURE.md); physical devices, authenticated acceptance and broader compatibility remain in [BACKLOG.md](BACKLOG.md). Earlier release evidence remains under [releases](releases/0.3.68.md).
