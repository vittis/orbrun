# Architecture

Orbrun is an npm/TypeScript workspace with a Vite app, Canvas renderers and a Cloudflare Worker. The DCSS server owns gameplay. The client interprets ordered WebTiles state and presents confirmed information.

| Area | Responsibility |
|---|---|
| `packages/webtiles` | Bounded connection/envelope handling, protocol keycodes, formatting and mutable state reduction |
| `packages/gamedata` | Bounded Acorn parsing of generated data without executing remote functions; atlas loading |
| `packages/scene-webtiles` | DCSS-specific classification and incremental scene composition |
| `packages/scene` | Render-facing cells, sprites, directions and shared visual-effect contracts |
| `packages/render-2.5d` | Sole gameplay renderer; raised-wall Canvas projection, visibility, lighting and confirmed animation |
| `packages/render-2d` | Flat temporary maps, minimap and development reference views |
| `packages/vault` | Restricted `.des` parsing and bundled scenery compilation |
| `packages/offline`, `engine/` | Development-only offline play; never used by the production menu |
| `apps/orbrun/src/session.ts` | Connection/state/asset sequencing, scene flushes and lifecycle |
| `apps/orbrun/src/game.ts` | Gameplay screen, renderer/map lifecycle, input and presentation coordination |
| `apps/orbrun/src/settings.ts` | Supported preferences, defaults, numeric validation and compatible persistence |
| `apps/orbrun/src/audio/` | Optional OSP pack loading/caching, worker-isolated matching and bounded Web Audio effects |
| App controls/HUD/menu modules | Device normalization, contextual commands, menus, targeting, settings and accessibility |
| `apps/orbrun/src/menu-home.ts`, `menu-modal.ts`, `menu-backdrop.ts` | Persistent Polished Crawl home, shared accessible document modal, silent recorded-gameplay backdrop |
| `apps/orbrun/src/room/` | Saved scenery and tiles retained for rendering fixtures and static document artwork |
| Worker/proxy/build tools | Static hosting, bounded allowlisted proxies, source identity and incremental deployment |

## State and presentation

The reducer mutates GameState; scene revisions and dirty-cell information drive incremental composition. Consumers must not mistake reused object identity for immutable history. Presentation snapshots only the identities, positions and visual fields needed for confirmed transitions.

Combat messages and state deltas drive effects. Named spell damage and native effect tiles share the DCSS presentation catalogue in `scene-webtiles/effect-types.ts` ([audit](COMBAT-ELEMENTS.md)). Explicit result classifications override ambiguous/reused native art; Searing Ray deliberately uses fire presentation without changing server damage mechanics. Named spell damage is classified before creature melee grammar, so Prism/force/energy and direct ability results retain their damage element without creating a physical attacker. Casting and status-only messages do not establish a damaging hit. An identified venom brand on the primary weapon is captured when a confirmed player weapon-hit message arrives, providing poison appearance even when lethal strikes omit the status follow-up; it does not assert extra damage or poisoning. Animation cannot delay command transmission, invent damage or hidden actors, change authoritative positions, or infer gameplay outcomes. Existing movement smoothing, wall/corridor behavior, visibility fading, spell traces and combat timing remain renderer responsibilities. Still/reduced-motion settings limit presentation work.

Unexplored fog uses one black starfield throughout the dungeon, with soft circular points, stable per-star variations, gentle curved drift and a handful of faint tapered curls. The separate atmosphere preference disables these decorations while retaining the exploration transition. Cached radial and curl artwork is bounded and released with the renderer. Branch atmosphere metadata and themes remain removed. A shared blurred mask of confirmed ground, raised roofs and wall faces feathers the exploration frontier before actors and markers; decorations fade away near this boundary. Geometry masks and distance fields are bounded and reused while the camera and scene stay unchanged. Hidden cells, actors and map bounds never select its appearance. The master fog preference, Still/reduced motion, remote-level exclusion and fully explored viewport sleep rules remain in force.

Confirmed travel adds bounded body gestures in the 2.5D renderer: walkers hop, oozes compress, serpents slither, small creatures scuttle, undead shuffle, and airborne or spectral creatures bank along their glide. Existing life traits select the gesture; player species and confirmed transformation artwork distinguish non-walking bodies, with actual flight status taking precedence. Ground travel, camera following, markers and authoritative cells remain independent of the body gesture. Rapid retargets preserve the current pose and settle by the end of the latest move. Visibility loss, level resets, disabled movement and Still/reduced motion discard these gestures; flat maps retain their existing presentation.

## Audio

Audio is opt-in and local to the listener, including spectators. Settings → Audio
downloads CNC Open Sound Pack explicitly or imports a ZIP, reads only root
`init.txt`, and provides master/effects volume, single/layered playback, a test
sound and cache removal. No pack assets or extension scripts ship with Orbrun.
Only `sound_file_path` and ordered `sound +=` / `sound ^=` rules are interpreted;
other RC directives, Lua, includes and music are ignored. Missing/invalid rules
are skipped with bounded diagnostics. This intentionally permits later valid
rules to supply a sound when a DWEM rule references a missing asset.

`message-occurrences.ts` shares initial-history and rollback-prefix bookkeeping
between combat and audio. Audio matches original plain-text lines but accepts
only matches intersecting newly received text. It never deduplicates by turn or
text alone, predicts from input, reads hidden positions, or waits for rendering.
Messages received while disabled, hidden, locked or loading are not replayed.
Session teardown invalidates queued matching/decoding; the app owns its one audio
context and reusable pack independently of renderer/map lifecycle. Still/reduced
motion does not mute audio. Hidden tabs suspend it until another user gesture.

A disposable module worker parses ZIPs and runs regexes, with request deadlines
that terminate stuck workers. Limits: 64 MiB ZIP, 192 MiB expanded data, 4,096
entries, 8 MiB per entry, 512 KiB text files, 10,000 rules, 2,048-character regexes,
16,384-character messages, 32 pending message lines and 16 pending effects.
Effects older than 700 ms are dropped. The decoded cache retains at most 32 MiB;
samples exceeding 60 seconds or 32 MiB decoded are rejected after browser decode
(the browser controls temporary decoder allocation). At most eight voices play.
The selected archive and SHA-256 identity live in the separate `orbrun.audio`
IndexedDB database; preferences remain in `orbrun.settings`. Cache failures allow
session-only playback. Refresh replaces content explicitly; no automatic pack
update, arbitrary URL proxy, music or spatial audio is implemented.

## Views and controls

Dungeon (2.5D) is permanent gameplay. Flat rendering is a temporary supporting view, entered by level-map/overview state and restored on close. The minimap also stays flat. GameScreen owns one presentation state (`dungeon` or `flat-map`) and one transition method. Server/overview state requests the transition; settings never choose a view. Settings changes and resize must apply safely while either view is active; repeated transitions preserve cursor/selection and clean up resources.

Input is compass-based across keyboard, gamepad and touch. `X` is the level map; `Ctrl+X` is the in-view list. Projection selection and first-person look/turn actions are removed. Existing menus, prompts, modifier keys and server commands remain contextual.

## Security boundaries

The gamedata parser accepts a bounded known grammar and fails closed on unsupported helpers. Transport and asset queues have explicit count/byte limits. The proxy permits exact bundled HTTPS hosts, rejects redirects and bounds request time/size/concurrency; browser game WebSockets use WSS directly. These controls and the restrictive CSP are independent of renderer choice. Deployment details and residual limits are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Combat presentation

Confirmed combat events drive player, enemy and ally body bumps, spell bursts, hit splashes and death effects. Weapon VFX, swing variations, artwork previews and their settings are removed; bump strength, speed and snap tune melee motion, while separate hit/death gore and outward-spray controls tune bounded material bursts. Hit and death splatters retain body material while mixing in debris from the confirmed damage element. Elemental stamps distinguish forked lightning, fire tongues, frost crystals, poison bubbles, acid streaks and magic glints; dense bursts reserve room for these signatures while retaining death floor splatter. Death attribution retains same-turn hit evidence briefly across message/frame boundaries; older turns and utility cues never supply a killing element. A shared VFX variation control adjusts stable per-spawn profiles around the saved density and spray baselines, with deterministic redraws and fixed particle caps. Misses, shield blocks and zero-damage attacks retain confirmed body bumps without impact VFX. Confirmed kills replace pending hit effects; they never predict death from damage or wounds. Bump contact, hit flash and hit spray share the same early contact clock. Creature melee requires an explicit physical attempt and a visible name-matched source within reported reach. When native messages omit attacker IDs, repeated same-name attempts in a turn are allocated deterministically across the least-used matching actors, including across rendered frames. This fallback affects visual attribution only: recipients remain unambiguous and each message still produces one attempt and its original result. Bump speed is captured per attack and scales the shared contact/recovery clock. Mutual attacks shorten their lunges smoothly as the opposing body approaches. Lunges blend across overlapping attacks; small receiver flinches preserve counterattack direction and never displace authoritative cells. They contain effect evidence and actor identity, not display labels or DOM positioning data. Floating combat text and its setting, stylesheet, icons, font, scheduler and offline damage-number patches have been removed. HP/status changes still feed the retained world effects; native server messages remain in the message log.

## Settings and layout

View settings and the in-game Tune panel share movement duration/easing and independent hop height, squash/stretch and sway/banking strengths. Strengths range from off to 200%, with defaults of 40% hop height, 60% squash and 100% sway and apply immediately to body poses and contact shadows without changing travel, camera following or idle motion. Instant movement and Still disable the dependent controls. Defaults preserve the authored gaits; existing custom durations remain valid between the menu's 10 ms steps.

`settings.ts` reads and writes only `orbrun.settings`. It preserves existing keys/defaults and legacy hint migration, ignores retired fields, normalizes finite numbers to documented supported domains, and stores only non-default values. Reading never rewrites storage. Server/account/save persistence remains in `servers.ts`.

HUD geometry uses available grid space. Narrow mouse windows receive readable top stats and full-width messages; input affordances still depend on the device. Existing phone portrait and wide desktop layout rules remain separate retained paths. GridHost measures glyph advances at actual displayed sizes, caches them and invalidates on font changes; it does not extrapolate small hinted text from a large font probe. Renderer algorithms and authored artwork are unchanged by stabilization.

## Verification

`npm run verify` is the fast development gate: incremental types and retained units. Isolated Vitest projects separate ordinary units from real-Git deployment tooling; changed/watch commands support the editing loop. The browser smoke profile samples all nine rendering concerns; render/release verification keeps the complete matrix. Playwright starts only the needed dev/preview servers, with at most two workers and no retries. Release verification builds once and includes production acceptance. CI routes PR changes conservatively and runs the complete gate on main. See [RUNBOOK.md](RUNBOOK.md) and [AGENTS.md](../AGENTS.md) for commands and selection limits. Optional engine execution remains separate.

## Polished Crawl shell

FrontEnd retains session/account/save/RC actions and secondary screens. HomeView owns the persistent compact header and keyed command rows; lobby updates preserve inputs, focus and row identity. Descent IDs are filtered only at the home offering boundary. MenuModal owns document focus containment, restoration and background inertness. About, /about/new and /whats-new enter that same modal; install/Steam remain static documents. News still uses orbrun.newsSeen.

MenuBackdrop owns the CSS entrance, lazy recording/artwork loading, preference/visibility listeners and lifecycle. Still and OS reduced motion suppress playback and CSS title reflection, even when gameplay animation is explicitly On; switching to Still releases the demo. Covered/hidden menus pause the playback clock without catch-up and stop rendering. Teardown aborts loads and releases renderer/atlases and observers.

MenuDemo owns a separate reducer/scene and the shared Render25d, CombatFeedback, presentCombat and dungeonOptions presentation. ReplayClock feeds ordered recorded state batches, preserving their remaining delay across pauses. Each clip starts from all of its preceding state deltas, with fresh state and combat history; each loop clones messages because reduction may mutate them. The menu never creates an engine, GameScreen, Session, input handlers or audio. The normal home lobby is independent. Three curated real captures share one pinned artwork version; startup fetches only same-origin static data. The build verifies their sizes/hashes, with no engine preparation. HTTP caching uses immutable clip hashes and gamedata versions. The old menu-engine cache is cleaned up without touching development saves. See [recording provenance](../apps/orbrun/public/menu/README.md).

GridHost and HUD fonts/metrics are independent of shell typography. The menu canvas retains its unfiltered renderer colors, with no CSS dimming overlay.
