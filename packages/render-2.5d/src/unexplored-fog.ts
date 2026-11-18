import type { SceneCell } from '@orbrun/scene'
import { groundDepth, planeRect, project, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d } from './tiles.js'

function starHash(x: number, y: number) {
  let seed = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x6d2b79f5
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177)
  return (seed ^ (seed >>> 16)) >>> 0
}

// A shared deterministic noise lattice, independent of the dungeon or its bounds.
// Smooth interpolation gives a continuous field across negative world coordinates.
let lattice: Float32Array | null = null
function noiseField() {
  if (lattice) return lattice
  lattice = new Float32Array(256 * 256)
  let seed = 0x6d2b79f5
  for (let i = 0; i < lattice.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    lattice[i] = (seed >>> 0) / 0xffffffff
  }
  return lattice
}

function noise(field: Float32Array, x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy)
  const row = (iy & 255) * 256, next = ((iy + 1) & 255) * 256
  const a = field[row + (ix & 255)], b = field[row + ((ix + 1) & 255)]
  const c = field[next + (ix & 255)], d = field[next + ((ix + 1) & 255)]
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy
}

/** Eight-neighbour distance transform over the shared silhouette. Padding keeps
 * the viewport edge from becoming a false exploration boundary. */
function distances(field: Float32Array, width: number, height: number) {
  const diagonal = Math.SQRT2
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    let d = field[i]
    if (x) d = Math.min(d, field[i - 1] + 1)
    if (y) {
      d = Math.min(d, field[i - width] + 1)
      if (x) d = Math.min(d, field[i - width - 1] + diagonal)
      if (x + 1 < width) d = Math.min(d, field[i - width + 1] + diagonal)
    }
    field[i] = d
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x
    let d = field[i]
    if (x + 1 < width) d = Math.min(d, field[i + 1] + 1)
    if (y + 1 < height) {
      d = Math.min(d, field[i + width] + 1)
      if (x) d = Math.min(d, field[i + width - 1] + diagonal)
      if (x + 1 < width) d = Math.min(d, field[i + width + 1] + diagonal)
    }
    field[i] = d
  }
}
/** Three box passes approximate a Gaussian over the union, rounding corners
 * and joining neighbouring tiles before the animated feather is applied. */
function blur(field: Float32Array, scratch: Float32Array, width: number, height: number, radius: number) {
  const count = radius * 2 + 1
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += field[row + Math.max(0, Math.min(width - 1, k))]
      for (let x = 0; x < width; x++) {
        scratch[row + x] = sum / count
        sum += field[row + Math.min(width - 1, x + radius + 1)] - field[row + Math.max(0, x - radius)]
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += scratch[Math.max(0, Math.min(height - 1, k)) * width + x]
      for (let y = 0; y < height; y++) {
        field[y * width + x] = sum / count
        sum += scratch[Math.min(height - 1, y + radius + 1) * width + x] - scratch[Math.max(0, y - radius) * width + x]
      }
    }
  }
}
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }

/** A simple black starfield and the retained feathered exploration boundary.
 * Stars are deterministic world decoration, independent of branch or hidden
 * terrain. Confirmed geometry only determines where the veil gives way. */
export class UnexploredFog {
  private edgeCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private edgeInk: Context2d | null = null
  private edgePixels: ImageData | null = null
  private stars: HTMLCanvasElement | OffscreenCanvas | null = null
  private swirl: HTMLCanvasElement | OffscreenCanvas | null = null
  private occupied = new Uint8Array(0)
  private previousOccupied = new Uint8Array(0)
  private boundary: number[] = []
  private veilArea = new Uint32Array(0)
  private blurRadius = -1
  private fullyCovered = false
  private coverage = new Float32Array(0)
  private outside = new Float32Array(0)
  private spacing = 1
  private origin = 0
  private prepared = false
  private scratch = new Float32Array(0)
  private maskKey = ''
  private maskCells: readonly SceneCell[] | null = null

  get hasBoundary() { return this.prepared }

  draw(ctx: Context2d, p: Projection, known: readonly SceneCell[], time: number, dpr: number,
    inView: readonly SceneCell[], silhouette: (cell: SceneCell, ground: SurfaceRect) => SurfaceRect, decorations = true): boolean {
    this.prepared = false
    if (!known.length) return false
    const key = [p.x, p.y, p.width, p.height, p.scale, p.tilt, dpr].join(':')
    const changed = key !== this.maskKey || known !== this.maskCells
    if (!changed && this.fullyCovered) return false

    // Bounded, reused buffers; no readbacks or per-cell blur filters.
    const spacing = this.spacing = Math.max(4, p.scale * 0.12, p.width / 240, p.height / 180)
    const pad = Math.ceil(p.scale * 1.25 / spacing) + 1
    this.origin = -pad * spacing
    const width = Math.ceil(p.width / spacing) + pad * 2, height = Math.ceil(p.height / spacing) + pad * 2
    if (!this.edgeCanvas) {
      this.edgeCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
        : typeof document !== 'undefined' ? document.createElement('canvas') : null
      this.edgeInk = this.edgeCanvas?.getContext('2d') as Context2d | null
    }
    if (!this.edgeCanvas || !this.edgeInk) return false
    if (!this.edgePixels || this.edgeCanvas.width !== width || this.edgeCanvas.height !== height) {
      this.edgeCanvas.width = width; this.edgeCanvas.height = height
      this.edgePixels = this.edgeInk.createImageData(width, height)
      this.occupied = new Uint8Array(width * height)
      this.coverage = new Float32Array(width * height); this.outside = new Float32Array(width * height)
      this.scratch = new Float32Array(width * height)
      this.previousOccupied = new Uint8Array(width * height)
      this.veilArea = new Uint32Array((width + 1) * (height + 1))
      this.blurRadius = -1
      this.maskKey = ''
    }
    if (changed) {
      this.occupied.fill(0)
      let covered = 0
      for (const cell of inView) {
        const ground = planeRect(p, cell.x, cell.y, 0, dpr)
        covered += Math.max(0, Math.min(p.width, ground.x + ground.width) - Math.max(0, ground.x))
          * Math.max(0, Math.min(p.height, ground.y + ground.height) - Math.max(0, ground.y))
        const r = silhouette(cell, ground)
        const left = Math.max(0, Math.ceil((r.x - this.origin) / spacing - 0.5))
        const right = Math.min(width, Math.ceil((r.x + r.width - this.origin) / spacing - 0.5))
        const top = Math.max(0, Math.ceil((r.y - this.origin) / spacing - 0.5))
        const bottom = Math.min(height, Math.ceil((r.y + r.height - this.origin) / spacing - 0.5))
        if (right <= left) continue
        for (let y = top; y < bottom; y++) this.occupied.fill(1, y * width + left, y * width + right)
      }
      this.maskKey = key; this.maskCells = known
      this.fullyCovered = covered >= p.width * p.height - 1 / (dpr * dpr)
      if (this.fullyCovered) return false
      const radius = Math.max(1, Math.ceil(p.scale * 0.12 / spacing))
      // Map packets and fractional camera movement can leave the sampled
      // silhouette identical. Only its shape and blur radius affect these fields.
      if (this.blurRadius !== radius || this.occupied.some((v, i) => v !== this.previousOccupied[i])) {
        this.blurRadius = radius
        this.previousOccupied.set(this.occupied)
        for (let i = 0; i < this.occupied.length; i++) {
          this.coverage[i] = this.occupied[i]
          this.outside[i] = this.occupied[i] ? 0 : 1e6
        }
        blur(this.coverage, this.scratch, width, height, radius)
        distances(this.outside, width, height)
        this.boundary.length = 0
        const edge = this.edgePixels.data, stride = width + 1
        for (let y = 0, k = 0; y < height; y++) {
          let row = 0
          for (let x = 0; x < width; x++, k++) {
            const coverage = this.coverage[k]
            if (coverage < 1) row++
            this.veilArea[(y + 1) * stride + x + 1] = this.veilArea[y * stride + x + 1] + row
            // Deep inside the union even the strongest noise darkens a
            // channel by at most one level. Animate only the feather itself.
            if (coverage > 0.5 && coverage < 1) this.boundary.push(k)
            else edge[k * 4 + 3] = coverage <= 0.5 ? 255 : 0
          }
        }
      }
    }

    const field = noiseField(), edge = this.edgePixels.data, sy = groundDepth(p.tilt)
    for (const k of this.boundary) {
      const px = k % width, py = Math.floor(k / width)
      const wx = p.x + (this.origin + (px + 0.5) * spacing - p.width / 2) / p.scale
      const wy = p.y + (this.origin + (py + 0.5) * spacing - p.height / 2) / (p.scale * sy)
      const feather = 0.3 + 0.22 * noise(field, wx * 0.8 + time * 0.22, wy * 0.8 - time * 0.18)
      // RGB stays black in the reused, zero-initialized ImageData.
      edge[k * 4 + 3] = 255 * (1 - smooth((this.coverage[k] - 0.5) / feather))
    }
    this.edgeInk.putImageData(this.edgePixels!, 0, 0)
    this.prepared = true
    if (!decorations) return true
    this.prepareDecorations()
    if (!this.stars || !this.swirl) return true

    // One jittered star per broad world patch; cap density when zoomed out.
    // Small, slow orbits give the points gentle curved drift without wrapping
    // or spawning. Cached radial artwork avoids square cores and hard halos.
    const step = Math.max(2.25, Math.max(p.width, p.height / sy) / (p.scale * 26))
    const left = Math.floor((p.x - p.width / p.scale / 2) / step) - 1
    const right = Math.ceil((p.x + p.width / p.scale / 2) / step) + 1
    const top = Math.floor((p.y - p.height / (p.scale * sy) / 2) / step) - 1
    const bottom = Math.ceil((p.y + p.height / (p.scale * sy) / 2) / step) + 1
    ctx.save()
    ctx.imageSmoothingEnabled = true
    for (let gy = top; gy <= bottom; gy++) for (let gx = left; gx <= right; gx++) {
      const seed = starHash(gx, gy)
      if (seed % 5 === 0) continue
      const rx = (seed & 0xffff) / 0xffff, ry = (seed >>> 16) / 0xffff
      const phase = rx * 17 + ry * 29
      const orbit = phase + time * (0.1 + rx * 0.035)
      const q = project(p, (gx + 0.12 + rx * 0.76) * step + Math.cos(orbit) * 0.12 + Math.sin(time * 0.19 + phase) * 0.025,
        (gy + 0.12 + ry * 0.76) * step + Math.sin(orbit) * 0.09)
      if (q.x < 0 || q.y < 0 || q.x >= p.width || q.y >= p.height) continue
      const distance = this.clearance((q.x - this.origin) / spacing - 0.5, (q.y - this.origin) / spacing - 0.5, width, height)
      const alpha = smooth((distance * spacing - spacing * 0.5) / (p.scale * 0.8))
        * (0.42 + rx * 0.38 + Math.sin(phase + time * (0.2 + ry * 0.1)) * 0.065)
      if (alpha <= 0) continue
      const radius = seed % 19 === 0 ? 3 : 1.8 + ry
      ctx.globalAlpha = alpha
      ctx.drawImage(this.stars, (seed % 4) * 32, 0, 32, 32, q.x - radius, q.y - radius, radius * 2, radius * 2)
    }
    // A handful of low-contrast, tapered curls, never a full cloud layer.
    const curlStep = Math.max(8, step * 3.5)
    const x0 = Math.floor((p.x - p.width / p.scale / 2) / curlStep) - 1
    const x1 = Math.ceil((p.x + p.width / p.scale / 2) / curlStep) + 1
    const y0 = Math.floor((p.y - p.height / (p.scale * sy) / 2) / curlStep) - 1
    const y1 = Math.ceil((p.y + p.height / (p.scale * sy) / 2) / curlStep) + 1
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const seed = starHash(x + 503, y - 311)
      if (seed % 3 !== 0) continue
      const rx = (seed & 0xffff) / 0xffff, ry = (seed >>> 16) / 0xffff, phase = rx * 17 + ry * 23
      const q = project(p, (x + rx) * curlStep + Math.sin(time * 0.07 + phase) * 0.08, (y + ry) * curlStep)
      const size = p.scale * (1.8 + rx * 0.5)
      if (q.x < -size || q.y < -size || q.x > p.width + size || q.y > p.height + size) continue
      const distance = this.clearance((q.x - this.origin) / spacing - 0.5, (q.y - this.origin) / spacing - 0.5, width, height) * spacing
      const alpha = smooth((distance - size * 0.6) / p.scale) * (0.35 + ry * 0.2)
      if (alpha <= 0) continue
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(q.x, q.y); ctx.rotate(phase + time * 0.035)
      ctx.drawImage(this.swirl, -size / 2, -size / 2, size, size); ctx.restore()
    }
    ctx.restore()
    return true
  }

  private prepareDecorations() {
    if (this.stars && this.swirl) return
    const make = (w: number, h: number) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
      : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null
    this.stars ??= make(128, 32); this.swirl ??= make(128, 128)
    const stars = this.stars?.getContext('2d') as Context2d | null
    const swirl = this.swirl?.getContext('2d') as Context2d | null
    if (!stars || !swirl) return
    for (const [i, rgb] of ['222,230,242', '237,225,207', '199,214,235', '216,220,228'].entries()) {
      const x = i * 32 + 16, point = stars.createRadialGradient(x, 16, 0, x, 16, 14)
      point.addColorStop(0, `rgba(${rgb},0.98)`); point.addColorStop(0.27, `rgba(${rgb},0.7)`)
      point.addColorStop(0.55, `rgba(${rgb},0.12)`); point.addColorStop(1, `rgba(${rgb},0)`)
      stars.fillStyle = point; stars.fillRect(i * 32, 0, 32, 32)
    }
    swirl.lineCap = 'round'
    for (let i = 0; i < 48; i++) {
      const t = i / 48, next = (i + 1) / 48
      const a = 0.6 + t * 3.9, b = 0.6 + next * 3.9, r = 8 + t * 36, s = 8 + next * 36
      const taper = Math.sin(Math.PI * (t + next) / 2) ** 2
      for (const [width, strength] of [[6, 0.025], [1.5, 0.16]]) {
        swirl.strokeStyle = `rgba(115,130,151,${taper * strength})`; swirl.lineWidth = width
        swirl.beginPath(); swirl.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.7)
        swirl.lineTo(64 + Math.cos(b) * s, 64 + Math.sin(b) * s * 0.7); swirl.stroke()
      }
    }
  }

  private clearance(x: number, y: number, width: number, height: number) {
    const ix = Math.max(0, Math.min(width - 2, Math.floor(x))), iy = Math.max(0, Math.min(height - 2, Math.floor(y)))
    const fx = Math.max(0, Math.min(1, x - ix)), fy = Math.max(0, Math.min(1, y - iy)), i = iy * width + ix
    const a = this.outside[i] * (1 - fx) + this.outside[i + 1] * fx
    const b = this.outside[i + width] * (1 - fx) + this.outside[i + width + 1] * fx
    return a * (1 - fy) + b * fy
  }

  /** Applied to receiving terrain before its actors/markers, never over them. */
  shade(ctx: Context2d, rect: SurfaceRect) {
    if (!this.prepared || !this.edgeCanvas) return
    const s = this.spacing
    // Include a texel of filtering support on each side. Four reads from
    // the summed-area table discard fully transparent receiver draws.
    const { width, height } = this.edgeCanvas, stride = width + 1
    const x0 = Math.max(0, Math.min(width, Math.floor((rect.x - this.origin) / s) - 1))
    const y0 = Math.max(0, Math.min(height, Math.floor((rect.y - this.origin) / s) - 1))
    const x1 = Math.max(0, Math.min(width, Math.ceil((rect.x + rect.width - this.origin) / s) + 1))
    const y1 = Math.max(0, Math.min(height, Math.ceil((rect.y + rect.height - this.origin) / s) + 1))
    if (this.veilArea[y1 * stride + x1] - this.veilArea[y0 * stride + x1]
      - this.veilArea[y1 * stride + x0] + this.veilArea[y0 * stride + x0] === 0) return
    ctx.save(); ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.edgeCanvas, (rect.x - this.origin) / s, (rect.y - this.origin) / s, rect.width / s, rect.height / s,
      rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  }

  clear() {
    if (this.edgeCanvas) { this.edgeCanvas.width = 0; this.edgeCanvas.height = 0 }
    for (const canvas of [this.stars, this.swirl]) if (canvas) { canvas.width = 0; canvas.height = 0 }
    this.stars = this.swirl = null
    this.edgeCanvas = null; this.edgeInk = null; this.edgePixels = null; this.prepared = false
    this.occupied = new Uint8Array(0); this.coverage = this.outside = this.scratch = new Float32Array(0)
    this.previousOccupied = new Uint8Array(0); this.veilArea = new Uint32Array(0); this.boundary = []; this.blurRadius = -1
    this.maskKey = ''; this.maskCells = null
  }
}
