import { paintImpact, paintImpactResidue, type ImpactKind } from './impact-art.js'
import type { Context2d } from './tiles.js'

/** Whole frames are cached in a bounded atlas of 64px stamps. The game draws
 * nearest-neighbour texels at the same resolution as its 32px dungeon tiles. */
export class ImpactArt {
  private cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>()

  draw(ctx: Context2d, kind: ImpactKind, age: number, seed: number, strength: number,
    x: number, y: number, scale: number, dpr: number, squash = 1, residue = false, direction?: number) {
    if (age < 0 || age >= 1 || scale <= 0) return
    const frame = Math.min(15, Math.floor(age * 16)), variant = ((Math.floor(seed) % 8) + 8) % 8
    const power = Math.max(0, Math.min(2, Math.round(strength * 2)))
    const facing = direction === undefined ? undefined : Math.round(direction / (Math.PI / 4))
    const key = `${kind}:${frame}:${variant}:${power}:${residue}:${facing}`
    let image = this.cache.get(key)
    if (!image) {
      image = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64)
        : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 64, height: 64 }) : undefined
      const ink = image?.getContext('2d') as Context2d | null | undefined
      if (!ink || !image) return
      ink.translate(32, 32)
      if (residue) paintImpactResidue(ink, kind, frame / 16, variant)
      else paintImpact(ink, kind, frame / 16, variant, 0.25 + power * 0.375, facing === undefined ? undefined : facing * Math.PI / 4)
      if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!)
      this.cache.set(key, image)
    }
    const width = Math.round(scale * 2 * dpr) / dpr, height = Math.round(width * squash * dpr) / dpr
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1
    ctx.drawImage(image, Math.round((x - width / 2) * dpr) / dpr, Math.round((y - height / 2) * dpr) / dpr, width, height)
    ctx.restore()
  }

  clear() { this.cache.clear() }
}
