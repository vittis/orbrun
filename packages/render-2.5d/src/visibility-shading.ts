import { MEMORY_DARKNESS, sampleVisibility, type VisibilityShade } from './visibility.js'
import type { Context2d } from './tiles.js'

/** Small alpha fields, independent of atlas filtering and bounded during fades. */
export class VisibilityShading {
  private masks = new Map<string, HTMLCanvasElement | OffscreenCanvas>()

  mask(shade: VisibilityShade, exposure = false) {
    const key = `${exposure}:${typeof shade === 'number' ? shade : shade.join(',')}`
    const cached = this.masks.get(key)
    if (cached) return cached
    const size = 64
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size })
    const ctx = canvas.getContext('2d') as Context2d | null
    if (!ctx) return null
    const pixels = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dark = sampleVisibility(shade, (x + 0.5) / size, (y + 0.5) / size)
      pixels.data[(y * size + x) * 4 + 3] = Math.round(255 * (exposure ? Math.max(0, 1 - dark / MEMORY_DARKNESS) : dark))
    }
    ctx.putImageData(pixels, 0, 0)
    if (this.masks.size >= 256) this.masks.delete(this.masks.keys().next().value!)
    this.masks.set(key, canvas)
    return canvas
  }

  clear() { this.masks.clear() }
}
