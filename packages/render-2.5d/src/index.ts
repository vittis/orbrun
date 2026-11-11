import {
  cellKey, emptyScene, minibarRects,
  type Billboard, type Camera, type CellKey, type MapRenderer, type Minibars,
  type Scene, type SceneCell, type SceneCursor, type TileSource,
} from '@orbrun/scene'
import { fittedScale, planeRect, project, unproject, type Projection } from './projection.js'
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

  project(x: number, y: number, height = 0) {
    return project(this.projection(), x, y, height)
  }

  private inFrame(p: Projection, cell: SceneCell) {
    const q = project(p, cell.x, cell.y)
    return q.x > -p.scale * 2 && q.x < this.width + p.scale * 2 && q.y > -p.scale * 2 && q.y < this.height + p.scale * 2
  }

  private light() {
    const tint = this.scene.level.tint
    // LOS determines brightness; distance from the player adds no spotlight.
    // The tile cache applies the same memory veil to terrain and standing art.
    return Math.min(1, 0.9 * (tint.r + tint.g + tint.b) / 3)
  }

  private tile(ctx: Context2d, layers: Layer[], cell: SceneCell, x: number, y: number, size: number, illuminate = true) {
    return this.tiles.draw(ctx, layers, x, y, size, this.light(), cell.visibility !== 'visible', cell.flash, illuminate ? this.lighting.get(cellKey(cell.x, cell.y)) : undefined)
  }

  private plane(ctx: Context2d, p: Projection, cell: SceneCell, layers: Layer[], z = 0, illuminate = true) {
    const rect = planeRect(p, cell.x, cell.y, z, this.dpr)
    // Uniform ambient light keeps the LOS boundary distinct from environmental glows.
    const tint = this.scene.level.tint
    const ambient = 0.86 * (tint.r + tint.g + tint.b) / 3
    return this.tiles.drawPlane(ctx, layers, rect, ambient, cell.visibility !== 'visible', cell.flash, illuminate ? this.lighting.get(cellKey(cell.x, cell.y)) : undefined)
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
    this.unexploredFog(ctx, p)
    const cells = this.cells.filter(c => this.inFrame(p, c))

    for (const cell of cells) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      const q = { x: rect.x, y: rect.y }
      ctx.fillStyle = cell.flags.lava ? '#75351b' : cell.flags.water ? '#193c50' : '#353538'
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      const layers: Layer[] = [{ tile: cell.floorTile }, ...(cell.underlays ?? []).map(tile => ({ tile }))]
      if (!cell.occluder && !this.upright(cell) && cell.featureTile !== undefined) layers.push({ tile: cell.featureTile })
      layers.push(...(cell.overlays ?? []).filter(tile => !cell.wallShadows?.includes(tile)).map(tile => ({ tile })))
      this.plane(ctx, p, cell, layers, 0, false)
      if (!this.tiles.source) {
        ctx.fillStyle = '#d7d5c8'
        ctx.font = `${s * 0.65}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(cell.glyph ?? (cell.occluder ? '#' : '·'), q.x + s / 2, q.y + s * sy * 0.8)
      }
      if (cell.visibility !== 'visible') {
        if (!this.tiles.source) {
          ctx.fillStyle = 'rgba(0,0,0,0.56)'
          ctx.fillRect(q.x, q.y, s, s * sy)
        }
      }
      if (cell.flash && !this.tiles.source) {
        const f = cell.flash
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.a / 255})`
        ctx.fillRect(q.x, q.y, s, s * sy)
      }
    }

    this.groundLights(ctx, p)
    this.waterSurface(ctx, p, cells, time)
    for (const cell of cells) if (cell.visibility === 'visible') this.environment(ctx, p, cell, time)
    this.wallShadows(ctx, p, cells)

    // Shadows lie on the ground; no sprite's shadow is painted over another sprite.
    for (const entry of this.standing) {
      if (!this.inFrame(p, entry.cell)) continue
      if (entry.cell.occluder) continue
      const q = project(p, entry.cell.x, entry.cell.y + 0.28)
      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.scale(1, sy * 0.3)
      const radius = s * (entry.billboard?.kind === 'item' ? 0.3 : 0.43)
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      shadow.addColorStop(0, 'rgba(0,0,0,0.38)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
      ctx.restore()
    }

    for (const entry of this.standing) {
      if (!this.inFrame(p, entry.cell)) continue
      if (entry.billboard) this.actor(ctx, p, entry.cell, entry.billboard, time)
      else if (entry.cell.occluder) this.wall(ctx, p, entry.cell)
      else this.actor(ctx, p, entry.cell, { x: entry.cell.x, y: entry.cell.y, tile: entry.cell.featureTile!, height: 1, kind: 'doll', scenery: true }, time)
    }

    this.memoryFog(ctx, p, cells, time)

    // Travel, exclusion and targeting information must remain readable over depth/effects.
    for (const cell of cells) {
      const q = project(p, cell.x - 0.5, cell.y - 0.5)
      for (const tile of cell.icons ?? []) {
        // Item cursors frame the upright atlas art. Travel/exclusion/stair
        // badges retain their ground anchor, even when sharing an item cell.
        if (tile === cell.cursorTile && this.standing.some(entry => entry.cell === cell && entry.billboard?.kind === 'item' && !entry.billboard.lying)) {
          const item = project(p, cell.x, cell.y + 0.3)
          drawTile(ctx, this.tiles.source, { tile }, item.x - s / 2, item.y - s, s)
        } else drawTile(ctx, this.tiles.source, { tile }, q.x, q.y, s)
      }
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
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,0,0,0.48)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, this.width, this.height)
  }

  /** Neutral, world-anchored mist behind known geometry; uses no hidden map data.
   * Static wisps also preserve still mode and let an idle scene sleep. */
  private unexploredFog(ctx: Context2d, p: Projection) {
    ctx.fillStyle = '#030404'
    ctx.fillRect(0, 0, this.width, this.height)
    const sy = Math.sin(p.tilt), step = 4
    const left = Math.floor((p.x - this.width / p.scale / 2) / step) * step - step
    const right = p.x + this.width / p.scale / 2 + step
    const top = Math.floor((p.y - this.height / (p.scale * sy) / 2) / step) * step - step
    const bottom = p.y + this.height / (p.scale * sy) / 2 + step
    ctx.save()
    ctx.scale(1, sy)
    for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) {
      const phase = x * 1.31 + y * 2.17
      const q = project(p, x + Math.sin(phase) * 1.2, y + Math.cos(phase) * 0.8)
      const cy = q.y / sy, radius = p.scale * (2.8 + Math.sin(phase * 1.7) * 0.6)
      const mist = ctx.createRadialGradient(q.x, cy, 0, q.x, cy, radius)
      mist.addColorStop(0, 'rgba(44,45,43,0.18)')
      mist.addColorStop(0.45, 'rgba(35,36,34,0.065)')
      mist.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = mist
      ctx.fillRect(q.x - radius, cy - radius, radius * 2, radius * 2)
    }
    ctx.restore()
  }

  private groundLights(ctx: Context2d, p: Projection) {
    for (const { source, cells } of this.lightPools) {
      const q = project(p, source.x, source.y), s = p.scale, sy = Math.sin(p.tilt)
      if (q.x + source.radius * s < 0 || q.x - source.radius * s > this.width || q.y + source.radius * s < 0 || q.y - source.radius * s > this.height) continue
      ctx.save()
      ctx.beginPath()
      for (const cell of cells) {
        const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
        ctx.rect(rect.x, rect.y, rect.width, rect.height)
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

  private waterSurface(ctx: Context2d, p: Projection, cells: SceneCell[], time: number) {
    const water = cells.filter(cell => cell.visibility === 'visible' && cell.flags.water && !cell.occluder)
    if (!water.length) return
    this.active = true
    ctx.save()
    ctx.beginPath()
    for (const cell of water) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      ctx.rect(rect.x, rect.y, rect.width, rect.height)
    }
    ctx.clip()
    const left = Math.min(...water.map(cell => cell.x)) - 1, right = Math.max(...water.map(cell => cell.x)) + 1
    const top = Math.min(...water.map(cell => cell.y)) - 1, bottom = Math.max(...water.map(cell => cell.y)) + 1
    ctx.strokeStyle = 'rgba(152,224,238,0.16)'
    ctx.lineWidth = Math.max(0.7, p.scale / 65)
    // One world-space wave field across the whole surface; no per-tile clipping edges.
    for (let y = top; y <= bottom; y += 0.65) {
      ctx.beginPath()
      for (let x = left; x <= right; x += 0.25) {
        const wave = Math.sin(x * 1.7 + time * 0.9 + y) * 0.07 + Math.sin(x * 0.8 - time * 0.4) * 0.04
        const q = project(p, x, y + wave)
        if (x === left) ctx.moveTo(q.x, q.y)
        else ctx.lineTo(q.x, q.y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  private wallShadows(ctx: Context2d, p: Projection, cells: SceneCell[]) {
    for (const cell of cells) {
      if (cell.occluder) continue
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      const north = this.scene.cells.get(cellKey(cell.x, cell.y - 1))
      const west = this.scene.cells.get(cellKey(cell.x - 1, cell.y))
      if (north?.occluder && north.visibility !== 'unseen') {
        const depth = rect.height * 0.34
        const shadow = ctx.createLinearGradient(0, rect.y, 0, rect.y + depth)
        shadow.addColorStop(0, 'rgba(0,0,0,0.3)')
        shadow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = shadow
        ctx.fillRect(rect.x, rect.y, rect.width, depth)
      }
      if (west?.occluder && west.visibility !== 'unseen') {
        const depth = rect.width * 0.22
        const shadow = ctx.createLinearGradient(rect.x, 0, rect.x + depth, 0)
        shadow.addColorStop(0, 'rgba(0,0,0,0.18)')
        shadow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = shadow
        ctx.fillRect(rect.x, rect.y, depth, rect.height)
      }
    }
  }

  private memoryFog(ctx: Context2d, p: Projection, cells: SceneCell[], time: number) {
    const memory = cells.filter(cell => cell.visibility === 'remembered')
    if (!memory.length) return
    ctx.save()
    ctx.beginPath()
    for (const cell of memory) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      ctx.rect(rect.x, rect.y, rect.width, rect.height)
    }
    ctx.clip()
    for (const cell of memory) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const neighbour = this.scene.cells.get(cellKey(cell.x + dx, cell.y + dy))
        if (neighbour && neighbour.visibility !== 'unseen' && neighbour.kind !== 'unknown') continue
        const x = rect.x + rect.width * (dx > 0 ? 1 : dx < 0 ? 0 : 0.5)
        const y = rect.y + rect.height * (dy > 0 ? 1 : dy < 0 ? 0 : 0.5)
        const edge = ctx.createLinearGradient(x, y, x - dx * rect.width * 0.28, y - dy * rect.height * 0.28)
        edge.addColorStop(0, 'rgba(0,0,0,0.28)')
        edge.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = edge
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
    }
    // Broad, world-anchored wisps cross tile boundaries instead of outlining cells.
    const left = Math.floor(Math.min(...memory.map(c => c.x)) / 4) * 4
    const right = Math.max(...memory.map(c => c.x)) + 4
    const top = Math.floor(Math.min(...memory.map(c => c.y)) / 4) * 4
    const bottom = Math.max(...memory.map(c => c.y)) + 4
    ctx.scale(1, Math.sin(p.tilt))
    for (let y = top; y <= bottom; y += 4) for (let x = left; x <= right; x += 4) {
      const phase = x * 1.31 + y * 2.17
      const q = project(p, x + Math.sin(time * 0.14 + phase) * 0.6, y + Math.cos(time * 0.11 + phase) * 0.4)
      const cy = q.y / Math.sin(p.tilt), radius = p.scale * 2.8
      const mist = ctx.createRadialGradient(q.x, cy, 0, q.x, cy, radius)
      mist.addColorStop(0, 'rgba(0,0,0,0.065)')
      mist.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = mist
      ctx.fillRect(q.x - radius, cy - radius, radius * 2, radius * 2)
    }
    ctx.restore()
    this.active = true
  }

  private wall(ctx: Context2d, p: Projection, cell: SceneCell) {
    // Cut foreground walls down beside known open ground, so actors behind them stay readable.
    const behind = this.scene.cells.get(cellKey(cell.x, cell.y - 1))
    const height = behind?.visibility === 'visible' && !behind.occluder ? 0.18 : 0.58
    const roof = planeRect(p, cell.x, cell.y, height, this.dpr)
    const ground = planeRect(p, cell.x, cell.y, 0, this.dpr)
    const tile = cell.wallTile ?? cell.featureTile ?? cell.floorTile
    ctx.save()
    if (cell.wallStyle === 'transparent') ctx.globalAlpha = 0.65
    // Texture the vertical face independently from the roof.
    const face = { x: roof.x, y: roof.y + roof.height, width: roof.width, height: ground.y + ground.height - roof.y - roof.height }
    ctx.fillStyle = '#343039'
    ctx.fillRect(face.x, face.y, face.width, face.height)
    this.tiles.drawPlane(ctx, [{ tile: cell.faceTiles?.s ?? tile }, ...(cell.wallOverlays ?? []).map(tile => ({ tile }))], face, this.light(), cell.visibility !== 'visible', cell.flash, this.lighting.get(cellKey(cell.x, cell.y)))
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.fillRect(face.x, face.y, face.width, face.height)
    this.plane(ctx, p, cell, [{ tile }], height)
    ctx.restore()
    this.hits.push({ key: cellKey(cell.x, cell.y), left: roof.x, right: roof.x + roof.width, top: roof.y, bottom: ground.y + ground.height })
  }

  private actor(ctx: Context2d, p: Projection, cell: SceneCell, b: Billboard, time: number) {
    const s = p.scale, visible = cell.visibility === 'visible'
    const creature = b.kind === 'player' || b.kind === 'monster' && !b.scenery
    const cloud = b.kind === 'cloud'
    if (visible && (creature || cloud)) this.active = true
    const phase = b.x * 2.31 + b.y * 1.73
    const breath = this.opts.animate && visible && creature ? Math.sin(time * 2.2 + phase) * 0.012 : 0
    const q = project(p, b.x, b.y + 0.3)
    // The atlas already encodes a rat's size relative to an ogre. First-person
    // billboard heights shrink that art a second time and must not scale it here.
    const size = s
    const x = q.x - size / 2 + (cloud ? Math.sin((visible ? time : 0) * 0.6 + phase) * s * 0.035 : 0)
    const y = q.y - size - (cloud ? s * 0.15 : 0)
    ctx.save()
    ctx.globalAlpha = (b.alpha ?? 1) * (cloud ? 0.75 : 1)
    if (b.lying) {
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
    if (visible && b.kind === 'doll' && cell.feature?.type === 'fountain' && !/dry/.test(cell.feature.kind)) this.fountain(ctx, p, cell, time)
    if (!cloud && !b.lying) this.hits.push({ key: cellKey(cell.x, cell.y), left: x + size * 0.12, right: x + size * 0.88, top: y, bottom: q.y })
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

  private fountain(ctx: Context2d, p: Projection, cell: SceneCell, time: number) {
    this.active = true
    const q = project(p, cell.x, cell.y + 0.3), s = p.scale
    const phase = cell.x * 1.31 + cell.y * 2.17
    ctx.save()
    ctx.lineWidth = Math.max(0.7, s / 60)
    for (let i = 0; i < 2; i++) {
      const life = (time * 0.45 + i * 0.5 + phase % 1 + 1) % 1
      ctx.strokeStyle = `rgba(170,239,245,${0.32 * Math.sin(life * Math.PI)})`
      ctx.beginPath()
      ctx.ellipse(q.x, q.y - s * 0.12, s * (0.08 + life * 0.21), s * (0.025 + life * 0.04), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  private environment(ctx: Context2d, p: Projection, cell: SceneCell, time: number) {
    const s = p.scale, q = project(p, cell.x, cell.y)
    const lava = cell.flags.lava
    const portal = cell.feature?.type === 'portal' || cell.feature?.type === 'transporter' || cell.feature?.type === 'altar'
    if (!lava && !portal) return
    this.active = true
    const phase = cell.x * 1.31 + cell.y * 2.17
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
    const x = Math.floor(q.x + 0.5), y = Math.floor(q.y + 0.5)
    const p = this.projection()
    // Raster alignment can move a shared edge by half a device pixel. Test
    // the adjacent ground quads so clicking that strip picks what was drawn.
    for (const dy of [0, -1, 1]) for (const dx of [0, -1, 1]) {
      const key = cellKey(x + dx, y + dy)
      const cell = this.scene.cells.get(key)
      if (!cell || cell.visibility === 'unseen' || cell.kind === 'unknown') continue
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      if (px >= rect.x && px < rect.x + rect.width && py >= rect.y && py < rect.y + rect.height) return key
    }
    return null
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
