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
| App controls/HUD/menu modules | Device normalization, contextual commands, menus, targeting, settings and accessibility |
| `apps/orbrun/src/room/` | Bundled menu scenery rendered through the existing 2.5D renderer |
| Worker/proxy/build tools | Static hosting, bounded allowlisted proxies, source identity and guarded deployment |

## State and presentation

The reducer mutates GameState; scene revisions and dirty-cell information drive incremental composition. Consumers must not mistake reused object identity for immutable history. Presentation snapshots only the identities, positions and visual fields needed for confirmed transitions.

Combat messages and state deltas drive effects. Animation cannot delay command transmission, invent damage or hidden actors, change authoritative positions, or infer gameplay outcomes. Existing movement smoothing, wall/corridor behavior, visibility fading, spell traces and combat timing remain renderer responsibilities. Still/reduced-motion settings limit presentation work.

## Views and controls

Dungeon (2.5D) is permanent gameplay. Flat rendering is a temporary supporting view, entered by level-map/overview state and restored on close. The minimap also stays flat. Settings changes and resize must be applied safely while either view is active; repeated transitions must preserve cursor/selection and clean up listeners/resources.

Input is compass-based across keyboard, gamepad and touch. `X` is the level map; `Ctrl+X` is the in-view list. Projection selection and first-person look/turn actions are removed. Existing menus, prompts, modifier keys and server commands remain contextual.

## Security boundaries

The gamedata parser accepts a bounded known grammar and fails closed on unsupported helpers. Transport and asset queues have explicit count/byte limits. The proxy permits exact bundled HTTPS hosts, rejects redirects and bounds request time/size/concurrency; browser game WebSockets use WSS directly. These controls and the restrictive CSP are independent of renderer choice. Deployment details and residual limits are in [DEPLOYMENT.md](DEPLOYMENT.md).
