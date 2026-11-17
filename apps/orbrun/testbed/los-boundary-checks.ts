import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { Render25d } from '@orbrun/render-2.5d'
import { captures, fixtureComplete, fixtureStart, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('los-boundary-checks')
const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
const ink = atlas.getContext('2d')!
ink.fillStyle = '#fff'; ink.fillRect(0, 0, 32, 32)
const source: TileSource = {
  tile: () => ({ atlas: 'white', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
  atlas: () => atlas, atlasNames: () => ['white'],
}
const failures: unknown[] = []
let checks = 0
for (const [width, height] of [[1280, 720], [390, 600]]) for (const dpr of [1, 2]) {
  for (const filterScaling of [false, true]) for (const diagonal of [false, true]) for (const wall of [false, true]) {
    const canvas = document.createElement('canvas')
    const renderer = new Render25d({ animate: false, filterScaling })
    renderer.mount(canvas); renderer.resize(width, height, dpr); renderer.setTiles(source)
    const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) scene.cells.set(cellKey(x, y), {
      x, y, kind: wall ? 'wall' : 'floor', occluder: wall, floorTile: 1, wallTile: 1,
      visibility: x + (diagonal ? y + 1 : 0) > 0 ? 'remembered' : 'visible',
      flags: { water: false, lava: false },
    } as SceneCell)
    renderer.setScene(scene, 0); renderer.render(0)
    const z = wall ? 0.58 : 0
    const start = renderer.project(-0.25, -1, z), end = renderer.project(1.25, -1, z)
    const x = Math.ceil(start.x * dpr), y = Math.floor(start.y * dpr)
    const data = canvas.getContext('2d')!.getImageData(x, y, Math.floor(end.x * dpr) - x, 1).data
    const row = Array.from({ length: data.length / 4 }, (_, i) => data[i * 4])
    const largestStep = Math.max(...row.slice(1).map((v, i) => Math.abs(v - row[i])))
    checks++
    if (row[0] < 245 || row.at(-1)! > 120 || largestStep > 20 || new Set(row).size < 10
      || row.some((v, i) => i > 0 && v > row[i - 1] + 2) || renderer.animating) {
      failures.push({ width, height, dpr, filterScaling, diagonal, wall, largestStep, row, animating: renderer.animating })
    }
    if (captures) {
      const label = document.createElement('p')
      label.textContent = `${width} × ${height}, DPR ${dpr}, ${wall ? 'wall caps' : 'floor'}, ${diagonal ? 'diagonal' : 'straight'}, filtering ${filterScaling}`
      document.querySelector('#captures')!.append(label, canvas)
    }
    renderer.destroy()
    if (!captures) releaseCanvas(canvas)
    await fixtureYield('los-boundary')
  }
}
fixtureComplete({ checks, failures })
