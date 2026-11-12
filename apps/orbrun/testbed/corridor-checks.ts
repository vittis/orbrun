import { matrix, fixtureYield, releaseCanvas, pixelSampler } from './fixture'
import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'

/** Real pixels and hit regions in the tightest passage, including the lowest elevation. */
export async function corridorChecks(source: TileSource) {
  let checks = 0
  const failures: unknown[] = []
  for (const [width, height] of matrix([[512, 384], [390, 600], [1728, 1117]], [[390, 600]])) {
    for (const dpr of matrix([1, 1.25, 2], [1, 2])) for (const filterScaling of [false, true]) {
      for (const tilt of matrix([30, 35, 50, 65, 75], [30, 75])) for (const zoom of matrix([0.8, 1, 1.4], [1])) {
        const canvas = document.createElement('canvas')
        const r = new Render25d({ tilt, zoom, animate: false, filterScaling })
        r.mount(canvas); r.resize(width, height, dpr); r.setTiles(source)
        const scene = emptyScene()
        for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) {
          scene.cells.set(cellKey(x, y), {
            x, y, kind: y === 0 ? 'floor' : 'wall', occluder: y !== 0, visibility: 'visible',
            floorTile: 1, wallTile: 5, flags: { water: false, lava: false },
          } as SceneCell)
        }
        scene.billboards = [
          { x: -1, y: 0, kind: 'player', tile: 2, height: 0.7 },
          { x: 0, y: 0, kind: 'monster', tile: 2, height: 0.4 },
          { x: 1, y: 0, kind: 'item', tile: 2, height: 0.28 },
        ]
        r.setScene(scene); r.render(0)
        const ctx = canvas.getContext('2d')!
        const size = r.project(1, 0).x - r.project(0, 0).x
        const sample = pixelSampler(ctx, dpr, { x: width / 2 - size * 3, y: height / 2 - size * 2, width: size * 6, height: size * 4 })
        const details = { width, height, dpr, filterScaling, tilt, zoom }
        // The foreground lip must leave at least 85% of the floor depth exposed,
        // allowing one backing pixel for snapping at the smallest phone scales.
        const north = r.project(-2, -0.5), south = r.project(-2, 0.5)
        let open = 0
        for (let y = Math.round(north.y * dpr); y < Math.round(south.y * dpr); y++) {
          const pixel = sample(north.x, (y + 0.5) / dpr)
          // Contact shadows remain usable floor; exclude the coloured wall art.
          if (pixel[0] > 90 && Math.abs(pixel[0] - pixel[2]) < 3 && r.pick(north.x, (y + 0.5) / dpr) === cellKey(-2, 0)) open++
        }
        checks++
        if (open + 1 < Math.max((south.y - north.y) * 0.85, size * Math.sin(tilt * Math.PI / 180) * 1.1) * dpr) {
          failures.push({ kind: 'corridor floor clearance', ...details, open })
        }
        // All three upright kinds keep their heads and feet, and own their hit regions.
        for (const b of scene.billboards) for (const fraction of [0.8, 0.12]) {
          const q = r.project(b.x, 0.3), y = q.y - size * fraction
          const pixel = sample(q.x, y)
          checks++
          if (pixel[2] < 200 || pixel[2] < pixel[0] * 2 || r.pick(q.x, y) !== cellKey(b.x, 0)) {
            failures.push({ kind: 'corridor sprite clearance / picking', ...details, actor: b.kind, fraction, pixel })
          }
        }
        // Keep the textured vertical face of the back wall and the low front roof.
        for (const [y, z] of [[-0.5, 0.29], [0.75, 0.08]]) {
          const q = r.project(-2, y, z), pixel = sample(q.x, q.y)
          checks++
          if (pixel[0] < pixel[2] * 2 || r.pick(q.x, q.y) !== cellKey(-2, y < 0 ? -1 : 1)) {
            failures.push({ kind: 'corridor raised wall depth / picking', ...details, y, z, pixel })
          }
        }
        r.destroy(); releaseCanvas(canvas)
    await fixtureYield('corridor-checks')
      }
    }
  }
  return { checks, failures }
}
