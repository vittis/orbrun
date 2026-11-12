# @orbrun/render-2d

A top-down Canvas 2D renderer of a `@orbrun/scene` `Scene`, drawing the
cells in the official client's layer order from any `TileSource`. `Render2d`
implements `MapRenderer`. Orbrun uses it for temporary flat level maps,
overviews and the minimap; it is not a selectable gameplay mode. `mode: 'minimap'` draws solid colour
blocks in the official client's minimap palette, and `'tiles'`, `'glyphs'`
and `'hybrid'` draw the level itself.

Depends on `@orbrun/scene`. Part of
[Orbrun](https://github.com/Caeous/orbrun). AGPL-3.0-or-later.
