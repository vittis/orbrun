import {
  cellKey, emptyScene, minibarRects, shadeOf,
  type Billboard, type Camera, type CellKey, type MapRenderer, type Minibars,
  type Scene, type SceneCell, type SceneCursor, type TileSource,
} from '@orbrun/scene'
import { fittedScale, project, unproject, type Projection } from './projection.js'
import { drawTile, TileCache, type Context2d, type Layer } from './tiles.js'
import { lightingFor, type Light, type LightPool } from './lighting.js'

export { fittedScale, project, unproject } from './projection.js'

export interface Render25dOptions {
  /** Camera elevation above the ground, in degrees. */
  tilt?: number
  /** 1 fits the full field of view; higher values trade coverage for detail. */
  zoom?: number
  /** Animated atmosphere, automatically disabled by the app for reduced motion. */
  animate?: boolean
  center?: { x: number; y: number } | null
  minibars?: Minibars | null
  filterScaling?: boolean
}

interface Hit { key: CellKey; left: number; top: number; right: number; bottom: number }
type Standing = { cell: SceneCell; billboard?: Billboard; depth: number }

/**
 * A separate presentation of Scene, not a filter over another renderer.
 * Ground → contact shadows → depth-sorted walls/sprites → markers → atmosphere.
 * One projection owns both drawing and picking. No game/protocol dependencies.
 */
export class Render25d implements MapRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null
  private ctx: Context2d | null = null
  private scene = emptyScene()
  private revision = -1
  private lighting = new Map<CellKey, Light>()
  private lightPools: LightPool[] = []
  private cursor: SceneCursor | null = null
  private tiles = new TileCache()
  private width = 1
  private height = 1
  private dpr = 1
  private cells: SceneCell[] = []
  private standing: Standing[] = []
  private hits: Hit[] = []
  private active = false
  private opts: Required<Render25dOptions> = {
    tilt: 50, zoom: 1, animate: true, center: null, minibars: null, filterScaling: false,
  }

  constructor(options: Render25dOptions = {}) { this.setOptions(options) }

  setOptions(options: Render25dOptions) {
    Object.assign(this.opts, options)
    this.opts.tilt = Number.isFinite(this.opts.tilt) ? Math.max(30, Math.min(75, this.opts.tilt)) : 50
    this.opts.zoom = Number.isFinite(this.opts.zoom) ? Math.max(0.6, Math.min(1.6, this.opts.zoom)) : 1
  }

  get animating() { return this.opts.animate && this.active }

  mount(target: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = target
    this.ctx = target.getContext('2d') as Context2d | null
    if (!this.ctx) throw new Error('The 2.5D renderer needs a Canvas 2D context')
  }

  setTiles(source: TileSource) {
    if (source === this.tiles.source) return
    this.tiles.source = source
    this.tiles.clear()
  }

  setScene(scene: Scene) {
    if (scene === this.scene && scene.revision === this.revision) return
    this.scene = scene
    this.revision = scene.revision
    const lighting = lightingFor(scene)
    this.lighting = lighting.field
    this.lightPools = lighting.pools
    // Never render effects or entities in unseen cells, even if a producer supplies them.
    this.cells = [...scene.cells.values()].filter(c => c.visibility !== 'unseen' && c.kind !== 'unknown')
    this.standing = []
    const cloudCells = new Set(scene.billboards.filter(b => b.kind === 'cloud').map(b => cellKey(b.x, b.y)))
    for (const cell of this.cells) {
      if (cell.occluder || this.upright(cell)) this.standing.push({ cell, depth: cell.y + (cell.occluder ? 0.5 : 0.25) })
      if (cell.cloud !== undefined && !cloudCells.has(cellKey(cell.x, cell.y))) this.standing.push({ cell, depth: cell.y + 0.4, billboard: { x: cell.x, y: cell.y, tile: cell.cloud, kind: 'cloud', height: 1, alpha: 0.7 } })
    }
    for (const billboard of scene.billboards) {
      const cell = scene.cells.get(cellKey(billboard.x, billboard.y))
      if (cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown') this.standing.push({ cell, billboard, depth: billboard.y + 0.3 + (billboard.kind === 'cloud' ? 0.1 : 0) })
    }
    this.standing.sort((a, b) => a.depth - b.depth || a.cell.x - b.cell.x)
  }

  // The server view centre owns this north-up camera; first-person look never rotates it.
  setCamera(_camera: Camera) {}
  setCursor(cursor: SceneCursor | null) { this.cursor = cursor }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.dpr = Math.max(1, Math.min(2, dpr))
    if (this.canvas) {
      this.canvas.width = Math.round(this.width * this.dpr)
      this.canvas.height = Math.round(this.height * this.dpr)
    }
  }

  private projection(): Projection {
    const tilt = this.opts.tilt * Math.PI / 180
    // Server view centre also follows a targeting cursor outside the player's LOS.
    const center = this.opts.center ?? this.scene.player
    return { x: center.x, y: center.y, width: this.width, height: this.height, tilt, scale: fittedScale(this.width, this.height, tilt, this.opts.zoom) }
  }

  private upright(cell: SceneCell) {
    return cell.featureTile !== undefined && (cell.stance === 'upright' || cell.freestanding || cell.feature?.type === 'door')
  }

  private inFrame(p: Projection, cell: SceneCell) {
    const q = project(p, cell.x, cell.y)
    return q.x > -p.scale * 2 && q.x < this.width + p.scale * 2 && q.y > -p.scale * 2 && q.y < this.height + p.scale * 2
  }

  private light(cell: SceneCell) {
    const tint = this.scene.level.tint
    return Math.min(1, shadeOf(cell, this.scene) * 1.12 * (tint.r + tint.g + tint.b) / 3)
  }

  private tile(ctx: Context2d, layers: Layer[], cell: SceneCell, x: number, y: number, size: number, illuminate = true) {
    return this.tiles.draw(ctx, layers, x, y, size, this.light(cell), cell.visibility !== 'visible', cell.flash, illuminate ? this.lighting.get(cellKey(cell.x, cell.y)) : undefined)
  }

  private plane(ctx: Context2d, p: Projection, cell: SceneCell, layers: Layer[], z = 0, illuminate = true) {
    const q = project(p, cell.x - 0.5, cell.y - 0.5, z)
    ctx.save()
    ctx.translate(q.x, q.y)
    ctx.scale(1, Math.sin(p.tilt))
    this.tile(ctx, layers, cell, 0, 0, p.scale, illuminate)
    ctx.restore()
  }

  render(now = performance.now() / 1000) {
    const ctx = this.ctx
    if (!ctx) return
    const time = this.opts.animate ? now : 0
    const p = this.projection(), s = p.scale, sy = Math.sin(p.tilt)
    this.active = false
    this.hits = []
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = this.opts.filterScaling
    ctx.fillStyle = '#080c13'
    ctx.fillRect(0, 0, this.width, this.height)
    const cells = this.cells.filter(c => this.inFrame(p, c))

    for (const cell of cells) {
      const q = project(p, cell.x - 0.5, cell.y - 0.5)
      ctx.fillStyle = cell.flags.lava ? '#75351b' : cell.flags.water ? '#193c50' : '#353538'
      ctx.fillRect(q.x, q.y, s + 0.5, s * sy + 0.5)
      const layers: Layer[] = [{ tile: cell.floorTile }, ...(cell.underlays ?? []).map(tile => ({ tile }))]
      if (!cell.occluder && !this.upright(cell) && cell.featureTile !== undefined) layers.push({ tile: cell.featureTile })
      layers.push(...(cell.overlays ?? []).map(tile => ({ tile })))
      this.plane(ctx, p, cell, layers, 0, false)
      if (!this.tiles.source) {
        ctx.fillStyle = cell.visibility === 'visible' ? '#d7d5c8' : '#788190'
        ctx.font = `${s * 0.65}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(cell.glyph ?? (cell.occluder ? '#' : '·'), q.x + s / 2, q.y + s * sy * 0.8)
      }
      if (cell.visibility !== 'visible') {
        ctx.fillStyle = 'rgba(12,22,40,0.28)'
        ctx.fillRect(q.x, q.y, s, s * sy)
      } else {
        this.environment(ctx, p, cell, time)
      }
      if (cell.flash && !this.tiles.source) {
        const f = cell.flash
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.a / 255})`
        ctx.fillRect(q.x, q.y, s, s * sy)
      }
      if (this.cursor?.grid) {
        ctx.strokeStyle = 'rgba(185,201,218,0.18)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(q.x, q.y, s, s * sy)
      }
    }

    this.groundLights(ctx, p)

    // Shadows lie on the ground; no sprite's shadow is painted over another sprite.
    for (const entry of this.standing) {
      if (!this.inFrame(p, entry.cell)) continue
      const q = project(p, entry.cell.x, entry.cell.y + 0.28)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.beginPath()
      ctx.ellipse(q.x + s * 0.06, q.y, s * (entry.cell.occluder ? 0.47 : 0.28), s * sy * 0.14, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    for (const entry of this.standing) {
      if (!this.inFrame(p, entry.cell)) continue
      if (entry.billboard) this.actor(ctx, p, entry.cell, entry.billboard, time)
      else if (entry.cell.occluder) this.wall(ctx, p, entry.cell)
      else this.actor(ctx, p, entry.cell, { x: entry.cell.x, y: entry.cell.y, tile: entry.cell.featureTile!, height: 1, kind: 'doll', scenery: true }, time)
    }

    // Travel, exclusion and targeting information must remain readable over depth/effects.
    for (const cell of cells) {
      const q = project(p, cell.x - 0.5, cell.y - 0.5)
      for (const tile of cell.icons ?? []) drawTile(ctx, this.tiles.source, { tile }, q.x, q.y, s)
      if (cell.flags.excluded) {
        ctx.strokeStyle = '#ee776b'
        ctx.lineWidth = 1
        ctx.strokeRect(q.x + 2, q.y + 2, s - 4, s * sy - 4)
      }
      if (cell.flags.outOfRange) {
        ctx.fillStyle = 'rgba(10,13,21,0.24)'
        ctx.fillRect(q.x, q.y, s, s * sy)
      }
    }
    if (this.cursor) {
      const cell = this.scene.cells.get(cellKey(this.cursor.x, this.cursor.y))
      if (cell && cell.visibility !== 'unseen') {
        const q = project(p, cell.x - 0.5, cell.y - 0.5)
        ctx.strokeStyle = this.cursor.mode === 'target' ? '#ffc278' : '#bce5ec'
        ctx.lineWidth = 2
        ctx.strokeRect(q.x + 1, q.y + 1, s - 2, s * sy - 2)
        if (this.cursor.tile !== undefined) drawTile(ctx, this.tiles.source, { tile: this.cursor.tile }, q.x, q.y - s * (1 - sy), s)
      }
    }
    const vignette = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.3, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.65)
    vignette.addColorStop(0, 'rgba(3,7,15,0)')
    vignette.addColorStop(1, 'rgba(3,7,15,0.48)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, this.width, this.height)
  }

  private groundLights(ctx: Context2d, p: Projection) {
    for (const { source, cells } of this.lightPools) {
      const q = project(p, source.x, source.y), s = p.scale, sy = Math.sin(p.tilt)
      if (q.x + source.radius * s < 0 || q.x - source.radius * s > this.width || q.y + source.radius * s < 0 || q.y - source.radius * s > this.height) continue
      ctx.save()
      ctx.beginPath()
      for (const cell of cells) {
        const corner = project(p, cell.x - 0.5, cell.y - 0.5)
        ctx.rect(corner.x, corner.y, s + 0.1, s * sy + 0.1)
      }
      ctx.clip()
      ctx.translate(q.x, q.y)
      ctx.scale(1, sy)
      const radius = source.radius * s
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      gradient.addColorStop(0, `rgba(${source.colour.join(',')},${source.power * 0.6})`)
      gradient.addColorStop(0.45, `rgba(${source.colour.join(',')},${source.power * 0.15})`)
      gradient.addColorStop(1, `rgba(${source.colour.join(',')},0)`)
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = gradient
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
      ctx.restore()
    }
  }

  private wall(ctx: Context2d, p: Projection, cell: SceneCell) {
    const s = p.scale, sy = Math.sin(p.tilt)
    // Cut foreground walls down beside known open ground, so actors behind them stay readable.
    const behind = this.scene.cells.get(cellKey(cell.x, cell.y - 1))
    const height = behind?.visibility === 'visible' && !behind.occluder ? 0.18 : 0.58
    const lift = height * s * Math.cos(p.tilt)
    const q = project(p, cell.x - 0.5, cell.y - 0.5)
    const tile = cell.wallTile ?? cell.featureTile ?? cell.floorTile
    ctx.save()
    if (cell.wallStyle === 'transparent') ctx.globalAlpha = 0.65
    // Texture the vertical face independently from the roof.
    ctx.save()
    ctx.translate(q.x, q.y + s * sy - lift)
    ctx.scale(1, lift / s)
    ctx.fillStyle = '#343039'
    ctx.fillRect(0, 0, s, s)
    this.tile(ctx, [{ tile: cell.faceTiles?.s ?? tile }, ...(cell.wallOverlays ?? []).map(tile => ({ tile }))], cell, 0, 0, s)
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.fillRect(0, 0, s, s)
    ctx.restore()
    this.plane(ctx, p, cell, [{ tile }], height)
    ctx.strokeStyle = 'rgba(220,221,207,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(q.x + 0.5, q.y - lift + 0.5, s - 1, s * sy - 1)
    ctx.restore()
    this.hits.push({ key: cellKey(cell.x, cell.y), left: q.x, right: q.x + s, top: q.y - lift, bottom: q.y + s * sy })
  }

  private actor(ctx: Context2d, p: Projection, cell: SceneCell, b: Billboard, time: number) {
    const s = p.scale, visible = cell.visibility === 'visible'
    const creature = b.kind === 'player' || b.kind === 'monster' && !b.scenery
    const cloud = b.kind === 'cloud'
    if (visible && (creature || cloud)) this.active = true
    const phase = b.x * 2.31 + b.y * 1.73
    const breath = this.opts.animate && visible && creature ? Math.sin(time * 2.2 + phase) * 0.012 : 0
    const q = project(p, b.x, b.y + 0.3)
    const size = s * (b.kind === 'item' ? 0.7 : Math.max(0.6, Math.min(1.25, creature ? b.height / 0.7 : b.height)))
    const x = q.x - size / 2 + (cloud ? Math.sin((visible ? time : 0) * 0.6 + phase) * s * 0.035 : 0)
    const y = q.y - size - (cloud ? s * 0.15 : 0)
    ctx.save()
    ctx.globalAlpha = (b.alpha ?? 1) * (cloud ? 0.75 : 1)
    if (b.lying || b.kind === 'item') {
      this.plane(ctx, p, cell, b.layers ?? [{ tile: b.tile }], 0.02)
    } else {
      if (b.kind === 'player' || b.attitude === 'friendly') {
        ctx.strokeStyle = b.kind === 'player' ? '#e3c88a' : '#8bd0ab'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(q.x, q.y - 1, s * 0.34, s * 0.13, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.translate(x, q.y)
      ctx.scale(1, 1 + breath)
      if (!this.tile(ctx, b.layers ?? [{ tile: b.tile }], cell, 0, y - q.y, size)) {
        ctx.fillStyle = b.kind === 'player' ? '#fff0ba' : '#e5c4ae'
        ctx.font = `${size * 0.75}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(b.kind === 'player' ? '@' : cell.glyph ?? '?', size / 2, -size * 0.1)
      }
    }
    ctx.restore()
    if (!cloud && !b.lying && b.kind !== 'item') this.hits.push({ key: cellKey(cell.x, cell.y), left: x + size * 0.12, right: x + size * 0.88, top: y, bottom: q.y })
    // Badges and bars stay upright and do not breathe, so tiny text never shimmers.
    for (const icon of b.statusIcons ?? []) drawTile(ctx, this.tiles.source, icon, q.x - s / 2, q.y - s, s)
    if (b.kind === 'player' && this.opts.minibars) {
      for (const bar of minibarRects(this.opts.minibars)) {
        ctx.fillStyle = bar.colour
        ctx.globalAlpha = bar.alpha
        ctx.fillRect(q.x - s / 2 + bar.x * s / 32, q.y - s - 5 + bar.y * s / 32, bar.w * s / 32, bar.h * s / 32)
      }
      ctx.globalAlpha = 1
    }
  }

  private environment(ctx: Context2d, p: Projection, cell: SceneCell, time: number) {
    const s = p.scale, sy = Math.sin(p.tilt), q = project(p, cell.x, cell.y)
    const lava = cell.flags.lava, water = cell.flags.water
    const portal = cell.feature?.type === 'portal' || cell.feature?.type === 'transporter' || cell.feature?.type === 'altar'
    if (!lava && !water && !portal) return
    this.active = true
    const phase = cell.x * 1.31 + cell.y * 2.17
    ctx.save()
    ctx.beginPath()
    ctx.rect(q.x - s / 2, q.y - s * sy / 2, s, s * sy)
    ctx.clip()
    const pulse = 0.85 + Math.sin(time * 1.7 + phase) * 0.15
    const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, s * 0.8)
    glow.addColorStop(0, lava ? `rgba(255,120,24,${0.32 * pulse})` : portal ? `rgba(115,160,255,${0.28 * pulse})` : 'rgba(72,171,200,0.12)')
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s)
    if (water) {
      ctx.strokeStyle = 'rgba(152,224,238,0.22)'
      ctx.lineWidth = Math.max(0.7, s / 50)
      for (let i = 0; i < 2; i++) {
        const wave = (time * 0.16 + i * 0.5 + phase % 1 + 1) % 1
        ctx.beginPath()
        ctx.ellipse(q.x, q.y, s * wave * 0.65, s * sy * wave * 0.28, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()
    if (lava || portal) {
      ctx.fillStyle = lava ? '#ffd38b' : '#c6deff'
      for (let i = 0; i < 3; i++) {
        const life = (time * 0.25 + i / 3 + (phase % 1 + 1)) % 1
        ctx.globalAlpha = Math.sin(life * Math.PI) * 0.65
        ctx.fillRect(q.x + Math.sin(phase + i * 8) * s * 0.3, q.y - life * s * 0.5, Math.max(1, s / 30), Math.max(1, s / 30))
      }
      ctx.globalAlpha = 1
    }
  }

  pick(px: number, py: number): CellKey | null {
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return null
    // Resolve visible raised surfaces front-to-back before falling back to the ground.
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]
      if (px >= h.left && px < h.right && py >= h.top && py < h.bottom) return h.key
    }
    const q = unproject(this.projection(), px, py)
    const key = cellKey(Math.floor(q.x + 0.5), Math.floor(q.y + 0.5))
    const cell = this.scene.cells.get(key)
    return cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown' ? key : null
  }

  destroy() {
    this.tiles.clear()
    this.tiles.source = null
    this.canvas = null
    this.ctx = null
    this.scene = emptyScene()
    this.revision = -1
    this.cells = []
    this.standing = []
    this.hits = []
    this.lighting.clear()
    this.lightPools = []
    this.active = false
  }
}
