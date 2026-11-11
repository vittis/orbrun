import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { planeRect } from '../../../packages/render-2.5d/src/projection'

/** Catch texture restarts, outlined caps and topology/LOS-dependent wall sizes. */
export function wallCoherenceChecks() {
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
  const ink = atlas.getContext('2d')!
  ink.fillStyle = '#20c020'; ink.fillRect(0, 0, 32, 32)
  // A single stripe near the foot must never repeat beneath a separate cap.
  ink.fillStyle = '#f02020'; ink.fillRect(0, 28, 32, 4)
  const source: TileSource = {
    tile: () => ({ atlas: 'stripe', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
    atlas: () => atlas, atlasNames: () => ['stripe'],
  }
  let checks = 0
  const failures: unknown[] = []
  for (const dpr of [1, 1.25, 2]) for (const filterScaling of [false, true]) for (const degrees of [35, 50, 65]) for (const zoom of [0.8, 1, 1.4]) {
    const canvas = document.createElement('canvas'), r = new Render25d({ animate: false, filterScaling, tilt: degrees, zoom })
    r.mount(canvas); r.resize(900, 700, dpr); r.setTiles(source)
    const scene = emptyScene()
    for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
      // Include a corner, a wall end and a wall with open ground behind it.
      const wall = y === 0 || y === -1 && x === -1
      scene.cells.set(cellKey(x, y), {
        x, y, kind: wall ? 'wall' : 'floor', occluder: wall, visibility: 'visible', floorTile: 1, wallTile: 1,
        flags: { water: false, lava: false },
      } as SceneCell)
    }
    const tilt = degrees * Math.PI / 180
    const p = { x: 0, y: 0, width: 900, height: 700, tilt, scale: fittedScale(900, 700, tilt, zoom) }
    const ctx = canvas.getContext('2d')!
    const sample = (x: number, y: number) => [...ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data]
    const assert = (name: string, passed: boolean, detail: unknown) => {
      checks++; if (!passed) failures.push({ name, dpr, filterScaling, degrees, zoom, detail })
    }
    r.setScene(scene); r.render(0)
    const tops = [-1, 0, 1].map(x => {
      const roof = planeRect(p, x, 0, 0.58, dpr)
      return r.pick(roof.x + roof.width / 2, roof.y + 2 / dpr) === cellKey(x, 0)
    })
    assert('corners and exposed walls share the same raised height and picking', tops.every(Boolean), tops)
    const roof = planeRect(p, 0, 0, 0.58, dpr), ground = planeRect(p, 0, 0, 0, dpr)
    const seam = roof.y + roof.height
    const above = sample(450, seam - 1 / dpr), below = sample(450, seam + 1 / dpr)
    assert('continuous art has no red stripe restart or cap recess', above[1] > above[0] * 3 && below[1] > below[0] * 3 && Math.abs(above[1] - below[1]) < 25, { above, below })
    const foot = sample(450, ground.y + ground.height - 2 / dpr)
    assert('original bottom stripe remains at the wall foot', foot[0] > foot[1] * 3, foot)
    const crop = () => [...ctx.getImageData(Math.round(roof.x * dpr), Math.round(roof.y * dpr), Math.round(roof.width * dpr), Math.round((ground.y + ground.height - roof.y) * dpr)).data].join(',')
    const before = crop()
    scene.cells.get(cellKey(0, -1))!.visibility = 'remembered'
    scene.revision++; r.setScene(scene); r.render(0)
    assert('LOS behind a wall cannot resize or alter its artwork', before === crop(), {})
    r.destroy()
  }
  return { checks, failures }
}
