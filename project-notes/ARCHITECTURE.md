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

## Settings and layout

`settings.ts` reads and writes only `orbrun.settings`. It preserves existing keys/defaults and legacy hint migration, ignores retired fields, normalizes finite numbers to documented supported domains, and stores only non-default values. Reading never rewrites storage. Server/account/save persistence remains in `servers.ts`.

HUD geometry uses available grid space. Narrow mouse windows receive readable top stats and full-width messages; input affordances still depend on the device. Existing phone portrait and wide desktop geometry remain separate retained paths. Renderer algorithms and authored artwork are unchanged by stabilization.

## Verification

`npm run verify` runs forced application/browser-test typechecking, unit tests, a production build and isolated Chromium checks. The browser gate uses local fixtures and production preview; it does not need a public server or credentials. Each full raster lane reports an explicit result with a pinned assertion count. Optional engine execution remains a separate lane.
