import { MEMORY_DARKNESS, sampleVisibility, settledVisibility, type VisibilityShade } from './visibility.js'
import type { Context2d } from './tiles.js'
import type { SurfaceRect } from './projection.js'

type Canvas = HTMLCanvasElement | OffscreenCanvas
export interface VisibilityMask extends SurfaceRect { canvas: Canvas }
const SIZE = 9, STRIDE = SIZE + 2, MAX_BATCH = 4096
const coordinates = Array.from({ length: STRIDE }, (_, i) => (i - 0.5) / SIZE)
const createCanvas = (width: number, height: number): Canvas | null => typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(width, height)
  : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width, height }) : null

/** Small alpha fields, independent of atlas filtering and bounded during fades. */
export class VisibilityShading {
  private masks = new Map<string, VisibilityMask>()
  private fading = new Map<boolean, { mask: VisibilityMask; pixels: ImageData }>()
  private keys = new WeakMap<readonly number[], string>()
  private batch = new Map<string, VisibilityMask>()
  private batchKeys: string[] = []
  private atlas: Canvas | null = null
  private pixels: ImageData | null = null
  private capacity = 0

  private key(shade: VisibilityShade, exposure: boolean) {
    if (typeof shade === 'number') return `${exposure}:${shade}`
    let key = this.keys.get(shade)
    if (key === undefined) { key = shade.join(','); this.keys.set(shade, key) }
    return `${exposure}:${key}`
  }

  /** Upload changing masks together, before any terrain consumes the texture. */
  prepare(shades: VisibilityShade[], exposure: boolean) {
    const entries = new Map<string, { shade: VisibilityShade; exposure: boolean }>()
    for (const shade of shades) if (typeof shade !== 'number') {
      for (const channel of exposure ? [false, true] : [false]) {
        const key = this.key(shade, channel)
        if (entries.size < MAX_BATCH) entries.set(key, { shade, exposure: channel })
      }
    }
    const keys = [...entries.keys()]
    if (keys.length === this.batchKeys.length && keys.every((key, i) => key === this.batchKeys[i])) return
    this.batch.clear(); this.batchKeys = []
    if (!keys.length) return
    if (keys.length > this.capacity) {
      this.capacity = Math.max(16, 2 ** Math.ceil(Math.log2(keys.length)))
      const columns = Math.ceil(Math.sqrt(this.capacity))
      this.atlas = createCanvas(columns * STRIDE, Math.ceil(this.capacity / columns) * STRIDE)
      const ctx = this.atlas?.getContext('2d') as Context2d | null
      this.pixels = ctx?.createImageData(this.atlas!.width, this.atlas!.height) ?? null
    }
    const atlas = this.atlas, pixels = this.pixels, ctx = atlas?.getContext('2d') as Context2d | null
    if (!atlas || !pixels || !ctx) return
    const columns = atlas.width / STRIDE
    let slot = 0
    for (const [key, { shade, exposure }] of entries) {
      const left = slot % columns * STRIDE, top = Math.floor(slot / columns) * STRIDE
      // Continue the field into the gutter. Filtering then reaches the same
      // value on both sides of a tile edge without sampling another pattern.
      for (let y = 0; y < STRIDE; y++) for (let x = 0; x < STRIDE; x++) {
        const dark = sampleVisibility(shade, coordinates[x], coordinates[y])
        pixels.data[((top + y) * atlas.width + left + x) * 4 + 3] = Math.round(255 * (exposure ? Math.max(0, 1 - dark / MEMORY_DARKNESS) : dark))
      }
      this.batch.set(key, { canvas: atlas, x: left + 1, y: top + 1, width: SIZE, height: SIZE })
      slot++
    }
    ctx.putImageData(pixels, 0, 0)
    this.batchKeys = keys
  }

  mask(shade: VisibilityShade, exposure = false) {
    const batch = this.batch.get(this.key(shade, exposure))
    if (batch) return batch
    const settled = settledVisibility(shade)
    const key = settled ? this.key(shade, exposure) : ''
    const cached = settled && this.masks.get(key)
    if (cached) return cached
    // Cubic falloff is low frequency: a 9×9 field has an exact centre sample
    // and is filtered independently of the pixel-art atlas. Fades reuse two
    // buffers rather than allocating textures for every floating-point shade.
    const size = SIZE
    const scratch = !settled ? this.fading.get(exposure) : undefined
    const canvas = scratch?.mask.canvas ?? createCanvas(size, size)
    const ctx = canvas?.getContext('2d') as Context2d | null
    if (!canvas || !ctx) return null
    const pixels = scratch?.pixels ?? ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dark = sampleVisibility(shade, (x + 0.5) / size, (y + 0.5) / size)
      pixels.data[(y * size + x) * 4 + 3] = Math.round(255 * (exposure ? Math.max(0, 1 - dark / MEMORY_DARKNESS) : dark))
    }
    ctx.putImageData(pixels, 0, 0)
    const mask = scratch?.mask ?? { canvas, x: 0, y: 0, width: size, height: size }
    if (settled) {
      if (this.masks.size >= 256) this.masks.delete(this.masks.keys().next().value!)
      this.masks.set(key, mask)
    } else if (!scratch) this.fading.set(exposure, { mask, pixels })
    return mask
  }

  clear() {
    this.masks.clear(); this.fading.clear(); this.batch.clear(); this.batchKeys = []
    this.keys = new WeakMap(); this.atlas = null; this.pixels = null; this.capacity = 0
  }
}
