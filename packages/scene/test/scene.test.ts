import { describe, it, expect } from 'vitest'
import { cellKey, emptyScene, cellAhead, isThreat, type Billboard, type SceneCell, type Scene } from '../src/index.js'

function cell(x: number, y: number, kind: SceneCell['kind'], visibility: SceneCell['visibility'] = 'visible'): SceneCell {
  return {
    x,
    y,
    kind,
    visibility,
    occluder: kind === 'wall' || kind === 'door' || kind === 'unknown',
    floorTile: 1,
    wallTile: kind === 'wall' ? 2 : undefined,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false },
  }
}

/** Build a scene from an ASCII map: # wall, . floor, @ player, r remembered floor, W remembered wall, space void. */
function sceneFrom(rows: string[]): Scene {
  const s = emptyScene()
  s.playerOnLevel = true
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]
      if (ch === ' ') continue
      let c: SceneCell
      if (ch === '#') c = cell(x, y, 'wall')
      else if (ch === 'W') c = cell(x, y, 'wall', 'remembered')
      else if (ch === 'r') c = cell(x, y, 'floor', 'remembered')
      else c = cell(x, y, 'floor')
      if (ch === '@') s.player = { x, y }
      s.cells.set(cellKey(x, y), c)
    }
  }
  s.bounds = { left: 0, top: 0, right: rows[0].length - 1, bottom: rows.length - 1 }
  return s
}

describe('directions', () => {
  it('finds the cell ahead', () => {
    const s = sceneFrom(['...', '.@.', '...'])
    expect(cellAhead(s, 0)?.y).toBe(0)
    expect(cellAhead(s, 2)?.x).toBe(2)
  })
})

describe('threat classification', () => {
  const monster = (attitude: Billboard['attitude'], scenery = false): Billboard => ({
    kind: 'monster', x: 1, y: 1, attitude, scenery, height: 1, tile: 1,
  })
  it('counts hostile creatures but excludes plants, allies and neutrals', () => {
    expect(isThreat(monster('hostile'))).toBe(true)
    expect(isThreat(monster('hostile', true))).toBe(false)
    for (const attitude of ['neutral', 'good_neutral', 'friendly'] as const) expect(isThreat(monster(attitude))).toBe(false)
  })
})
