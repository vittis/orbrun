import { MEMORY_DARKNESS, sampleVisibility, settledVisibility, type VisibilityShade } from './visibility.js'
import type { Context2d } from './tiles.js'

/** Small alpha fields, independent of atlas filtering and bounded during fades. */
export class VisibilityShading {
  private masks = new Map<string, HTMLCanvasElement | OffscreenCanvas>()
  private fading = new Map<boolean, { canvas: HTMLCanvasElement | OffscreenCanvas; pixels: ImageData }>()

  mask(shade: VisibilityShade, exposure = false) {
    const settled = settledVisibility(shade)
    const key = settled ? `${exposure}:${typeof shade === 'number' ? shade : shade.join(',')}` : ''
    const cached = settled && this.masks.get(key)
    if (cached) return cached
    // Cubic falloff is low frequency: a 17×17 field has an exact centre sample
    // and is filtered independently of the pixel-art atlas. Fades reuse two
    // buffers rather than allocating textures for every floating-point shade.
    const size = 17
    const scratch = !settled ? this.fading.get(exposure) : undefined
    const canvas = scratch?.canvas ?? (typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size }))
    const ctx = canvas.getContext('2d') as Context2d | null
    if (!ctx) return null
    const pixels = scratch?.pixels ?? ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dark = sampleVisibility(shade, (x + 0.5) / size, (y + 0.5) / size)
      pixels.data[(y * size + x) * 4 + 3] = Math.round(255 * (exposure ? Math.max(0, 1 - dark / MEMORY_DARKNESS) : dark))
    }
    ctx.putImageData(pixels, 0, 0)
    if (settled) {
      if (this.masks.size >= 256) this.masks.delete(this.masks.keys().next().value!)
      this.masks.set(key, canvas)
    } else if (!scratch) this.fading.set(exposure, { canvas, pixels })
    return canvas
  }

  clear() { this.masks.clear(); this.fading.clear() }
}
