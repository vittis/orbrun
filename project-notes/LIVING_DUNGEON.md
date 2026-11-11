# Living dungeon work

Branch: `codex/living-dungeon`, based on production 0.3.17 (`896dcfc`).
Prepared as app 0.3.18, immutable source tag `cloudflare-online-v1.15`.
The user authorized committing to main and deploying on 2026-11-11; hosted
verification is recorded after rollout.

## Changes

- Add environmental light from torches, elemental clouds, glowing creatures and spell bolts across dungeon views, with warm line of sight, cool memory and curling shadows at unexplored edges.
- Animate creatures by body and state, trees, liquids, clouds, gold and magical terrain; confirmed hits, water steps and teleport arrivals send out ripples. Respect reduced motion and keep remembered tiles still.
- Prevent duplicate damage numbers when an attack message and its monster wound-status update arrive in separate frames. Wound flags inform reported-hit estimates without producing another hit popup.

## Architecture

`scene-webtiles/src/living.ts` interprets the connected server's tile names and
monster flags. No server tile numbers or engine modifications are needed.
`scene/src/living.ts` provides common motion poses, geometry-aware light pools,
and bounded afterglows and impact rings. The two Canvas views draw gradients
and transform the existing art; the first-person renderer updates a light
texture and the existing instance buffers without rebuilding the terrain.

Monster wound flags are evidence for estimating reported attacks. They no
longer create independent combat popups, avoiding duplicates regardless of
whether the map or message update arrives first. Consequently a wound change
with no attack sentence does not invent a damage number. Visible impacts can
still create rings, independently of the damage-number setting.

Lighting sources and rings are restricted to known, currently visible cells.
Remembered creatures and materials remain still. Full level maps, minimaps
and UI thumbnails stay static. Level identity discards transient state even
when two levels place the player at the same coordinates.

Reference: [Super Dungeon Crawl](https://github.com/vimuston/super-dungeon-crawl),
especially `alive.js` and `light.js`; credited in `ATTRIBUTION.md`.

## Validation

- `npm run typecheck`: pass.
- `NODE_ENV=test npm test`: 2,109 passed; two optional offline-engine tests skipped.
- `npm run build`: pass (existing bundle-size advisory remains).
- Real Chrome: animation and still mode in all three views, desktop/mobile
  Canvas rendering and isolated impact rings; existing 504 raster checks
  cover seams, sprite proportions, item-marker alignment, memory contrast,
  unknown-space fog and picking.

Browser checks are reproducible with a dev server from this checkout:

```sh
npm run dev -- --port 5209 --strictPort
node tools/build/render-compare.mjs eval tools/build/living-checks.browser.js http://127.0.0.1:5209
```

The URL is explicit because another worktree can already occupy the renderer
harness's default port. The harness leaves captures on `window.__livingCaptures`
while the page is open and prints the check results.
