// @vitest-environment happy-dom
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, type Scene } from '@orbrun/scene'
import { readScene, sceneTileIds, writeScene, type PlaceFile, type PlaceScene } from '../src/room/place-data'
import { placeCenter, PLACES } from '../src/room/places'
import { RoomTiles } from '../src/room/tiles'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '../public/room/places')
const read = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as PlaceFile

/** The places the menus stand in are build assets: each one listed is there, whole, and drawable from its own atlas. */
describe('the places', () => {
  it('each have their level and their tiles, and nothing else: no picture of a place ships', () => {
    for (const p of PLACES) for (const ext of ['json', 'png']) expect(fs.existsSync(path.join(dir, `${p.id}.${ext}`)), `${p.id}.${ext}`).toBe(true)
    expect(fs.readdirSync(dir).filter((f) => !/\.(json|png)$/.test(f))).toEqual([])
  })

  it('each hold every tile their level names', () => {
    for (const p of PLACES) {
      const file = read(p.id)
      expect(file.format).toBe(2)
      expect(file.id).toBe(p.id)
      const tiles = RoomTiles.fromPlace(file, undefined)
      const scene = readScene(file.scene)
      const missing = [...sceneTileIds(scene)].filter((id) => !tiles.tile(id))
      expect(missing, p.id).toEqual([])
      // The saved view centre is an explored floor cell.
      expect(scene.cells.get(cellKey(file.center.x, file.center.y))?.occluder, p.id).toBe(false)
    }
  })

  it('keep nothing of whose game it was, and nothing but the dungeon: no monster, no item, no cloud; scenery stays', () => {
    for (const p of PLACES) {
      const file = read(p.id)
      expect(file.scene.billboards.every((b) => b.scenery && !('ref' in b)), p.id).toBe(true)
      expect(file.scene.cells.some((c) => c.icons || c.trail || c.cloud !== undefined), p.id).toBe(false)
    }
  })


})

describe('a place file', () => {
  it('retains and packs the plain material used below a decorated wall', () => {
    const scene = emptyScene()
    scene.cells.set(cellKey(0, 0), { x: 0, y: 0, kind: 'wall', visibility: 'visible', occluder: true,
      floorTile: 1, wallTile: 2, wallMaterialTile: 3, flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false } })
    const back = readScene(JSON.parse(JSON.stringify(writeScene(scene))))
    expect(back.cells.get(cellKey(0, 0))?.wallMaterialTile).toBe(3)
    expect([...sceneTileIds(back)].sort()).toEqual([1, 2, 3])
  })
  it('reads back the scene it was written from', () => {
    const scene: Scene = emptyScene()
    const flags = { water: true, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false }
    scene.cells.set(cellKey(1, 2), { x: 1, y: 2, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 5, overlays: [9], glyph: '.', label: 'water', flags })
    scene.cells.set(cellKey(0, 0), { x: 0, y: 0, kind: 'unknown', visibility: 'unseen', occluder: false, floorTile: 0, flags: { ...flags, water: false } })
    scene.billboards.push({ x: 1, y: 2, tile: 7, kind: 'monster', height: 1, name: 'rat', ref: { id: 3 } }, { x: 1, y: 2, tile: 8, kind: 'player', height: 1 })
    const back = readScene(JSON.parse(JSON.stringify(writeScene(scene))))
    expect([...back.cells.keys()]).toEqual([cellKey(1, 2)])
    expect(back.cells.get(cellKey(1, 2))).toEqual({ x: 1, y: 2, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 5, overlays: [9], flags })
    expect(back.billboards).toEqual([{ x: 1, y: 2, tile: 7, kind: 'monster', height: 1, name: 'rat' }])
    expect([...sceneTileIds(back)].sort()).toEqual([5, 7, 9])
  })

  it('stands its features as the builder stands them now, not as they were frozen', () => {
    const cell = (x: number, feature: PlaceScene['cells'][number]['feature'], stance: 'upright' | 'decal') => ({ x, y: 0, kind: 'feature' as const, visibility: 'seen' as const, occluder: false, floorTile: 1, featureTile: 2, feature, stance })
    const back = readScene({
      ...writeScene(emptyScene()),
      cells: [cell(0, { type: 'stairs', dir: 'down' }, 'upright'), cell(1, { type: 'stairs', dir: 'up' }, 'upright'), cell(2, { type: 'trap' }, 'decal'), cell(3, { type: 'other', name: 'tree' }, 'upright')],
    })
    expect([0, 1, 2, 3].map((x) => back.cells.get(cellKey(x, 0))?.stance)).toEqual(['lying', 'upright', 'lying', 'upright'])
  })

  it('centres on the saved place cell', () => {
    const c = placeCenter({ center: { x: 4, y: -2 } })
    expect(c).toMatchObject({ x: 4, y: -2 })
  })
})
