import type { TileSource } from '@orbrun/scene'
import type { Light } from './lighting.js'
import type { SurfaceRect } from './projection.js'

export type Context2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export interface Layer { tile: number; ox?: number; oy?: number; ymax?: number; at?: 'top' }

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
  source: TileSource | null = null

  clear() { this.entries.clear() }

  draw(ctx: Context2d, layers: Layer[], x: number, y: number, size: number, light: number, memory: boolean, flash?: { r: number; g: number; b: number; a: number }, glow?: Light): boolean {
    const surface = this.composite(layers, light, memory, false, flash, glow)
    if (!surface) return false
    ctx.drawImage(surface, x - size, y - size, size * 3, size * 3)
    return true
  }

  /** Terrain has no transparent padding to bleed into its edges when filtered. */
  drawPlane(ctx: Context2d, layers: Layer[], rect: SurfaceRect, light: number, memory: boolean, flash?: { r: number; g: number; b: number; a: number }, glow?: Light): boolean {
    const surface = this.composite(layers, light, memory, true, flash, glow)
    if (!surface) return false
    ctx.drawImage(surface, rect.x, rect.y, rect.width, rect.height)
    return true
  }

  private composite(layers: Layer[], light: number, memory: boolean, flat: boolean, flash?: { r: number; g: number; b: number; a: number }, glow?: Light) {
    if (!layers.some(l => this.source?.tile(l.tile))) return null
    if (layers.some(l => { const r = this.source?.tile(l.tile); return r && !this.source?.atlas(r.atlas) })) return null
    const shade = Math.round(Math.max(0.2, Math.min(1, light)) * 16) / 16
    const key = JSON.stringify([layers, shade, memory, flat, flash, glow])
    let surface = this.entries.get(key)
    if (!surface) {
      const size = flat ? 32 : 96, origin = flat ? 0 : 32
      surface = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size })
      const c = surface.getContext('2d') as Context2d | null
      if (!c) return null
      let painted = false
      for (const layer of layers) painted = drawTile(c, this.source, layer, origin, origin, 32) || painted
      // Atlases may still be loading: a missing image must never poison the cache.
      if (!painted) return null
      c.globalCompositeOperation = 'source-atop'
      c.fillStyle = `rgba(0,0,0,${1 - shade})`
      c.fillRect(0, 0, size, size)
      if (memory) {
        c.fillStyle = 'rgba(0,0,0,0.56)'
        c.fillRect(0, 0, size, size)
      }
      if (glow) {
        c.fillStyle = `rgba(${glow.colour.join(',')},${glow.strength})`
        c.fillRect(0, 0, size, size)
      }
      if (flash) {
        c.fillStyle = `rgba(${flash.r},${flash.g},${flash.b},${flash.a / 255})`
        c.fillRect(0, 0, size, size)
      }
      if (this.entries.size >= 1024) this.entries.delete(this.entries.keys().next().value!)
      this.entries.set(key, surface)
    }
    return surface
  }
}
