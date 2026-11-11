import { DIR8_DX, DIR8_DY, getCell, monstersInView, type Dir8, type Scene } from '@orbrun/scene'

/** Deliberately stricter than pathfinding: only a view hint on ordinary visible floor. */
export function canPreviewStep(scene: Scene, dir: Dir8): boolean {
  if (!scene.playerOnLevel || monstersInView(scene).length) return false
  const { x, y } = scene.player
  const clear = (x: number, y: number) => {
    const c = getCell(scene, x, y)
    return !!c && c.visibility === 'visible' && c.kind === 'floor' && !c.occluder &&
      !c.feature && c.featureTile == null && c.cloud == null &&
      !c.flags.water && !c.flags.lava && !c.flags.excluded && !c.flags.excludeRoot &&
      !scene.billboards.some((b) => b.x === x && b.y === y && b.kind !== 'player')
  }
  const dx = DIR8_DX[dir], dy = DIR8_DY[dir]
  // No diagonal peeking past a corner; the current cell must also be ordinary floor.
  return clear(x, y) && clear(x + dx, y + dy) &&
    (!dx || !dy || (clear(x + dx, y) && clear(x, y + dy)))
}
