import type { Atmosphere, SceneCell } from '@orbrun/scene'
import { groundDepth, planeRect, type Projection, type SurfaceRect } from './projection.js'
import type { Context2d } from './tiles.js'

interface Mood { glow: readonly number[]; flow: number; curl: number; stretch: number }
const moods: Record<Atmosphere, Mood> = {
  stone: { glow: [86, 95, 112], flow: 1, curl: 1, stretch: 1 },
  earth: { glow: [112, 94, 72], flow: 0.65, curl: 0.65, stretch: 1.15 },
  verdant: { glow: [80, 117, 83], flow: 0.75, curl: 0.8, stretch: 1 },
  marsh: { glow: [74, 122, 108], flow: 0.65, curl: 1.1, stretch: 1.35 },
  sea: { glow: [86, 134, 148], flow: 0.9, curl: 0.75, stretch: 1.45 },
  frost: { glow: [100, 150, 174], flow: 0.65, curl: 0.65, stretch: 1.2 },
  embers: { glow: [156, 92, 65], flow: 1.15, curl: 1.15, stretch: 0.85 },
  spectral: { glow: [109, 106, 143], flow: 0.55, curl: 1, stretch: 1.1 },
  arcane: { glow: [130, 102, 170], flow: 0.9, curl: 1.2, stretch: 1 },
  chaos: { glow: [146, 91, 166], flow: 1.35, curl: 1.35, stretch: 0.9 },
  holy: { glow: [151, 140, 110], flow: 0.55, curl: 0.55, stretch: 1.3 },
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

/** Mostly black unexplored space, with sparse smoke and a single feathered
 * boundary shared by ground, raised roofs and wall faces. Geometry is supplied
 * from confirmed cells only; hidden terrain never enters either distance field. */
export class UnexploredFog {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private ink: Context2d | null = null
  private pixels: ImageData | null = null
  private edgeCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private edgeInk: Context2d | null = null
  private edgePixels: ImageData | null = null
  private occupied = new Uint8Array(0)
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
    atmosphere: Atmosphere = 'stone', geometry: readonly SurfaceRect[] = known.map(c => planeRect(p, c.x, c.y, 0, dpr))): boolean {
    this.prepared = false
    if (!known.length) return false
    let covered = 0
    for (const cell of known) {
      const r = planeRect(p, cell.x, cell.y, 0, dpr)
      covered += Math.max(0, Math.min(p.width, r.x + r.width) - Math.max(0, r.x))
        * Math.max(0, Math.min(p.height, r.y + r.height) - Math.max(0, r.y))
    }
    if (covered >= p.width * p.height - 1 / (dpr * dpr)) return false

    // Bounded, reused buffers; no readbacks or per-cell blur filters.
    const spacing = this.spacing = Math.max(4, p.scale * 0.12, p.width / 240, p.height / 180)
    const pad = Math.ceil(p.scale * 1.25 / spacing) + 1
    this.origin = -pad * spacing
    const width = Math.ceil(p.width / spacing) + pad * 2, height = Math.ceil(p.height / spacing) + pad * 2
    if (!this.canvas) {
      const make = () => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
        : typeof document !== 'undefined' ? document.createElement('canvas') : null
      this.canvas = make(); this.edgeCanvas = make()
      this.ink = this.canvas?.getContext('2d') as Context2d | null
      this.edgeInk = this.edgeCanvas?.getContext('2d') as Context2d | null
    }
    if (!this.canvas || !this.ink || !this.edgeCanvas || !this.edgeInk) return false
    if (!this.pixels || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = this.edgeCanvas.width = width
      this.canvas.height = this.edgeCanvas.height = height
      this.pixels = this.ink.createImageData(width, height)
      this.edgePixels = this.edgeInk.createImageData(width, height)
      this.occupied = new Uint8Array(width * height)
      this.coverage = new Float32Array(width * height); this.outside = new Float32Array(width * height)
      this.scratch = new Float32Array(width * height)
      this.maskKey = ''
    }
    const key = [p.x, p.y, p.width, p.height, p.scale, p.tilt, dpr].join(':')
    if (key !== this.maskKey || known !== this.maskCells) {
      this.occupied.fill(0)
      for (const r of geometry) {
        const left = Math.max(0, Math.ceil((r.x - this.origin) / spacing - 0.5))
        const right = Math.min(width, Math.ceil((r.x + r.width - this.origin) / spacing - 0.5))
        const top = Math.max(0, Math.ceil((r.y - this.origin) / spacing - 0.5))
        const bottom = Math.min(height, Math.ceil((r.y + r.height - this.origin) / spacing - 0.5))
        if (right <= left) continue
        for (let y = top; y < bottom; y++) this.occupied.fill(1, y * width + left, y * width + right)
      }
      for (let i = 0; i < this.occupied.length; i++) {
        this.coverage[i] = this.occupied[i]
        this.outside[i] = this.occupied[i] ? 0 : 1e6
      }
      blur(this.coverage, this.scratch, width, height, Math.max(1, Math.ceil(p.scale * 0.12 / spacing)))
      distances(this.outside, width, height)
      this.maskKey = key; this.maskCells = known
    }

    const mood = moods[atmosphere] ?? moods.stone
    time *= mood.flow
    const field = noiseField(), data = this.pixels.data, edge = this.edgePixels!.data, sy = groundDepth(p.tilt)
    const maxGlow = Math.max(...mood.glow)
    for (let py = 0, i = 0; py < height; py++) for (let px = 0; px < width; px++, i += 4) {
      const k = py * width + px
      const wx = p.x + (this.origin + (px + 0.5) * spacing - p.width / 2) / p.scale
      const wy = p.y + (this.origin + (py + 0.5) * spacing - p.height / 2) / (p.scale * sy)
      const feather = 0.3 + 0.22 * noise(field, wx * 0.8 + time * 0.22, wy * 0.8 - time * 0.18)
      edge[i] = edge[i + 1] = edge[i + 2] = 0
      edge[i + 3] = 255 * (1 - smooth((this.coverage[k] - 0.5) / feather))
      data[i] = data[i + 1] = 1; data[i + 2] = 2; data[i + 3] = 255
      if (this.occupied[k]) continue
      const x = wx * 0.4 / mood.stretch, y = wy * 0.46
      const a = noise(field, x * 0.55 + time * 0.027, y * 0.55 - time * 0.02)
      const b = noise(field, x * 0.55 + 43 - time * 0.022, y * 0.55 + 19 + time * 0.018)
      const angle = (a - 0.5) * Math.PI * 2 * mood.curl + time * 0.08
      const u = x + Math.cos(angle) * 0.55 + (b - 0.5) * 1.2 + time * 0.075
      const v = y + Math.sin(angle) * 0.55 + (a - 0.5) * 1.2 - time * 0.038
      const broad = noise(field, u, v)
      const fold = noise(field, u * 1.64 - v * 1.17 + 17, u * 1.17 + v * 1.64 + 9)
      const detail = noise(field, u * 1.95 + v * 3.57 + 29, -u * 3.57 + v * 1.95 + 51)
      const density = broad * 0.4 + fold * 0.35 + detail * 0.25
      const wisp = Math.max(0, Math.min(1, (density - 0.54) * 5))
      // Wisps break up into black rather than covering the void with clouds.
      // Fade back to black near geometry on the unexplored side as well.
      const light = wisp ** 1.4 * 65 * smooth((this.outside[k] * spacing - spacing * 0.5) / (p.scale * 0.9))
      data[i] = 1 + light * mood.glow[0] / maxGlow
      data[i + 1] = 1 + light * mood.glow[1] / maxGlow
      data[i + 2] = 2 + light * mood.glow[2] / maxGlow
      data[i + 3] = 255
    }
    this.ink.putImageData(this.pixels, 0, 0); this.edgeInk.putImageData(this.edgePixels!, 0, 0)
    ctx.save(); ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.canvas, this.origin, this.origin, width * spacing, height * spacing)
    ctx.restore()
    this.prepared = true
    return true
  }

  /** Applied to receiving terrain before its actors/markers, never over them. */
  shade(ctx: Context2d, rect: SurfaceRect) {
    if (!this.prepared || !this.edgeCanvas) return
    const s = this.spacing
    ctx.save(); ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.edgeCanvas, (rect.x - this.origin) / s, (rect.y - this.origin) / s, rect.width / s, rect.height / s,
      rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  }

  clear() {
    for (const canvas of [this.canvas, this.edgeCanvas]) if (canvas) { canvas.width = 0; canvas.height = 0 }
    this.canvas = this.edgeCanvas = null; this.ink = this.edgeInk = null
    this.pixels = this.edgePixels = null; this.prepared = false
    this.occupied = new Uint8Array(0); this.coverage = this.outside = this.scratch = new Float32Array(0)
    this.maskKey = ''; this.maskCells = null
  }
}
