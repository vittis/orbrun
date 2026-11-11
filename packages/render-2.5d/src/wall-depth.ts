import { cellKey, type Scene, type SceneCell } from '@orbrun/scene'
import { planeRect, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d } from './tiles.js'
import { MEMORY_DARKNESS } from './visibility.js'

/** Foreground cutaways share their height with lighting and ground shadows. */
export function wallHeight(scene: Scene, cell: SceneCell) {
  const behind = scene.cells.get(cellKey(cell.x, cell.y - 1))
  return behind?.visibility === 'visible' && !behind.occluder ? 0.18 : 0.58
}

const known = (cell?: SceneCell): cell is SceneCell => !!cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown'

/** Paint only receiving ground. Neighbouring wall tiles never get dark seams. */
export function drawWallShadows(ctx: Context2d, p: Projection, scene: Scene, cells: SceneCell[], dpr: number, darkness?: (cell: SceneCell) => number) {
  for (const cell of cells) {
    if (cell.occluder || !known(cell)) continue
    const r = planeRect(p, cell.x, cell.y, 0, dpr)
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const wall = scene.cells.get(cellKey(cell.x + dx, cell.y + dy))
      if (!known(wall) || !wall.occluder) continue
      const height = wallHeight(scene, wall)
      // A soft cast toward the south/east suggests light from above-left;
      // the other edges retain a short, dense contact shadow at the base.
      const contact = (dy ? r.height : r.width) * 0.12
      const depth = dy < 0 ? contact + height * Math.cos(p.tilt) * p.scale * 0.65
        : dx < 0 ? contact + height * p.scale * 0.24 : contact
      const x = r.x + (dx > 0 ? r.width : dx ? 0 : r.width / 2)
      const y = r.y + (dy > 0 ? r.height : dy ? 0 : r.height / 2)
      const memory = darkness ? Math.min(1, darkness(cell) / MEMORY_DARKNESS) : cell.visibility === 'remembered' ? 1 : 0
      const strength = (wall.wallStyle === 'transparent' ? 0.45 : 1) * (1 - memory * 0.35)
      const shadow = ctx.createLinearGradient(x, y, x - dx * depth, y - dy * depth)
      shadow.addColorStop(0, `rgba(0,0,0,${0.5 * strength})`)
      shadow.addColorStop(Math.min(0.65, contact / depth), `rgba(0,0,0,${0.18 * strength})`)
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.fillRect(dx > 0 ? x - depth : r.x, dy > 0 ? y - depth : r.y, dx ? depth : r.width, dy ? depth : r.height)
    }
  }
}

/** Texture stays readable, with a darker foot and a narrow recess under the cap. */
export function shadeWallFace(ctx: Context2d, face: SurfaceRect, dpr: number) {
  if (face.height <= 0) return
  const shade = ctx.createLinearGradient(0, face.y, 0, face.y + face.height)
  shade.addColorStop(0, 'rgba(0,0,0,0.2)')
  shade.addColorStop(0.35, 'rgba(0,0,0,0.24)')
  shade.addColorStop(1, 'rgba(0,0,0,0.56)')
  ctx.fillStyle = shade
  ctx.fillRect(face.x, face.y, face.width, face.height)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(face.x, face.y, face.width, Math.min(face.height, 1 / dpr))
}

/** Bevel the exposed silhouette only, preserving continuous multi-tile roofs. */
export function drawRoofEdges(ctx: Context2d, p: Projection, scene: Scene, cell: SceneCell, roof: SurfaceRect, dpr: number) {
  const height = wallHeight(scene, cell)
  const edge = Math.max(1, Math.round(p.scale * 0.025 * dpr)) / dpr
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
    const neighbour = scene.cells.get(cellKey(cell.x + dx, cell.y + dy))
    if (!known(neighbour) || neighbour.occluder && wallHeight(scene, neighbour) >= height) continue
    ctx.fillStyle = dx > 0 ? 'rgba(0,0,0,0.12)' : `rgba(255,255,255,${dy > 0 ? 0.16 : 0.09})`
    ctx.fillRect(roof.x + (dx > 0 ? roof.width - edge : 0), roof.y + (dy > 0 ? roof.height - edge : 0), dx ? edge : roof.width, dy ? edge : roof.height)
  }
}
