# Session log

## 2026-11-11 — Phase 0 initialization

- Read the complete user initialization brief from its attachment.
- Inspected `/Users/vittis/dev/dcss-client`: empty directory, not a Git repository; no parent AGENTS.md found.
- Confirmed Node v24.11.1, npm 11.6.2, Git and GitHub CLI availability.
- `gh auth status` exited 1: configured `vittis` token invalid. Proceeding with local clone; hosted fork remains blocked.
- Initialized STATUS.md and this log before source acquisition. No application code changed.
- Acquired complete Orbrun history at b65fc15ca1b58969cb061a7749db8cbdb92b8f4d after sandbox DNS retry. Copied into workspace without overwriting project notes; Git metadata copy/branch/remotes required approved execution.
- Established chore/phase-0-foundation and upstream remote. No origin because no authenticated hosted fork.
- Read README, CONTRIBUTING, ABOUT, INSTALL, root package metadata, .npmrc and .gitignore. Upstream ignores AGENTS.md; no repository AGENTS.md found.
- Launched independent architecture, controls and security/licensing agents (three concurrent slots); build investigator queued.
- Started locked npm ci with isolated temporary npm cache. Application remains unmodified.
- npm ci passed (116 added / 127 audited); lockfile unmodified. npm audit returned 10 vulnerable package nodes; security reviewer triaging.
- Unmodified npm test failed at suite registration despite 1,836 passing tests; missing local WebAssembly engine causes empty describe.each in offline engine suite.
- Typecheck and production build passed; build reports >500 kB chunk warnings.
- npm run e2e failed (6 failed, 38 skipped) because spell-bar/helpdump tests assume absent engine/dist/stable/engine.json. No production changes made to conceal baseline failures.
- Dev server first launch hit sandbox EPERM; approved retry binds loopback only. Browser tool connected for runtime verification.
- Browser validation: local shell, Accounts/server picker, login form without submission, keyboard Escape back, CDI anonymous lobby and active 0.34 spectating. Live textured 3D scene, Canvas minimap, HUD/messages/level changes observed; queried console warning/error logs empty. No credentials/chat/gameplay commands sent.
- Local room testbed rendered Canvas map and Three scene; Face south changed yaw to 180 degrees. Saved two small screenshots under project-notes/evidence. Physical and browser-emulated gamepad testing unavailable; unit inputs remain separate.
- Received all four reports. Controls independently passed 11 files/388 tests; build reviewer reproduced both failures and corrected early E2E attribution (spell-bar/helpdump, stable engine). Updated baseline accordingly.
- Architecture and controls agents challenged proposal: current state is not strictly single-writer; preserve scene only provisionally; test complete direction/target/context slice before broad extraction; live spectate is remote execution, not isolated fixture work. Integrated into architecture/ADRs/roadmap.
- Security reviewer safely demonstrated global gamedata execution, internal-destination route acceptance using mock fetch and a null-batch exception. Copied portable mock-only probe into evidence and reran exit 0. Recorded licensing provenance uncertainties without claiming specific infringement.
- Rechecked GitHub authentication with approved keyring access: succeeded. Original invalid-token result was sandbox-only. Existing vittis/orbrun lookup failed; created requested hosted fork, added origin and fetched it; verified parent Caeous/orbrun. Earlier hosted-fork blocker is resolved.
- Ran explicit partial engine-free test selection: 130 files/1,836 tests passed, exit 0. Default command remains failed; no source/test/lockfile modifications used to hide failures.
- Wrote README, ARCHITECTURE, DECISIONS, MASTER_PLAN, RISKS, BACKLOG, RUNBOOK, AGENT_REPORTS; reconciled BASELINE and STATUS; retained four detailed reports. Final independent review and local documentation commit pending.
- Final independent reviewer found no blocking architecture/security documentation defect; checked source equality, notes/links and both screenshots without claiming a separate browser run. Corrected P1-007 acceptance wording from "baseline remains passing" to "no new failures, default green after P1-001" so the known failing baseline is not contradicted.
- Root final checks: all eleven required notes present, relative Markdown links resolve, tracked source diff against b65fc15 empty, no credential-pattern matches in notes. Development server remains loopback-only at 127.0.0.1:5173 (observed PID 29880); temporary browser validation tab closed. No background automation created.
- Final closure: Phase 0 accepted with explicit engine/hardware/authenticated/compatibility exceptions. All required baseline commands executed, failing commands remain documented. Final review report retained; STATUS, BACKLOG and MASTER_PLAN reconciled. Next session begins P1-001 and source-backed security stabilization; no UI/renderer rewrite begun.
- Local initialization checkpoint contains only project-notes (11 root notes, 5 independent reports, 2 screenshots and 1 safe probe). Branch is not pushed; hosted fork contains upstream history. Verify checkpoint with git log -1 and cleanliness with git status --short. Development server left on loopback for local use.

## 2026-11-11 — Cloudflare deployment feasibility

- User asked whether deployment to Cloudflare would be straightforward and supplied an open Chrome dashboard as context. Read-only dashboard inspection confirmed Workers & Pages access and an existing workers.dev subdomain; no Orbrun or orbrun-engine service listed. No Cloudflare application, permissions or deployment changed.
- Inspected root wrangler.jsonc and apps/orbrun/worker/index.ts: existing Worker serves static build, gamedata/morgue proxy, optional event counts and /engine routes. Config requires ENGINE service `orbrun-engine` and EVENTS analytics dataset. Static-only upload is insufficient for current cross-origin gamedata flow.
- Ran npm run deploy:check (Wrangler deploy --dry-run): bundled 93 asset files and 16.25 KiB Worker (5.27 KiB gzip), exit 0; log-location sandbox EPERM reported. Repeat with `WRANGLER_LOG_PATH=/private/tmp/dcss-wrangler-readiness.log WRANGLER_SEND_METRICS=false npm run deploy:check` passed exit 0 without the log-write error. Dry-run validates local packaging, not remote binding existence, permissions or deployed runtime.
- Deployment recommendation: online-only Worker initially; unique fork name/source URLs, remove offline binding and handle disabled offline routes/UI, decide whether to omit analytics, then address documented proxy/loader exposure gates. Git build root repository `/`, build `npm ci --include=dev && npm run build`, deploy `npx wrangler deploy`; these settings already appear in upstream config and match current Cloudflare documentation. No main-account credential or public-release safety claim made.

## 2026-11-11 — Authorized online Cloudflare deployment

- User authorized implementation/deployment, completed GitHub login in Chrome, and explicitly approved a dedicated Cloudflare build token after automatic approval review blocked credential creation. No credentials were read or committed.
- Removed hosted engine/analytics bindings; production server policy is bundled HTTPS/WSS only. Preserved development workflows and inherited first-person presentation.
- Replaced remote AMD execution with bounded Acorn parsing and locally implemented accessors/flag decoding. Pinned fixture parity plus current CDI stable/trunk modules passed. Added Acorn MIT notice.
- Hardened Node/Worker proxies (allowlist, no redirects, bounded time/bytes/concurrency/cache), validated Worker cache destinations before lookup, normalized query-free keys. Added malformed-wire/resource-limit coverage and explicit Session load failure handling.
- Default full suite before final Session edits: 132 files / 1,912 tests passed, 2 engine skips. Optional E2E: 44 explicit engine skips, no real-engine gameplay claim. Typecheck/build passed; Worker dry-run20.86KiB, onlyASSETS binding.
- Production preview connected to CBRG (Brazil) and anonymously watched a live 0.34 game with rendered textures, HUD, minimap and changing messages. No login, chat or gameplay commands sent.
- Full audit retains ten development-tool advisories. Production-only audit must override repository include=dev: npm audit --include=prod --omit=dev; this reported zero.
- Fork source links target cloudflare-online-v1 release tag, with upstream credit retained. Corrected unsupported blanket tile-art CC0 assertion; provenance inventory remains incomplete, no specific infringement established.
- Deployment settings prepared in Chrome: vittis/orbrun, dcss-client, root/, pinned Node24.11.1, install/typecheck/test/build pipeline, npx wrangler deploy, preview builds off. Final commit/push and hosted smoke checks pending.

- Final integrated suite after Session changes:1,916 passed/2skipped. Independent release review caught unsafe-inline CSP permitting server-dialog handlers; removed it, externalized About controls as /site-controls.js, added frame-src none and script-src-attr none.18 site/analytics tests, full typecheck/build and final dry-run passed (96assets,20.86KiB Worker).

- Published initial source31bfef3/tag cloudflare-online-v1. Cloudflare build a56e43d7 failed before deployment: clean TypeScript consumers lacked allowImportingTsExtensions (TS5097); previous incremental local checks missed it. Moved the setting to shared base (all projects emit declarations only). Kept v1 immutable, updated source links for corrective release cloudflare-online-v1.1, and forced full typecheck.
