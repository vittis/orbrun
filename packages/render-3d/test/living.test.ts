import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, makeCamera, type SceneCell, type TileSource } from '@orbrun/scene'
import { stubbed, settle, written } from './bed.js'

const tiles: TileSource = {
  tile: () => ({ atlas: 'main', sx: 4, sy: 8, w: 4, h: 4, ox: 0, oy: 0, cell: 32 }),
  atlas: () => ({ width: 16, height: 16 }) as unknown as TexImageSource,
  atlasNames: () => ['main'],
}
function room() {
  const s = emptyScene()
  s.revision = s.layoutRevision = 1
  s.bounds = { left: 0, top: 0, right: 3, bottom: 3 }
  s.playerOnLevel = true
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) s.cells.set(cellKey(x, y), {
    x, y, kind: 'floor', visibility: 'visible', floorTile: 1, occluder: false,
    flags: { water: false, lava: false },
  } as SceneCell)
  s.billboards = [{ x: 1, y: 1, tile: 1, kind: 'monster', height: 1, life: { motion: 'breath' } }]
  return s
}

describe('living sprites in first person', () => {
  it('breathes without rebuilding terrain, and freezes when motion is disabled', () => {
    const { r, g } = stubbed({ motion: true }, tiles), s = room()
    r.setCamera(makeCamera(0, 0)); r.setScene(s, 1); r.render(1); settle({ r, g, draws: 0 })
    const builds = g.stats.levelBuilds, first = written(g, 'main', 'opaque')
    r.render(2)
    expect(written(g, 'main', 'opaque')).not.toEqual(first)
    expect(g.stats.levelBuilds).toBe(builds)
    r.setOptions({ motion: false }); r.render(3)
    const still = written(g, 'main', 'opaque')
    r.render(4)
    expect(written(g, 'main', 'opaque')).toEqual(still)
    r.destroy()
  })
  it('does not animate remembered creatures or immobilised actors', () => {
    const { r, g } = stubbed({ motion: true }, tiles), s = room()
    s.billboards[0].life!.held = true
    r.setCamera(makeCamera(0, 0)); r.setScene(s, 1); r.render(1)
    const first = written(g, 'main', 'opaque')
    r.render(2)
    expect(written(g, 'main', 'opaque')).toEqual(first)
    s.billboards[0].life!.held = false
    s.cells.get(cellKey(1, 1))!.visibility = 'remembered'
    s.revision++; r.setScene(s, 3); r.render(3)
    const memory = written(g, 'main', 'opaque')
    r.render(4)
    expect(written(g, 'main', 'opaque')).toEqual(memory)
    r.destroy()
  })
})
