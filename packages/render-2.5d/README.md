# @orbrun/render-2.5d

A north-up, slanted dungeon view using the existing DCSS tile art. Select
**Settings → View → Projection → Dungeon (2.5D)**. Tilt, zoom and animation
are in the same settings page. The pause menu also cycles all three views.
At 100% zoom the full 17-cell field of view fits, including sprite headroom.
Higher zoom values deliberately trade coverage for larger tiles.

## Architecture

`Render25d` implements `@orbrun/scene`'s `MapRenderer` contract and consumes
the same `Scene` and `TileSource` as the other renderers. It knows nothing
about WebTiles, server tile numbering, or game rules. Online games, offline
games, spectating and vault scenes therefore share one implementation.

Canvas 2D is a deliberate choice for this fixed orthographic view: it can
reuse the atlases and their alpha, render raised walls and upright sprites,
and composite lighting without another WebGL context, shaders or a new
dependency. It is a separate renderer, not a postprocessing filter over
flattened tiles; floors, creatures and wall faces retain their own depth
and picking regions. The existing first-person renderer remains independent.

- `projection.ts` owns ground projection, its inverse, and viewport fitting.
  World coordinates are cell centres. Input and drawing use CSS pixels;
  device pixel ratio only changes the backing surface, capped at two.
- `index.ts` paints ground layers, continuous floor lighting, contact
  shadows, depth-sorted walls and sprites, and readable targeting markers.
  Foreground walls lower beside visible open ground. Sprites retain doll
  composition, atlas offsets, clipping, status badges and player minibars.
  Picking walks the raised surfaces front to back before intersecting the
  floor, so wall roofs and upright creatures select their own cells.
- `lighting.ts` derives a bounded set of lantern, lava, altar and portal
  lights from scene semantics. Light is blocked by known occluders; unseen
  terrain never receives light and remembered terrain never emits it.
  Floor lights use continuous gradients clipped to reachable cells. Sprite
  lighting is quantized for reuse in the tile cache.
- `tiles.ts` caches composed, tinted tiles, including transparent and tall
  artwork. The cache is bounded to 1,024 surfaces, does no pixel readback,
  waits for all needed atlas images, and clears when tile sources change or
  the renderer is destroyed. Scene lists and lighting rebuild on scene
  replacement; frames cull outside the viewport and reuse tile composites.

Time is presentation-only: breathing, drifting clouds, water ripples,
emissive glow and embers never change game state. `MapRenderer.animating`
keeps the application's existing frame scheduler awake only when visible
effects need it. Still mode and the operating system's reduced motion
preference stop animation. No renderer starts a separate timer or RAF loop.
Server flashes are rendered as supplied; spell types and damage are not
guessed from message text.

## Input and integration

The app keeps the active projection distinct from its first-person input
flag. Overhead movement and targeting use compass directions regardless of
the saved first-person heading. Left/right step instead of turning, and
targeting moves across the grid instead of orbiting the player. Pointer
clicks and touch taps select the visible cell. The full level map temporarily
borrows `Render2d`, then returns to the saved projection. First-person parking
and its WebGL lifecycle are preserved.

## Preview and validation

Run `npm run dev` and open `/testbed/dungeon.html` for an interactive preview
using the bundled Antechamber artwork; no server account is needed. The
lantern stands in for the player, fungi for actors, and a dirt tile for the
synthetic lava patch because the small room atlas has no lava tile. Live
games use their server's complete tileset.

Tests cover projection/picking at multiple elevations and viewport sizes,
visibility, lighting occlusion, animation sleep, atlas composition, compass
controls, persistence, and temporary level-map switching. Browser captures
check real Canvas rendering at desktop and phone sizes.

## Extending the mode

For richer combat effects, add typed, confirmed presentation events to the
shared scene contract, with stable identities and timestamps. Keep their
bounded lifetimes in a separate effect layer and respect visibility and
reduced motion. Do not parse combat prose in the renderer. Movement currently
follows confirmed scene positions without interpolation. Camera rotation,
perspective projection, full shadow maps and element-specific spell effects
are not implemented; a future GPU backend can reuse the same scene and input
contracts if those become necessary.

Visual inspiration: [Super Dungeon Crawl](https://github.com/vimuston/super-dungeon-crawl/),
particularly its raised walls, standing creatures and environmental lighting.
This implementation does not copy its rendering code. DCSS artwork remains
covered by the repository's [attribution](../../ATTRIBUTION.md).

AGPL-3.0-or-later.
