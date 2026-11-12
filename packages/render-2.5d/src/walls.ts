import { cellKey, type Scene, type SceneCell } from '@orbrun/scene'

/** A low foreground lip exposes the passage; back walls retain their full depth. */
export function wallHeight(scene: Scene, cell: SceneCell) {
  const behind = scene.cells.get(cellKey(cell.x, cell.y - 1))
  return behind?.visibility === 'visible' && !behind.occluder ? 0.08 : 0.58
}
