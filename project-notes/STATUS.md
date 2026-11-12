# Current status

Updated 2026-11-12 (America/Sao_Paulo).

The approved simplification makes Dungeon (2.5D) the sole gameplay presentation, retains flat maps/minimap, replaces menu scenery with the existing 2.5D renderer and removes the first-person implementation and exclusive dependencies. It preserves protocol, UI, development/offline capabilities, combat presentation and accessibility.

Released **0.3.67** to production on 2026-11-12. Source commit `a37449b0749bbbf3c241a55e099947f646c4a860`, immutable tag `cloudflare-online-v1.64`. Cloudflare Workers Builds completed successfully; hosted menu/version/source links and exact main-bundle bytes match the release. Anonymous CBRG spectating works at desktop and narrow viewport sizes with no observed console errors. [DEPLOYMENT.md](DEPLOYMENT.md) records build/deployment IDs and HTTP evidence. Post-deployment evidence is published on `codex/dungeon-only`; main and the source tag remain at the deployed release.

Clean-install verification passed 2,236 unit tests with two optional-engine skips, forced TypeScript, production build and guarded dry-run. Full browser raster fixture eventually completed **4,069/4,070**, with one unchanged baseline assertion mismatch documented in [BASELINE.md](BASELINE.md).
Baseline HEAD and fetched origin/main: `91bf21a182e75e5ac46a4b0f656ef03296f381b7` (0.3.66). Baseline forced TypeScript rebuild passed; unit tests passed 2,668 cases with two optional-engine skips. Measured refactor results are in BASELINE.md.

Known limits remain: narrow fine-pointer HUD clipping (not a touch-phone test); no physical-controller or authenticated-play acceptance in this refactor yet; optional engine artifacts may be unavailable; broader browser/server coverage, exact packed-art provenance and distributed proxy abuse controls remain follow-ups. See [BACKLOG.md](BACKLOG.md).

Production is online-only on bundled HTTPS/WSS servers. Development retains offline/custom-server code. Source offer, CSP, proxy boundaries, licenses and deployment freshness guards remain mandatory. [DEPLOYMENT.md](DEPLOYMENT.md) gives the procedure and release ledger.
