# Agent A — Architecture and maintainability investigation

Date: 2026-11-11. Source revision: `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`.
Scope: read-only inspection of Orbrun source, package manifests, root/package documentation, existing tests, and a limited official WebTiles source comparison. No application edits, dependency installation, or runtime/test execution by this agent. Severity below describes engineering impact; confidence reflects source evidence, not runtime verification.

## Recommendation

Retain the full Orbrun fork for Phase 0–2, preserve Canvas 2D as the initial primary renderer and correctness reference, and postpone both package extraction and a GPU renderer decision until top-down controller semantics and visual parity are demonstrated. The valuable reuse is the full interaction implementation, not merely protocol packages. Controller code is currently app code, not a separately reusable package.

The scene abstraction is useful but is neither purely top-down nor a fully isolated immutable snapshot. Keep it initially, document its actual ownership, and remove only the specific first-person dependencies encountered while implementing a tested top-down path. Do not introduce a general multi-renderer framework or rewrite state management preemptively.

## Observed package and execution boundaries

- Root npm workspaces cover `packages/*`, `apps/*`, `tools/*`. Eight library packages export TypeScript source directly; they are workspace libraries, not independently built JavaScript release artifacts. Root `tsconfig.json` references every package and app.
- `@orbrun/webtiles`: protocol messages, WebSocket lifecycle, formatted text, mutable authoritative state; no package dependencies.
- `@orbrun/gamedata`: server-specific enums, tile tables, flags, and images; no package dependencies. It structurally implements `scene.TileSource` without importing scene.
- `@orbrun/scene`: cells, billboards, camera, spatial queries, presentation timing, renderer/asset contracts; no package dependencies.
- `@orbrun/scene-webtiles`: depends on webtiles/gamedata/scene; interprets DCSS tile/flag/UI data and constructs scenes. It also contains 3D-oriented ceiling/feature classification.
- `@orbrun/render-2d`: scene only; Canvas drawing, minimap, glyphs, tiles, and hybrid modes.
- `@orbrun/render-3d`: scene plus Three peer dependency; app supplies Three. Current implementation uses custom shaders, instancing and chunked geometry (`src/index.ts:37`, `level-mesh.ts`, `sprites.ts`, `shaders.ts`), not only conventional Three scene objects.
- `@orbrun/vault`: scene and scene-webtiles; builds the front room from `.des` content. `@orbrun/offline`: webtiles; wraps the real crawl WASM engine behind the same Connection contract.
- `apps/orbrun` depends on all eight packages; owns session, screens, settings, menus, HUD, gamepads, context and command execution. `main.ts` coordinates accounts/lobby and lazy game screen. `game.ts` coordinates rendering, inputs, view/camera effects and UI.

Flow: remote WebSocket -> `RemoteConnection.dispatchText/dispatch` -> `Session.handle/apply` -> `reduce` -> `Session.flushScene` -> `buildScene` -> renderers and HUD. Input: keyboard/GamepadInput -> context + bindings -> Runner -> Session.send -> Connection.send. Server echoes then drive state and presentation. There is no independent combat/turn simulation in these layers. Offline mode runs actual DCSS in WASM; it should remain optional and must not be confused with official online saves/statistics.

## Evidence and findings

### A1. Mutable state is incorrectly documented as immutable — medium, confirmed documentation defect, high confidence

`packages/webtiles/README.md` describes an immutable reducer. In fact `packages/webtiles/src/state.ts:1288–1306` explicitly applies in place and returns the identical object. `mergeCells` (:822), `mergeObjects` (:797) and `mergeMonster` (:803) mutate maps, cells, and monster objects, including objects originally passed in a message. `GameState.rev`, `dirtyCells`, `mapCleared` (:674–680) are the invalidation contract. `Session.flushScene` (`apps/orbrun/src/session.ts:408`) clears dirty tracking after consuming it.

Consequence: identity-based subscriptions or retaining old state as a replay snapshot will silently fail. Preserve the mutable single-writer model initially; document it accurately, constrain writes to reduction/session lifecycle, and copy explicitly when recording snapshots. An immutable rewrite would threaten existing incremental assumptions without advancing top-down gameplay.

### A2. Useful renderer contract, substantial concrete renderer coupling in app — high migration risk, confirmed, high confidence

`packages/scene/src/index.ts:540` defines a small MapRenderer lifecycle: mount, setTiles, setScene, setCamera, setCursor, render, pick, resize, destroy. Canvas already implements it (`render-2d/src/index.ts:216`) and has faithful layer-order test coverage (`test/render.test.ts`, fake canvas drawing calls).

But `apps/orbrun/src/game.ts` uses concrete Render3d/Render2d checks and casts for layout (:668), warmup (:737), renderer selection (:752), viewmodels (:858), renderer parking (:887), animation scheduling (:950, :1145), rendering (:1043), map options (:1251) and touch projection (:1879). `park.ts` is explicitly a parked Render3d lifecycle. A third renderer is therefore not a drop-in plugin in the complete application even though the shared interface is small.

Mitigation: first add a tested top-down mode and isolate current first-person presentation behavior behind a small local policy/adapter as actual calls require. Avoid expanding MapRenderer to encompass hands, FOV, weapon swings, menu layout, and every existing renderer-specific feature.

### A3. Selecting 2D is insufficient to restore ordinary DCSS movement — high, confirmed behavior path, high confidence

`game.ts:1840–1851` intercepts direction keys in command/targeting modes and calls `Runner.step` as relative directions regardless of the renderer setting. Runner imports CameraController and contains camera/targeting/orbit behavior (`runner.ts:82` onward); context uses camera heading (`context.ts:791`). The renderer setting alone is not a control-mode boundary.

Preserve key encoding, mode detection, prompts and binding tables; separate absolute movement/target selection from camera steering. Require eight-direction output equivalence under every camera heading for the top-down mode. Controller support can become renderer independent, but it is not independent today.

### A4. Scene is renderer-facing but not fully neutral or immutable — medium, confirmed, high confidence

`SceneCell` (`scene/src/index.ts:103`) includes faceTiles, ceilings, stance and freestanding treatment; `Camera` (:494) mandates eye position, yaw/pitch and facing. Those are usable defaults for Canvas, not evidence they should all become mandatory concepts in a new top-down design. `scene-webtiles/src/index.ts:314` builds semantic snapshots and preserves untouched object identities via dirty sets, but `Billboard.ref` (:1271) points at raw mutable Monster objects. Scene helpers and app context cast these refs back to Monster (:1463–1480; `context.ts:325`). Render-only effects must not write to scene, refs, or GameState.

Keep Scene as an initial read-only consumption boundary. If later effects need historical monster snapshots, copy only the necessary stable ID/position/status fields. Do not use retained `ref` objects as history. Separate optional 3D decoration only if its measured cost or semantics warrant the split.

### A5. Incremental scene building reduces classification work but still scans full known map — low/medium performance risk, confirmed code pattern, unmeasured impact

`scene-webtiles/src/index.ts:332–355` allocates record/maps and loops through all map cells even on incremental updates; ceilings and wall counts add work. Tests (`test/incremental.test.ts:48`) compare full and incremental semantic output across recorded sessions and several flush cadences. Preserve these valuable tests. Do not claim O(changed-cells) complexity or poor performance without profiling representative full levels and effect workloads.

### A6. Source-visible scene invalidation gap for option-only updates — medium candidate bug, high source confidence, not runtime reproduced

`state.ts:1468–1475` changes options and bumps player revision for `options` / `set_option`; `buildScene` reads options such as tile_show_demon_tier and records them in its incremental guard. However `Session.apply` (`session.ts:349`) marks sceneDirty only for map/player/game_client/go_lobby, and `flushScene` returns immediately if sceneDirty is false. An option-only update may leave scene-derived option visuals stale until a later map/player event. Add a focused session regression before fixing. A global reducer/scene rewrite is unnecessary.

### A7. Oversized app modules and stale descriptive docs — medium maintenance risk, confirmed, high confidence

At this revision: game.ts 2,622 lines; menu.ts 2,965; hud.ts 2,550; bindings.ts 1,809; state.ts 1,764; scene-webtiles index.ts 1,535; render-3d index.ts 1,494. Lines alone are not defects, but the GameScreen responsibilities above create real change coupling. Extract by behavior only during relevant work, with command and scene replay checks protecting outcomes. `render-3d/README.md` still describes `crowd.ts`/`mesh.ts` files that are absent in the current source; current implementation is `sprites.ts`/`level-mesh.ts`/`shaders.ts`. Prefer source over prose during planning.

### A8. Connection is cleanly injectable, compatibility has explicit limits — medium integration risk, confirmed, high confidence

`webtiles/src/connection.ts:61–205` accepts a WebSocket constructor, orders JSON batches, handles ping, rejects stale socket generations, clears queued input on close, and supports reopen. Compression is not implemented: default requests `no-compression`; binary input is UTF-8 decoded rather than inflated. JSON typing is a cast, not complete validation, and handler failures are diagnosed then processing continues. Do not promise compatibility with every public server/version from the README claim. Use recorded fixtures plus real server/version matrix and reconnect tests.

## Alternatives comparison

| Criterion | A: full fork | B: selected packages + new app | C: official WebTiles base |
|---|---|---|---|
| Work to controller-first top-down | Lowest expected: fix coordinate semantics and layout | Higher: rebuild app interaction stack | Higher: add controller focus, contexts, menus, OSK |
| Protocol/server behavior | Existing library + recorded fixtures; matrix still required | Same inherited limits | Closest implementation reference; external hosting still work |
| Existing controller breadth | Retains it | Most resides in app, so package-only loses it | Not established by this limited source review |
| Top-down | Existing Canvas | Reuse Canvas | Native top-down rendering |
| 2.5D | Reuse semantic tiles; no commitment needed | Similar if Scene retained | New presentation extraction likely needed |
| Maintainability | Large first-person app; incremental isolation | Cleaner app possible, costly parity recovery | Existing AMD/jQuery/DOM integration |
| Security | Must harden inherited trust boundaries | Same gamedata risks unless replaced | Official origin trust assumptions cannot be transplanted blindly |
| Tests | Reuse broad repository suites | Keep library tests; new app regressions needed | Requires separate investigation; not asserted equivalent |
| Upstream fixes | Full history facilitates cherry-picks/merges | Manual package synchronization | Direct crawl history, larger project scope |
| Licensing | AGPL plus DCSS/asset attribution review | Extraction does not remove license obligations | DCSS/source/asset licensing still requires review |
| Performance | Canvas baseline and profiling available | No inherently faster rendering | No comparative measurements obtained |

Option A is a provisional engineering choice supported by existing interaction breadth and Canvas implementation, not an assertion that Orbrun is universally superior. Revisit B if first-person isolation repeatedly requires unrelated UI rewrites or retained code becomes a measurable maintenance burden. Revisit C if major protocol/visual mismatches dominate despite fixture-driven repairs.

Official-source comparison: inspected current `crawl-ref/source/webserver/static/scripts/client.js` via [upstream raw source](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/source/webserver/static/scripts/client.js). It uses AMD/jQuery with module/global UI state, DOM login/layer handling, and input event translation. It also preserves historical dynamic code handling (`handle_message`, `enqueue_messages`), so using the official client does not inherently solve cross-origin trust. This was a live branch file, not a pinned crawl checkout; full renderer/license/controller review remains outside this agent's completed work. Attempts to retrieve guessed renderer paths and Super Dungeon Crawl README/API through web access failed; no conclusions about that project's implementation are claimed.

## Target boundaries and ordering

1. Keep Connection and protocol as transport/interoperability; add validation/limits at trust boundaries, not a gameplay engine.
2. Keep Session as sole state lifecycle owner, but constrain app hooks (`hold`, `intercept`) and document command sequencing.
3. Keep scene-webtiles as authoritative-state-to-presentation adapter; retain incremental/full equivalence fixtures.
4. Extract only needed direction/command policy from Runner and camera-dependent context. Input emits absolute intents; camera animation consumes confirmed movement.
5. Keep Canvas primary for first top-down milestone. Preserve current renderer as regression reference until replacement passes real visual and interaction comparison.
6. Add presentation-only effects after command correctness. Effects must not infer combat, hidden cells, movement acceptance, or consume gameplay keys.
7. Keep existing menus/HUD/OSK and account/server flows until replacements satisfy explicit workflow matrix.
8. Treat asset loading as an untrusted-input subsystem; security fixes precede deployment or real-account use with untrusted sources.

PixiJS is not yet justified by measured requirements. In Phase 3 compare identical captured scenes and effect budgets in Canvas and a small optional GPU spike. Evaluate frame time, memory, startup/atlas upload, loss/recovery, visibility/layer correctness, accessibility and maintenance. Choose one main renderer implementation. Keeping a simple Canvas reference/minimap is reasonable; maintaining Canvas, Pixi and Three as equal feature-complete gameplay backends is avoidable scope. Optional 2.5D can use sprites/shadows/depth layers before requiring Three or isometric projection.

## Completed, unresolved, next actions

Completed: all eight manifests and package READMEs, root docs, state/connection/session/scene/renderer core inspection, app dependency/camera/input coupling inspection, representative tests, limited official client source comparison. No production files changed.

Unresolved: actual baseline execution (another agent/orchestrator), browser rendering correctness, real controller and authenticated play, all-server compatibility, comparative performance, complete source provenance/legal assessment, Super Dungeon Crawl access.

Recommended first tests: option-only scene invalidation; mutation ownership/snapshot expectations; top-down absolute directions in command and targeting modes at all headings; replay full vs incremental Scene; Canvas layer/cursor parity; disconnect while keys/gamedata load are pending.

## Independent critique of orchestrator's proposed decision

Reviewed 2026-11-11 after the initial report. Proposal reviewed: full fork; preserve mutable state/revisions and provisional Scene/MapRenderer; Canvas primary in Phase 2; isolate world directions/context/input before effects; measured Pixi decision in Phase 3; optional 2.5D; no three-backend product commitment; security gates before deployment/authentication but permit isolated fixture work.

Agreement is conditional, not a blanket endorsement:

1. **Full fork is the best initial experiment, not a permanent architecture commitment.** The case rests on app-level controller/menu reuse. Set a Phase 2 review checkpoint: demonstrate normal movement, targeting, inventory/spells/shop/text prompts without first-person camera dependencies. If achieving that requires pervasive changes across menu/HUD/session rather than a bounded direction/context policy, reevaluate a smaller app using selected packages. Do not use sunk fork setup cost as evidence.
2. **I disagree with describing current state as already single-writer.** That is the desired ownership rule. `apps/orbrun/src/menu.ts:718` directly clears `this.session.state.exit`; Session itself clears dirty state. Mutable state is intentional, but ownership is presently conventional, not enforced. Document authorized lifecycle mutations and inventory out-of-reducer writes before claiming the rule is met. A migration to immutable state is still unwarranted.
3. **I disagree with a broad “input dispatch first” extraction if it means redesigning Runner before a working top-down slice.** Characterize current outbound messages and implement an explicit top-down direction policy in the existing Runner/context paths first. Movement, targeting and context actions must be evaluated together: “A interacts ahead” depends on heading even if eight-direction movement becomes absolute. Extract the minimal stable boundary after those tests expose it; retain sequencing, spell lookup interception, confirmations and mode handling. A top-down setting must not alter keyboard macro/text capture.
4. **Preserve Scene provisionally, but do not call it a complete independence boundary.** Raw Monster refs and mandatory camera fields are real coupling. A future animation layer needs immutable presentation records for history, not immutable entire GameState. Do not pull 3D ceiling classification into a new package simply because it feels impure; profile cost or identify an actual semantic conflict first.
5. **Canvas is a strong baseline, not already proven visually equivalent or performant enough.** Existing tests record drawing operations on fake canvases. Require screenshots or pixel comparisons with actual tile atlases, remembered/visible/unseen cells, masks/status badges, dolls, clouds, flashes, cursors, targeting and level-map behavior. Browser checks and official-client comparisons must accompany unit tests.
6. **Pixi is appropriately gated, but include developer effort and effect requirements alongside speed.** A moderate effect workload may be easier and more maintainable on a GPU sprite library even before Canvas becomes slow. Conversely a benchmark showing faster sprites does not justify migration if perceptual effects, accessibility/reduced motion, picking and atlas lifecycle become harder. Benchmark an identical captured workload and define success thresholds before implementation.
7. **Three/2.5D is optional and no hybrid three-backend roadmap is justified.** Retaining untouched first-person source for upstream compatibility is different from promising maintained feature parity. Specify which presentation is supported by releases. True elevation/projection may later justify Three, while walls, shadows and parallax alone do not force it.
8. **Security gating is reasonable with a precise scope.** High-risk remote-code/proxy findings should block public deployment and real-account testing on the affected app origin until mitigated or explicitly constrained. They do not block offline fixture tests or loopback browser checks using only known local data. Server allowlisting is a useful interim trust constraint, not a replacement for sanitizing HTML or eliminating same-origin execution of arbitrary gamedata. Do not describe ordinary public-server spectating as credential validation.
9. **Do not overstate the alternative review.** I additionally inspected the official [game.js source](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/source/webserver/game_data/static/game.js): AMD dependencies explicitly include dungeon_renderer, display/minimap, mouse control, menus and UI; initialization and layout directly use document events/jQuery. This substantiates integration cost and its native top-down baseline, not a claim the complete official client has no controller code or weak tests. `client.js` remains the source reference for server lifecycle and direct keyboard semantics. These were live master files, not a pinned comparative build. Super Dungeon Crawl remains visual inspiration only; no code import or license compatibility assumption is justified from the failed retrieval attempts.

Recommended ordering: establish baseline and known exceptions -> add narrow trust-boundary regressions and fix deployment-blocking risks -> characterize outbound direction/context actions -> implement one complete top-down movement/targeting slice on Canvas -> validate remaining controller workflows and remove unnecessary first-person UI behavior -> measure rendering and effects -> choose renderer investment -> optional 2.5D. No large module splits, state rewrite, or new UI framework are prerequisites.
