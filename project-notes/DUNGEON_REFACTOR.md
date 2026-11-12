# Dungeon-only simplification — 2026-11-12

## Authorized scope

Dungeon (2.5D) is the sole gameplay presentation. Flat WebTiles remains for temporary level maps, overview and minimap. Preserve actual X level-map and Ctrl+X in-view bindings, compass controls, server-authoritative state, current visual effects and accessibility. Replace menu scenery with the existing 2.5D renderer. Delete first-person implementation, exclusive assets/tools/tests and dependencies. Preserve development/offline capabilities and online-only production boundaries, security, licensing and immutable source identity. Commit, push to the user's fork, deploy through existing guarded Workers Builds, and verify production.

## Baseline

- Clean `main` at `91bf21a182e75e5ac46a4b0f656ef03296f381b7`, app 0.3.66.
- Fetched origin/main: identical. Working branch: `codex/dungeon-only`.
- Verified origin `https://github.com/vittis/orbrun.git`; upstream `https://github.com/Caeous/orbrun.git`. Publish only to origin.
- No applicable repository/ancestor AGENTS.md found.
- Node 24.11.1; npm 11.6.2. Forced TypeScript and full baseline tests running.

## Responsibilities and sequence

Main agent: architecture, shared manifests/lockfile/build references, integrated verification, browser checks and release. Three bounded read-only investigations precede implementation:

1. renderer: scene/camera contracts, shared dependencies, rendering packages and menu scenery.
2. app: integration, controls, HUD/settings/storage/map lifecycle and tests.
3. docs_release: operational knowledge, documentation/public presentation, tooling and release requirements.

Implementation ownership and shared interfaces will be recorded before edits begin. Independent review must inspect the final diff and behavior; reviewers must not author reviewed changes.

## Acceptance checklist

- [x] Read request, inspect instructions/worktree/remotes and integrate current origin/main.
- [x] Record baseline checks and operational safeguards.
- [x] Establish explicit file ownership and shared-interface agreements.
- [x] Remove first-person runtime, assets, tools, contracts and dependencies.
- [x] Dungeon-only settings migration and compass controls; temporary flat views restore reliably.
- [x] Existing 2.5D renderer supplies front-menu scenery with lifecycle cleanup.
- [x] Reset documentation and public presentation, retain legal/security/runbook knowledge.
- [ ] Meaningful regressions; forced TypeScript, unit suite, production build, browser fixtures and E2E.
- [x] Independent final-diff review; resolve actionable findings.
- [x] Audit source/assets/lockfile/bundles; explain legitimate historical references.
- [ ] Re-fetch main, commit, guarded dry-run, immutable release tag, push and automatic deployment.
- [ ] Verify production identity, menu/gameplay/maps, anonymous spectating, gamedata/CSP/proxy bounds.
- [ ] Record release evidence and explicit coverage limitations.

## Decisions and evidence

Pending investigations. Never replace observed results with historical counts. Physical-controller and authenticated-play coverage must remain distinct from synthetic input and anonymous spectating.

### Ownership and interface agreement

- Renderer agent owns renderer/scene/scene-webtiles/gamedata/vault source and tests, room source/tests and packed place JSON schema. Main owns their manifests/TS references; docs agent owns READMEs.
- App agent owns game/runner/camera/context/HUD/pips/bindings/gamepad/overlays/combat-popups/count-events and associated tests, removing exclusive helpers.
- Main owns servers/settings and their tests, menu/hints/controls/style integration, testbeds/tools, manifests/lockfile and release.
- Docs agent owns prose, project-notes except this checklist, site pages/metadata/source links and site/shell tests.
- Remove renderer Camera/setCamera contract. Retain scene faceTiles and shared motion/combat data. Runner compass directions are identity; directional context may track confirmed movement but never rotates input/rendering. Right-stick analog events remain for map pan and document scroll. RoomView retains lifecycle/fit/settings API but removes look(). No persisted renderer setting.

### Measured baseline

`npx --no-install tsc -b --force`: passed. `npm test`: 166 files passed, one skipped; 2668 tests passed, two optional-engine tests skipped (13.14s). No baseline failures observed. Deployment safeguards extracted before documentation reset: clean committed source, fresh origin/main ancestor before/after build, immutable source tag, online-only production, strict CSP and bounded allowlisted proxies. Workers Builds auto-deploys fork main; do not duplicate with manual deploy.

### Integration and independent review

Settings/menu/hints/analytics focused suite: 210 passed. Initial production build passed; engine E2E: 44 skipped in 12 files because artifacts are absent. Intermediate integration snapshots caught in-progress source edits; these are not final release results.

Independent docs agent inspected actual runtime diff and ran 555 tests/31 files successfully. Reviewed scene/renderer preservation, RoomView async cleanup, settings migration, temporary-map restoration and unchanged production/security boundaries. Found stale contextual interaction heading after attempted non-displacing movement; app owner corrected it and adds regression coverage. Found social-card dimension metadata mismatch; metadata now matches 1280×720 generated image.

Independent renderer agent reviewed docs/tooling: corrected scene-webtiles package description, documented live packed place format 2 separately from authored fixture/poster atlas, and migrated retained animated/Still/impact raster checks from the deleted mixed-renderer script to `testbed/living-checks.html`. Pure first-person cases are removed; retained renderer acceptance checks remain.

Actual browser: new 2.5D room fixture inspected and used to regenerate poster/card; View menu contains Dungeon tilt/zoom/animation/movement only. Live GameScreen scheduler produces distinct actor frames and stops in Still mode. Real GameScreen map fixture transfers cursor to flat renderer and keeps exactly one gameplay canvas. Further repeated transitions, narrow layout, production preview and hosted checks pending.


### Release preparation checkpoint

Clean reinstall removed stale local Three packages. Final full suite: 132 files passed/one optional file skipped, 2236 tests passed/two skipped (13.30s). Forced TypeScript and production build passed. Final input review: 136/136; final public/menu focused tests:112/112. Net collected test reduction432 is explained in BASELINE.md. origin/main re-fetched unchanged at91bf21a. Existing GitHub and Cloudflare credentials verified without changing scopes. Prepared release0.3.67/source tag cloudflare-online-v1.64; tag not yet created, commit/dry-run/publication pending.

Browser evidence: preview anonymous CBRG game rendered with no console errors, desktop and390px captures saved. Pixel lanes tiles342/342 and markers216/216 pass. Surface-light fixture exposed synchronous readback starvation, so only test scheduling changed: yield between every existing sample, retain exact sample times/assertions and release discarded canvases. Remaining lane results will be recorded before publication where available.
