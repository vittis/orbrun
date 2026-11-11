# Agent B — Controller and interaction investigation

Date: 2026-11-11. Revision: `b65fc15ca1b58969cb061a7749db8cbdb92b8f4d`.
Scope: read-only source review and focused existing automated tests. No production changes, hardware testing, live gameplay, or independent browser validation.

## Recommendation

Reuse Orbrun's device normalization, contextual menus, OSK, key encoding, and existing regression tests. Refactor directional command interpretation before making Canvas the primary renderer. The controller is not presently independent of presentation: the low-level device adapter is mostly independent, but the command executor and context construction depend on camera facing. A full fork is the lower-risk starting point because the valuable interaction system is in the app rather than a standalone controller package. Extracting packages immediately would entail moving and rewiring much of the app before demonstrating parity.

## Observed input flow and evidence

- `apps/orbrun/src/main.ts:740-770`: `tick()` calls `GamepadInput.poll()` each animation frame with a connected or virtual-held pad; otherwise uses 250 ms idle polling, with immediate wake on `gamepadconnected`. Input sampling does not wait on dungeon rendering. Latency is frame-scheduled; no measured latency claim is made.
- `apps/orbrun/src/gamepad.ts:171-209`: polls `navigator.getGamepads`, selects most recently active pad, favors standard mapping when raw/virtual twins wake, and emits releases/zero look on disconnect.
- `gamepad.ts:99-112, 278-307`: left-stick entry 0.55 and exit 0.4; angular hysteresis (9 degrees on eight-way sectors); direction repeat 350 ms initial delay / 90 ms subsequent interval. Held buttons use 420 / 100 ms. `deadzoneL` exists in options but is not read beyond assignment: low severity API cleanup, high-confidence source finding. Right stick enters at 0.3, leaves at 0.15 and applies a quadratic response.
- `gamepad.ts:325-349`: `standardView` supports browser standard mappings plus heuristic Linux xpad and Bluetooth layouts. Unknown devices fall back to raw order. Hardware compatibility beyond these layouts remains unverified; recognizing Bluetooth by button count rather than a device mapping is a medium-likelihood compatibility risk, not a reproduced failure.
- `gamepad.ts:262-272`: d-pad combines horizontal/vertical buttons into all eight compass sectors. `fourWay` only modifies left-stick sectors; `game.ts:962-963` enables it during 3D command mode.
- `bindings.ts:1753-1808`: `resolve` dispatches device events through current context into typed `Action`s. Menus, focus surfaces, targeting, level maps and text entry have separate direction handling. Repeat events only activate explicitly repeatable actions (`repeatsHeld`, lines 1734-1744); autorepeated combat stops across mode changes.
- `context.ts:258-303`: `deriveMode` prioritizes phase, more, text, dialog, popup/menu, CRT, map, server mouse modes and a raw-prompt fallback. Do not describe this as depending solely on explicit protocol mode: the raw prompt exception checks prompt channel and read position.
- `context.ts:791-836`: `deriveContext` gets targets from scene and camera, then enriches mode with menu/OSK/targeting state. Shop behavior derives from server menu footer/row text (`shopContext`, line 708); targeting hint parsing uses English phrases (`select action`, lines 819-828). These compatibility dependencies warrant recorded fixtures per supported DCSS version.
- `game.ts:1535-1615`: `pad` arbitrates chat, client overlay, right-stick camera/map behavior, holds, spectator restrictions and `resolve`/`Runner.execute`. It is integration logic, not a clean reusable controller package.
- `runner.ts:117-160`: a shared send path blocks spectator game commands, keeps sequencing and delegates outcomes to server. Animation hints are client-side; no evidence here of independently simulating combat outcomes.

## Confirmed top-down blockers

1. **High impact / high confidence — camera-relative command directions persist outside 3D.** `Runner.absolute` (`runner.ts:316-317`) rotates by camera facing; `Runner.step` (`432-477`) uses it and may turn instead of sending a key. `GameScreen.onKeyDown` (`game.ts:1839-1848`) rewrites command/targeting keys without checking renderer. Pad `resolve` defaults left/right to turns; settings also default them to turns (`servers.ts:638-639`). This is intentional first-person behavior upstream, a requirement mismatch for this project, not an upstream bug.
2. **High impact / high confidence — targeting has first-person orbit semantics.** `absoluteAim` (`runner.ts:334-336`) rotates by grid/camera facing; `step` (`435-444`) converts plain left/right into `orbitStep`, walking around the player. Level-map directions are already absolute (`447-450`). Must explicitly test targeting, examine and compass prompts, not just ordinary movement.
3. **High impact / high confidence — contextual action target is camera-defined.** `deriveContext` computes `ahead` from `cam.facing` (`context.ts:793`); opening and closing doors depend on forward direction (`runner.ts:655-657,672-688`). A top-down selection/interaction policy needs an explicit visible target or chooser, rather than invisible facing.
4. **Medium impact / high confidence — 2D is deliberately not user-selectable.** `servers.ts:602-609` sets `VIEW_OPTIONS=false`; `getSettings` forces 3D at line 651 even with persisted 2D. Restoring the UI setting alone does not fix items 1–3.
5. **Medium impact / high confidence — implementation and user docs diverge.** ABOUT says A may attack/step and held direction runs. Current `Runner.contextual` does neither general attack nor general step (closed door is a step exception), and `bindings.ts:25-31` expressly implements repeated single steps, never a server run. `bindings.test.ts` tests these current semantics. Use executable behavior as baseline and update controls text when the new mode lands.

## Reuse/refactor/replace

| Component | Recommendation | Rationale |
| --- | --- | --- |
| `gamepad.ts` normalization, hysteresis, repeat, activity glyph detection | Preserve initially | Existing tests and mostly renderer-free event stream; later remove unused option and validate focus/device handoff. |
| `keys.ts` WebTiles encoder | Preserve | Existing legacy keycode/modifier/NumLock/CapsLock coverage; `directionKey` already emits compass directions. |
| `menu-nav.ts`, focus, OSK, action/pack tabs, chat input | Preserve behind existing hooks | Broad interaction coverage would be expensive to recreate; require mode regression tests. |
| `bindings.ts` action tables and hints | Preserve behavior, split by responsibility only when touched | 1,809 lines combines catalogues, hints, mode policy and resolver. A full new binding framework is unnecessary. |
| `context.ts` | Incrementally isolate camera/selection-dependent target calculation | Retain server mode and prompt/menu compatibility behavior; do not introduce second game state. |
| `runner.ts` | Separate world-direction commands from first-person presentation | 776 lines mix input sequencing, camera turning, targeting orbit, contextual interactions and transport dispatch. |
| `game.ts` routing | Incremental extraction after contract tests | 2,622 lines; actual UI integration path matters, so test harnesses alone do not justify a wholesale rewrite. |
| First-person look/orbit/auto-face/viewmodel behavior | Disable in top-down policy, retain until replacement verified | Do not copy camera semantics into new renderer interfaces or delete useful upstream reference prematurely. |

## Proposed minimal boundary

Device adapters emit button/axis/keyboard events. Existing context resolver maps them to menu/OSK operations or world-coordinate gameplay intents. A single dispatcher encodes intents as WebTiles keys and preserves cancellation/sequence guards. Renderer consumes scene snapshots and optional presentation events; it cannot choose command direction. Keep an explicit first-person direction adapter temporarily if preserving the upstream mode, rather than testing renderer classes inside every input path. This can live as a few app modules initially; new packages or a generic middleware/event-bus framework are not justified.

For top-down mode, N/NE/E/SE/S/SW/W/NW send identical server directions under every camera orientation and renderer. Keyboard Shift/Ctrl semantics remain run/attack. Held pad directions stay bounded repeated single-step inputs initially. Right stick should have an explicitly chosen presentation/selection role; it must not silently rotate subsequent game commands. Contextual A retains underfoot interactions; adjacent ambiguous interactions use a visible selection or chooser. Server outcomes remain authoritative.

## Verification performed

Executed existing tests with:

```sh
npx vitest run apps/orbrun/test/gamepad-repeat.test.ts apps/orbrun/test/gamepad-look.test.ts apps/orbrun/test/bindings.test.ts apps/orbrun/test/game-controls.test.ts apps/orbrun/test/runner-controls.test.ts apps/orbrun/test/runner-step.test.ts apps/orbrun/test/keys.test.ts apps/orbrun/test/osk-cursor.test.ts apps/orbrun/test/menu-nav.test.ts apps/orbrun/test/movement-cadence.test.ts apps/orbrun/test/game-movement.test.ts
```

Exit 0: **11 files, 388 tests passed** (Vitest 3.2.7, reported duration 974 ms). This independently verifies synthetic gamepad/keyboard events, pure bindings, mocked DOM OSK/menu and command-routing scenarios. `game-controls.test.ts` deliberately uses a GameScreen prototype harness without constructing a renderer/socket; these are not browser or physical-controller tests.

Existing additional coverage includes recorded menu fixtures, chat-pad, pad-keys, runner-door/examine/cast, focus, action tabs, reconnection and gamepad hints. The separate `apps/orbrun/test/e2e/matrix.ts` suite exercises an offline engine across surfaces and inputs; it is excluded from default `npm test` by `vitest.config.ts`. Its existence is evidence of capability, not a claim that I ran or passed it.

## Next test gates

1. Characterize all eight directions × keyboard/d-pad/stick × heading × command/target/look/level-map/compass modes; verify exact outbound keys and no optimistic authoritative state changes.
2. Test first-person and proposed absolute adapters against same input fixtures before switching defaults. Include Shift/Ctrl/CapsLock/NumLock and macro/text raw-key paths.
3. Test held movement/combat across prompts, disconnect, device switch, focus loss/regain, background-tab resume and network delay. Current code sends repeated movement immediately without waiting for echo; quantify queued commands under latency before choosing a throttle policy. Do not infer safe latency from unit timings.
4. Test inventory pickup/multiselect/use/drop/adjust, targeting spell/fire/reach/examine, shop buy/list/confirmation, ability, more, CRT skills, level-map travel/exclusions, character creation, login and text entry/OSK. Existing fixtures should be expanded before replacing UI.
5. Real browser controller emulation and physical Xbox/PlayStation/Switch/Steam Deck checks remain required. Verify diagonals, drift, hotplug, raw/virtual duplicate devices, OSK composition and controller-only completion of ordinary gameplay.

## Completed, unresolved, and dissent

Completed source inspection and focused existing tests. No edits in repository. Unresolved: real browser/gamepad behavior, controller-only end-to-end coverage, nonstandard hardware mapping, focus safety, macro reachability, server/version changes to text-parsed prompts, and high-latency repeat behavior.

I disagree with any proposal that calls the controller reusable unchanged or claims switching Canvas restores native eight-way DCSS controls. I also disagree with immediate selected-package extraction: the strongest controller assets are app-local and coupled through overlays/context/runner. Preserve the scene abstraction provisionally because both existing renderers and input context use it; constrain new command contracts to world coordinates, not its current first-person camera. PixiJS is not needed to establish control correctness; a Canvas baseline is the right next milestone. A simultaneous Canvas/PixiJS/Three feature architecture would multiply verification work before need is demonstrated.

## Independent critique of orchestrator proposal

Reviewed proposal: full fork; retain mutable-state/revision ownership and Scene/MapRenderer initially; Canvas primary in Phase 2; isolate orientation/input dispatch before UI rewrite; benchmark-gated Pixi in Phase 3; no third renderer commitment; security gates public deployment/authentication but permit isolated fixture work.

- Agree with full fork, conditional on keeping upstream history and avoiding needless broad refactors. Reusing selected packages would discard controller work concentrated in app files, so it does not materially avoid the hardest integration.
- Agree with retaining Scene/MapRenderer provisionally, but disagree if this becomes a permanent fixed interface requirement. `deriveContext` currently takes Scene + Camera, so keeping all current scene consumers unchanged would preserve an invisible facing dependency. Introduce a narrow explicit interaction target input; do not make the renderer synthesize a fake north-facing camera to satisfy gameplay behavior.
- Agree with mutable authoritative state ownership for Phase 0. Do not equate mutation with unacceptable architecture. Add revision/identity tests around consumers before changing ownership; presentation caches must neither mutate authoritative state nor become a competing source of truth.
- Strongly agree that direction policy precedes default-Canvas/UI changes. Acceptance must include targeting orbit, look mode, door compass prompts and all eight keyboard/pad directions, not only map movement. Keep server macro/text raw input untouched.
- Agree with benchmark-gated Pixi, but benchmark must compare a real required visual workload and readability, not just FPS on the upstream static Canvas baseline. Canvas may already meet Phase 2 and some Phase 3 effects; no obligation to adopt Pixi.
- Agree with no three-renderer commitment. Preserve current Three code as reference during migration; avoid creating a permanent feature-parity matrix for a first-person mode outside the product objective.
- Agree security issues should block public deployment and credential use. Tighten the local-work exception: fixtures and bundled/local assets are isolated; live public-server spectating can still execute remote gamedata, so it is not equivalent to local fixture testing. Use no credentials in that browser context and explicitly record remote execution exposure until hardened.
- A useful pre-Phase-2 gate is verifying controller-only navigation and OSK with existing browser UI, because pure resolver tests cannot establish reachability. Physical-device validation remains separate and can be explicitly deferred if unavailable.

No fundamental dissent with proposed phase order; material qualifications are the interaction-target boundary, provisional scene interface, and not calling remote spectating isolated fixture work.
