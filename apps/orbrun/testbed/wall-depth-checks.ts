import { Render25d, fittedScale } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { planeRect } from '../../../packages/render-2.5d/src/projection'

/** Raster checks for depth cues, including cutaways and hidden neighbours. */
export function wallDepthChecks(source: TileSource) {
  let checks = 0
  const failures: unknown[] = []
  for (const dpr of [1, 1.25, 2]) for (const degrees of [35, 50, 65]) for (const zoom of [0.8, 1, 1.4]) {
    const canvas = document.createElement('canvas')
    const r = new Render25d({ tilt: degrees, zoom, animate: false })
    r.mount(canvas); r.resize(900, 700, dpr); r.setTiles(source)
    const scene = emptyScene()
    for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) {
      const wall = Math.abs(x) <= 2 && (y === 0 || y === -1)
      scene.cells.set(cellKey(x, y), {
        x, y, kind: wall ? 'wall' : 'floor', occluder: wall, visibility: 'visible', floorTile: 1, wallTile: 1,
        flags: { water: false, lava: false },
      } as SceneCell)
    }
    const p = { x: 0, y: 0, width: 900, height: 700, tilt: degrees * Math.PI / 180, scale: fittedScale(900, 700, degrees * Math.PI / 180, zoom) }
    const ctx = canvas.getContext('2d')!
    const pixel = (x: number, y: number) => ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data[0]
    const assert = (name: string, passed: boolean, detail: unknown) => {
      checks++; if (!passed) failures.push({ name, dpr, degrees, zoom, detail })
    }
    r.setScene(scene); r.render(0)
    const ground = planeRect(p, 0, 0, 0, dpr), roof = planeRect(p, 0, 0, 0.58, dpr)
    const bottom = ground.y + ground.height, faceTop = roof.y + roof.height
    const upper = pixel(450, faceTop + (bottom - faceTop) * 0.35)
    const lower = pixel(450, faceTop + (bottom - faceTop) * 0.88)
    assert('wall foot darker than upper face', lower < upper - 15, { upper, lower })
    const floor = planeRect(p, 0, 1, 0, dpr)
    const near = pixel(450, floor.y + floor.height * 0.04), far = pixel(450, floor.y + floor.height * 0.8)
    assert('wall casts a fading base shadow', near < far - 35, { near, far })
    const shadowInk = () => {
      let sum = 0
      for (let i = 1; i < 16; i++) sum += 255 - pixel(450, floor.y + floor.height * i / 16)
      return sum
    }
    const tall = shadowInk()
    const behind = scene.cells.get(cellKey(0, -1))!
    behind.kind = 'floor'; behind.occluder = false
    scene.revision++; r.setScene(scene); r.render(0)
    const short = shadowInk()
    assert('cutaway wall casts a shorter shadow', tall > short + 20, { tall, short })
    const wall = scene.cells.get(cellKey(0, 0))!
    wall.wallStyle = 'transparent'
    scene.revision++; r.setScene(scene); r.render(0)
    const transparent = shadowInk()
    assert('transparent walls cast lighter shadows', transparent < short, { transparent, short })
    // Changing unseen geometry must not change any visible shadow or bevel.
    wall.visibility = 'unseen'
    scene.revision++; r.setScene(scene); r.render(0)
    const before = canvas.toDataURL()
    wall.occluder = false; wall.kind = 'unknown'
    scene.revision++; r.setScene(scene); r.render(0)
    assert('hidden walls never affect visible depth cues', canvas.toDataURL() === before, {})
    assert('static depth cues let still scenes sleep', !r.animating, {})
    r.destroy()
  }
  return { checks, failures }
}
