import { beforeAll, describe, expect, it } from 'vitest'
import { initialState, reduce, MapFeature } from '@orbrun/webtiles'
import { cellKey, type SceneCell } from '@orbrun/scene'
import type { Gamedata } from '@orbrun/gamedata'
import { buildScene } from '../src/index.js'
import { fixtureGamedata } from './recording.js'

let gd: Gamedata
beforeAll(async () => { gd = await fixtureGamedata() })
const shape = (cell: SceneCell) => {
  const { kind, occluder, floorTile, wallTile, wallStyle, featureTile, stance, freestanding } = cell
  return { kind, occluder, floorTile, wallTile, wallStyle, featureTile, stance, freestanding }
}

describe('spell screen glyphs never change terrain geometry', () => {
  it.each([
    ['FLOOR_GREY_DIRT', MapFeature.FLOOR, false],
    ['FLOOR_GREY_DIRT', MapFeature.ITEM, false],
    ['FLOOR_GREY_DIRT', MapFeature.MONS_HOSTILE, false],
    ['FLOOR_GREY_DIRT', MapFeature.EXCL, false],
    ['FLOOR_GREY_DIRT', MapFeature.WALL, true],
    ['DNGN_TRANSPARENT_WALL', MapFeature.WALL, true],
    ['DNGN_TRANSPARENT_WALL', MapFeature.MAP_WALL, true],
    ['STONE_SMOOTH_WALL_BEOGH', MapFeature.WALL, true],
    ['DNGN_DIMENSION_EDGE', MapFeature.WALL, true],
  ] as const)('keeps %s category %s stable through glyph/overlay ordering', (name, mf, wall) => {
    const state = initialState(), bg = gd.dngn.id(name)!, key = cellKey(1, 0)
    expect(bg).toBeDefined()
    reduce(state, { msg: 'map', clear: true, player_on_level: true, cells: [{ x: 1, y: 0, mf, g: wall ? '#' : '.', t: { bg } }] })
    const baseline = shape(buildScene(state, gd).cells.get(key)!)
    expect(baseline.occluder).toBe(wall)
    let previous = buildScene(state, gd)
    const tile = gd.main.id('BOLT_DEFAULT_RED')!
    // Crawl explosion_draw_cell supplies DCHAR_EXPLOSION ('#') separately
    // from tile art. Exercise either order and a glyph-only intermediate draw.
    for (const update of [
      { g: '#' }, { t: { ov: [tile] } }, { t: { ov: [] } }, { g: '*' },
      { t: { cloud: gd.main.id('CLOUD_FIRE')! } }, { g: '@' },
      { t: { cloud: 0 } }, { g: wall ? '#' : '.' },
    ]) {
      reduce(state, { msg: 'map', cells: [{ x: 1, y: 0, ...update }] })
      const full = buildScene(state, gd)
      previous = buildScene(state, gd, { previous, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
      expect(shape(full.cells.get(key)!)).toEqual(baseline)
      expect(shape(previous.cells.get(key)!)).toEqual(baseline)
      state.dirtyCells.clear(); state.mapCleared = false
    }
    // Actual terrain changes remain authoritative, even under an effect glyph.
    reduce(state, { msg: 'map', cells: [{ x: 1, y: 0, mf: MapFeature.FLOOR, g: '#', t: { bg: gd.dngn.id('FLOOR_GREY_DIRT')! } }] })
    expect(buildScene(state, gd, { previous }).cells.get(key)?.occluder).toBe(false)
  })
})
