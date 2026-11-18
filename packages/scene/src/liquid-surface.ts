import type { SceneCell } from './index.js'

export type LiquidMaterial = 'water' | 'lava' | 'bog'
type Ink = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const cellsAcross = 8
const texels = 20
const size = cellsAcross * texels
const tau = 2 * Math.PI
const saturate = (value: number) => Math.max(0, Math.min(1, value))

export function liquidMaterial(cell: SceneCell): LiquidMaterial | undefined {
  if (cell.visibility !== 'visible' || cell.occluder || cell.kind === 'unknown') return
  const motion = cell.kind === 'floor' ? cell.life?.motion : undefined
  if (cell.flags.lava || motion === 'lava') return 'lava'
  if (motion === 'bog') return 'bog'
  if (cell.flags.water || motion === 'water') return 'water'
}

// Whole spatial frequencies make the field wrap across its eight-cell period.
// Two bending currents carry the smaller surface features at different speeds.
function paint(pixels: Uint8ClampedArray, material: LiquidMaterial, seconds: number) {
  const lava = material === 'lava', bog = material === 'bog'
  const t = seconds * (lava ? 0.24 : bog ? 0.29 : 0.70)
  let i = 0
  for (let row = 0; row < size; row++) {
    const y = (row + 0.5) * tau / size
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) * tau / size
      const u = x + 0.40 * Math.sin(y * 2 + x - t * 0.47) + 0.12 * Math.sin(x * 3 - y + t * 0.3)
      const v = y + 0.31 * Math.sin(x * 2 - y + t * 0.6) + 0.09 * Math.sin(y * 4 + x - t * 0.4)
      if (lava) {
        const fold = Math.sin(u * 4 + v * 3 - t) + 0.77 * Math.sin(v * 6 - u * 2 + t * 0.6)
          + 0.32 * Math.sin(u * 7 - v * 4 + t)
        const heat = saturate(1 - Math.abs(fold) * 1.55)
        const core = heat ** 3
        pixels[i++] = 66 + 181 * heat
        pixels[i++] = 21 + 46 * heat + 106 * core
        pixels[i++] = 21 + 26 * core
        pixels[i++] = 100 + 71 * core
      } else if (bog) {
        const swell = Math.sin(u * 3 + v * 7 - t) + 0.55 * Math.sin(v * 11 - u * 2 + t * 0.74)
        const facet = 0.5 + 0.5 * Math.sin(u * 5 - v * 3 + t * 0.35)
        const glint = saturate((swell - 0.48) * 1.05) ** 3 * (0.32 + 0.68 * facet)
        const trough = saturate(-swell * 0.7)
        pixels[i++] = 50 + 125 * glint
        pixels[i++] = 55 + 105 * glint
        pixels[i++] = 33 + 65 * glint
        pixels[i++] = 17 + 42 * trough + 63 * glint
      } else {
        // The tile art already has bright crests. Let one broad reflection drift across them.
        const swell = 0.5 + 0.5 * Math.sin(2 * u + 2 * v - t)
        const cross = 0.5 + 0.5 * Math.cos(2 * v - u + t * 0.6)
        pixels[i++] = 110
        pixels[i++] = 167
        pixels[i++] = 177
        pixels[i++] = 3 + 61 * swell * cross
      }
    }
  }
}

/** One small, readback-free surface per visible material, shared by every receiving cell. */
export class LiquidSurfaces {
  private fields = new Map<LiquidMaterial, { ctx: Ink; image: ImageData; frame: number }>()

  draw(ctx: Ink, material: LiquidMaterial, cell: SceneCell, time: number, x: number, y: number, width: number, height: number) {
    let field = this.fields.get(material)
    if (!field) {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size)
        : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: size, height: size }) : null
      const ink = canvas?.getContext('2d') as Ink | null
      if (!ink) return
      field = { ctx: ink, image: ink.createImageData(size, size), frame: -Infinity }
      this.fields.set(material, field)
    }
    const frame = Math.floor(time * 24)
    if (frame !== field.frame) {
      paint(field.image.data, material, frame / 24)
      field.ctx.putImageData(field.image, 0, 0)
      field.frame = frame
    }
    const u = ((cell.x % cellsAcross + cellsAcross) % cellsAcross) * texels
    const v = ((cell.y % cellsAcross + cellsAcross) % cellsAcross) * texels
    ctx.drawImage(field.ctx.canvas, u, v, texels, texels, x, y, width, height)
  }

  clear() { this.fields.clear() }
}
