import type { TileSource } from '@orbrun/scene'
import type { SurfaceRect } from './projection.js'
import { MEMORY_DARKNESS } from './visibility.js'

export type Context2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export interface Layer { tile: number; ox?: number; oy?: number; ymax?: number; at?: 'top' }
export interface SurfaceLighting { draw(ctx: Context2d, rect: SurfaceRect, mask?: HTMLCanvasElement | OffscreenCanvas, sample?: SurfaceRect): void }

/** Keep atlas offsets and doll clipping identical on every projected surface. */
export function drawTile(ctx: Context2d, source: TileSource | null, layer: Layer, x: number, y: number, size: number): boolean {
  const r = source?.tile(layer.tile)
  const image = r && source?.atlas(r.atlas)
  if (!r || !image) return false
  const height = layer.ymax === undefined ? r.h : Math.min(r.h, Math.max(0, layer.ymax - r.oy))
  if (!height) return true
  const scale = size / r.cell
  ctx.drawImage(image as CanvasImageSource, r.sx, r.sy, r.w, height,
    x + (r.ox + (layer.ox ?? 0)) * scale,
    y + (layer.at === 'top' ? 0 : r.oy + (layer.oy ?? 0)) * scale,
    r.w * scale, height * scale)
  return true
}

/** Bounded, readback-free cache. Padding preserves tall and offset tile art. */
export class TileCache {
  private entries = new Map<string, HTMLCanvasElement | OffscreenCanvas>()
  private pixels = 0
  private fading = new Map<number, HTMLCanvasElement | OffscreenCanvas>()
  source: TileSource | null = null

  clear() { this.entries.clear(); this.pixels = 0; this.fading.clear() }

  draw(ctx: Context2d, layers: Layer[], x: number, y: number, size: number, light: number, memory: boolean | number, flash?: { r: number; g: number; b: number; a: number }, lighting?: SurfaceLighting, sample?: SurfaceRect, rasterScale = 1): boolean {
    const surface = this.composite(layers, light, memory, false, flash, false, rasterScale)
    if (!surface) return false
    ctx.drawImage(surface, x - size, y - size, size * 3, size * 3)
    lighting?.draw(ctx, { x: x - size, y: y - size, width: size * 3, height: size * 3 }, surface, sample)
    return true
  }

  /** Terrain has no transparent padding to bleed into its edges when filtered. */
  drawPlane(ctx: Context2d, layers: Layer[], rect: SurfaceRect, light: number, memory: boolean | number, flash?: { r: number; g: number; b: number; a: number }, lighting?: SurfaceLighting, sample?: SurfaceRect, thin = false): boolean {
    const surface = this.composite(layers, light, memory, true, flash, thin)
    if (!surface) return false
    ctx.drawImage(surface, rect.x, rect.y, rect.width, rect.height)
    lighting?.draw(ctx, rect, surface, sample)
    return true
  }

  /** Numeric memory is continuous black opacity; booleans retain static shading. */
  private composite(layers: Layer[], light: number, memory: boolean | number, flat: boolean, flash?: { r: number; g: number; b: number; a: number }, thin = false, rasterScale = 1) {
    if (!layers.some(l => this.source?.tile(l.tile))) return null
    if (layers.some(l => { const r = this.source?.tile(l.tile); return r && !this.source?.atlas(r.atlas) })) return null
    const shade = Math.round(Math.max(0.2, Math.min(1, light)) * 16) / 16
    const darkness = typeof memory === 'boolean' ? memory ? MEMORY_DARKNESS : 0 : Math.max(0, Math.min(1, memory))
    const fading = darkness !== 0 && darkness !== MEMORY_DARKNESS
    const cachedMemory = !fading && darkness === MEMORY_DARKNESS
    const cachedFlash = fading ? undefined : flash
    const key = JSON.stringify([layers, shade, cachedMemory, flat, cachedFlash, thin, rasterScale])
    let surface = this.entries.get(key)
    if (!surface) {
      const size = flat ? 32 : 96, origin = flat ? 0 : 32
      surface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size * rasterScale, size * rasterScale) : Object.assign(document.createElement('canvas'), { width: size * rasterScale, height: size * rasterScale })
      const c = surface.getContext('2d') as Context2d | null
      if (!c) return null
      // Enlarge whole source pixels first. Filtering this surface then softens
      // only a narrow pixel edge instead of blurring entire atlas texels.
      c.imageSmoothingEnabled = false
      c.scale(rasterScale, rasterScale)
      let painted = false
      for (const layer of layers) painted = drawTile(c, this.source, layer, origin, origin, 32) || painted
      // Atlases may still be loading: a missing image must never poison the cache.
      if (!painted) return null
      if (thin) {
        const mask = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size + 2, size + 2) : Object.assign(document.createElement('canvas'), { width: size + 2, height: size + 2 })
        const ink = mask.getContext('2d') as Context2d | null
        if (ink) {
          ink.drawImage(surface, 1, 1)
          // Clamp the mask's edges so thinning never shortens a beam segment.
          ink.drawImage(surface, 0, 0, 1, size, 0, 1, 1, size)
          ink.drawImage(surface, size - 1, 0, 1, size, size + 1, 1, 1, size)
          ink.drawImage(surface, 0, 0, size, 1, 1, 0, size, 1)
          ink.drawImage(surface, 0, size - 1, size, 1, 1, size + 1, size, 1)
          c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true
          for (const [dx, dy] of [[-0.45, 0], [0.45, 0], [0, -0.45], [0, 0.45]]) c.drawImage(mask, dx - 1, dy - 1)
        }
      }
      c.globalCompositeOperation = 'source-atop'
      c.fillStyle = `rgba(0,0,0,${1 - shade})`
      c.fillRect(0, 0, size, size)
      if (cachedMemory) {
        c.fillStyle = `rgba(0,0,0,${MEMORY_DARKNESS})`
        c.fillRect(0, 0, size, size)
      }
      if (cachedFlash) {
        c.fillStyle = `rgba(${cachedFlash.r},${cachedFlash.g},${cachedFlash.b},${cachedFlash.a / 255})`
        c.fillRect(0, 0, size, size)
      }
      // Keep the same pixel budget when animation uses larger cached sprites.
      const pixels = surface.width * surface.height
      while (this.entries.size && (this.entries.size >= 1024 || this.pixels + pixels > 1024 * 96 * 96)) {
        const oldest = this.entries.keys().next().value!
        const previous = this.entries.get(oldest)!
        this.pixels -= previous.width * previous.height
        this.entries.delete(oldest)
      }
      this.entries.set(key, surface)
      this.pixels += pixels
    }
    if (fading) {
      // Shade a reusable scratch surface, preserving sprite alpha and flash
      // ordering without quantized cache entries for every animation frame.
      let fadingSurface = this.fading.get(surface.width)
      if (!fadingSurface) {
        fadingSurface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(surface.width, surface.height)
          : Object.assign(document.createElement('canvas'), { width: surface.width, height: surface.height })
        this.fading.set(surface.width, fadingSurface)
      }
      const c = fadingSurface.getContext('2d') as Context2d | null
      if (!c) return surface
      c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, surface.width, surface.height)
      c.drawImage(surface, 0, 0)
      c.globalCompositeOperation = 'source-atop'
      c.fillStyle = `rgba(0,0,0,${darkness})`; c.fillRect(0, 0, surface.width, surface.height)
      if (flash) {
        c.fillStyle = `rgba(${flash.r},${flash.g},${flash.b},${flash.a / 255})`
        c.fillRect(0, 0, surface.width, surface.height)
      }
      return fadingSurface
    }
    return surface
  }
}
