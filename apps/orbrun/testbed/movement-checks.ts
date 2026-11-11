import { Render25d, fittedScale, project, type MovementEasing } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'

/** Real pixels at intermediate tween times, including badges and hit regions. */
export function movementChecks(source: TileSource) {
  const failures: unknown[] = []
  let checks = 0
  for (const [width, height] of [[512, 384], [390, 600]]) for (const dpr of [1, 1.25, 2]) for (const degrees of [35, 50, 65]) for (const easing of ['ease-out', 'smooth', 'linear'] as MovementEasing[]) {
    const canvas = document.createElement('canvas')
    const r = new Render25d({ tilt: degrees, movementDuration: 0.1, movementEasing: easing, center: { x: 0, y: 0 } })
    r.mount(canvas); r.resize(width, height, dpr); r.setTiles(source)
    const scene = emptyScene()
    scene.playerOnLevel = true
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) {
      const c: SceneCell = { x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
        flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false } }
      scene.cells.set(cellKey(x, y), c)
    }
    scene.billboards = [{ id: 'item', kind: 'item', tile: 2, x: 0, y: 0, height: 1, life: { motion: 'still' }, statusIcons: [{ tile: 4, ox: 12, oy: 10 }] }]
    r.setScene(scene, 0)
    const next = { ...scene, revision: 1, billboards: [{ ...scene.billboards[0], x: 1 }] }
    const cell = next.cells.get(cellKey(1, 0))!
    cell.icons = [3]; cell.cursorTile = 3
    r.setScene(next, 1)
    const tilt = degrees * Math.PI / 180, scale = fittedScale(width, height, tilt)
    const p = { x: 0, y: 0, width, height, tilt, scale }
    for (const elapsed of [0, 0.05, 0.1]) {
      r.render(1 + elapsed)
      const progress = elapsed / 0.1
      const x = easing === 'ease-out' ? 1 - (1 - progress) ** 3 : easing === 'smooth' ? progress * progress * (3 - 2 * progress) : progress
      const q = project(p, x, 0.3)
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      const boxes = { blue: [Infinity, Infinity, -1, -1], green: [Infinity, Infinity, -1, -1], red: [Infinity, Infinity, -1, -1] }
      for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
        const i = (py * canvas.width + px) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
        const colour = b > r * 1.6 && b > g * 1.3 ? 'blue' : g > 100 && g > r * 3 && g > b * 3 ? 'green' : r > 100 && r > g * 3 && r > b * 3 ? 'red' : null
        if (!colour) continue
        const box = boxes[colour]
        box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py)
      }
      const centerX = (boxes.blue[0] + boxes.blue[2] + 1) / 2
      const cursorLeft = (q.x - scale / 2) * dpr, cursorTop = (q.y - scale) * dpr
      const badgeLeft = cursorLeft + scale * dpr * 12 / 32, badgeTop = cursorTop + scale * dpr * 10 / 32
      const picked = r.pick(q.x, q.y - scale * 0.5)
      checks++
      if (Math.abs(centerX - q.x * dpr) > 1.5 || Math.abs(boxes.green[0] - cursorLeft) > 2 || Math.abs(boxes.green[1] - cursorTop) > 2 ||
        Math.abs(boxes.red[0] - badgeLeft) > 2 || Math.abs(boxes.red[1] - badgeTop) > 2 || picked !== cellKey(1, 0) || r.animating !== (elapsed < 0.1)) {
        failures.push({ kind: 'moving pixels / item cursor / badge / picking / sleep', width, height, dpr, degrees, easing, elapsed, boxes, expected: { x: q.x * dpr, cursorLeft, cursorTop }, picked, animating: r.animating })
      }
    }
    r.destroy()
  }
  return { checks, failures }
}
