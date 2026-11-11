# Living dungeon work

Branch: `codex/living-dungeon`, based on production 0.3.17 (`896dcfc`).
Prepared as app 0.3.18, immutable source tag `cloudflare-online-v1.15`.
Deployed 2026-11-11: production main and source tag point to `6214854`.
Cloudflare build `08d707e7-ce5c-4287-80e0-1224450f9923` succeeded; hosted
verification is recorded in `DEPLOYMENT.md` and `evidence/release-0318-*`.

## 0.3.21 native exposure, compact lights and live animation

Deployed `a8c5fbb`, source tag `cloudflare-online-v1.18`, on 2026-11-11.
Visible tiles use native atlas colors; the 10% white lift is removed. Light
centers follow emitting artwork with a radius capped at 1.35 cells. Circular
screen-space gradients use feathered reachability masks, and wall faces now
sample their actual rectangle instead of stretching one strip over a face.

Animation Auto follows device motion preferences; explicit On overrides them,
and Still freezes the scene. Living sprites use filtered subpixel movement
even when the server selects nearest-neighbor scaling for static art. Smaller
numbers use a CSS entrance (rise, scale overshoot, settle), with their stable
wrapper preserved across delayed estimate/brand refinements.

Validation: 2,128 unit tests/two optional-engine skips; forced TypeScript,
production build and Worker dry-run; 576 real Canvas checks; 13 hosted checks.
The real GameScreen fixture runs without testbed RAF or server messages and
records changing actor pixels, On under reduced motion, Auto/Still stopping
motion, and animated/still popup CSS. See `/testbed/live-animation.html`,
`DEPLOYMENT.md` and `evidence/release-0321-*`.

## 0.3.20 smooth surface lighting and VFX

Deployed `114c077`, source tag `cloudflare-online-v1.17`, on 2026-11-11.
`render-2.5d/src/lighting.ts` now builds a single continuous light texture;
floors, raised roofs/faces and masked sprites sample it, replacing per-cell
tinting. Reachability is cached, and pulse/afterglow intensity updates every
frame. LOS uses full ambient art exposure plus a 10% lift of dark texels,
weaker contact shadows and a gentle vignette. Remembered art remains neutral.

Spell overlays lie on the plane and use a thinned alpha mask with clamped
edges to preserve joined segments. Clouds, impact rings and particles are
quieter. Popups use self-hosted Barlow Condensed Bold and bounded per-type
motion/glow, including distinct acid and electricity. Reduced motion keeps
the trajectories and flame glow position still.

Validation: 2,120 passing unit tests; forced TypeScript/build/Worker dry-run;
576 real Canvas checks; 14 animation/impact checks; live source/bundle/font,
CSP/proxy and anonymous 2.5D checks. Evidence is in `DEPLOYMENT.md` and
`evidence/release-0320-*`. Interactive preview: `/testbed/effects.html`.

## 0.3.19 refinements

Deployed `76d8357`, source tag `cloudflare-online-v1.16`, on 2026-11-11.
2.5D now uses uniform LOS ambient brightness, neutral black remembered shading
and faint dark fog. Player light bands are removed. Living poses use stronger
continuous motion and smooth skitter/undead/fleeing variants; still/reduced
motion remains supported. Redundant SLAIN/HIT popups are suppressed in 2.5D,
with damage numbers and useful feedback retained. The character pane moves to
the top right and its nearby column follows the height of wrapped statuses.
Right-click item descriptions use the server's hovered-item examine command.

Current checks: 2,118 unit tests pass, forced TypeScript/build/Worker dry-run
pass, 558 Canvas checks and desktop/phone browser checks pass. Hosted bundle,
version/source, CSP/proxy and spectator checks are recorded in `DEPLOYMENT.md`.

## Original 0.3.18 changes

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
