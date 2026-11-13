import type { Billboard, Scene } from '@orbrun/scene'

/** Server spell artwork owns its shape, colour and animation. It must not
 * become a second atmospheric light/particle source or an occluding actor. */
export const nativeSpellArt = (b: Billboard) => b.kind === 'projectile' || b.kind === 'cloud' || !!b.life?.spawn

/** Keep actor state for confirmed damage/water feedback, but exclude spell
 * emission from the environmental light history (including its afterglows). */
export function atmosphereScene(scene: Scene): Scene {
  return { ...scene,
    cells: new Map([...scene.cells].map(([key, cell]) => [key, cell.life?.spawn ? { ...cell, life: { ...cell.life, lights: [] } } : cell])),
    billboards: scene.billboards.map(b => nativeSpellArt(b) ? { ...b, life: { ...b.life, lights: [] } } : b),
  }
}
