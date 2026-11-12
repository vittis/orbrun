import { cellKey, type Scene } from '@orbrun/scene'
import { DEATH_ART, DEATH_TEXELS, deathDither, deathPixelColour } from './death-art.js'
import type { DeathParticle } from './death.js'
import { groundDepth, planeRect, project, type Projection } from './projection.js'
import type { Context2d } from './tiles.js'

/** Cache small shaded stamps, then enlarge whole texels just like the tile art. */
export class DeathArt {
  private cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>()

  draw(ctx: Context2d, p: Projection, scene: Scene, particle: DeathParticle, dpr: number) {
    const turn = ((Math.round(particle.angle / (Math.PI / 2)) % 4) + 4) % 4
    const fade = Math.ceil(particle.alpha * 16)
    const key = `${particle.sprite}:${particle.colour.join(',')}:${turn}:${fade}`
    let stamp = this.cache.get(key)
    if (!stamp) {
      const n = DEATH_TEXELS
      stamp = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n)
        : Object.assign(document.createElement('canvas'), { width: n, height: n })
      const ink = stamp.getContext('2d') as Context2d | null
      if (!ink) return
      DEATH_ART[particle.sprite].forEach((row, y) => {
        for (let x = 0; x < n; x++) {
          const shade = Number(row[x])
          if (!shade || fade / 16 <= deathDither(x, y)) continue
          ink.fillStyle = `rgb(${deathPixelColour(shade, particle.colour).join(',')})`
          const rx = turn === 0 ? x : turn === 1 ? y : turn === 2 ? n - 1 - x : n - 1 - y
          const ry = turn === 0 ? y : turn === 1 ? n - 1 - x : turn === 2 ? n - 1 - y : x
          ink.fillRect(rx, ry, 1, 1)
        }
      })
      if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!)
      this.cache.set(key, stamp)
    }
    const q = project(p, particle.x, particle.y, particle.z)
    const minimum = particle.minPixels ? particle.minPixels * dpr : 2
    const width = Math.max(minimum, Math.round(particle.size * 2 * p.scale * particle.stretch * dpr)) / dpr
    const height = Math.max(minimum, Math.round(particle.size * 2 * p.scale * (particle.ground ? groundDepth(p.tilt) : 1) * dpr)) / dpr
    ctx.save()
    if (particle.ground) {
      ctx.beginPath()
      const cx = Math.round(particle.x), cy = Math.round(particle.y)
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        const cell = scene.cells.get(cellKey(x, y))
        if (cell?.visibility !== 'visible' || cell.occluder) continue
        const rect = planeRect(p, x, y, 0, dpr)
        ctx.rect(rect.x, rect.y, rect.width, rect.height)
      }
      ctx.clip()
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(stamp, Math.round((q.x - width / 2) * dpr) / dpr, Math.round((q.y - height / 2) * dpr) / dpr, width, height)
    ctx.restore()
  }

  clear() { this.cache.clear() }
}
