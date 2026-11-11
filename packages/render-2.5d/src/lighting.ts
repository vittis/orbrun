export { lightingFor, lightPulse, type Light, type Emitter, type LightPool } from '@orbrun/scene'
import { cellKey, lightReaches, lightingFor, type Emitter, type Scene, type SceneCell } from '@orbrun/scene'
import { planeRect, project, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d, SurfaceLighting } from './tiles.js'
export function lightField(scene: Scene) { return lightingFor(scene).field }

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
  private scene: Scene | null = null
  private revision = -1
  private key = ''
  private reachable: SceneCell[][] = []
  private pad = 0
  active = false

  build(scene: Scene, p: Projection, sources: Emitter[], time: number, animate: boolean) {
    this.active = false
    if (!sources.length) return
    const key = sources.map(s => `${s.x},${s.y},${s.radius}`).join(';')
    if (scene !== this.scene || scene.revision !== this.revision || key !== this.key) {
      this.reachable = sources.map(source => {
        const cells: SceneCell[] = [], radius = Math.ceil(source.radius)
        if (scene.cells.get(cellKey(source.x, source.y))?.visibility !== 'visible') return cells
        for (let y = source.y - radius; y <= source.y + radius; y++) for (let x = source.x - radius; x <= source.x + radius; x++) {
          const cell = scene.cells.get(cellKey(x, y))
          // Include cells whose edge intersects the gradient, so its radius
          // ends smoothly rather than clipping at the last cell's centre.
          if (cell?.visibility === 'visible' && Math.hypot(x - source.x, y - source.y) < source.radius + 0.71 && lightReaches(scene, source, cell)) cells.push(cell)
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
      const q = project(p, source.x, source.y), radius = source.radius * p.scale
      if (!cells.length || q.x + radius < -this.pad || q.x - radius > p.width + this.pad || q.y + radius < -this.pad || q.y - radius > p.height + this.pad) continue
      const phase = source.x * 2.31 + source.y * 1.73
      const pulse = !animate ? 1 : source.pulse === 'fire'
        ? 0.94 + Math.sin(time * 1.7 + phase) * 0.04 + Math.sin(time * 3.1 + phase) * 0.02
        : source.pulse === 'electric' ? 0.94 + Math.sin(time * 4 + phase) * 0.06
          : source.pulse === 'slow' ? 0.94 + Math.sin(time * 1.2 + phase) * 0.06 : 1
      const power = source.power * pulse
      ctx.save(); ctx.beginPath()
      for (const cell of cells) {
        const r = planeRect(p, cell.x, cell.y, 0, 1)
        ctx.rect(r.x, r.y, r.width, r.height)
      }
      ctx.clip(); ctx.translate(q.x, q.y); ctx.scale(1, Math.sin(p.tilt))
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      for (const [at, opacity] of [[0, 0.42], [0.25, 0.32], [0.55, 0.13], [0.8, 0.025], [1, 0]]) gradient.addColorStop(at, `rgba(${source.colour.join(',')},${power * opacity})`)
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = gradient
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.restore()
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

  clear() { this.canvas = this.scratch = null; this.scene = null; this.reachable = []; this.key = ''; this.revision = -1; this.active = false }
}
