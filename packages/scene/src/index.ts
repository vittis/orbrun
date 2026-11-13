/**
 * @orbrun/scene
 *
 * A description of a grid world that has already been classified, plus the
 * contracts renderers implement and consume. No dependencies, no knowledge of
 * DCSS or WebTiles. Everything here can be built by hand from any source.
 */

// ---------------------------------------------------------------------------
// Basic geometry

export type TileId = number

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

import type { WoundLevel } from './bars.js'
import { cellKey, type CellKey } from './coordinates.js'
export { cellKey, keyToXY, type CellKey } from './coordinates.js'

export * from './bars.js'
export * from './motion.js'
export * from './living.js'

/** 8 compass headings, clockwise from north. North is -y. */
export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const DIR8_DX = [0, 1, 1, 1, 0, -1, -1, -1] as const
export const DIR8_DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const

export function dirFromDelta(dx: number, dy: number): Dir8 | null {
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  for (let i = 0; i < 8; i++) if (DIR8_DX[i] === sx && DIR8_DY[i] === sy) return i as Dir8
  return null
}

// ---------------------------------------------------------------------------
// Cells

export type CellKind = 'unknown' | 'floor' | 'wall' | 'door' | 'feature'
export type Visibility = 'visible' | 'remembered' | 'unseen'

export type Feature =
  /**
   * `branch`: the stair into a branch (name says entrance, minimap says
   * branch stair). `exit`: crawl's `DNGN_EXIT_DUNGEON`, the up staircase the
   * game starts on (feature-data.h: glyph `<`, minimap `MF_STAIR_UP`); `<`
   * there ends the game, so it is not an ascent to prompt as one.
   */
  | { type: 'stairs'; dir: 'up' | 'down'; branch?: boolean; exit?: boolean }
  | { type: 'hatch'; dir: 'up' | 'down' }
  | { type: 'door'; state: 'open' | 'closed' | 'runed' | 'sealed' }
  | { type: 'altar'; god?: string }
  | { type: 'shop' }
  | { type: 'fountain'; kind: string }
  | { type: 'portal' }
  | { type: 'transporter' }
  | { type: 'trap'; kind?: string }
  | { type: 'other'; name: string }

export interface SceneCell {
  /** Tile semantics resolved by the producer, independent of atlas ids. */
  life?: import('./living.js').TileLife
  x: number
  y: number
  kind: CellKind
  visibility: Visibility
  /** Stands full height: wall, closed door, void. */
  occluder: boolean
  floorTile: TileId
  wallTile?: TileId
  wallStyle?: 'solid' | 'transparent'
  /**
   * The tile a face shows instead of `wallTile`, by the side it faces. A
   * closed door in a row of doors is a piece of crawl's gate art, drawn to be
   * seen from above and from the south: seen from the north the left and
   * right pieces trade places, and a gate running north–south has its own
   * top-down pieces that read as nothing upright. Each face here is the
   * horizontal piece a player standing on that side sees in that place. An
   * open door in such a gate stands in its doorway showing its east face.
   */
  faceTiles?: Partial<Record<'n' | 's' | 'w' | 'e', TileId>>
  featureTile?: TileId
  feature?: Feature
  /** How the feature tile stands: up in its cell, laid on the floor as a block a texel thick (a way down), or painted on it. */
  stance?: 'upright' | 'lying' | 'decal'
  /**
   * The cell's feature stands on the dungeon — a statue, a fountain, an altar,
   * a tree — rather than being built into it, as a door, a gate, a runelight
   * or a staircase is. What stands is a thing in the cell like the monsters
   * and items (and the scenery billboards), so a renderer that turns the
   * ground stands it upright over the turn; what is built in turns with the
   * ground it is part of.
   */
  freestanding?: boolean
  beacon?: 'down' | 'up' | 'portal'
  /** Ground decals under the feature tile: floor patterns and blood beneath stairs, altars and the like. */
  underlays?: TileId[]
  /**
   * Ground decals over the floor and feature, in draw order: blood and mould,
   * wall shadows and other server overlays, halos and sanctuary, threat rings,
   * travel exclusions. Under anything standing in the cell.
   */
  overlays?: TileId[]
  /** WebTiles wall shadows among overlays; 2.5D replaces these with projected shadows. */
  wallShadows?: TileId[]
  /** Decals on a wall or closed door face (blood splatter, silence). */
  wallOverlays?: TileId[]
  /**
   * Cell markers drawn above everything at the cell: travel-trail arrows, the
   * "new stairs" badge, exclusion marks on unseen cells, rampage hints.
   */
  icons?: TileId[]
  /** The server cursor among `icons`; raised renderers can align it with a standing item. */
  cursorTile?: TileId
  cloud?: TileId
  /**
   * The travel trail through this cell (`show_travel_trail`): the heading the
   * walk arrived on and the heading it left on, as directions of travel. The
   * player's own cell carries `from` for the last step made; the cell behind
   * carries the matching `to`.
   */
  trail?: { from?: Dir8; to?: Dir8 }
  flags: {
    water: boolean
    lava: boolean
    excluded: boolean
    /** The centre of a travel exclusion, where crawl's level map `e` takes it off again (tileview.cc EXCL_CTR, MF_EXCL_ROOT). */
    excludeRoot?: boolean
    travelTrail: boolean
    newStair: boolean
    cursor: boolean
    /**
     * Which cursor flag the server set on the cell, in WebTiles' precedence:
     * the tutorial cursor wins over CURSOR1 (mouse), CURSOR2, CURSOR3.
     */
    cursorKind?: 'tutorial' | 'cursor1' | 'cursor2' | 'cursor3'
    /** Out of range for the current targeting prompt. */
    outOfRange: boolean
    /** Known through magic mapping only, never seen. */
    magicMapped: boolean
  }
  /**
   * Flash colour as rgba 0..255, when the game washes this cell in one
   * (view.cc `draw_cell`): blue while paralysed, grey while petrified, red
   * while berserk, and while blind the colour of what blinded you, thickening
   * with the distance from the player. It covers everything drawn in the cell,
   * as WebTiles lays it over the whole cell (cell_renderer.js `render_flash`),
   * not the ground alone.
   */
  flash?: { r: number; g: number; b: number; a: number }
  /** Glyph and colour fallback, so a renderer without tiles can still draw. */
  glyph?: string
  colour?: number
  /** Opaque description used for the reticle label. */
  label?: string
  /** The server's minimap feature category for the cell (`map-feature.h`), for the `tile_*_col` palette. */
  mf?: number
}

export type BillboardKind = 'monster' | 'item' | 'cloud' | 'doll' | 'projectile' | 'player'

export interface Billboard {
  /** Ground-plane rotation of projectile artwork, in radians. */
  rotation?: number
  /** Stable entity identity within a level, when supplied by the producer. */
  id?: string | number
  life?: import('./living.js').TileLife
  x: number
  y: number
  tile: TileId
  kind: BillboardKind
  /** Fraction of wall height, already resolved by the builder. */
  height: number
  /** Doll / mcache composition, bottom to top. Each entry may carry an offset. */
  layers?: { tile: TileId; ox?: number; oy?: number; ymax?: number }[]
  /**
   * Status badges laid out as WebTiles does: each carries an offset in
   * texels of a 32-texel cell from the cell's top-left corner.
   */
  statusIcons?: {
    tile: TileId
    ox: number
    oy: number
    /**
     * `'top'` pins the badge's opaque texels to the top edge of the frame
     * instead of where the tile paints them. The damage bar is drawn on rows
     * 30 and 31 of its icon (the sprite's feet); Orbrun lifts it over the
     * head, where the player's own bars go (bars.ts).
     */
    at?: 'top'
    /**
     * The badge is about the square, not the thing standing on it: the
     * "something under here" item-stack marks. A pane about the player's own
     * state (orbrun's status strip) leaves these out.
     */
    square?: true
    /**
     * The badge is the whole cell: the net and the web, which WebTiles
     * paints across the doll rather than in a corner. These stay on the
     * character, off the corner strip.
     */
    full?: true
  }[]
  /** Opacity 0..1 when the thing is translucent (submerged, invisible-but-known). */
  alpha?: number
  /** A corpse or skeleton laid on the floor instead of an upright sprite. */
  lying?: boolean
  /** Attitude of an actor, for tinting rings and lists (WebTiles monster_list.js names). */
  attitude?: 'hostile' | 'neutral' | 'good_neutral' | 'friendly'
  /** Threat class as WebTiles' monster list names it; `invisible` is the fifth server level. */
  threat?: 'trivial' | 'easy' | 'tough' | 'nasty' | 'invisible'
  name?: string
  /**
   * A monster that is really scenery: plants, bushes, fungi, trees, piles of
   * debris; or an item-range tile that is a tree. Renderers treat it as scenery rather than an animated actor.
   */
  scenery?: boolean
  /** Wound level from the server's MDAM flags, in monster_list.js' class names (`uninjured` when unhurt). */
  damage?: WoundLevel
  /** Opaque handle set by the builder (Orbrun stores the raw monster here). */
  ref?: unknown
}

export interface Scene {
  /** Cumulative native animation delays in seconds; presentation only. */
  projectileTime?: number
  /** Confirmed player turn, when the producer supplies one. */
  turn?: number
  /** Producer identity used to discard transient effects at level transitions. */
  levelKey?: string
  bounds: Rect
  cells: Map<CellKey, SceneCell>
  player: { x: number; y: number }
  /** Whether the player is on this level at all (false while viewing a remote level). */
  playerOnLevel: boolean
  billboards: Billboard[]
  /** Increments whenever the scene is rebuilt. */
  revision: number
}

export function emptyScene(): Scene {
  return {
    bounds: { left: 0, top: 0, right: -1, bottom: -1 },
    cells: new Map(),
    player: { x: 0, y: 0 },
    playerOnLevel: false,
    billboards: [],
    revision: 0,
  }
}

export function flashOf(cell: SceneCell | undefined): { r: number; g: number; b: number; a: number } {
  const f = cell?.flash
  if (!f || f.a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  return { r: f.r / 255, g: f.g / 255, b: f.b / 255, a: Math.min(1, f.a / 255) }
}

export function getCell(scene: Scene, x: number, y: number): SceneCell | undefined {
  return scene.cells.get(cellKey(x, y))
}

// ---------------------------------------------------------------------------
// Tiles

export interface TileRect {
  atlas: string
  /** Source rect in texels. */
  sx: number
  sy: number
  w: number
  h: number
  /** Offset of the drawn rect within a 32x32 cell, in texels. */
  ox: number
  oy: number
  /** Nominal cell size the tile was authored for. */
  cell: number
}

/**
 * What a renderer needs from a tile provider. `@orbrun/gamedata`'s `Gamedata`
 * satisfies it structurally; this package does not depend on that one.
 */
export interface TileSource {
  tile(id: TileId, layer?: string): TileRect | undefined
  atlas(name: string): TexImageSource | undefined
  atlasNames(): string[]
}

export interface SceneCursor {
  x: number
  y: number
  mode: 'target' | 'examine' | 'map'
  /** The icon WebTiles draws for this cursor (`CURSOR`, `TUTORIAL_CURSOR`); an outline when the gamedata has none. */
  tile?: TileId
  /** Outline every known cell (where the cursor may go) in the 2D view; the minimap never draws it. */
  grid?: boolean
}

// ---------------------------------------------------------------------------
// Renderer contract

/** Confirmed combat presentation. Coordinates remain the authoritative cells. */
export type HitIntensity = 'light' | 'solid' | 'heavy'
export type DamageType = 'physical' | 'fire' | 'cold' | 'poison' | 'acid' | 'electric' | 'magic'
export { combatActorId, hitIntensity, impactStrength, bumpTiming, bumpPose } from './combat.js'
export { DeathEffects } from './death.js'
export { creatureMaterial } from './material.js'
export { HitEffects } from './hits.js'
export type { HitEffect } from './hits.js'
export type { DeathEffect, DeathKind, DeathParticle } from './death.js'

export interface CombatBump {
  /** Local presentation rate captured at receipt; never changes server timing. */
  speed?: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  hit: boolean
  fromId?: string
  toId?: string
  tone?: DamageType
  intensity?: HitIntensity
}

/** Explicit unsuccessful attack; never inferred from unchanged HP. */
export interface DeflectionEffect {
  x: number
  y: number
  actorId?: string
  turn?: number
  outcome: 'miss' | 'no-damage'
}

/** Confirmed spell/ability feedback, independent of projectile artwork or damage. */
export interface SpellEffect {
  x: number
  y: number
  /** Stable recipient identity, so presentation follows the rendered actor. */
  actorId?: string
  /** Confirmed game turn, used to coalesce reports for the same result. */
  turn?: number
  kind: DamageType | 'air' | 'earth' | 'drain' | 'holy' | 'heal' | 'buff' | 'debuff' | 'teleport'
  intensity?: HitIntensity
}

export interface MapRenderer {
  /** Animated body-material effects replace generic qualitative hit icons. */
  readonly materialHitEffects?: boolean
  /** Whether presentation effects need another frame without a new game state. */
  readonly animating?: boolean
  mount(target: HTMLCanvasElement | OffscreenCanvas): void
  setTiles(tiles: TileSource): void
  /** Optional presentation timestamps are seconds on the same monotonic clock. */
  setScene(scene: Scene, now?: number): void
  setCursor(cursor: SceneCursor | null): void
  /** A confirmed visible impact, in cell coordinates and monotonic seconds. */
  impact?(x: number, y: number, strength: number, now: number): void
  hit?(effect: import('./hits.js').HitEffect, now: number): void
  deflect?(effect: DeflectionEffect, now: number): void
  bump?(attack: CombatBump, now: number): void
  spell?(effect: SpellEffect, now: number): void
  death?(effect: import('./death.js').DeathEffect, now: number): void
  render(now?: number): void
  /** Cell centre at height (0 floor, 1 wall top), in CSS pixels; null when unavailable. */
  project?(x: number, y: number, height?: number): { x: number; y: number } | null
  /** The entity's current presentation position, when movement is interpolated. */
  projectBillboard?(billboard: Billboard, height?: number): { x: number; y: number } | null
  pick(px: number, py: number): CellKey | null
  resize(width: number, height: number, dpr: number): void
  destroy(): void
}

// ---------------------------------------------------------------------------
// Spatial queries

export function cellAhead(scene: Scene, facing: Dir8, from?: { x: number; y: number }): SceneCell | undefined {
  const p = from ?? scene.player
  return getCell(scene, p.x + DIR8_DX[facing], p.y + DIR8_DY[facing])
}

export function cellUnder(scene: Scene): SceneCell | undefined {
  return getCell(scene, scene.player.x, scene.player.y)
}

export function billboardsAt(scene: Scene, x: number, y: number): Billboard[] {
  return scene.billboards.filter((b) => b.x === x && b.y === y)
}

/** Every monster on a visible cell. Order is the builder's (threat, then distance). */
export function monstersInView(scene: Scene): Billboard[] {
  return scene.billboards.filter((b) => b.kind === 'monster' && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible')
}

/**
 * Whether a monster is a threat: one autofight would attack. `l-autofight.cc`
 * `_is_candidate_for_autofight_attack` takes a hostile and rejects
 * `MB_FIREWOOD`, so a plant, bush or fungus is a hostile the server never
 * swings at. The server does not send that flag; `scenery` stands in for
 * it, by name. This classification informs contextual actions.
 */
export function isThreat(b: Billboard): boolean {
  return b.kind === 'monster' && b.attitude === 'hostile' && !b.scenery
}

/** Passable for walking purposes: known ground that is not an occluder. */
export function isWalkable(cell: SceneCell | undefined): boolean {
  if (!cell) return false
  if (cell.kind === 'unknown') return false
  if (cell.occluder) return false
  if (cell.flags.lava) return false
  return true
}

/** Bearing from the player to a cell, as a compass direction. */
export function bearingTo(scene: Scene, x: number, y: number): Dir8 | null {
  return dirFromDelta(x - scene.player.x, y - scene.player.y)
}

