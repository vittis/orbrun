# Baseline stabilization — 2026-11-12

Authorized scope: dependable browser verification, simpler temporary-map lifecycle, settings extraction and validation, narrow-window HUD correction, verification gates and documentation consolidation. Preserve existing 2.5D artwork/rendering, flat supporting views, compass controls, storage keys and accounts/saves, development/offline support, and production/security boundaries.

## Starting point

Clean `codex/dungeon-only` at `88166befdfa7a4bfa37027751df2de56f039bcdb`; fetched origin/main `a37449b0749bbbf3c241a55e099947f646c4a860` is already an ancestor. New branch `codex/baseline-stabilization` retains the prior release's final evidence. Origin is vittis/orbrun; upstream is Caeous/orbrun. No applicable AGENTS.md found. Starting app/source: 0.3.67 / cloudflare-online-v1.64. Initial forced TypeScript and 2,236 unit tests passed (two optional-engine skips); current results are in BASELINE.md.

## Ownership and sequence

Bounded read-only investigations precede implementation:

- Renderer agent: browser fixtures and independent authored-art oracle; owns testbed files except map-lifecycle. No runtime renderer algorithm changes.
- App agent: game/map lifecycle and responsive HUD/grid/layout source/tests; owns map-lifecycle fixture.
- Settings agent: servers/settings extraction and associated tests. Main updates remaining consumer imports after extraction to avoid overlapping edits.
- Main: shared manifests/lockfile, verification runner/CI, documentation, integration, independent review coordination and release.

Agents report proposed contracts before edits. Any shared-file changes require coordination. Main owns release/version metadata; agents do not commit or deploy.

## Acceptance

- [x] Independent authored-sprite raster expectation passes without changing visuals or weakening coverage.
- [x] Bounded browser fixtures and reliable Still/reduced-motion checks.
- [x] One Dungeon/temporary-map transition path; cursor, settings, resize and repeated lifecycle retained.
- [x] Dedicated settings module, compatible storage keys, finite validated numeric values, unrelated data preserved.
- [x] Narrow mouse and touch layouts fit; desktop presentation retained.
- [x] One documented verification command; branch/PR CI; optional engine lane separate.
- [x] Consolidated current documentation and explicit historical release evidence.
- [x] Independent integrated diff review and appropriate full verification.
- [x] Clean commit, fresh-main guard/dry-run, new immutable source tag, atomic publication and automatic deployment.
- [x] Hosted identity/behavior/security checks and published final evidence.

## Integration evidence

One presentation state replaces the prior correlated flags; settings cannot select a view. Independent review found narrow-list/prompt overlap, resolved with bounded scroll bands and preserved map origin. Settings extraction retains keys/defaults and uses a documented normalization policy. Renderer packages and artwork remain unchanged.

The new browser gate caught a test-selector error, fixed without changing runtime behavior. Full raster matrices now finish in about a minute and pass all 4,072 checks; native reduced-motion transitions pass. Verification is typechecked, rejects reduced assertion counts, aborts public WebSockets in preview tests and preserves failure traces.

Independent reviewers inspected settings/storage, renderer oracles and full matrices, map/pointer/layout behavior, verification/CI and documentation links/security safeguards. Local `npm run verify` passed: 2,296 unit tests plus 14 browser tests. This is the completed 0.3.68 release result; see releases/0.3.68.md for its evidence. BASELINE.md now records the subsequent fast-iteration verification setup.

Release source, guarded preflight, branch CI and hosted evidence: [releases/0.3.68.md](releases/0.3.68.md).

Linux CI found a real font-metric defect after the local gate passed: actual small glyphs were wider than a scaled100px estimate. Fixed GridHost to measure/cache actual sizes, added four nonlinear-metric/cache regressions and kept browser overflow assertions unchanged. Local full units and affected browser cases pass; branch CI is rerun before promotion.

## Completion

Release 0.3.68/source tag `cloudflare-online-v1.65` is deployed and verified at commit `858964a`. Both clean-install branch CI and main CI passed, as did the automatic Workers Build and hosted identity/behavior/security checks. Final evidence and exact IDs are in [releases/0.3.68.md](releases/0.3.68.md). No runtime/rendering change is included in this post-deployment evidence commit.
