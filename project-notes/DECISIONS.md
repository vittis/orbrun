# Architectural decision log

All decisions dated 2026-11-11. Append superseding decisions; do not silently rewrite history.

## ADR-001 — Preserve full fork through the first top-down milestone

- Context: obtain controller-first DCSS without recreating protocol, menus and OSK.
- Alternatives: full Orbrun fork; selected packages/new app; official WebTiles base.
- Evidence/tradeoff: Canvas and broad tested interactions already exist; controls live mostly in the app, so package extraction loses the main value. Full fork inherits first-person coupling and security debt. Official native top-down is attractive but a complete controller layer and standalone integration would require further work.
- Decision/rationale: retain full history/workspaces; build a bounded top-down slice and incrementally isolate dependencies. See ARCHITECTURE matrix.
- Consequences: retain unused/offline/3D code initially, preserve licenses, keep patches small for upstream merging. No rewrite in Phase 0.
- Revisit: Phase 2 gate, or repeated unrelated rewrites required by control changes; compare actual extraction cost and protocol mismatch burden.

## ADR-002 — Canvas first; defer GPU/2.5D commitment

- Context: modern visuals are desired, but correctness/control semantics are unproven.
- Alternatives: Canvas baseline; immediate Pixi replacement; Three orthographic; hybrid triple backend.
- Evidence/tradeoff: existing Canvas implements layer contract; browser room/minimap render verified, primary gameplay parity not yet. No app-specific Pixi benchmark exists. Three first-person features do not establish need for top-down geometry.
- Decision/rationale: make Canvas primary in Phase 2 after control tests; Phase 3 benchmark optional Pixi spike against defined workload/budget. Phase 4 optional geometry only after simpler depth effects evaluated.
- Consequences: keep simple Canvas reference/minimap if useful; choose one production primary backend, avoid feature parity across three engines.
- Revisit: measured effects/performance requirements cannot be met within chosen Canvas budget, or required 2.5D geometry justifies Three.

## ADR-003 — Preserve mutable state; tighten ownership and provisional scene contract

- Context: README claims immutability, actual reduction mutates and reuses nested objects; UI also writes state directly.
- Alternatives: immutable reducer rewrite; keep unrestricted mutations; retain revision model with explicit owner.
- Evidence/tradeoff: Session dirty sets and existing incremental/full equivalence tests depend on current behavior. Scene retains raw Monster refs; identity is not history.
- Decision/rationale: retain mutable reduction, make single-owner state transitions a stabilization target, and document current exceptions. Keep Scene/MapRenderer provisionally. Copy minimal confirmed attributes for effects history.
- Consequences: no Redux-style identity subscriptions, renderer/effect writes, or fake promise of immutable snapshots. Avoid bloating MapRenderer with first-person details.
- Revisit: demonstrated concurrency/history needs outgrow explicit snapshots or scene obligations materially block a second renderer.

## ADR-004 — Absolute command semantics before visual overhaul

- Context: Canvas setting still routes keyboard/pad movement and targeting relative to facing; contextual A uses ahead.
- Alternatives: change default renderer only; rewrite all input; a tested world-coordinate slice through current resolver/Runner.
- Evidence/tradeoff: independent controls review and 388 passing focused tests reveal reusable device/menu/OSK pieces and camera-dependent execution.
- Decision/rationale: implement movement, targeting/examine and explicit interaction-target semantics together in a narrow slice, then extract only necessary policy. Maintain one command send path and server authority.
- Consequences: all eight directions invariant across headings/renderers in top-down mode; right stick cannot silently change command orientation; keyboard modifiers/raw text preserved. Retain first-person adapter only where needed for safe transition.
- Revisit: slice demonstrates unnecessary Scene/camera requirements; simplify those concrete contracts instead of preserving them by default.

## ADR-005 — Security work gates exposure, not all local development

- Context: safe probes demonstrate executable gamedata in app realm, permissive proxy destinations and malformed-batch exception; dependency audit flags dev tooling.
- Alternatives: ignore until release; stop all work; scoped hardening before exposed/authenticated use.
- Evidence/tradeoff: source and offline mock probes reproduced primitives, not actual deployed attacks or compromise. Public trusted-server anonymous spectating is distinct from isolated fixture work and was conducted without credentials.
- Decision/rationale: restrict development service to loopback, resolve loader/proxy/bounds and transport policy before public deployment or account-bearing integration on affected origins. Continue fixture and source work. Do not consider a same-origin worker alone a security boundary.
- Consequences: use mock adversarial fixtures; no invasive public tests, auto audit-force upgrades, or secrets in logs. Credentialed acceptance remains deferred. License/source-offer/provenance checks also gate distribution.
- Revisit: threat model or deployment egress/capability boundary changes with verified tests; record residual trust explicitly.

## ADR-006 — Record unmodified failures and explicit Phase 0 exceptions

- Context: engine-free clone installs/builds/types successfully, but default tests and E2E do not cleanly skip absent engines.
- Alternatives: alter production/test configuration now; label all tests passing; document exact failures and focused workaround.
- Evidence/tradeoff: 1,836 tests pass; one empty test file fails. E2E spell-bar/helpdump fail on stable engine.json; unrelated engine cases skip. Offline engine requires separate toolchain/artifacts.
- Decision/rationale: leave upstream application, tests and lockfile unchanged; record failing commands, focused engine-free check, and a Phase 1 task to correct gating. Phase 0 deliverable can be accepted with named exceptions; it is not a green release baseline.
- Consequences: no inference of login/controller/gameplay correctness from build or unit checks; manual/hardware/server matrix remains backlog.
- Revisit: correct artifact-aware test gates and independently rerun baseline; engine E2E should be required in a separate provisioned lane.
