# Working on Orbrun

Keep the existing 2.5D gameplay presentation and flat supporting maps. Preserve server-authoritative state, confirmed combat/visibility, Still/reduced motion, storage compatibility, and production's online-only boundary. See project-notes/ARCHITECTURE.md for ownership.

## Fast iteration

- Inspect `git status` first and preserve unrelated edits. Install dependencies only when missing or the lockfile changed. Chromium is needed only for browser checks.
- While editing, use `npm run test:changed` (changes since HEAD, including staged/unstaged/untracked files), `npm test -- <test-file-or-filter>`, or `npm run test:watch -- <filter>`. For a committed branch diff, use `npx vitest run --changed origin/main`.
- Prioritize fast iteration and manual verification. Run focused tests for changed behavior and typecheck when TypeScript changes; do not run full verification/release gates automatically for routine publishing.
- Visually inspect UI changes at desktop and narrow sizes, including loading and Still/reduced motion where relevant. Use representative browser tests when they provide useful coverage, not the entire matrix by default.
- For deployment tooling, run the affected deployment tests. Reuse unchanged app builds and pinned engine artifacts. `npm run verify:release` remains an optional broad audit, not a publishing prerequisite.
- Changed-test selection follows imports and can miss CSS, assets, readFile fixtures and build configuration. Apply the broader commands above even when it selects zero tests. A zero-test run is not verification.
- Engine changes need the separately provisioned `REQUIRE_ENGINE=1 npm run e2e`. Missing artifacts are an explicit coverage limitation, not success.

## What deserves a test

Protect meaningful behavior: protocol/order, commands, persistence, scene/rendering, lifecycle, accessibility, security and deployment. Add the smallest regression that fails for the bug being fixed. Prefer observable results over private fields and call sequences. Do not add tests for cosmetic copy/order or trivial helpers solely to increase counts. Remove redundant cases when changing their area; keep meaningful boundaries and independent visual oracles. No coverage-percentage quota.

Keep isolated tests, deterministic fixtures and zero browser retries. Use fake time for unit timing; retain deliberate real-time observation windows that prove animation loops sleep. Avoid public-server dependencies in automated gates. Keep performance evidence outside the default suite; do not add wall-clock assertions to CI.

## Commands and reporting

project-notes/RUNBOOK.md is the command reference; project-notes/BASELINE.md records timings and coverage tradeoffs. Browser failures retain traces/screenshots under ignored test-results/. Keep strict loopback server ports so checks cannot accidentally use another checkout. Report commands, results, skips and limitations accurately. Never claim deployment or physical-device acceptance from local tests.
