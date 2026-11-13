import { matrix, fixtureYield, releaseCanvas, equalPixels } from './fixture'
import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { planeRect } from '../../../packages/render-2.5d/src/projection'

/** Catch stretched roofs, repeated face artwork and topology/LOS-dependent sizes. */
export async function wallCoherenceChecks() {
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
  const ink = atlas.getContext('2d')!
  ink.fillStyle = '#20c020'; ink.fillRect(0, 0, 32, 32)
  // The roof's bottom stripe must continue into its extrusion, without
  // restarting the green body of the texture on the vertical face.
  ink.fillStyle = '#f02020'; ink.fillRect(0, 28, 32, 4)
  const source: TileSource = {
    tile: () => ({ atlas: 'stripe', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
    atlas: () => atlas, atlasNames: () => ['stripe'],
  }
  let checks = 0
  const failures: unknown[] = []
  for (const dpr of matrix([1, 1.25, 2], [1.25, 2])) for (const filterScaling of [false, true]) for (const degrees of matrix([35, 50, 65], [50])) for (const zoom of matrix([0.8, 1, 1.4], [1])) {
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
    assert('roof edge extrudes into a shaded face without restarting the artwork', above[0] > above[1] * 3 && below[0] > below[1] * 3 && below[0] < above[0] - 40, { above, below })
    const body = sample(450, roof.y + roof.height * 0.5)
    assert('roof retains the unstretched original stonework', body[1] > body[0] * 3, body)
    const foot = sample(450, ground.y + ground.height - 2 / dpr)
    assert('original bottom stripe remains at the wall foot', foot[0] > foot[1] * 3, foot)
    const crop = () => ctx.getImageData(Math.round(roof.x * dpr), Math.round(roof.y * dpr), Math.round(roof.width * dpr), Math.round((ground.y + ground.height - roof.y) * dpr)).data
    const before = crop()
    scene.cells.get(cellKey(0, -1))!.visibility = 'remembered'
    scene.revision++; r.setScene(scene); r.render(0)
    assert('LOS behind a wall cannot resize or alter its artwork', equalPixels(before, crop()), {})
    // The gap in the back wall opens a junction above the foreground run.
    // Its middle tile must share the low roof of its neighbours, as opposed
    // to protruding above them when its own cross-section is wider.
    for (let x = -4; x <= 4; x++) {
      Object.assign(scene.cells.get(cellKey(x, -1))!, { kind: 'floor', occluder: false, visibility: 'visible' })
      Object.assign(scene.cells.get(cellKey(x, -2))!, { kind: x === 0 ? 'floor' : 'wall', occluder: x !== 0 })
    }
    scene.revision++; r.setScene(scene); r.render(0)
    const lip = planeRect(p, 0, 0, 0.08, dpr)
    const junctionRoofs = [-1, 0, 1].map(x => {
      const q = r.project(x, 0)
      const body = sample(q.x, lip.y + lip.height * 0.8)
      const passage = r.project(x, -0.55, 0.2)
      return { x, body, passage: r.pick(passage.x, passage.y) }
    })
    assert('junction foreground roofs align without a raised tile or blocked passage',
      junctionRoofs.every(({ x, body, passage }) => body[1] > body[0] * 3 && passage === cellKey(x, -1)), junctionRoofs)
    // Corners at both ends of the widened junction remain part of this row.
    // They used to stop the cutaway, producing a tall roof beside a low one.
    for (const x of [-1, 1]) Object.assign(scene.cells.get(cellKey(x, -1))!, { kind: 'wall', occluder: true })
    scene.revision++; r.setScene(scene); r.render(0)
    const cornerRoofs = [-1, 0, 1].map(x => {
      const q = r.project(x, 0)
      const body = sample(q.x, lip.y + lip.height * 0.8)
      const above = r.project(x, -0.5, 0.3)
      return { x, body, above: r.pick(above.x, above.y), roof: r.pick(q.x, lip.y + lip.height * 0.8) }
    })
    assert('connected roofs and picking stay aligned through corners', cornerRoofs.every(({ x, body, above, roof }) =>
      body[1] > body[0] * 3 && above !== cellKey(x, 0) && roof === cellKey(x, 0)), cornerRoofs)
    // Side walls meet the lowered foreground row without a dark crossbar.
    // Sample inside the former vertical face, independently of cap geometry.
    const side = planeRect(p, -1, -1, 0.58, dpr)
    const joinY = side.y + side.height + (lip.y - side.y - side.height) * 0.25
    const joins = [-1, 1].map(x => {
      const q = r.project(x, -1)
      return { pixel: sample(q.x, joinY), picked: r.pick(q.x, joinY), x }
    })
    assert('side wall stonework continues into lowered corners without internal face bands',
      joins.every(({ pixel, picked, x }) => pixel[0] + pixel[1] > 210 && picked === cellKey(x, -1)), joins)
    r.destroy(); releaseCanvas(canvas)
    await fixtureYield('wall-coherence-checks')
  }
  return { checks, failures }
}
