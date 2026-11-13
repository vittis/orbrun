# About Orbrun

Orbrun is an unofficial [Dungeon Crawl Stone Soup](https://crawl.develz.org/) WebTiles client. This fork presents the game in Dungeon (2.5D), with keyboard, gamepad and touch controls.

[Play or watch](https://dcss-client.vittis.workers.dev/). The hosted build supports online play on the bundled public servers. Offline play and custom servers are development capabilities and are unavailable in this deployment.

The [complete source for this release](https://github.com/vittis/orbrun/tree/cloudflare-online-v1.87) is available under [AGPL-3.0-or-later](LICENSE). Upstream Orbrun is by [Caeous](https://github.com/Caeous/orbrun). [ATTRIBUTION.md](ATTRIBUTION.md) records the original authors, DCSS-derived work and asset licenses.

## Getting started

Choose **Watch** to spectate without signing in. To play, choose **Play**, select the server where your account lives, then log in or register there. Accounts, saves, rc files and scoreboard entries belong to that DCSS server. There is no separate Orbrun account.

[Add to Steam](STEAM.md) explains using the Steam Deck's browser and controller. [Add to Home Screen](INSTALL.md) explains installing the shell on phones, tablets and computers. Online gameplay needs a network connection.

## The dungeon and maps

Dungeon (2.5D) is the only gameplay presentation. It uses the server's tiles with raised walls, upright creatures, lighting and confirmed combat effects. Settings retain tilt, zoom, animation, movement presentation and accessibility controls. **Still** mode limits animation; reduced motion is respected.

The minimap and temporary level map remain flat. Press `X` for the level map; closing it restores the dungeon. `Ctrl+X` opens the separate **in view** list. Messages, menus, stats, targeting and the monster list remain available. The client never predicts authoritative moves, damage or hidden information.

## Controls

### Keyboard

Movement and targeting use compass directions, independent of the camera tilt.

| Key | Action |
|---|---|
| `k` / `↑` | North |
| `j` / `↓` | South |
| `h` / `←` | West |
| `l` / `→` | East |
| `y`, `u`, `b`, `n` | Northwest, northeast, southwest, southeast |
| Shift + direction | Run |
| Ctrl + direction | Attack |
| `X` / F2 | Level map |
| `Ctrl+X` | In view list |
| F3 | Actions menu |
| F4 | Gear menu |
| F5 | Orbrun menu |
| F12 | Chat |

Menus, prompts and text entry retain their contextual WebTiles keys. The F-keys open the gamepad's menus; press again to close. Escape opens the menu while spectating.

### Gamepad (standard mapping)

- Left stick or d-pad: move and target in the eight compass directions. Held movement repeats steps.
- **A** does what the situation calls for; consult the action bar for the current command.
- **B** cancels or backs out.
- **X** opens spells, abilities, evocables and quiver; bumpers switch tabs. In a menu, X describes the selected row.
- **Y** opens gear; Y in that menu swaps weapons.
- **LB** waits; hold to rest.
- **RB** aims the quivered action; press again to fire.
- **LT** autoexplores.
- **RT** autofights.
- **R3** or **L3** examines; use the d-pad to move the cursor and A to describe it.
- **Select** opens the level map. Map actions include stairs, travel, search and dungeon overview; hold Select for more map commands.
- **Start** opens the Orbrun menu for character commands, help, settings, chat and save/exit.

The action bar reflects the current server mode. Controller mappings and browser/device support can vary; automated input checks do not certify every physical controller.

### Touch

Touch buttons provide compass movement, targeting, exploration, fighting, waiting, quivering, spells and gear. Their labels change with the current mode. Tap a dungeon cell to select or act on it according to the current command. Tap stats for the Orbrun menu and the minimap for the level map. On the flat map, tap to select, drag to pan and pinch to zoom.

Tap a spell to ready it and again to cast. Menus support selecting rows and swiping between tabs. Actions that spend a turn can require a confirming second tap. Numeric prompts offer a number pad.

## Version support

The client loads each connected server's enums, tile tables and atlases. Its parser supports known generated forms without executing remote JavaScript. Changed upstream formats may require a compatibility update; unsupported content fails explicitly rather than being guessed.

## Security and privacy

The browser connects directly to the chosen DCSS server over WSS. Passwords are sent in login messages and are not stored. Saving a login stores the server's token in browser storage alongside preferences. Clear the site's data to remove these local records. Protect your browser profile as you would any saved login.

The host serves the app and bounded gamedata/morgue proxies for the bundled allowlisted servers. Game WebSocket traffic goes directly to DCSS. Custom proxy hosts and redirects are rejected. Executable scripts are served from the app's own origin under a restrictive Content Security Policy.

The repository retains optional Cloudflare analytics support; it loads a beacon only when configured at build time. Do not put secrets in `VITE_` variables, fixtures or bug reports.

## Credits and feedback

DCSS is made by its volunteer contributors and runs on independently maintained public servers. Thanks to [PocketZot](https://pocketzot.app/about) and [Super Dungeon Crawl](https://github.com/vimuston/super-dungeon-crawl) for the inspirations described in the attribution record.

Report fork issues at [vittis/orbrun](https://github.com/vittis/orbrun/issues). Upstream Orbrun is at [Caeous/orbrun](https://github.com/Caeous/orbrun); its author can be reached at <caeous@gmail.com>.
