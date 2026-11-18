import type { SceneCell } from './index.js'

export type LiquidMaterial = 'water' | 'lava' | 'bog'
type Ink = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export function liquidMaterial(cell: SceneCell): LiquidMaterial | undefined {
  if (cell.visibility !== 'visible' || cell.occluder || cell.kind === 'unknown') return
  const motion = cell.kind === 'floor' ? cell.life?.motion : undefined
  if (cell.flags.lava || motion === 'lava') return 'lava'
  if (motion === 'bog') return 'bog'
  if (cell.flags.water || motion === 'water') return 'water'
}

/** Bend the existing texture inside its footprint. The shore and its adjoining
 * floor retain the same border texels even when they come from different atlas layers. */
export function refractLiquid(ctx: Ink, image: CanvasImageSource, source: { sx: number; sy: number; w: number; h: number },
  rect: { x: number; y: number; width: number; height: number }, material: LiquidMaterial, cell: SceneCell, time: number, dpr: number) {
  if (source.w < 4 || source.h < 4) return
  const speed = material === 'water' ? 1.05 : 0.65
  const phase = cell.y * 5.3 + cell.x * 1.2 - time * speed
  const drift = 0.85 * Math.sin(cell.x * 0.8 + cell.y * 1.1 + time * speed * 0.4)
  const split = Math.round((rect.x + rect.width / 2) * dpr) / dpr
  if (split <= rect.x || split >= rect.x + rect.width) return
  ctx.save()
  ctx.globalAlpha *= 0.68
  const bands = 8
  let top = rect.y
  for (let band = 0; band < bands; band++) {
    const bottom = Math.round((rect.y + (band + 1) * rect.height / bands) * dpr) / dpr
    if (band > 0 && band < bands - 1 && bottom > top) {
      const v = (band + 0.5) / bands
      const bend = Math.sin(phase + v * 5.3 + drift) * Math.sin(Math.PI * v)
      // Shift the source midpoint, stretching the two halves to fixed outer edges.
      const left = source.w * (0.5 + 0.07 * bend)
      const sy = source.sy + band * source.h / bands
      ctx.drawImage(image, source.sx, sy, left, source.h / bands,
        rect.x, top, split - rect.x, bottom - top)
      ctx.drawImage(image, source.sx + left, sy, source.w - left, source.h / bands,
        split, top, rect.x + rect.width - split, bottom - top)
    }
    top = bottom
  }
  ctx.restore()
}
