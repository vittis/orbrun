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
| `packages/offline`, `engine/` | Optional development/offline engine integration; unavailable in hosted production |
| `apps/orbrun/src/session.ts` | Connection/state/asset sequencing, scene flushes and lifecycle |
| `apps/orbrun/src/game.ts` | Gameplay screen, renderer/map lifecycle, input and presentation coordination |
| `apps/orbrun/src/settings.ts` | Supported preferences, defaults, numeric validation and compatible persistence |
| App controls/HUD/menu modules | Device normalization, contextual commands, menus, targeting, settings and accessibility |
| `apps/orbrun/src/room/` | Bundled menu scenery rendered through the existing 2.5D renderer |
| Worker/proxy/build tools | Static hosting, bounded allowlisted proxies, source identity and guarded deployment |

## State and presentation

The reducer mutates GameState; scene revisions and dirty-cell information drive incremental composition. Consumers must not mistake reused object identity for immutable history. Presentation snapshots only the identities, positions and visual fields needed for confirmed transitions.

Combat messages and state deltas drive effects. Animation cannot delay command transmission, invent damage or hidden actors, change authoritative positions, or infer gameplay outcomes. Existing movement smoothing, wall/corridor behavior, visibility fading, spell traces and combat timing remain renderer responsibilities. Still/reduced-motion settings limit presentation work.

## Views and controls

Dungeon (2.5D) is permanent gameplay. Flat rendering is a temporary supporting view, entered by level-map/overview state and restored on close. The minimap also stays flat. GameScreen owns one presentation state (`dungeon` or `flat-map`) and one transition method. Server/overview state requests the transition; settings never choose a view. Settings changes and resize must apply safely while either view is active; repeated transitions preserve cursor/selection and clean up resources.

Input is compass-based across keyboard, gamepad and touch. `X` is the level map; `Ctrl+X` is the in-view list. Projection selection and first-person look/turn actions are removed. Existing menus, prompts, modifier keys and server commands remain contextual.

## Security boundaries

The gamedata parser accepts a bounded known grammar and fails closed on unsupported helpers. Transport and asset queues have explicit count/byte limits. The proxy permits exact bundled HTTPS hosts, rejects redirects and bounds request time/size/concurrency; browser game WebSockets use WSS directly. These controls and the restrictive CSP are independent of renderer choice. Deployment details and residual limits are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Combat presentation

Confirmed combat events drive player, enemy and ally body bumps, spell bursts, hit splashes and death effects. Weapon VFX, swing variations, artwork previews and their settings are removed; bump strength, speed and snap tune melee motion, while separate hit/death gore and outward-spray controls tune bounded material bursts. Explicit misses and zero-damage hits use brief shaded air-slip/contact-glint cues, sharing the bump contact clock without damage flashes or material spray. Confirmed kills replace pending hit effects; they never predict death from damage or wounds. Bump contact, hit flash and hit spray share the same early contact clock. Creature melee requires an explicit physical attack sentence and an unambiguous visible source within reported reach. Bump speed is captured per attack and scales the shared contact/recovery clock. Mutual attacks shorten their lunges smoothly as the opposing body approaches. Lunges blend across overlapping attacks; small receiver flinches preserve counterattack direction and never displace authoritative cells. They contain effect evidence and actor identity, not display labels or DOM positioning data. Floating combat text and its setting, stylesheet, icons, font, scheduler and offline damage-number patches have been removed. HP/status changes still feed the retained world effects; native server messages remain in the message log.

## Settings and layout

`settings.ts` reads and writes only `orbrun.settings`. It preserves existing keys/defaults and legacy hint migration, ignores retired fields, normalizes finite numbers to documented supported domains, and stores only non-default values. Reading never rewrites storage. Server/account/save persistence remains in `servers.ts`.

HUD geometry uses available grid space. Narrow mouse windows receive readable top stats and full-width messages; input affordances still depend on the device. Existing phone portrait and wide desktop layout rules remain separate retained paths. GridHost measures glyph advances at actual displayed sizes, caches them and invalidates on font changes; it does not extrapolate small hinted text from a large font probe. Renderer algorithms and authored artwork are unchanged by stabilization.

## Verification

`npm run verify` is the fast development gate: incremental types and retained units. Isolated Vitest projects separate ordinary units from real-Git deployment tooling; changed/watch commands support the editing loop. The browser smoke profile samples all nine rendering concerns; render/release verification keeps the complete matrix. Playwright starts only the needed dev/preview servers, with at most two workers and no retries. Release verification builds once and includes production acceptance. CI routes PR changes conservatively and runs the complete gate on main. See [RUNBOOK.md](RUNBOOK.md) and [AGENTS.md](../AGENTS.md) for commands and selection limits. Optional engine execution remains separate.
