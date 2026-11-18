export { lightingFor, lightPulse, type Light, type Emitter, type LightPool } from '@orbrun/scene'
import { cellKey, lightReaches, lightingFor, type Billboard, type Emitter, type Scene, type SceneCell, type TileSource } from '@orbrun/scene'
import { planeRect, project, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d, SurfaceLighting } from './tiles.js'
import { wallHeight } from './wall-depth.js'
import { nativeSpellArt } from './spell-presentation.js'
export function lightField(scene: Scene) { return lightingFor(scene).field }

export const glowRadius = (source: Emitter) => Math.max(0.65, Math.min(6, source.radius * 0.85))

/** Locate the visible art, rather than the floor below a standing emitter. */
type ActorPosition = (b: Billboard) => { x: number; y: number }
export function glowCenter(scene: Scene, p: Projection, source: Emitter, tiles?: TileSource | null, position?: ActorPosition, candidates: readonly Billboard[] = scene.billboards) {
  const cell = scene.cells.get(cellKey(source.x, source.y))
  const billboard = candidates.find(b => b.x === source.x && b.y === source.y && b.life?.lights?.some(l =>
    l.radius === source.radius && l.colour[0] === source.colour[0] && l.colour[1] === source.colour[1] && l.colour[2] === source.colour[2]))
  if (!billboard && cell?.occluder) {
    const z = wallHeight(scene, cell, p.tilt)
    const roof = planeRect(p, cell.x, cell.y, z, 1)
    return { x: roof.x + roof.width / 2, y: roof.y + roof.height * 0.4 }
  }
  if (billboard || cell?.stance === 'upright' || cell?.freestanding) {
    const anchor = billboard && position ? position(billboard) : source
    const q = project(p, anchor.x, anchor.y + 0.3)
    const id = billboard?.tile ?? cell?.featureTile
    const art = id === undefined ? undefined : tiles?.tile(id)
    return {
      x: q.x + (art ? (art.ox + art.w / 2) / art.cell - 0.5 : 0) * p.scale,
      y: q.y + (art ? (art.oy + art.h / 2) / art.cell - 1 : -0.5) * p.scale - (billboard?.kind === 'cloud' ? p.scale * 0.15 : 0),
    }
  }
  return project(p, source.x, source.y)
}

type Canvas = HTMLCanvasElement | OffscreenCanvas
const surface = (width: number, height: number): Canvas | null => typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(width, height)
  : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width, height }) : null

// The field contains only soft colour gradients. Keep tile art, silhouettes
// and the final receiver masks at their original resolutions.
const LIGHT_SCALE = 0.5
const SOURCE_PIXELS = 2 * 1024 * 1024
const SAMPLE_PIXELS = 2 * 1024 * 1024

interface LightStamp {
  canvas: Canvas
  geometry: number[]
  radius: number
  blur: number
}

/** A single continuous light field for floors, raised terrain and standing art.
 * Only reachability is cell-based; colour and falloff are sampled per pixel.
 * Texture samples never enter the tile cache, so flicker/afterglows stay fluid. */
export class DungeonLighting implements SurfaceLighting {
  private canvas: Canvas | null = null
  private samples = new Map<string, { canvases: Canvas[]; used: number }>()
  private samplePixels = 0
  private stamps = new Map<string, LightStamp>()
  private stampPixels = 0
  private geometry: number[] = []
  private sourceMask: Canvas | null = null
  private scene: Scene | null = null
  private revision = -1
  private key = ''
  private emittersAt = new Map<ReturnType<typeof cellKey>, Billboard[]>()
  private reachable: SceneCell[][] = []
  private pad = 0
  private bounds: SurfaceRect[] = []
  active = false

  build(scene: Scene, p: Projection, sources: Emitter[], time: number, animate: boolean, tiles?: TileSource | null, position?: ActorPosition,
    receives = (cell: SceneCell) => cell.visibility === 'visible') {
    this.active = false
    for (const pool of this.samples.values()) pool.used = 0
    this.bounds = []
    if (!sources.length) return
    const key = sources.map(s => `${s.x},${s.y},${s.radius}`).join(';')
    const sceneChanged = scene !== this.scene || scene.revision !== this.revision
    if (sceneChanged) {
      this.emittersAt.clear()
      for (const b of scene.billboards) if (b.life?.lights?.length) {
        const key = cellKey(b.x, b.y)
        const at = this.emittersAt.get(key)
        if (at) at.push(b)
        else this.emittersAt.set(key, [b])
      }
    }
    if (sceneChanged || key !== this.key) {
      this.reachable = sources.map(source => {
        const cells: SceneCell[] = [], radius = Math.ceil(glowRadius(source) + 1)
        if (scene.cells.get(cellKey(source.x, source.y))?.visibility !== 'visible') return cells
        for (let y = source.y - radius; y <= source.y + radius; y++) for (let x = source.x - radius; x <= source.x + radius; x++) {
          const cell = scene.cells.get(cellKey(x, y))
          // Include cells whose edge intersects the gradient, so its radius
          // ends smoothly rather than clipping at the last cell's centre.
          if (cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown' && receives(cell) && Math.hypot(x - source.x, y - source.y) < glowRadius(source) + 1.4 && lightReaches(scene, source, cell)) cells.push(cell)
        }
        return cells
      })
      this.scene = scene; this.revision = scene.revision; this.key = key
    }
    this.pad = Math.ceil(p.scale * 3)
    const width = Math.ceil((p.width + this.pad * 2) * LIGHT_SCALE), height = Math.ceil((p.height + this.pad * 2) * LIGHT_SCALE)
    this.canvas ??= surface(width, height)
    if (!this.canvas) return
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
    const ctx = this.canvas.getContext('2d') as Context2d | null
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height)
    ctx.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, this.pad * LIGHT_SCALE, this.pad * LIGHT_SCALE)
    ctx.globalCompositeOperation = 'screen'
    const actors = scene.billboards.filter(b => !nativeSpellArt(b))
    // Several lights often overlap the same receiver. Project it once for all
    // of them, including the headroom at an actor's interpolated position.
    const headroom = (x: number, y: number): SurfaceRect => {
      const foot = project(p, x, y + 0.3)
      return { x: foot.x - p.scale / 2, y: foot.y - p.scale * 1.2, width: p.scale, height: p.scale * 1.2 }
    }
    const actorRects = new Map<SceneCell, SurfaceRect[]>()
    for (const actor of actors) {
      const cell = scene.cells.get(cellKey(actor.x, actor.y))
      if (!cell) continue
      let rects = actorRects.get(cell)
      if (!rects) actorRects.set(cell, rects = [headroom(cell.x, cell.y)])
      const anchor = position?.(actor)
      if (anchor && (anchor.x !== cell.x || anchor.y !== cell.y)) rects.push(headroom(anchor.x, anchor.y))
    }
    const receivers = new Map<SceneCell, SurfaceRect[]>()
    const receiver = (cell: SceneCell) => {
      let rects = receivers.get(cell)
      if (rects) return rects
      rects = []
      if (receives(cell)) {
        const floor = planeRect(p, cell.x, cell.y, 0, 1)
        if (cell.occluder) {
          const roof = planeRect(p, cell.x, cell.y, wallHeight(scene, cell, p.tilt), 1)
          rects.push({ ...floor, y: roof.y, height: floor.y + floor.height - roof.y })
        } else rects.push(floor)
        const actors = actorRects.get(cell)
        if (actors) rects.push(...actors)
        else if (!cell.life?.spawn && (cell.stance === 'upright' || cell.freestanding)) rects.push(headroom(cell.x, cell.y))
      }
      receivers.set(cell, rects)
      return rects
    }
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i], cells = this.reachable[i]
      const candidates = this.emittersAt.get(cellKey(source.x, source.y))
      const q = glowCenter(scene, p, source, tiles, position, candidates ?? []), radius = glowRadius(source) * p.scale
      if (!cells.length || q.x + radius < -this.pad || q.x - radius > p.width + this.pad || q.y + radius < -this.pad || q.y - radius > p.height + this.pad) continue
      const phase = source.x * 2.31 + source.y * 1.73
      const pulse = !animate ? 1 : source.pulse === 'fire'
        ? 0.94 + Math.sin(time * 1.7 + phase) * 0.04 + Math.sin(time * 3.1 + phase) * 0.02
        : source.pulse === 'electric' ? 0.94 + Math.sin(time * 4 + phase) * 0.06
          : source.pulse === 'slow' ? 0.94 + Math.sin(time * 1.2 + phase) * 0.06 : 1
      const blur = p.scale * 0.13
      const pixels = Math.ceil((radius * 2 + blur * 4) * LIGHT_SCALE), size = pixels / LIGHT_SCALE
      const left = q.x - size / 2, top = q.y - size / 2
      const geometry = this.geometry
      geometry.length = 0
      for (const cell of cells) for (const rect of receiver(cell)) {
        geometry.push(rect.x - left, rect.y - top, rect.width, rect.height)
      }
      const colour = source.colour.join(',')
      const gain = Math.max(1, source.power)
      const key = `${source.x},${source.y}:${source.radius}:${colour}:${gain}`
      const stamp = this.stamp(key, pixels, radius, blur, colour, gain, geometry)
      if (!stamp) continue
      ctx.globalAlpha = Math.max(0, source.power * pulse / gain)
      ctx.drawImage(stamp, left, top, size, size)
      // Include the entire source surface plus a filtering texel. This is a
      // conservative bound, including blurred masks and moving actor headroom.
      this.bounds.push({ x: left - 1, y: top - 1, width: size + 2, height: size + 2 })
      this.active = true
    }
  }

  /** Only the feathered silhouette is cached. Source positions, LOS fades,
   * intensity and pulse are evaluated on every draw, including afterglows. */
  private stamp(key: string, size: number, radius: number, blur: number, colour: string, gain: number, geometry: number[]) {
    let stamp = this.stamps.get(key)
    const previous = stamp?.geometry
    if (stamp && stamp.canvas.width === size && stamp.radius === radius && stamp.blur === blur
      && previous?.length === geometry.length && geometry.every((v, i) => Math.abs(v - previous[i]) < 0.01)) return stamp.canvas
    if (!stamp || stamp.canvas.width !== size) {
      if (stamp) { this.stampPixels -= stamp.canvas.width ** 2; this.stamps.delete(key) }
      while (this.stamps.size && (this.stamps.size >= 256 || this.stampPixels + size * size > SOURCE_PIXELS)) {
        const oldest = this.stamps.keys().next().value!
        this.stampPixels -= this.stamps.get(oldest)!.canvas.width ** 2
        this.stamps.delete(oldest)
      }
      const canvas = surface(size, size)
      if (!canvas) return null
      stamp = { canvas, radius, blur, geometry: [] }
      this.stamps.set(key, stamp); this.stampPixels += size * size
    }
    this.sourceMask ??= surface(size, size)
    if (!this.sourceMask) return null
    // Keep the scratch mask large enough for mixed-radius lights. Blurring
    // samples transparent pixels outside the stamp, including its padding.
    if (this.sourceMask.width < size) this.sourceMask.width = this.sourceMask.height = size
    const mask = this.sourceMask.getContext('2d') as Context2d | null
    const ink = stamp.canvas.getContext('2d') as Context2d | null
    if (!ink || !mask) return null
    mask.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    mask.clearRect(0, 0, this.sourceMask.width / LIGHT_SCALE, this.sourceMask.height / LIGHT_SCALE)
    mask.beginPath()
    for (let i = 0; i < geometry.length; i += 4) mask.rect(geometry[i], geometry[i + 1], geometry[i + 2], geometry[i + 3])
    mask.fillStyle = '#fff'; mask.fill()
    ink.globalCompositeOperation = 'source-over'; ink.clearRect(0, 0, size, size)
    const gradient = ink.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius * LIGHT_SCALE)
    for (const [at, opacity] of [[0, 0.42], [0.25, 0.29], [0.55, 0.1], [0.8, 0.015], [1, 0]]) gradient.addColorStop(at, `rgba(${colour},${0.65 * gain * opacity})`)
    ink.fillStyle = gradient; ink.fillRect(0, 0, size, size)
    ink.globalCompositeOperation = 'destination-in'; ink.filter = `blur(${blur * LIGHT_SCALE}px)`
    ink.drawImage(this.sourceMask, 0, 0, size, size, 0, 0, size, size); ink.filter = 'none'
    this.geometry = stamp.geometry
    stamp.geometry = geometry; stamp.radius = radius; stamp.blur = blur
    return stamp.canvas
  }

  draw(ctx: Context2d, rect: SurfaceRect, mask?: Canvas, sample = rect,
    maskRect = mask ? { x: 0, y: 0, width: mask.width, height: mask.height } : undefined) {
    if (!this.active || !this.canvas || rect.width <= 0 || rect.height <= 0) return
    if (!this.bounds.some(b => sample.x < b.x + b.width && sample.x + sample.width > b.x
      && sample.y < b.y + b.height && sample.y + sample.height > b.y)) return
    const sx = (sample.x + this.pad) * LIGHT_SCALE, sy = (sample.y + this.pad) * LIGHT_SCALE
    const sw = sample.width * LIGHT_SCALE, sh = sample.height * LIGHT_SCALE
    let ink = this.canvas
    if (mask && maskRect) {
      const { width, height } = maskRect
      const key = `${width}:${height}`
      let pool = this.samples.get(key)
      if (!pool) this.samples.set(key, pool = { canvases: [], used: 0 })
      let canvas = pool.canvases[pool.used]
      if (!canvas) {
        // Keep each submitted sample immutable for this frame. Rewriting a
        // sprite-sized scratch canvas after every cloud forces GPU snapshots.
        if (pool.canvases.length && (pool.canvases.length >= 256 || this.samplePixels + width * height > SAMPLE_PIXELS)) canvas = pool.canvases[pool.canvases.length - 1]
        else {
          const created = surface(width, height)
          if (!created) return
          canvas = created; pool.canvases.push(canvas); this.samplePixels += width * height
        }
      }
      pool.used++
      const scratch = canvas.getContext('2d') as Context2d | null
      if (!scratch) return
      scratch.globalCompositeOperation = 'source-over'; scratch.clearRect(0, 0, width, height)
      scratch.drawImage(this.canvas, sx, sy, sw, sh, 0, 0, width, height)
      scratch.globalCompositeOperation = 'destination-in'
      scratch.drawImage(mask, maskRect.x, maskRect.y, width, height, 0, 0, width, height)
      ink = canvas
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = true
    if (mask) ctx.drawImage(ink, rect.x, rect.y, rect.width, rect.height)
    else ctx.drawImage(ink, sx, sy, sw, sh, rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  }

  clear() {
    this.canvas = this.sourceMask = null; this.stamps.clear(); this.stampPixels = 0; this.samples.clear(); this.samplePixels = 0
    this.geometry = []; this.emittersAt.clear(); this.bounds = []; this.scene = null; this.reachable = []; this.key = ''; this.revision = -1; this.active = false
  }
}
