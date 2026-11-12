# What's new

Notable changes to Orbrun, newest first.

## 0.3.42 — 2026-11-12

- Give Dungeon (2.5D) deaths chunkier shaded pixel gore, denser blood sprays and ragged splatters that linger before dissolving.

## 0.3.41 — 2026-11-12

- Give melee attacks pixel-art swings, thrusts and overhead blows matched to the weapon, with sharper contact sparks for heavier hits.
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
