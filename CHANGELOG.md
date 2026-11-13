# What's new

Notable changes to Orbrun, newest first.

## 0.3.112 — 2026-11-13

- Added soft, cool mist and sparse drifting motes behind unexplored dungeon terrain. Slow world-anchored motion adds atmosphere while keeping explored terrain and gameplay markers clear.
- View → Unexplored fog toggles the effect, enabled by default. Still/reduced motion freezes it; fully explored viewports stop its animation loop. Hidden terrain and actors never influence its appearance.

## 0.3.111 — 2026-11-13

- Level-up feedback now uses smooth, understated lettering with a small rising burst of warm embers and a soft 1.8-second fade. It remains above the character and triggers before stat selection; Still/reduced motion show a static label.
- Removed the shadow overlay during message pauses. System menus and modal backdrops use an even tint instead of darkening the corners.

## 0.3.110 — 2026-11-13

- Made magic death splatter a little shorter and less intense: a 0.65-second maximum instead of 0.8 seconds, about 12% fewer particles, slightly softer opacity and a quicker fade. Retained purple glints, body splatter and per-spawn variation.

## 0.3.109 — 2026-11-13

- Reworked the level-up popup into crisp bitmap lettering over ragged blood-red pixels, hanging drips and bone chips. It follows the rendered character just above their head, including camera motion and resizing.
- The native level-gain announcement now triggers the popup immediately, before the stat-improvement choice. A delayed XL update never repeats it; history, duplicate announcements and unrelated message channels stay excluded. Still/reduced motion retain a static pixel stamp.

## 0.3.108 — 2026-11-13

- Searing Ray now mixes flame into hit and death splatter. Audited stable/trunk spell, ability and projectile classifications, including Fulsome Fusillade's individual substances, Magic Dart, crystal/stone/metal projectiles, steam, Sirocco and destruction abilities.
- Shared effect classification keeps native projectiles, spawns and lighting consistent. Ghostly fire and shadowy lightning keep necromantic/magic signatures; physical attacks retain physical debris. Confirmed Mercury Arrow damage overrides its reused poison tile; cold auras now use cold effects.
- Retained existing blood/material splatter, killing-hit attribution, venom brands, variation defaults, native artwork, visibility and Still/reduced motion. Integrated the concurrent level-up popup release without replacing its changes.

## 0.3.107 — 2026-11-13

- Confirmed character level gains now strike a gold level seal into view, with a brief impact, ember shards and an automatic fade. The popup stays clear of HUD panes, never intercepts input, and uses a static presentation with Still or reduced motion.
- Loaded characters and duplicate updates do not trigger a celebration. Rapid gains show the latest confirmed level; death, disconnects and run changes clear the popup.

## 0.3.106 — 2026-11-13

- Confirmed hits with an identified venom weapon now include poison bubbles and vapour in hit/death splatter, including lethal strikes that send no separate poison-status sentence.
- Capture the equipped brand when the server’s hit message arrives, preserving the correct appearance across weapon swaps before rendering. Poison-status messages alone do not create an extra hit; spells, auxiliary attacks, other actors, misses and zero-damage results keep their own feedback.

## 0.3.105 — 2026-11-13

- Electric hits and deaths now emit larger forked blue-white lightning with bright cores and short, changing discharges instead of ice-like shards.
- Made elemental splatter more present and distinct: fire tongues, frost crystals, bubbling poison and vapour, sharp acid streaks, and luminous purple magic glints. Increased elemental particle size and density while preserving existing total particle limits.
- Dense hit and death bursts reserve room for their elemental signature; death floor splatter is retained. Existing gore/variation settings, confirmed contact, visibility clipping, Still/reduced motion and spell coverage remain intact.

## 0.3.104 — 2026-11-13

- Fulminant Prism and Iskenderun’s Mystic Blast now mix magic splatter with existing hit and death debris. Extended confirmed-result coverage to Searing Ray, Force Lance, Battlesphere, Orb of Destruction, shadow/energy attacks, Mindburst and Dispel Undead.
- Added missing elemental results for Hailstorm, creeping frost, Toxic Bog, caustic explosions, plasma, Blinkbolt and related spells/abilities. Explicit chaos-beam elements keep their reported colour.
- A separate spell result keeps its element when melee hits the same recipient in the same turn. Casts, misses, zero-damage results, hidden targets and Still/reduced motion remain excluded from damaging splatter.

## 0.3.103 — 2026-11-13

- Added `(edit rc)` beside each server-advertised Play version on the main menu. The editor shares the account’s server-side file with original WebTiles, verifies saves, protects unsaved changes and returns to the version link you opened. Each server keeps its own files.

## 0.3.102 — 2026-11-13

- Made the critical-health red corner vignette stronger and extended it from 2.8 to 5.6 seconds, with a brief hold before fading. The center stays clear and reduced-motion intensity remains lowered.

## 0.3.101 — 2026-11-13

- Hit and death splatters mix fire, cold, poison, acid, electricity or magic from the confirmed damaging hit with the creature’s existing blood or material debris. Deaths retain same-turn hit evidence across frames without reusing older attacks or guessing from elemental creature names.
- Added Combat → VFX variation, defaulting to 25%, for stable per-spawn changes in particle count, energy, size and spray shape. Off keeps a consistent burst profile; visibility, particle limits and Still/reduced motion remain enforced.
- Combat defaults now use 175% bump strength, 115% speed, 70% snap, 100% hit gore, 50% death gore, and 100%/75% hit/death outward spray. Existing saved overrides remain supported.

## 0.3.100 — 2026-11-13

- Removed the entire miss, shield-block and zero-damage VFX feature, including particle art, animation, stacking state, renderer API and dedicated previews/tests. Normal attack bumps and damaging-hit effects remain.

## 0.3.99 — 2026-11-13

- Removed miss/dodge VFX entirely; confirmed attack bumps remain.
- Made shield and zero-damage VFX smaller and more distinct: three sideways golden ricochet strokes for shields, and a compact scatter of falling steel chips for armor. Both still accumulate alongside blood with smooth settling and fade.

## 0.3.98 — 2026-11-13

- Replaced defensive combat icons with material VFX: curved wind streaks for dodges, steel armor flecks for zero-damage hits and golden ricochet sparks for shield blocks.
- Effects expand and settle around the body, keep moving as they fade, and accumulate independently alongside blood and other confirmed combat feedback.

## 0.3.97 — 2026-11-13

- Shield blocks, misses and zero-damage hits now use distinct shield, sidestep and breastplate symbols. Confirmed projectile blocks also get shield feedback without a melee lunge.
- Defensive popups accumulate independently, including repeated misses, while damaging hits retain their blood/material VFX. Stable positions keep simultaneous results readable.
- Popups spring upward with a quick overshoot and settle, then lift and smoothly fade. Visibility, recipient removal, death and Still/reduced-motion cleanup remain enforced.

## 0.3.96 — 2026-11-13

- Fixed missing attack bumps when multiple adjacent enemies share a name. Repeated confirmed attempts are distributed across visible matching attackers, including messages arriving across frames.
- Each reported attempt retains its original hit, miss, shield block or zero-damage result; hidden and out-of-reach creatures stay excluded.

## 0.3.95 — 2026-11-13

- Confirmed shield-blocked melee attacks now trigger the attacker’s body bump and a shield contact cue, including enemy, player and ally attacks. Blocks produce no damage flashes or blood and respect Still/reduced motion.

## 0.3.94 — 2026-11-13

- Keep keyboard focus inside quick settings after Reset or reaching a numeric limit, including browsers that blur disabled controls.

## 0.3.93 — 2026-11-13

- Added a collapsible Tune panel at the left-center of the game screen with every View and Combat setting.
- Adjust sliders, small −/+ buttons and selectors while watching the dungeon. Changes apply immediately and share the normal saved preferences and reset controls.
- Keyboard and controller focus stays inside the controls; Escape closes them without sending a gameplay command. The panel scrolls to fit phones and short windows.

## 0.3.92 — 2026-11-13

- Misses now show a bright pale-blue X with trailing whiff marks; zero-damage hits show a gold shield-shaped contact flash. Larger silhouettes, stronger contrast and longer visibility make both outcomes easier to read during combat.
- Both symbols retain the existing pixel-art outlines and dithered fade, with no blood, floor residue or changes to confirmed combat timing, visibility or reduced-motion behavior.

## 0.3.91 — 2026-11-13

- Confirmed misses show a small grey air-slip; hits that explicitly deal no damage show a muted contact glint. Both use shaded pixel art, follow the recipient and share melee contact timing without blood or damage flashes.
- The brief feedback respects visibility, death cleanup and Still/reduced motion. Existing damaging hits, server authority, wider Dungeon camera controls and foreground wall cutaways remain intact.

## 0.3.90 — 2026-11-13

- Keep walls beside and behind the player fully raised, including exposed ends next to narrow passages. Corridor cutaways remain in front of the player, with matching wall picking, lighting and shadows.

## 0.3.89 — 2026-11-13

- Expanded Dungeon tilt to 25°–85° and zoom to 25%–300%, keeping 5°/5% adjustment steps.
- Updated saved-setting validation and renderer limits together so every offered value takes effect.

## 0.3.88 — 2026-11-13

- Mutual melee attacks lunge about half as far at contact, easing smoothly through staggered counterattacks to reduce overlap.
- Combat settings now adjust in 5% steps, including bump strength, snap, gore and outward spray.
- Added Hit bump speed from 50% to 200%, defaulting to 100%. Lunges and flinches share the adjusted contact clock with hit flashes and sprays; game turns and input remain unchanged.

## 0.3.87 — 2026-11-13

- Fine-tune Dungeon tilt in 5° steps from 35° to 65° and Dungeon zoom in 5% steps from 80% to 140% using the existing arrows, keyboard or gamepad controls.
- Existing camera defaults and saved custom preferences are preserved.

## 0.3.86 — 2026-11-13

- Enemies and allies now lunge on confirmed visible melee attacks, including misses and fully absorbed blows.
- Receivers make a small flinch instead of being pushed away. Simultaneous attacks and cleaves blend smoothly, keeping counterattacks readable without stacking displacement.
- Preserved contact timing, confirmed actor identity, Still/reduced motion and server-owned positions.

## 0.3.85 — 2026-11-13

- Added 175% hit bump strength and 125% hit/death gore options.
- Added independent Hit outward spray and Death outward spray controls. Choose how many particles spread in all directions, with the rest following the blow.
- Confirmed kills now own contact effects: death VFX replace pending hit particles and flashes, including delayed reports and when death gore is Off. Other actors entering the same cell retain their own hit effects.

## 0.3.84 — 2026-11-13

- Melee hits land earlier with a stronger body bump, a brief impact hold and a sharp recoil. Hit flashes and material sprays share the new contact timing.
- Hit sprays are shorter, faster and denser. Blood uses dark, rounded droplets and irregular splashes instead of pointed, bright fragments; deaths throw heavier bursts and leave richer floor splatter.
- Combat settings now include independent Hit gore and Death gore levels from Off to 200%, plus bump strength up to 200%. Still/reduced motion and confirmed visibility remain respected.

## 0.3.83 — 2026-11-13

- Continue raised side-wall tops into lowered foreground corners, removing the dark internal step at the join while preserving corridor clearance and exposed wall faces.
- Check mirrored corners, remembered terrain, unknown boundaries and water edges, including real-pixel coverage across tilt, zoom, filtering and display density.

## 0.3.82 — 2026-11-13

- Stop Djinni spell previews and HP casting costs from triggering the player hit animation. Only confirmed incoming melee/spell damage messages trigger hit feedback; HP expenditure alone does not.
- Preserve incoming hits when casting and enemy damage occur together, regardless of whether HP or combat messages arrive first.

## 0.3.81 — 2026-11-13

- Keep flying, breathing, swaying and wounded poses continuous across confirmed steps, turns and artwork updates.
- Smooth hover displacement between pixels and change animation speed without resetting its phase.
- Preserve the concurrent spell-terrain, spell-atmosphere and wider death-splatter fixes.

## 0.3.80 — 2026-11-13

- Add an all-direction burst of death debris from the body alongside the killing blow’s directional spray.
- Widen death splatter and increase particle travel so the effect is less concentrated, preserving material styling, visibility clipping and Still mode.

## 0.3.79 — 2026-11-12

- Fix Flame Wave and other explosion glyphs briefly turning floors into raised walls. Transparent/decorative walls also retain their shape beneath spell, cloud and actor glyphs; terrain categories now decide wall geometry.
- Restore the earlier spell lighting, particles, cloud motion/opacity, residues and impact styling. Keep native fades, fixed area/cloud positions and duplicate-effect suppression.
- Add protocol-to-raster checks for the glyph-only frame before artwork, visible effects and clearing, with lighting/VFX enabled and Still mode.

## 0.3.78 — 2026-11-12

- Remove all weapon VFX, trails, swing artwork/variations, their preview and obsolete Combat controls.
- Keep one consistent body bump for all melee weapons, with Hit bump strength and Soft / Firm / Crunchy snap settings. Strength Off plants both actors; old weapon preferences no longer affect bumps.
- Preserve ordinary blood/material hit splashes, confirmed damage, and the concurrent native spell and terrain-lighting fixes.

## 0.3.77 — 2026-11-12

- Keep native spell artwork and brief entry/exit fades; remove stacked spell light pools, added cloud deformation/particles and cloud floor residue. Spell overlays no longer change nearby terrain lighting masks or slide between cloud cells.
- Let native area explosions/clouds own their visual effect, without a second generated burst. Smaller standalone spell/contact cues retain confirmed damage feedback, projectile timing, and the concurrent melee/hit-splash improvements.
- Expand spell raster checks to 16 artwork families, with independent native-shape references and pixel comparisons for terrain/torch stability around Flame Wave, Volatile Blastmotes and clouds.

## 0.3.76 — 2026-11-12

- Show melee swings only for player attacks, with one consistent gesture per weapon family and a shorter version for misses.
- Give axes a broad directional sweep and thrusts a straight approach; remove randomized variations from the game and preview.
- Make target hit bumps stronger and faster, with adjustable strength and Soft / Firm / Crunchy snap under Combat settings.

## 0.3.75 — 2026-11-12

- Make confirmed melee and ranged impacts splash naturally around the contact point, with a smaller all-direction spray and a stronger forward majority.
- Vary splash angles and speed while preserving material artwork, hit timing, visibility clipping and Still/reduced-motion behavior.

## 0.3.74 — 2026-11-12

- Simplify spell entrances and exits to brief opacity fades of the original server artwork.
- Remove added spawn particle bursts and tile growth/stretching, especially for Flame Wave; preserve fixed explosion positions.
- Fade departing native clouds and spell terrain, retain very brief server overlays, and verify unchanged sprite shapes and colours in the browser.

## 0.3.73 — 2026-11-12

- Keep complete melee silhouettes at visibility boundaries instead of clipping wide axe strokes and misses to cell rectangles.
- Treat minotaur headbutts as natural follow-ups, preserving damage feedback without extra axe swings or retargeting same-name enemies.
- Add an actual dungeon-renderer panel to the melee preview and regression coverage comparing live weapon pixels with the isolated artwork in all eight directions.

## 0.3.72 — 2026-11-12

- Add quick, material-specific entrance effects for Ice Thorns, Fulminant Prism, clouds and stationary spell explosions.
- Keep Flame Wave's expanding explosion cells anchored instead of joining them into moving projectile paths.
- Preserve confirmed visibility, Still/reduced motion and ordinary projectile travel; add deterministic spawn lifecycle and browser raster checks.

## 0.3.71 — 2026-11-12

- Make melee strikes more pronounced with opaque, outlined weapon artwork, thicker trails and a solid braided whip.
- Use one common guard and continuous attack path, with weapon orientation fixed when each swing begins.
- Add timeline scrubbing and motion guides to the melee preview, including a narrow layout.

## 0.3.70 — 2026-11-12

- Give nine melee weapon families distinct pixel-art gestures, with upright silhouettes, short follow-through and withdrawing thrusts.
- Add Combat settings for weapon effects, stroke weight, trail length and actor lunge/recoil; expand the melee preview to 27 gestures.
- Preserve 0.3.69's removal of floating combat text and its streamlined verification workflow.

## 0.3.69 — 2026-11-12

- Remove floating combat popups, their setting, font/icons and dedicated engine patches while preserving world combat and spell effects.
- Make everyday verification substantially faster with incremental typechecking, focused unit tests and representative browser checks.
- Keep full rendering, production and deployment checks in the release gate; document the verification choices for contributors and agents.
- Remove redundant tests and unused diagnostic setup, and run only relevant verification on pull requests.

## 0.3.68 — 2026-11-12

- Stabilize the Dungeon-only baseline while preserving existing 2.5D artwork and renderer behavior.
- Consolidate temporary-map transitions and preserve applied settings/cursor state when returning to Dungeon.
- Separate settings from server/account persistence and normalize supported numeric preferences safely.
- Give narrow mouse windows readable HUD panes while retaining touch and wide-screen layouts.
- Add repeatable Chromium raster, accessibility, map and production-preview checks, plus branch/PR verification.
- Consolidate current engineering documentation and prior release evidence.

## 0.3.67 — 2026-11-12

- Make Dungeon (2.5D) the only gameplay presentation and migrate old projection preferences safely.
- Keep flat level maps, overview and minimap with restoration to the dungeon on close.
- Render menu scenery with the existing 2.5D renderer.
- Remove the first-person renderer, exclusive controls/settings/assets/tools and Three.js dependencies.
- Refresh documentation and public presentation around the current product; preserve online-only hosting and corresponding-source safeguards.

Earlier entries below describe historical releases and may mention features removed in 0.3.67.

## 0.3.66 — 2026-11-12

- Add three varied gestures per melee style, with smoother paths and follow-through in Dungeon (2.5D).
- Keep swings aligned with moving creatures and preserve material splatters at the existing contact time.

## 0.3.65 — 2026-11-12

- Give deaths a middle-ground lifetime and density, with more outward travel along the hit direction.
- Strengthen melee and ranged splatters with larger particles, longer travel and stepped trails.
- Let animated Dungeon material splatters replace the generic hit icon that covered the body.

## 0.3.64 — 2026-11-12

- Keep adjoining wall roofs level through corners and passage junctions in Dungeon (2.5D), with matching click targets.

## 0.3.63 — 2026-11-12

- Make melee and ranged material splatters more pronounced with larger fragments and denser sprays.
- Keep death effects much closer to the body, with fewer particles and quicker settling and fading.

## 0.3.62 — 2026-11-12

- Give ranged damage subtle, varied splatters matched to the struck creature's body material and timed to projectile arrival in Dungeon (2.5D).
- Tone down death bursts with fewer particles, smaller fragments and pools, and less outward travel.

## 0.3.61 — 2026-11-12

- Replace low-health tile fire flashes with a subtle red corner vignette that fades away after damage at 30% HP or below.
- Keep the centre clear and reduce warning intensity with reduced motion.

## 0.3.60 — 2026-11-12

- Replace melee impact flashes in Dungeon (2.5D) with subtle directional sprays matched to the target's body material.
- Vary particle count, speed, spread, size and launch point between hits.

## 0.3.59 — 2026-11-12

- Keep foreground wall tiles aligned through corridor junctions and widened passages in Dungeon (2.5D).

## 0.3.58 — 2026-11-12

- Vary enemy death bursts, debris and floor pools in Dungeon (2.5D).

## 0.3.57 — 2026-11-12

- Briefly flash creatures when melee or spells damage them, timed to the hit and respecting reduced motion.

## 0.3.56 — 2026-11-12

- Keep grounded characters, orc apostles and sacred lotuses from hovering; animate player flight only while the flying status is active.

## 0.3.55 — 2026-11-12

- Slow projectiles slightly so their flight is easier to follow while keeping combat snappy.

## 0.3.54 — 2026-11-12

- Make idle breathing and swaying more noticeable, and give flying creatures and Djinni a visible hovering animation.

## 0.3.53 — 2026-11-12

- Show one travelling projectile that lands over the destination creature, paced by WebTiles animation delays.
- Keep the projectile and its single impact aligned with moving targets.

## 0.3.52 — 2026-11-12

- Add an FPS counter to the Dungeon (2.5D) view, measuring frames actually drawn.

## 0.3.51 — 2026-11-12

- Restore WebTiles projectile artwork repeated along the path.
- Show one impact per hit and keep it centred on creatures as they move.

## 0.3.50 — 2026-11-12

- Make single projectiles easier to follow with slightly slower travel and fading trails matched to their material or element.
- Stop showing an impact burst on the character after auto-explore or travel batches multiple steps.

## 0.3.49 — 2026-11-12

- Give projectiles, spell hits, melee and shared impact feedback shaded pixel bursts, debris and elemental remnants that match the dungeon artwork.
- Fix batched Magic Dart paths and repeated-cast impacts, and make projectile travel nearly instant.

## 0.3.48 — 2026-11-12

- Show death VFX for Foxfire and other indirect kills, including delayed death messages and named enemies.

## 0.3.47 — 2026-11-12

- Keep projectiles moving toward their targets, double travel speed, and align directional sprites with their flight.

## 0.3.46 — 2026-11-12

- Start death VFX as soon as the enemy disappears, removing the brief gap before gore and debris appear.

## 0.3.45 — 2026-11-12

- Show dungeon projectiles as a single traveling sprite, with impact effects at their destination.

## 0.3.44 — 2026-11-12

- Give melee attacks pixel-art swings, thrusts and overhead blows matched to the weapon, with sharper contact sparks for heavier hits.

## 0.3.43 — 2026-11-12

- Align Djinni defence and attribute rows below the character portrait.
- Keep webs and nets at character size in overhead views instead of covering the screen.

## 0.3.42 — 2026-11-12

- Give Dungeon (2.5D) deaths chunkier shaded pixel gore, denser blood sprays and ragged splatters that linger before dissolving.

## 0.3.41 — 2026-11-12

- Add a subtle directional sweep on fast explore/travel arrivals to show the general direction traveled.

## 0.3.40 — 2026-11-12

- Give enemy deaths a sharp burst and fading debris in dungeon and first-person views, with bone shards, slime splashes, rubble, embers and spectral wisps matched to the creature.

## 0.3.39 — 2026-11-12

- Speed up idle breathing slightly while keeping its pronounced movement and smooth edges.

## 0.3.38 — 2026-11-12

- Give Dungeon (2.5D) stone walls raised tops and dark vertical faces, with deeper fades into unexplored space.
- Warm nearby terrain, cool distant stone, and let torches and magic illuminate a broader area.

## 0.3.37 — 2026-11-12

- Make idle breathing more pronounced while keeping its slow rhythm and smooth edges.

## 0.3.36 — 2026-11-11

- Skip LOS fades when fast auto-explore or travel jumps to a new location, so the surroundings appear at their final brightness.
- Replace estimated enemy damage numbers with light, solid and heavy hit cues that show damage type; keep confirmed numbers and player HP changes.
- Make Dungeon (2.5D) melee travel from attacker to defender, with recoil and combat feedback timed to contact.

## 0.3.35 — 2026-11-11

- Restore the latest combat popup icons, receiver colors, level-up celebration and spell effects after a stale deployment.
- Give horizontal Dungeon (2.5D) corridors more floor space and lower the foreground lip in single-cell passages while retaining raised room walls.

## 0.3.34 — 2026-11-11

- Add Dungeon (2.5D) effects for Freeze and other spells and abilities without projectiles, including gusts, flames, draining, smiting, hexes, healing, buffs and summons.
- Show confirmed zero-damage results and incoming abilities, even with combat popups disabled. Preserve brief server flashes received between rendered frames.
- Keep effects bounded, depth sorted and consistent with visibility, level changes and Still mode.

## 0.3.33 — 2026-11-11

- Remove the sword beside physical damage numbers and celebrate level-ups with larger text, colorful confetti, sparks and an expanding ring.
- Distinguish player and enemy combat feedback with different colors, including cyan player dodges/blocks and amber enemy dodges/blocks. Keep player damage pink and healing mint.

## 0.3.32 — 2026-11-11

- Remove artificial lines and texture seams from Dungeon (2.5D) walls, keeping soft shading at their bases.
- Give walls a consistent height and artwork scale, including corners and foreground walls, so tiles no longer shrink as visibility changes.
- Keep ground fog beneath walls and creatures so remembered terrain cannot paint rectangular bands across them.

## 0.3.31 — 2026-11-11

- Replace NO DAMAGE with a subtle armor-block icon for players and enemies.
- Make combat popups smaller and use distinct icons for misses, shield blocks, kills, damage types, healing, statuses and leveling to reduce reading during combat.

## 0.3.30 — 2026-11-11

- Strengthen wall-base shadows in Dungeon (2.5D) so wall height is easier to read.
- Fade terrain smoothly as it enters and leaves line of sight, including lighting and memory fog. Rapid LOS changes reverse smoothly; Still mode keeps instant changes.

## 0.3.29 — 2026-11-11

- Restore Sandblast and other brief spell projectiles that could be created and removed between rendered frames. Preserve confirmed flight artwork briefly without delaying game updates or input.
- Give non-glowing sand, stone, metal and air spells their own subtle impacts and lingering dust/shard traces. Keep compact missiles crisp instead of applying continuous-beam thinning to them.
- Apply the fix to other short-lived spell and missile overlays, with quiet fallbacks for new server art. Preserve intentionally invisible spells, Still mode, visibility and level-transition cleanup.

## 0.3.28 — 2026-11-11

- Make idle breathing slower and gentler, with smoother pixel edges that keep sprite details crisp.

## 0.3.27 — 2026-11-11

- Give Dungeon (2.5D) walls stronger base shadows, height-aware cast shadows, shaded faces and subtle roof edges so their depth is easier to read.

## 0.3.26 — 2026-11-11

- Tween multi-cell movement for fast enemies, projectiles and rampage instead of snapping to the destination. Keep the following camera synchronized with the player.
- Continue repeated moves from the drawn position and animate the full remaining route within one tween duration.

## 0.3.25 — 2026-11-11

- Make Dungeon (2.5D) idle motion slightly stronger and preserve crisp sprite filtering during animation. Wounded enemies lean and breathe unevenly as their health drops.
- Animate confirmed melee attacks with small lunges and recoil, plus sword, thrust, axe, blunt and unarmed gestures. Enemy melee attempts animate independently of damage-popup settings.
- Leave faint, short-lived fire, frost, lightning and magical traces after spells. Add compact light cores, more embers and magical motes, and fountain spray while keeping sprites and targeting readable.
- Bound effect histories and particle counts; respect visibility, level changes and Still/reduced-motion settings.

## 0.3.24 — 2026-11-11

- Show damage popups when enemies step on Ice Thorns from Crawl trunk, including its plural “skewer” hit messages.
- Display a quiet NO DAMAGE popup for explicitly reported zero-damage hits, including incoming hits that cause no HP change. Keep damage estimates distinct from exact zeroes and skip damage-impact effects for zero-damage hits.

## 0.3.23 — 2026-11-11

- Fix the camera jumping ahead of the player in Dungeon (2.5D). Deliver the new camera center with the confirmed scene and keep both on one movement curve.
- Carry velocity through repeated player steps for smoother walking and travel, preserving configurable timing, exact landing and reduced motion.
- Restore damage popups for native strong-hit messages such as “perforate … like a sieve” and “cut … into ribbons”. Keep floating text aligned with moving entities and the camera.

## 0.3.22 — 2026-11-11

- Add smooth movement tweens for entities in Dungeon (2.5D), with a synchronized following camera and a snappy 100 ms ease-out default.
- Configure movement, duration and Snappy/Smooth/Linear easing in Settings → View. Rapid travel retargets immediately without queuing animations; teleports and level changes snap.
- Keep shadows, lighting, depth ordering, badges, item cursors and picking aligned during movement. Respect Still mode and the device's reduced motion preference in Auto mode.

## 0.3.21 — 2026-11-11

- Restore original WebTiles tile brightness in line of sight, removing the extra exposure lift.
- Keep torch and magical light compact and centered on the emitting sprite. Feather light and shadows across floors and walls instead of stretching light over individual faces.
- Make Dungeon animation On work independently of device reduced motion; Auto follows the device preference. Smooth subpixel creature motion during live play.
- Make damage numbers smaller and add a quick rise, overshoot and settle when they appear. Keep still mode and elemental styles.

## 0.3.20 — 2026-11-11

- Brighten Dungeon (2.5D) ambient lighting and dark floor artwork, with lighter contact shadows and a gentler vignette.
- Share one smooth light field across floors, walls and sprites. Remove per-tile light tints; soften torch flicker and fade spell afterglows every frame.
- Draw spell bolts as thinner, smoothly filtered ground-plane effects, preserving connected beam segments. Reduce cloud opacity, impact rings and ambient particles.
- Use a new condensed combat-number font with distinct motion and glow for physical, fire, cold, poison, acid, electric and magical damage. Heavy hits pop more strongly; reduced motion keeps numbers still.

## 0.3.19 — 2026-11-11

- Remove player lighting halos in Dungeon (2.5D), use neutral black shading with faint fog outside line of sight, and make living animations smoother and more pronounced.
- Keep damage numbers while hiding redundant SLAIN and generic HIT popups in Dungeon (2.5D).
- Move the 2.5D character panel to the top right and keep the nearby list below it, including when status labels wrap.
- Show item descriptions on right-click in inventory, equipment and other item lists without selecting or using the item.

## 0.3.18 — 2026-11-11

- Add colored light from torches, elemental clouds, glowing creatures and spell bolts across dungeon views, with warm line of sight, cool memory and curling shadows at unexplored edges.
- Animate creatures by body and state, trees, liquids, clouds, gold and magical terrain; hits, water steps and teleport arrivals send out ripples. Respect reduced motion and keep remembered tiles still.
- Prevent duplicate damage numbers when an attack message and its monster wound-status update arrive in separate frames. Wound flags inform hit estimates without producing another damage popup.

## 0.3.17 — 2026-11-11

- Align green item borders with upright sprites in Dungeon (2.5D), keeping travel and other ground markers in place.
- Fill unexplored space with dark neutral mist and make remembered terrain clearly dimmer than tiles in line of sight.
- Remove the player lantern glow and distance-based sprite lighting; keep environmental lava, portal and altar effects.

## 0.3.16 — 2026-11-11

- Show estimated public-server damage as ≈ numbers using hit strength and visible wounds; group same-turn hits and keep exact server numbers when available.
- Improve damage popup placement when several monsters share a name, and keep estimated damage visible beside kill callouts.

## 0.3.15 — 2026-11-11

- Keep rapid combat readable: limit popup stacks, fold weapon-brand effects into their hits, and skip old combat queued while a game is loading.

## 0.3.14 — 2026-11-11

- Add combat popups in every dungeon view: damage, misses, blocks, kills, healing, level-ups and important status changes, with elemental colors and reduced-motion support. Toggle them in Settings → View → Combat popups.
- Use exact player health changes and server-reported attack damage; ordinary public-server hits say HIT when no number is available. Offline engine builds now include actual melee and beam damage in messages (requires a rebuilt engine).

## 0.3.13 — 2026-11-11

- Fix remaining 2.5D tile seams at fractional zoom and display density, including filtered terrain edges and inherited flat-view wall shadows.
- Draw monsters and ordinary objects at their original atlas scale relative to the player; keep corpses flat and make upright items clickable across their visible height.
- Add soft contact shadows, continuous water ripples, fountain ripples and faint drifting black fog at explored boundaries. Atmosphere still respects reduced motion.

## 0.3.12 — 2026-11-11

- Blend the Dungeon (2.5D) view by removing raised-tile outlines and the duplicate corner 2D view.
- Replace blue explored-terrain shading with a faint black haze that keeps terrain readable.
- Make fullscreen opt-in with an icon in the main menu's upper-right corner; installed apps open in standalone mode.

## 0.3.11 — 2026-11-11

- Add Dungeon (2.5D) in Settings → View: raised walls, upright creatures, shadows and environmental lighting, with adjustable tilt, zoom and animation.
- Overhead views use compass movement and targeting; the level map stays flat.

## 0.3.10 — 2026-11-11

- Add opt-in Predictive movement under Settings › Controls for online 3D play. A single step into clear visible floor starts immediately; matching replies keep the same animation and refused steps ease back.
- Keep authoritative position, map, combat and targeting unchanged. Prediction stays off around monsters, status effects, occupied or special terrain, and prompts; it never adds, buffers or replays commands.

## 0.3.9 — 2026-11-11

- Remove the partial movement preview that caused a move–pause–move effect online. Confirmed steps use one continuous glide again, retaining input-before-render scheduling and first-frame motion.
- Add a separate connection check at /connection-check.html to compare server response times across networks without touching your game.

## 0.3.8 — 2026-11-11

- Give online walking an immediate, small camera preview on clear visible floor. The server still decides every step; refused moves ease back, and previews are disabled around visible monsters, special terrain, prompts and status effects.
- Finish confirmed manual steps sooner when their response was delayed, without adding or buffering commands.

## 0.3.7 — 2026-11-11

- Reduce controller response delay and show confirmed movement sooner, keeping camera and monster motion synchronized.
- Enter fullscreen automatically at launch and on return; when the browser requires a gesture, any tap or key starts it.

## 0.3.6 — 2026-11-11

- Keep Android controller buttons and d-pad aligned with the browser's mapping.
- Installed apps request fullscreen; Settings › Interface › Go fullscreen hides system bars on supported browsers.

## 0.3.5 — 2026-11-08

- Add Hold RB key to gamepad to Reach with a primary attack.

## 0.3.4 — 2026-10-25

- View your morgues and high scores, online or offline.

## 0.3.3 — 2026-10-24

- Play on more servers: CRG, CBRG, CNC and CPO.
- Spells and Gear reset after you move.
- Explore on the touch bar dims once done exploring.
- Various fixes for walls, doors, ceilings, the camera, and text wrapping.

## 0.3.2 — 2026-10-18

- Gozag's Potion Petition now lets you pick which potions to buy.
- Add mark travel exclusion to level map.

## 0.3.1 — 2026-10-17

- Explore now walks you at 90ms per step (Settings › View).
- Fixes for phones, tablets, the touch bar, doors and spell aiming.

## 0.3.0 — 2026-10-16

- Play Orbrun on a phone or tablet, in portrait or landscape.
- Field of view and minimap size now default to Auto, fitted to your screen.
- Choose how many lines the message log shows (Settings › Interface).
- The minimap now always stays north up, with you turning on it, to suit every device.

## 0.2.13 — 2026-10-02

- In-game menus are redone, with tabs for your pack and your actions.
- X opens your spells, abilities and quiver; LB now waits and rests.
- Select opens the level map, with stairs and travel a button away.

## 0.2.12 — 2026-10-01

- The left stick no longer slips into diagonal steps by accident.
- The right stick can turn in 45° steps, so the left stick can strafe (Settings › Controls).
- The right stick looks around faster.

## 0.2.11 — 2026-10-01

- The minimap can now stay north up instead of turning with you (Settings › Interface).
- Each settings page can now be reset to its defaults.

## 0.2.10 — 2026-09-30

- Stairs up are now solid steps.

## 0.2.9 — 2026-09-29

- Stairs down, traps and transporters now sit solid in the floor.

## 0.2.8 — 2026-09-29

- The main menu now stands in a new real place from the dungeon each visit.

## 0.2.7 — 2026-09-29

- What's new is now in the main menu, with a dot when there's something new.
- Settings/accounts screens show scenes as backdrop.

## 0.2.6 — 2026-09-29

- You can launch Orbrun and play without an internet connection.

## 0.2.5 — 2026-09-28

- Travel, explore and rest on this device work like they do on a server.
- Older browsers ask you to update instead of crashing.

## 0.2.4 — 2026-09-28

- Edit your rc file right in Orbrun.

## 0.2.3 — 2026-09-28

- Play older versions, Sprint, the tutorial and seeded games.

## 0.2.2 — 2026-09-25

- A new About page shows Orbrun in real games, from Lair to the Abyss; What’s new and Add to Steam match it.

## 0.2.1 — 2026-09-25

- Add a server has its own page: type an address, and the server lands on the list with the cursor on it. A server you added can be removed again.
- Logging in no longer shows a stale "Connection lost" when the connection had already come back.
- Looking at another server's login no longer leaves your account stuck on "connecting"; a player on this device always shows as ready.
- Your account and About & credits line up with the rest of the title screen menu.

## 0.2.0 — 2026-09-25

- Play on this device, with no server and no connection needed: under Add an account, pick This device, give your player a name, and play — the game runs in your browser.
- Everyone who shares the device can have a player of their own, each with their own game and saves.
- The game on your device keeps itself up to date: new versions download in the background and are ready the next time you press Play.
- Choosing a god at an altar works with the gamepad: Start joins, and the d-pad switches between the god's pages.
- Doors, statues and items no longer go missing on busy levels deeper in the game.
- Pressing up at the top of the title screen goes to your account; About & credits is one step right of it.
- Cleaner addresses you can share, like orbrun.app/watch/cdi/bob.
- Each server's own site is a click away beside it when you add an account, for its rules, code of conduct and donations.

## 0.1.8 — 2026-09-23

- Menus now use the same font as the game, and it comes with Orbrun, so it looks the same on every device.
- Small text in the menus is bigger and easier to read, especially on a Steam Deck.
- If your connection drops mid-game, Orbrun puts you straight back into your game, with nothing to press. If the network stays down, you land on the menu with your game saved.
- A button pressed while the server closes your last session no longer stops your game from starting.
- The Watch list no longer skips players as you scroll through it.
- The gamepad controls sheet now lives under Settings > Controls, in two columns.

## 0.1.7 — 2026-09-22

- Smoke and the other clouds now drift over the monsters standing in them, instead of disappearing behind whoever is in the cell.
- Everything that stands — monsters, items, doors, statues, your own shadow — is now drawn straight from the art by the graphics card, one draw for a whole crowd, instead of being built as a little model each. Their thickness and dark outline are worked out as they draw, so nothing is built ahead of them either.
- Walls on a big level go up faster: cells whose surroundings look alike reuse the shape already worked out for them.

## 0.1.6 — 2026-09-21

- Arriving on a level no longer stalls on its statues, trees and stairs: their outlines were being read back off the art one row at a time. Nothing in the picture changed.
- The home screen offers Quit when Orbrun runs in its own window — a kiosk browser on a Steam Deck, or an installed app — where the browser gives you no way out. In a normal tab it stays hidden.

## 0.1.5 — 2026-09-20

- Monsters now walk between cells instead of jumping one to the next, gliding
  after their step the way your own view does.

## 0.1.4 — 2026-09-18

- Exploring no longer hitches: a step relights the level instead of rebuilding it, a newly seen cell rebuilds only what changed, and a crowd of sprites uploads only the sprites that moved. Nothing in the picture changed.
- A screen you leave stops everything it started: its timers, its fetches and a tile download the server left hanging.

## 0.1.3 — 2026-09-16

- Crowded levels no longer stutter: sprite updates cost 93–98 % less CPU and draw 46 % fewer triangles.

## 0.1.2 — 2026-09-16

- Crowded levels draw far faster: a hall full of monsters and items costs a dozen draw calls a frame instead of one per sprite, so the frame rate holds up on weak graphics.

## 0.1.1 — 2026-09-16

- Movement now glides between cells and comes to a clean stop, with consistent pacing on diagonals and across frame rates.
- Turning or looking during movement is no longer undone by a delayed movement reply.

## 0.1.0 — 2026-09-10 — first public release

Everything before this was pre-release development, so this entry is the whole
of what Orbrun does today.

- Play any public WebTiles server in first person: connect, log in or register,
  start a game or continue a saved one, or watch someone else's. Your account
  and your rc file stay the server's, honoured live, never cached or overridden.
- Everything the official client shows: menus, popups, prompts, `--more--`,
  the monster list, the stats pane, the message log, chat with spectators, the
  level map, the dungeon overview, and targeting.
- Full gamepad support: a contextual A button, tap-or-hold buttons, an action
  bar that always shows what each button does in the current mode, a menu per
  button (actions on LB, travel on Select, your gear on Y, your character and
  the game options on Start), an on-screen keyboard, and hints that teach the
  controls as you use them.
- Aiming on a controller: fire, examine, spells and wands open on the cell
  ahead, keep their heading while the d-pad walks the cursor, and repeat
  with repeated taps.
- Keyboard plays exactly as in the official client, with one exception:
  direction keys are relative to facing.
- A minimap, edge pips for monsters the camera does not frame (your own
  summons included), a wielded-weapon viewmodel, memory dimming, and threat
  and travel messages spelled the way crawl spells them.
- The front end stands in the Antechamber, a small hall built from the game's
  own tiles: main menu, accounts and servers, the Watch roster, settings, the
  changelog and about screens, and morgue files all read over it.
- Nothing version-specific is hardcoded. Enums, tile tables, and atlases come
  from the connected server at runtime, so stable and trunk both work.
- Multiple accounts across multiple servers, plus any server you add by URL.
  A dropped connection is reopened and logged back in on its own.
- Plays from your Steam library, on a Steam Deck, Windows, Linux or a Mac, as
  a non-Steam game that opens a kiosk browser on orbrun.app. The five steps,
  with artwork, are in STEAM.md and under About & credits.
- Hosted at orbrun.app: nothing to install, no Orbrun account, and tile data
  loads from whichever server you connect to.
- Anonymous page counts on the hosted site only — no cookies, nothing about
  your game — and nothing at all from local builds.
- Not yet: sound, the feel layer (sway, hit shake, vignettes), a desktop or
  Steam shell, offline play against a local engine. The top-down view
  exists but is not offered in this release.
