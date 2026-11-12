import { cellKey, type Scene, type SceneCell } from '@orbrun/scene'
import { planeRect, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d } from './tiles.js'
import { MEMORY_DARKNESS } from './visibility.js'

/** One height for terrain, picking, lights and shadows, independent of LOS. */
export const WALL_HEIGHT = 0.58

const known = (cell?: SceneCell): cell is SceneCell => !!cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown'

/** Expose one-cell horizontal passages without changing room walls or reacting to LOS fades. */
export function wallHeight(scene: Scene, cell: SceneCell) {
  const behind = scene.cells.get(cellKey(cell.x, cell.y - 1))
  const back = scene.cells.get(cellKey(cell.x, cell.y - 2))
  return known(behind) && !behind.occluder && known(back) && back.occluder ? 0.08 : WALL_HEIGHT
}

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

/** Directional shade separates the vertical extrusion from the horizontal stonework. */
export function shadeWallFace(ctx: Context2d, face: SurfaceRect) {
  if (face.height <= 0) return
  const shade = ctx.createLinearGradient(0, face.y, 0, face.y + face.height)
  shade.addColorStop(0, 'rgba(0,0,0,0.38)')
  shade.addColorStop(0.35, 'rgba(0,0,0,0.48)')
  shade.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.fillStyle = shade
  ctx.fillRect(face.x, face.y, face.width, face.height)
}
