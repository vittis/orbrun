export { lightingFor, lightPulse, type Light, type Emitter, type LightPool } from '@orbrun/scene'
import { cellKey, lightReaches, lightingFor, type Billboard, type Emitter, type Scene, type SceneCell, type TileSource } from '@orbrun/scene'
import { planeRect, project, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d, SurfaceLighting } from './tiles.js'
export function lightField(scene: Scene) { return lightingFor(scene).field }

export const glowRadius = (source: Emitter) => Math.max(0.65, Math.min(1.35, source.radius * 0.32))

/** Locate the visible art, rather than the floor below a standing emitter. */
type ActorPosition = (b: Billboard) => { x: number; y: number }
export function glowCenter(scene: Scene, p: Projection, source: Emitter, tiles?: TileSource | null, position?: ActorPosition) {
  const cell = scene.cells.get(cellKey(source.x, source.y))
  const billboard = scene.billboards.find(b => b.x === source.x && b.y === source.y && b.life?.lights?.some(l => l.radius === source.radius && l.colour.join(',') === source.colour.join(',')))
  if (!billboard && cell?.occluder) {
    const behind = scene.cells.get(cellKey(cell.x, cell.y - 1))
    const z = behind?.visibility === 'visible' && !behind.occluder ? 0.18 : 0.58
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

/** A single continuous light field for floors, raised terrain and standing art.
 * Only reachability is cell-based; colour and falloff are sampled per pixel.
 * Texture samples never enter the tile cache, so flicker/afterglows stay fluid. */
export class DungeonLighting implements SurfaceLighting {
  private canvas: Canvas | null = null
  private scratch: Canvas | null = null
  private sourceInk: Canvas | null = null
  private sourceMask: Canvas | null = null
  private scene: Scene | null = null
  private revision = -1
  private key = ''
  private reachable: SceneCell[][] = []
  private pad = 0
  active = false

  build(scene: Scene, p: Projection, sources: Emitter[], time: number, animate: boolean, tiles?: TileSource | null, position?: ActorPosition) {
    this.active = false
    if (!sources.length) return
    const key = sources.map(s => `${s.x},${s.y},${s.radius}`).join(';')
    if (scene !== this.scene || scene.revision !== this.revision || key !== this.key) {
      this.reachable = sources.map(source => {
        const cells: SceneCell[] = [], radius = Math.ceil(glowRadius(source) + 1)
        if (scene.cells.get(cellKey(source.x, source.y))?.visibility !== 'visible') return cells
        for (let y = source.y - radius; y <= source.y + radius; y++) for (let x = source.x - radius; x <= source.x + radius; x++) {
          const cell = scene.cells.get(cellKey(x, y))
          // Include cells whose edge intersects the gradient, so its radius
          // ends smoothly rather than clipping at the last cell's centre.
          if (cell?.visibility === 'visible' && Math.hypot(x - source.x, y - source.y) < glowRadius(source) + 1.4 && lightReaches(scene, source, cell)) cells.push(cell)
        }
        return cells
      })
      this.scene = scene; this.revision = scene.revision; this.key = key
    }
    this.pad = Math.ceil(p.scale * 3)
    const width = Math.ceil(p.width + this.pad * 2), height = Math.ceil(p.height + this.pad * 2)
    this.canvas ??= surface(width, height)
    if (!this.canvas) return
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
    const ctx = this.canvas.getContext('2d') as Context2d | null
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height)
    ctx.translate(this.pad, this.pad)
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i], cells = this.reachable[i]
      const q = glowCenter(scene, p, source, tiles, position), radius = glowRadius(source) * p.scale
      if (!cells.length || q.x + radius < -this.pad || q.x - radius > p.width + this.pad || q.y + radius < -this.pad || q.y - radius > p.height + this.pad) continue
      const phase = source.x * 2.31 + source.y * 1.73
      const pulse = !animate ? 1 : source.pulse === 'fire'
        ? 0.94 + Math.sin(time * 1.7 + phase) * 0.04 + Math.sin(time * 3.1 + phase) * 0.02
        : source.pulse === 'electric' ? 0.94 + Math.sin(time * 4 + phase) * 0.06
          : source.pulse === 'slow' ? 0.94 + Math.sin(time * 1.2 + phase) * 0.06 : 1
      const power = source.power * pulse * 0.65
      const blur = p.scale * 0.13, size = Math.ceil(radius * 2 + blur * 4)
      const left = q.x - size / 2, top = q.y - size / 2
      this.sourceInk ??= surface(size, size); this.sourceMask ??= surface(size, size)
      if (!this.sourceInk || !this.sourceMask) continue
      for (const canvas of [this.sourceInk, this.sourceMask]) if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size }
      const ink = this.sourceInk.getContext('2d') as Context2d | null, mask = this.sourceMask.getContext('2d') as Context2d | null
      if (!ink || !mask) continue
      mask.setTransform(1, 0, 0, 1, -left, -top); mask.clearRect(left, top, size, size); mask.beginPath()
      for (const cell of cells) {
        const r = planeRect(p, cell.x, cell.y, 0, 1)
        if (cell.occluder) {
          const behind = scene.cells.get(cellKey(cell.x, cell.y - 1))
          const z = behind?.visibility === 'visible' && !behind.occluder ? 0.18 : 0.58
          const roof = planeRect(p, cell.x, cell.y, z, 1)
          mask.rect(r.x, roof.y, r.width, r.y + r.height - roof.y)
        } else mask.rect(r.x, r.y, r.width, r.height)
        // Give standing art headroom in the visibility mask. Its own alpha
        // clips the final light sample, so no rectangular sprite glow leaks.
        if (scene.billboards.some(b => b.x === cell.x && b.y === cell.y) || cell.stance === 'upright' || cell.freestanding) {
          const foot = project(p, cell.x, cell.y + 0.3)
          mask.rect(foot.x - p.scale / 2, foot.y - p.scale * 1.2, p.scale, p.scale * 1.2)
        }
      }
      // Retain headroom at each drawn position while actors travel between cells.
      if (position) for (const b of scene.billboards) {
        if (!cells.some(c => c.x === b.x && c.y === b.y)) continue
        const anchor = position(b), foot = project(p, anchor.x, anchor.y + 0.3)
        mask.rect(foot.x - p.scale / 2, foot.y - p.scale * 1.2, p.scale, p.scale * 1.2)
      }
      mask.fillStyle = '#fff'; mask.fill()
      ink.setTransform(1, 0, 0, 1, 0, 0); ink.globalCompositeOperation = 'source-over'; ink.clearRect(0, 0, size, size)
      const gradient = ink.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius)
      for (const [at, opacity] of [[0, 0.42], [0.25, 0.29], [0.55, 0.1], [0.8, 0.015], [1, 0]]) gradient.addColorStop(at, `rgba(${source.colour.join(',')},${power * opacity})`)
      ink.fillStyle = gradient; ink.fillRect(0, 0, size, size)
      // Blur the union of reachable surfaces once, so shadows feather instead
      // of switching intensity at individual cell boundaries.
      ink.globalCompositeOperation = 'destination-in'; ink.filter = `blur(${blur}px)`
      ink.drawImage(this.sourceMask, 0, 0); ink.filter = 'none'
      ctx.globalCompositeOperation = 'screen'; ctx.drawImage(this.sourceInk, left, top)
      this.active = true
    }
  }

  draw(ctx: Context2d, rect: SurfaceRect, mask?: Canvas, sample = rect) {
    if (!this.active || !this.canvas || rect.width <= 0 || rect.height <= 0) return
    let ink = this.canvas
    if (mask) {
      this.scratch ??= surface(mask.width, mask.height)
      if (!this.scratch) return
      if (this.scratch.width !== mask.width || this.scratch.height !== mask.height) { this.scratch.width = mask.width; this.scratch.height = mask.height }
      const scratch = this.scratch.getContext('2d') as Context2d | null
      if (!scratch) return
      scratch.globalCompositeOperation = 'source-over'; scratch.clearRect(0, 0, mask.width, mask.height)
      scratch.drawImage(this.canvas, sample.x + this.pad, sample.y + this.pad, sample.width, sample.height, 0, 0, mask.width, mask.height)
      scratch.globalCompositeOperation = 'destination-in'; scratch.drawImage(mask, 0, 0)
      ink = this.scratch
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = true
    if (mask) ctx.drawImage(ink, rect.x, rect.y, rect.width, rect.height)
    else ctx.drawImage(ink, sample.x + this.pad, sample.y + this.pad, sample.width, sample.height, rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  }

  clear() { this.canvas = this.scratch = this.sourceInk = this.sourceMask = null; this.scene = null; this.reachable = []; this.key = ''; this.revision = -1; this.active = false }
}
