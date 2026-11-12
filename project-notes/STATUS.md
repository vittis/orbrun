# Current status

Updated 2026-11-12 (America/Sao_Paulo).

The approved simplification makes Dungeon (2.5D) the sole gameplay presentation, retains flat maps/minimap, replaces menu scenery with the existing 2.5D renderer and removes the first-person implementation and exclusive dependencies. It preserves protocol, UI, development/offline capabilities, combat presentation and accessibility.

Implementation and independent review are complete. Clean-install verification passed 2,236 unit tests with two optional-engine skips, forced TypeScript and the production build. Browser/release checks are completing. Intended release: **0.3.67**, source tag **cloudflare-online-v1.64**; these are preparation identifiers, not a deployment claim. The orchestrator owns final verification, commit, source tag, push and production identity checks. See [DUNGEON_REFACTOR.md](DUNGEON_REFACTOR.md).

Baseline HEAD and fetched origin/main: `91bf21a182e75e5ac46a4b0f656ef03296f381b7` (0.3.66). Baseline forced TypeScript rebuild passed; unit tests passed 2,668 cases with two optional-engine skips. Current results must be recorded after integration.

Known limits remain: no physical-controller or authenticated-play acceptance in this refactor yet; optional engine artifacts may be unavailable; broader browser/server coverage, exact packed-art provenance and distributed proxy abuse controls remain follow-ups. See [BACKLOG.md](BACKLOG.md).

Production is online-only on bundled HTTPS/WSS servers. Development retains offline/custom-server code. Source offer, CSP, proxy boundaries, licenses and deployment freshness guards remain mandatory. [DEPLOYMENT.md](DEPLOYMENT.md) gives the procedure and release ledger.
