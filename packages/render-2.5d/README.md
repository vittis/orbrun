# @orbrun/render-2.5d

A north-up, slanted dungeon view using the existing DCSS tile art. Select
**Settings → View → Projection → Dungeon (2.5D)**. Tilt, zoom and animation
are in the same settings page, alongside movement, move duration and easing.
Movement defaults to a snappy 100 ms ease-out; Smooth and Linear curves and
60–250 ms presets are available. Movement can be disabled independently of
atmosphere. The pause menu also cycles all three views.
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
  shared terrain edges snap to backing pixels at each zoom and device pixel
  ratio, capped at two, so adjacent quads meet without gaps or overlap strips.
- `index.ts` paints ground layers, continuous floor lighting, contact
  shadows, depth-sorted walls and sprites, and readable targeting markers.
  Foreground walls lower beside visible open ground. Sprites retain doll
  composition, atlas offsets, clipping, status badges and player minibars.
  Monsters and ordinary objects use the same atlas scale as the player;
  the artwork defines their relative proportions, independently of the
  first-person renderer's billboard heights. Only corpses lie flat.
  Contact shadows replace the original flat-view wall-shadow decals.
  Exposed wall bases have dense contact shadows and soft south/east cast
  shadows that shorten with foreground cutaways. Wall faces darken toward
  their feet, with a recessed cap and subtle bevels on exposed roof edges;
  connected roofs stay continuous rather than outlining every tile.
  Picking walks the raised surfaces front to back before intersecting the
  floor, so wall roofs and upright creatures select their own cells.
- `lighting.ts` builds one continuous world-space light texture from semantic
  emitters. Floors, wall roofs/faces and alpha-masked sprites all sample that
  field, without per-cell colour steps. Reachability is cached separately from
  smooth per-frame flicker and afterglow fading. Known occluders block light;
  unseen and remembered terrain never receives it. The player emits no light.
  LOS has uniform bright ambient exposure and a gentle vignette.
- `movement.ts` tweens confirmed entity positions and the following camera on
  the renderer's existing clock. Every billboard kind shares the same motion;
  shadows, glows, depth sorting, upright badges/bars and hit regions follow the
  drawn position. Picking still returns the confirmed destination cell. Stable
  `Billboard.id` values identify entities across art changes (WebTiles supplies
  monster IDs); anonymous art only pairs unambiguous matching arrivals and
  departures after reserving stationary copies. Spawns, ambiguous matches,
  level changes and transitions into/out of visibility snap. Moves of any
  distance tween, including fast enemies, projectiles and rampage. Fast
  travel retargets from the current drawn position over one duration without
  skipping ahead or queuing full animations. The default player curve carries velocity
  through repeated steps and adapts to observed arrival cadence within 1–1.4×
  the configured duration; the camera uses that exact curve. Targeting pans
  snap for immediate feedback. The app delivers the centre before every scene
  observation, including receipt-time updates, so it cannot jump ahead.
  `Render25dOptions.movement`, `movementDuration` (seconds, clamped to 0.04–0.25)
  and `movementEasing` (`ease-out`, `smooth`, `linear`) configure the tween.
- `tiles.ts` caches composed, tinted tiles, including transparent and tall
  artwork. Terrain uses unpadded composites so filtering cannot sample a
  transparent border; standing artwork keeps its tall/offset padding.
  Dynamic lighting stays outside the tile cache. Beam art is plane-aligned,
  alpha-thinned and smoothly filtered without shortening adjoining segments.
  The cache is bounded to 1,024 surfaces, does no pixel readback,
  waits for all needed atlas images, and clears when tile sources change or
  the renderer is destroyed. Scene lists and lighting rebuild on scene
  replacement; frames cull outside the viewport and reuse tile composites.
- `effects.ts` keeps bounded melee and spell histories on the existing frame
  clock. Confirmed `MeleeAttack` events produce a small lunge/recoil and sword,
  thrust, axe, blunt or unarmed gestures. The app resolves these from combat
  feedback and the wielded inventory item, independently of popup settings.
  Disappearing transient spell lights leave faint fire, frost, electrical or
  magical floor traces for 1.25–2.8 seconds, beneath sprites and markers.
  Histories clear on level changes, remote maps, lost visibility and Still mode.
  Projectile appearance is independent of light emission: Sandblast/rock/metal
  spells leave dust or chips without glowing. Compact missiles preserve their
  original texels; continuous beams retain alpha thinning. Short-lived server
  overlays remain visible for up to 180 ms after removal, without delaying game
  state, so a flight received entirely between frames cannot disappear unseen.

Unexplored space uses neutral, world-anchored dark mist behind known geometry.
Remembered tiles and standing art retain 44% of their ambient brightness,
with neutral black shading and faint dark fog; visible tiles remain bright. Server item cursors
share the upright item frame, while other cell badges keep their ground anchor.
The unexplored mist is static, so it does not keep idle scenes awake.

Time is presentation-only: fluid breathing and swaying, drifting clouds and remembered-terrain fog,
continuous water ripples, fountain ripples,
emissive glow and embers never change game state. `MapRenderer.animating`
keeps the application's existing frame scheduler awake only when visible
effects need it. Still mode and the operating system's reduced motion
preference stop animation. No renderer starts a separate timer or RAF loop.
Server flashes are rendered as supplied; spell types and damage are not
guessed from message text.
Idle motion is slightly stronger than before, with device-pixel-snapped offsets
and the selected tile filter preserved during motion. Severe wound flags add a
guarded lean and uneven breathing without obscuring identifying sprite art.
Lights have compact bright cores and up to six embers or four magical motes each,
with an 88-mote frame budget; fountains add five small spray droplets.
Movement also stops in Still/reduced-motion mode. Only visible, on-screen
tweens keep frames awake, and motion history is discarded on destroy.

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
Use **Move entities ↔** to compare tween durations/easing on real artwork,
or the arrow keys to walk the player with a following camera. Clicks place the
player directly; long-distance moves demonstrate multi-cell tweening.
**Melee**, **Weapon** and **Wounds** preview combat beside a practice enemy;
**Cast** previews four spell trace families. Append `?effectFrame=0.1` to freeze
each triggered effect 100 ms into its lifetime for deterministic captures.

The Scene chooser also loads a recorded fountain dungeon. Original 2D
switches to the standard renderer at the same atlas scale for comparison.
Open `/testbed/dungeon-checks.html` for real Canvas pixel checks: uniform
floor/wall joins at three elevations, zooms and DPRs, filtering on/off, and
equal-atlas player/monster/item silhouettes with upright picking, item cursor
alignment, independent ground badges, LOS contrast and neutral unexplored mist.
Movement checks sample all three easing curves at the start, midpoint and
landing, checking sprite pixels, item cursors, badges, picking and sleep, plus
a steady centred player and moving world under camera follow. These
checks complement unit tests, whose DOM mocks cannot detect raster seams.
Open `/testbed/projectile-checks.html` for 20 additional real-art checks using
the public server's Sandblast, Stone Arrow, Iron Shot, Magic Dart and Frost
tiles. A synchronous protocol burst creates and removes each flight before the
first draw; pixel comparisons verify projectile, impact, residue and expiry.

Wall-depth checks also verify fading base shadows, shorter cutaway shadows,
lighter transparent-wall shadows, face shading, hidden geometry and sleep
at three elevations, zoom levels and device pixel ratios.

Tests cover projection/picking at multiple elevations and viewport sizes,
visibility, lighting occlusion, animation sleep, atlas composition, compass
controls, persistence, and temporary level-map switching. Browser captures
check real Canvas rendering at desktop and phone sizes.

## Extending the mode

For richer combat effects, extend the typed, confirmed presentation contract
with stable identities and timestamps. Keep bounded lifetimes in the effect
layer and respect visibility and reduced motion. Do not parse combat prose in
the renderer. Spell traces use semantic light colours and pulses; they do not
invent persistent hazards. Camera rotation, perspective projection and full
shadow maps are not implemented; a future GPU backend can reuse these contracts.

Visual inspiration: [Super Dungeon Crawl](https://github.com/vimuston/super-dungeon-crawl/),
particularly its raised walls, standing creatures and environmental lighting.
This implementation does not copy its rendering code. DCSS artwork remains
covered by the repository's [attribution](../../ATTRIBUTION.md).

AGPL-3.0-or-later.
