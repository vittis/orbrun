import { refractLiquid, type LiquidMaterial, type SceneCell, type TileSource } from '@orbrun/scene'
import type { SurfaceRect } from './projection.js'
import { MEMORY_DARKNESS, settledVisibility, type VisibilityShade } from './visibility.js'
import { VisibilityShading } from './visibility-shading.js'

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
  private fieldRasters: (HTMLCanvasElement | OffscreenCanvas)[] = []
  private fieldCursor = 0
  private fadeRasters = new Map<number, { canvases: (HTMLCanvasElement | OffscreenCanvas)[]; used: number }>()
  private fadePixels = 0
  private frameFades = new Map<string, HTMLCanvasElement | OffscreenCanvas>()
  private fadeCursor = 0
  source: TileSource | null = null
  readonly visibility = new VisibilityShading()

  beginFrame() {
    this.frameFades.clear(); this.fadeCursor = 0; this.fieldCursor = 0
    for (const pool of this.fadeRasters.values()) pool.used = 0
  }

  clear() {
    this.entries.clear(); this.pixels = 0; this.fading.clear(); this.visibility.clear()
    this.fieldRasters = []; this.fadeRasters.clear(); this.fadePixels = 0; this.beginFrame()
  }

  draw(ctx: Context2d, layers: Layer[], x: number, y: number, size: number, light: number, memory: boolean | number, flash?: { r: number; g: number; b: number; a: number }, lighting?: SurfaceLighting, sample?: SurfaceRect, rasterScale = 1): boolean {
    const surface = this.composite(layers, light, memory, false, flash, false, rasterScale)
    if (!surface) return false
    const extent = size * surface.width / (32 * rasterScale)
    const margin = (extent - size) / 2
    const rect = { x: x - margin, y: y - margin, width: extent, height: extent }
    ctx.drawImage(surface, rect.x, rect.y, extent, extent)
    lighting?.draw(ctx, rect, surface, sample && extent !== size * 3 ? {
      x: sample.x + size - margin, y: sample.y + size - margin, width: extent, height: extent,
    } : sample)
    return true
  }

  /** Terrain has no transparent padding to bleed into its edges when filtered. */
  drawPlane(ctx: Context2d, layers: Layer[], rect: SurfaceRect, light: number, memory: boolean | VisibilityShade, flash?: { r: number; g: number; b: number; a: number }, lighting?: SurfaceLighting, sample?: SurfaceRect, thin = false): boolean {
    const surface = this.composite(layers, light, memory, true, flash, thin)
    if (!surface) return false
    ctx.drawImage(surface, rect.x, rect.y, rect.width, rect.height)
    lighting?.draw(ctx, rect, surface, sample)
    return true
  }

  /** Refract just the native floor. Decals, shoreline foam and actors keep their anchors. */
  drawLiquidFloor(ctx: Context2d, material: LiquidMaterial, cell: SceneCell, rect: SurfaceRect, memory: VisibilityShade, time: number, dpr: number) {
    const floor = this.composite([{ tile: cell.floorTile }], 1, false, true)
    if (floor) {
      ctx.drawImage(floor, rect.x, rect.y, rect.width, rect.height)
      refractLiquid(ctx, floor, { sx: 0, sy: 0, w: floor.width, h: floor.height }, rect, material, cell, time, dpr)
    }
    if (this.source && memory !== 0) {
      const mask = typeof memory === 'number' ? undefined : this.visibility.mask(memory)
      if (mask) {
        ctx.save(); ctx.imageSmoothingEnabled = true
        ctx.drawImage(mask.canvas, mask.x, mask.y, mask.width, mask.height, rect.x, rect.y, rect.width, rect.height)
        ctx.restore()
      } else if (typeof memory === 'number') {
        ctx.fillStyle = `rgba(0,0,0,${memory})`; ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
    }
    if (this.source && cell.flash) {
      const { r, g, b, a } = cell.flash
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`; ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    }
  }

  /** Turn the roof edge down into shallow stonework, keeping texels roughly square. */
  drawWallFace(ctx: Context2d, layers: Layer[], rect: SurfaceRect, light: number, memory: VisibilityShade, flash?: { r: number; g: number; b: number; a: number }, lighting?: SurfaceLighting) {
    if (rect.height <= 0) return
    const surface = this.composite(layers, light, memory, true, flash)
    if (!surface) return
    // Reflect only the adjoining band: the first face row matches the cap,
    // then the stone shapes continue instead of stretching into vertical lines.
    // Sampling by face depth also keeps low corridor cutaways from squeezing
    // an entire tile of artwork into their narrow lip.
    const depth = Math.min(surface.height, Math.max(1, Math.ceil(surface.width * rect.height / rect.width)))
    ctx.save()
    ctx.translate(rect.x, rect.y + rect.height)
    ctx.scale(1, -1)
    ctx.drawImage(surface, 0, surface.height - depth, surface.width, depth, 0, 0, rect.width, rect.height)
    ctx.restore()
    lighting?.draw(ctx, rect)
  }

  /** Numeric memory is continuous black opacity; booleans retain static shading. */
  private composite(layers: Layer[], light: number, memory: boolean | VisibilityShade, flat: boolean, flash?: { r: number; g: number; b: number; a: number }, thin = false, rasterScale = 1) {
    if (!layers.some(l => this.source?.tile(l.tile))) return null
    if (layers.some(l => { const r = this.source?.tile(l.tile); return r && !this.source?.atlas(r.atlas) })) return null
    const shade = Math.round(Math.max(0.2, Math.min(1, light)) * 16) / 16
    const field = typeof memory === 'object' ? memory : undefined
    const darkness = typeof memory === 'boolean' ? memory ? MEMORY_DARKNESS : 0 : typeof memory === 'number' ? Math.max(0, Math.min(1, memory)) : 0
    const cachedField = field && settledVisibility(field) ? field : undefined
    const fading = !!field && !cachedField || darkness !== 0 && darkness !== MEMORY_DARKNESS
    const cachedMemory = !fading && darkness === MEMORY_DARKNESS
    const cachedFlash = fading ? undefined : flash
    const key = JSON.stringify([layers, shade, cachedMemory, flat, cachedFlash, thin, rasterScale, cachedField])
    let surface = this.entries.get(key)
    if (!surface) {
      // Most sprites (especially dense spell clouds) fit their own cell.
      // Keep a filtering gutter for them and retain the full three-cell
      // footprint for overhanging art and offset equipment.
      const fits = !flat && layers.every(layer => {
        const tile = this.source?.tile(layer.tile)
        if (!tile) return true
        const left = tile.ox + (layer.ox ?? 0), top = layer.at === 'top' ? 0 : tile.oy + (layer.oy ?? 0)
        return left >= 0 && top >= 0 && left + tile.w <= tile.cell && top + tile.h <= tile.cell
      })
      const origin = flat ? 0 : fits ? 2 : 32, size = 32 + origin * 2
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
      if (cachedField) {
        const mask = this.visibility.mask(cachedField)
        if (mask) { c.imageSmoothingEnabled = true; c.drawImage(mask.canvas, mask.x, mask.y, mask.width, mask.height, 0, 0, size, size) }
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
      const fadeKey = JSON.stringify([key, field ?? darkness, flash])
      const cached = this.frameFades.get(fadeKey)
      if (cached) return cached
      // Both scalar fades (actors and uniform terrain) and spatial fields
      // must remain immutable after submission. Pool by size so mixed padded
      // sprites and floor tiles never resize or clip each other's rasters.
      let slot: number | undefined, rasters: (HTMLCanvasElement | OffscreenCanvas)[] | undefined
      const pixels = surface.width * surface.height
      if (field) {
        // Spatial fields are always native 32px terrain; keep their hot path
        // as a direct array lookup, independent of padded scalar sprites.
        if (this.fieldCursor < 512) { slot = this.fieldCursor++; rasters = this.fieldRasters }
      } else {
        let pool = this.fadeRasters.get(surface.width)
        if (!pool) this.fadeRasters.set(surface.width, pool = { canvases: [], used: 0 })
        if (this.fadeCursor < 512 && (pool.used < pool.canvases.length || this.fadePixels + pixels <= 2 * 1024 * 1024)) {
          slot = pool.used++; rasters = pool.canvases; this.fadeCursor++
        }
      }
      let fadingSurface = slot !== undefined ? rasters![slot] : this.fading.get(surface.width)
      if (!fadingSurface) {
        fadingSurface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(surface.width, surface.height)
          : Object.assign(document.createElement('canvas'), { width: surface.width, height: surface.height })
        if (slot !== undefined) { rasters![slot] = fadingSurface; if (!field) this.fadePixels += pixels }
        else this.fading.set(surface.width, fadingSurface)
      }
      const c = fadingSurface.getContext('2d') as Context2d | null
      if (!c) return surface
      c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, surface.width, surface.height)
      c.drawImage(surface, 0, 0)
      c.globalCompositeOperation = 'source-atop'
      const mask = field && this.visibility.mask(field)
      if (mask) {
        c.imageSmoothingEnabled = true
        c.drawImage(mask.canvas, mask.x, mask.y, mask.width, mask.height, 0, 0, surface.width, surface.height)
      } else {
        c.fillStyle = `rgba(0,0,0,${darkness})`; c.fillRect(0, 0, surface.width, surface.height)
      }
      if (flash) {
        c.fillStyle = `rgba(${flash.r},${flash.g},${flash.b},${flash.a / 255})`
        c.fillRect(0, 0, surface.width, surface.height)
      }
      if (slot !== undefined) this.frameFades.set(fadeKey, fadingSurface)
      return fadingSurface
    }
    return surface
  }
}
