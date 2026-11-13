import type { Atmosphere, SceneCell } from '@orbrun/scene'
import { groundDepth, planeRect, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

interface Mood { shadow: readonly number[]; glow: readonly number[]; flow: number; curl: number; stretch: number }
const moods: Record<Atmosphere, Mood> = {
  stone: { shadow: [9, 15, 27], glow: [86, 95, 112], flow: 1, curl: 1, stretch: 1 },
  earth: { shadow: [22, 16, 13], glow: [112, 94, 72], flow: 0.65, curl: 0.65, stretch: 1.15 },
  verdant: { shadow: [10, 22, 18], glow: [80, 117, 83], flow: 0.75, curl: 0.8, stretch: 1 },
  marsh: { shadow: [12, 24, 22], glow: [74, 122, 108], flow: 0.65, curl: 1.1, stretch: 1.35 },
  sea: { shadow: [10, 24, 29], glow: [86, 134, 148], flow: 0.9, curl: 0.75, stretch: 1.45 },
  frost: { shadow: [11, 23, 36], glow: [100, 150, 174], flow: 0.65, curl: 0.65, stretch: 1.2 },
  embers: { shadow: [27, 12, 15], glow: [156, 92, 65], flow: 1.15, curl: 1.15, stretch: 0.85 },
  spectral: { shadow: [16, 17, 27], glow: [109, 106, 143], flow: 0.55, curl: 1, stretch: 1.1 },
  arcane: { shadow: [20, 14, 33], glow: [130, 102, 170], flow: 0.9, curl: 1.2, stretch: 1 },
  chaos: { shadow: [25, 10, 33], glow: [146, 91, 166], flow: 1.35, curl: 1.35, stretch: 0.9 },
  holy: { shadow: [25, 23, 20], glow: [151, 140, 110], flow: 0.55, curl: 0.55, stretch: 1.3 },
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

/** Rolling, domain-warped cloud banks behind known geometry. There are no
 * circular stamps or bright dots. Only confirmed ground footprints determine
 * whether fog is visible; hidden map data never influences its appearance. */
export class UnexploredFog {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private ink: Context2d | null = null
  private pixels: ImageData | null = null

  draw(ctx: Context2d, p: Projection, known: readonly SceneCell[], time: number, dpr: number, atmosphere: Atmosphere = 'stone'): boolean {
    if (!known.length) return false
    let covered = 0
    for (const cell of known) {
      const r = planeRect(p, cell.x, cell.y, 0, dpr)
      covered += Math.max(0, Math.min(p.width, r.x + r.width) - Math.max(0, r.x))
        * Math.max(0, Math.min(p.height, r.y + r.height) - Math.max(0, r.y))
    }
    if (covered >= p.width * p.height - 1 / (dpr * dpr)) return false

    // A bounded low-resolution volume, smoothly enlarged by Canvas. Work is
    // independent of DPR and level size; buffers are reused until resize/zoom.
    const spacing = Math.max(5, p.scale * 0.14)
    const width = Math.min(240, Math.ceil(p.width / spacing))
    const height = Math.min(180, Math.ceil(p.height / spacing))
    if (!this.canvas) {
      this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
        : typeof document !== 'undefined' ? document.createElement('canvas') : null
      this.ink = this.canvas?.getContext('2d') as Context2d | null
    }
    if (!this.canvas || !this.ink) return false
    if (!this.pixels || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height
      this.pixels = this.ink.createImageData(width, height)
    }
    const mood = moods[atmosphere] ?? moods.stone
    time *= mood.flow
    const field = noiseField(), data = this.pixels.data, sy = groundDepth(p.tilt)
    const dx = p.width / (width * p.scale), dy = p.height / (height * p.scale * sy)
    const left = p.x - p.width / (2 * p.scale), top = p.y - p.height / (2 * p.scale * sy)
    for (let py = 0, i = 0; py < height; py++) for (let px = 0; px < width; px++, i += 4) {
      const x = (left + (px + 0.5) * dx) * 0.4 / mood.stretch, y = (top + (py + 0.5) * dy) * 0.46
      // Slowly turning flow bends several octaves into billows and curled
      // filaments. Opposing drift keeps the cloud mass rolling, not sliding.
      const a = noise(field, x * 0.55 + time * 0.027, y * 0.55 - time * 0.02)
      const b = noise(field, x * 0.55 + 43 - time * 0.022, y * 0.55 + 19 + time * 0.018)
      const angle = (a - 0.5) * Math.PI * 2 * mood.curl + time * 0.08
      const u = x + Math.cos(angle) * 0.55 + (b - 0.5) * 1.2 + time * 0.075
      const v = y + Math.sin(angle) * 0.55 + (a - 0.5) * 1.2 - time * 0.038
      const broad = noise(field, u, v)
      const fold = noise(field, u * 1.64 - v * 1.17 + 17, u * 1.17 + v * 1.64 + 9)
      const detail = noise(field, u * 1.95 + v * 3.57 + 29, -u * 3.57 + v * 1.95 + 51)
      const density = broad * 0.4 + fold * 0.35 + detail * 0.25
      const body = Math.max(0, Math.min(1, (density - 0.25) * 1.6))
      const light = body ** 1.35 * 150 + detail * 6
      data[i] = mood.shadow[0] + light * mood.glow[0] / 100
      data[i + 1] = mood.shadow[1] + light * mood.glow[1] / 100
      data[i + 2] = mood.shadow[2] + light * mood.glow[2] / 100
      data[i + 3] = 255
    }
    this.ink.putImageData(this.pixels, 0, 0)
    ctx.save(); ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.canvas, 0, 0, p.width, p.height)
    ctx.restore()
    return true
  }

  clear() {
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0 }
    this.canvas = null; this.ink = null; this.pixels = null
  }
}
