import {
  cellKey, emptyScene, minibarRects, DungeonLife, livingPose, type DeathEffect,
  type Billboard, type Camera, type CellKey, type MapRenderer, type Minibars,
  type Scene, type SceneCell, type SceneCursor, type TileSource, type MeleeAttack, type Emitter, type SpellEffect,
} from '@orbrun/scene'
import { fittedScale, groundDepth, planeRect, project, unproject, type Projection } from './projection.js'
import { drawTile, TileCache, type Context2d, type Layer, type SurfaceLighting } from './tiles.js'
import { DungeonLighting, glowCenter } from './lighting.js'
import { DungeonMovement, type MovementEasing } from './movement.js'
import { DungeonEffects, type SpellBurst } from './effects.js'
import { drawMelee, drawSpellTrace, drawSpellBurst } from './effects-draw.js'
import { DeathArt } from './death-draw.js'
import { DungeonDeaths, type DeathParticle } from './death.js'
import { drawWallShadows, shadeWallFace, wallHeight } from './wall-depth.js'
import { DungeonVisibility, MEMORY_DARKNESS } from './visibility.js'
import { DungeonArrival } from './arrival.js'

export { fittedScale, project, unproject } from './projection.js'
export type { MovementEasing } from './movement.js'

export interface Render25dOptions {
  /** Camera elevation above the ground, in degrees. */
  tilt?: number
  /** 1 fits the full field of view; higher values trade coverage for detail. */
  zoom?: number
  /** Animated atmosphere, automatically disabled by the app for reduced motion. */
  animate?: boolean
  /** Tween confirmed movement; still/reduced-motion mode also disables this. */
  movement?: boolean
  /** Seconds per move, clamped to 0.04–0.25. Retargets never queue. */
  movementDuration?: number
  /** Monotone curves without overshoot, for readable grid movement. */
  movementEasing?: MovementEasing
  center?: { x: number; y: number } | null
  minibars?: Minibars | null
  filterScaling?: boolean
}

interface Hit { key: CellKey; left: number; top: number; right: number; bottom: number }
type Standing = { cell: SceneCell; billboard?: Billboard; burst?: SpellBurst; death?: DeathParticle; depth: number; x: number; y: number; moving?: boolean }

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
  private lighting = new DungeonLighting()
  private life = new DungeonLife()
  private movement = new DungeonMovement()
  private effects = new DungeonEffects()
  private deaths = new DungeonDeaths()
  private deathArt = new DeathArt()
  private visibility = new DungeonVisibility()
  private arrival = new DungeonArrival()
  private fogField: HTMLCanvasElement | OffscreenCanvas | null = null
  private frameTime = 0
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
    movement: true, movementDuration: 0.1, movementEasing: 'ease-out',
  }

  constructor(options: Render25dOptions = {}) { this.setOptions(options) }

  setOptions(options: Render25dOptions) {
    Object.assign(this.opts, options)
    this.opts.tilt = Number.isFinite(this.opts.tilt) ? Math.max(30, Math.min(75, this.opts.tilt)) : 50
    this.opts.zoom = Number.isFinite(this.opts.zoom) ? Math.max(0.6, Math.min(1.6, this.opts.zoom)) : 1
    this.opts.movementDuration = Number.isFinite(this.opts.movementDuration) ? Math.max(0.04, Math.min(0.25, this.opts.movementDuration)) : 0.1
    if (!['ease-out', 'smooth', 'linear'].includes(this.opts.movementEasing)) this.opts.movementEasing = 'ease-out'
    if (!this.opts.animate || !this.opts.movement) this.movement.finish()
    if (!this.opts.animate) { this.effects.clear(); this.deaths.clear(); this.visibility.finish(); this.arrival.finish() }
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
    this.visibility.clear()
    this.arrival.clear()
  }

  setScene(scene: Scene, now = performance.now() / 1000) {
    if (scene === this.scene && scene.revision === this.revision) return
    this.scene = scene
    this.revision = scene.revision
    this.visibility.observe(scene, now, this.opts.animate)
    this.arrival.observe(scene, now, this.opts.animate)
    this.life.observe(scene, now)
    this.effects.observe(scene, now, this.opts.animate)
    this.deaths.observe(scene, this.opts.animate)
    // Never render effects or entities in unseen cells, even if a producer supplies them.
    this.cells = [...scene.cells.values()].filter(c => c.visibility !== 'unseen' && c.kind !== 'unknown')
    this.standing = []
    const cloudCells = new Set(scene.billboards.filter(b => b.kind === 'cloud').map(b => cellKey(b.x, b.y)))
    for (const cell of this.cells) {
      if (cell.occluder || this.upright(cell)) this.standing.push({ cell, x: cell.x, y: cell.y, depth: cell.y + (cell.occluder ? 0.5 : 0.25) })
      if (cell.cloud !== undefined && !cloudCells.has(cellKey(cell.x, cell.y))) this.standing.push({ cell, x: cell.x, y: cell.y, depth: cell.y + 0.4, billboard: { x: cell.x, y: cell.y, tile: cell.cloud, kind: 'cloud', height: 1, alpha: 0.7 } })
    }
    for (const billboard of scene.billboards) {
      const cell = scene.cells.get(cellKey(billboard.x, billboard.y))
      if (cell && cell.visibility !== 'unseen' && cell.kind !== 'unknown') this.standing.push({ cell, billboard, x: billboard.x, y: billboard.y, depth: billboard.y + 0.3 + (billboard.kind === 'cloud' ? 0.1 : 0) })
    }
    this.standing.sort((a, b) => a.depth - b.depth || a.cell.x - b.cell.x)
    this.movement.observe({ ...scene, billboards: this.standing.flatMap(entry => entry.billboard ? [entry.billboard] : []) }, this.opts.center ?? scene.player, now, {
      enabled: this.opts.animate && this.opts.movement, duration: this.opts.movementDuration, easing: this.opts.movementEasing,
    })
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
    const target = this.opts.center ?? this.scene.player
    const center = this.movement.center(target, this.frameTime)
    return { x: center.x, y: center.y, width: this.width, height: this.height, tilt, scale: fittedScale(this.width, this.height, tilt, this.opts.zoom) }
  }

  private upright(cell: SceneCell) {
    return cell.featureTile !== undefined && (cell.stance === 'upright' || cell.freestanding || cell.feature?.type === 'door')
  }

  project(x: number, y: number, height = 0) {
    return project(this.projection(), x, y, height)
  }

  projectBillboard(billboard: Billboard, height = 0) {
    const pos = this.actorPosition(billboard, this.frameTime)
    return this.project(pos.x, pos.y, height)
  }

  private actorPosition(b: Billboard, now: number) {
    const pos = this.movement.position(b, now), offset = this.opts.animate ? this.effects.offset(b, now) : { x: 0, y: 0 }
    return { x: pos.x + offset.x, y: pos.y + offset.y }
  }

  private inFrame(p: Projection, cell: { x: number; y: number }) {
    const q = project(p, cell.x, cell.y)
    return q.x > -p.scale * 2 && q.x < this.width + p.scale * 2 && q.y > -p.scale * 2 && q.y < this.height + p.scale * 2
  }

  private light() {
    // WebTiles draws visible atlas colours directly, without an exposure lift.
    return 1
  }

  private darkness(cell: SceneCell) { return this.visibility.darkness(cell, this.frameTime) }

  private lightExposure(cell: SceneCell) { return Math.max(0, 1 - this.darkness(cell) / MEMORY_DARKNESS) }

  private surfaceLighting(cell: SceneCell): SurfaceLighting | undefined {
    const exposure = this.lightExposure(cell)
    if (exposure <= 0) return undefined
    if (exposure === 1) return this.lighting
    return { draw: (ctx, rect, mask, sample) => {
      ctx.save(); ctx.globalAlpha *= exposure
      this.lighting.draw(ctx, rect, mask, sample); ctx.restore()
    } }
  }

  private tile(ctx: Context2d, layers: Layer[], cell: SceneCell, x: number, y: number, size: number, world: { x: number; y: number }, rasterScale = 1) {
    return this.tiles.draw(ctx, layers, x, y, size, this.light(), this.darkness(cell), cell.flash, this.surfaceLighting(cell),
      { x: world.x - size, y: world.y - size, width: size * 3, height: size * 3 }, rasterScale)
  }

  private plane(ctx: Context2d, p: Projection, cell: SceneCell, layers: Layer[], z = 0, illuminate = true) {
    const rect = planeRect(p, cell.x, cell.y, z, this.dpr)
    // Uniform ambient light keeps the LOS boundary distinct from environmental glows.
    return this.tiles.drawPlane(ctx, layers, rect, this.light(), this.darkness(cell), cell.flash, illuminate ? this.surfaceLighting(cell) : undefined,
      rect)
  }

  impact(x: number, y: number, strength: number, now: number) {
    if (!this.opts.animate || this.scene.cells.get(cellKey(x, y))?.visibility !== 'visible') return
    this.life.ripple(x, y, now, strength)
    this.active = true
  }

  melee(attack: MeleeAttack, now: number) {
    if (this.opts.animate && this.effects.melee(this.scene, attack, now)) this.active = true
  }

  spell(effect: SpellEffect, now: number) {
    if (this.opts.animate && this.effects.spell(this.scene, effect, now)) this.active = true
  }

  death(effect: DeathEffect, now: number) {
    if (this.opts.animate && this.deaths.spawn(this.scene, effect, now)) this.active = true
  }

  render(now = performance.now() / 1000) {
    const ctx = this.ctx
    if (!ctx) return
    const time = this.opts.animate ? now : 0
    this.frameTime = now
    const p = this.projection(), s = p.scale, sy = groundDepth(p.tilt)
    this.active = this.movement.cameraMoving(now)
    this.effects.tick(this.scene, now)
    const deathParticles = this.opts.animate ? this.deaths.sample(this.scene, now) : []
    // Sort and cull at the drawn position, retaining confirmed cells for semantics and picking.
    const standing = this.standing.map(entry => {
      if (!entry.billboard) return entry
      const pos = this.actorPosition(entry.billboard, now)
      return { ...entry, ...pos, depth: entry.depth + pos.y - entry.billboard.y, moving: this.movement.moving(entry.billboard, now) }
    }).sort((a, b) => a.depth - b.depth || a.x - b.x)
    if (this.opts.animate) {
      for (const death of deathParticles) {
        if (death.ground) continue
        const cell = this.scene.cells.get(cellKey(Math.round(death.x), Math.round(death.y)))!
        standing.push({ cell, death, x: death.x, y: death.y, depth: death.y + 0.35 })
      }
      if (this.deaths.active) this.active = true
      for (const billboard of this.effects.retainedProjectiles(now)) {
        const cell = this.scene.cells.get(cellKey(billboard.x, billboard.y))
        if (!cell || !this.inFrame(p, billboard)) continue
        standing.push({ cell, billboard, x: billboard.x, y: billboard.y, depth: billboard.y + 0.3 })
        this.active = true
      }
      for (const burst of this.effects.bursts) {
        const cell = this.scene.cells.get(cellKey(burst.x, burst.y))
        if (!cell || cell.occluder || !this.inFrame(p, burst)) continue
        standing.push({ cell, burst, x: burst.x, y: burst.y, depth: burst.y + 0.35 })
        this.active = true
      }
      standing.sort((a, b) => a.depth - b.depth || a.x - b.x)
    }
    this.life.tick(now)
    const emitters = this.life.emitters(now)
    this.lighting.build(this.scene, p, emitters, time, this.opts.animate, this.tiles.source, b => this.actorPosition(b, now),
      cell => cell.visibility === 'visible' || this.visibility.moving(cell, now))
    this.hits = []
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.imageSmoothingEnabled = this.opts.filterScaling
    this.unexploredFog(ctx, p, time)
    const cells = this.cells.filter(c => this.inFrame(p, c))
    if (this.opts.animate && cells.some(c => this.visibility.moving(c, now))) this.active = true

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
      if (this.darkness(cell) > 0) {
        if (!this.tiles.source) {
          ctx.fillStyle = `rgba(0,0,0,${this.darkness(cell)})`
          ctx.fillRect(q.x, q.y, s, s * sy)
        }
      }
      if (cell.flash && !this.tiles.source) {
        const f = cell.flash
        ctx.fillStyle = `rgba(${f.r},${f.g},${f.b},${f.a / 255})`
        ctx.fillRect(q.x, q.y, s, s * sy)
      }
    }

    ctx.save(); ctx.beginPath()
    for (const cell of cells) if (!cell.occluder && this.lightExposure(cell) === 1) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr); ctx.rect(rect.x, rect.y, rect.width, rect.height)
    }
    ctx.clip(); this.lighting.draw(ctx, { x: 0, y: 0, width: this.width, height: this.height }); ctx.restore()
    for (const cell of cells) if (!cell.occluder && this.lightExposure(cell) > 0 && this.lightExposure(cell) < 1) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      this.surfaceLighting(cell)?.draw(ctx, rect)
    }
    if (this.lighting.active) this.active = true
    this.waterSurface(ctx, p, cells, time)
    this.lavaSurface(ctx, p, cells, time)
    // Traces stay on the floor, underneath silhouettes, badges and targeting.
    if (this.opts.animate) for (const trace of this.effects.traces) {
      if (!this.inFrame(p, trace.source)) continue
      const cell = this.scene.cells.get(cellKey(trace.source.x, trace.source.y))
      if (!cell || cell.occluder) continue
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y - s * 0.4, rect.width, rect.height + s * 0.4); ctx.clip()
      drawSpellTrace(ctx, p, trace, now); ctx.restore()
      this.active = true
    }
    for (const death of deathParticles) if (death.ground && this.inFrame(p, death)) this.deathArt.draw(ctx, p, this.scene, death, this.dpr)
    // Ground haze must stay beneath raised terrain. Drawing it after walls
    // projects a remembered neighbour's rectangular boundary across their art.
    this.memoryFog(ctx, p, cells, time)
    this.frontierFog(ctx, p, cells, time)
    drawWallShadows(ctx, p, this.scene, cells, this.dpr, cell => this.darkness(cell))

    // Shadows lie on the ground; no sprite's shadow is painted over another sprite.
    for (const entry of standing) {
      if (!this.inFrame(p, entry)) continue
      if (entry.death || entry.burst || entry.cell.occluder || entry.billboard?.kind === 'projectile' || entry.billboard?.kind === 'cloud') continue
      const q = project(p, entry.x, entry.y + 0.28)
      ctx.save()
      ctx.translate(q.x, q.y)
      ctx.scale(1, sy * 0.3)
      const radius = s * (entry.billboard?.kind === 'item' ? 0.3 : 0.43)
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
      shadow.addColorStop(0, 'rgba(0,0,0,0.28)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
      ctx.restore()
    }

    for (const entry of standing) {
      if (!this.inFrame(p, entry)) continue
      if (entry.moving) this.active = true
      if (entry.death) {
        this.deathArt.draw(ctx, p, this.scene, entry.death, this.dpr)
      }
      else if (entry.burst) {
        const rect = planeRect(p, entry.x, entry.y, 0, this.dpr)
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y - s * 1.1, rect.width, rect.height + s * 1.1); ctx.clip()
        drawSpellBurst(ctx, p, entry.burst, now); ctx.restore()
      }
      else if (entry.billboard) this.actor(ctx, p, entry.cell, entry.billboard, time, entry)
      else if (entry.cell.occluder) this.wall(ctx, p, entry.cell)
      else this.actor(ctx, p, entry.cell, { x: entry.cell.x, y: entry.cell.y, tile: entry.cell.featureTile!, height: 1, kind: 'doll', scenery: true, life: entry.cell.life }, time)
    }

    // Keep the old faint stair/crystal motes even when they emit no light.
    const ornaments: Emitter[] = cells.filter(c => c.visibility === 'visible' && ['crystal', 'up', 'down'].includes(c.life?.motion ?? '') && !c.life?.lights?.length)
      .map(c => ({ x: c.x, y: c.y, colour: [198, 222, 255], radius: 1, power: 0 }))
    this.emitterParticles(ctx, p, [...emitters, ...ornaments], time)
    if (this.opts.animate) for (const stroke of this.effects.strokes) {
      if (!this.inFrame(p, stroke.from) && !this.inFrame(p, stroke.to)) continue
      ctx.save(); ctx.beginPath()
      for (const cell of cells) if (cell.visibility === 'visible') {
        const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
        ctx.rect(rect.x, rect.y - s, rect.width, rect.height + s)
      }
      ctx.clip(); drawMelee(ctx, p, stroke, now); ctx.restore()
      this.active = true
    }
    this.impactRipples(ctx, p, time)
    this.dungeonExposure(ctx, p, cells)

    if (this.opts.animate && this.arrival.draw(ctx, p, now)) this.active = true

    // Travel, exclusion and targeting information must remain readable over depth/effects.
    for (const cell of cells) {
      const q = project(p, cell.x - 0.5, cell.y - 0.5)
      for (const tile of cell.icons ?? []) {
        // Item cursors frame the upright atlas art. Travel/exclusion/stair
        // badges retain their ground anchor, even when sharing an item cell.
        const cursorItem = tile === cell.cursorTile && standing.find(entry => entry.cell === cell && entry.billboard?.kind === 'item' && !entry.billboard.lying)
        if (cursorItem) {
          const item = project(p, cursorItem.x, cursorItem.y + 0.3)
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
    vignette.addColorStop(1, 'rgba(0,0,0,0.08)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, this.width, this.height)
  }

  /** A broad, world-anchored pool of warm exposure, with cooler distant stone.
   * This is presentation ambient, not an emitter: it never reveals terrain or
   * changes occlusion. Remote level maps retain their ungraded atlas colours. */
  private dungeonExposure(ctx: Context2d, p: Projection, cells: SceneCell[]) {
    if (!this.scene.playerOnLevel) return
    const player = this.scene.billboards.find(b => b.kind === 'player')
    const anchor = player ? this.actorPosition(player, this.frameTime) : this.scene.player
    const q = project(p, anchor.x, anchor.y)
    const sy = groundDepth(p.tilt), radius = p.scale * 10
    ctx.save()
    ctx.translate(q.x, q.y); ctx.scale(1, sy)
    const exposure = ctx.createRadialGradient(0, 0, p.scale * 1.5, 0, 0, radius)
    exposure.addColorStop(0, '#fff5df')
    exposure.addColorStop(0.4, '#e4dfd2')
    exposure.addColorStop(1, '#78899e')
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = exposure
    ctx.fillRect(-q.x, -q.y / sy, this.width, this.height / sy)
    ctx.restore()

    // Lift the near floor gently without adding a halo over unexplored black.
    // The union of known terrain includes raised wall tops and their faces.
    ctx.save(); ctx.beginPath()
    for (const cell of cells) {
      const ground = planeRect(p, cell.x, cell.y, 0, this.dpr)
      const roof = cell.occluder ? planeRect(p, cell.x, cell.y, wallHeight(this.scene, cell), this.dpr) : ground
      ctx.rect(ground.x, roof.y, ground.width, ground.y + ground.height - roof.y)
    }
    ctx.clip(); ctx.translate(q.x, q.y); ctx.scale(1, sy)
    const warmth = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.8)
    warmth.addColorStop(0, 'rgba(196,128,58,0.07)')
    warmth.addColorStop(0.45, 'rgba(156,105,52,0.025)')
    warmth.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = warmth
    ctx.fillRect(-q.x, -q.y / sy, this.width, this.height / sy)
    ctx.restore()
  }

  /** Neutral, world-anchored mist behind known geometry; uses no hidden map data.
   * Static wisps also preserve still mode and let an idle scene sleep. */
  private unexploredFog(ctx: Context2d, p: Projection, time: number) {
    ctx.fillStyle = '#010202'
    ctx.fillRect(0, 0, this.width, this.height)
    const sy = groundDepth(p.tilt), step = 4
    const left = Math.floor((p.x - this.width / p.scale / 2) / step) * step - step
    const right = p.x + this.width / p.scale / 2 + step
    const top = Math.floor((p.y - this.height / (p.scale * sy) / 2) / step) * step - step
    const bottom = p.y + this.height / (p.scale * sy) / 2 + step
    ctx.save()
    ctx.scale(1, sy)
    for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) {
      const phase = x * 1.31 + y * 2.17
      const q = project(p, x + Math.sin(phase + time * 0.08) * 1.2, y + Math.cos(phase + time * 0.06) * 0.8)
      const cy = q.y / sy, radius = p.scale * (2.8 + Math.sin(phase * 1.7) * 0.6)
      const mist = ctx.createRadialGradient(q.x, cy, 0, q.x, cy, radius)
      mist.addColorStop(0, 'rgba(44,45,43,0.1)')
      mist.addColorStop(0.45, 'rgba(35,36,34,0.04)')
      mist.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = mist
      ctx.fillRect(q.x - radius, cy - radius, radius * 2, radius * 2)
    }
    ctx.restore()
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

  private lavaSurface(ctx: Context2d, p: Projection, cells: SceneCell[], time: number) {
    for (const cell of cells) {
      if (cell.visibility !== 'visible' || !cell.flags.lava) continue
      this.active = true
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip()
      ctx.strokeStyle = 'rgba(255,177,47,0.22)'; ctx.lineWidth = Math.max(1, p.scale * 0.025)
      for (let i = 0; i < 3; i++) {
        const t = time * 0.5 + cell.x * 1.7 + cell.y * 2.1 + i * 2
        ctx.beginPath()
        ctx.ellipse(rect.x + rect.width * (0.5 + Math.sin(t) * 0.24), rect.y + rect.height * (0.5 + Math.cos(t * 0.7) * 0.24), rect.width * (0.12 + i * 0.055), rect.height * 0.12, Math.sin(t) * 0.3, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private impactRipples(ctx: Context2d, p: Projection, time: number) {
    if (!this.opts.animate) return
    for (const ripple of this.life.ripples) {
      if (this.deaths.coversImpact(ripple.x, ripple.y, time)) continue
      const age = time - ripple.born
      if (age < 0 || age >= 0.9) continue
      this.active = true
      const q = project(p, ripple.x, ripple.y)
      const radius = p.scale * (0.08 + age * 1.1)
      ctx.save(); ctx.beginPath()
      // Clip to current LOS, so impact rings never reveal unseen terrain.
      for (const cell of this.cells) if (cell.visibility === 'visible') {
        const r = planeRect(p, cell.x, cell.y, 0, this.dpr); ctx.rect(r.x, r.y, r.width, r.height)
      }
      ctx.clip(); ctx.strokeStyle = `rgba(220,230,240,${ripple.strength * 0.18 * (1 - age / 0.9) ** 2})`
      ctx.lineWidth = Math.max(0.6, p.scale / 90); ctx.beginPath()
      ctx.ellipse(q.x, q.y, radius, radius * groundDepth(p.tilt), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
    }
  }

  private memoryFog(ctx: Context2d, p: Projection, cells: SceneCell[], time: number) {
    const memory = cells.filter(cell => this.darkness(cell) > 0)
    if (!memory.length) return
    const width = Math.ceil(this.width), height = Math.ceil(this.height)
    this.fogField ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width, height }) : null
    const ink = this.fogField?.getContext('2d') as Context2d | null
    if (ink && this.fogField) {
      if (this.fogField.width !== width || this.fogField.height !== height) { this.fogField.width = width; this.fogField.height = height }
      ink.setTransform(1, 0, 0, 1, 0, 0); ink.clearRect(0, 0, width, height)
      // Generate the broad mist once, then fade each receiving cell with LOS.
      const left = Math.floor(Math.min(...memory.map(c => c.x)) / 4) * 4
      const right = Math.max(...memory.map(c => c.x)) + 4
      const top = Math.floor(Math.min(...memory.map(c => c.y)) / 4) * 4
      const bottom = Math.max(...memory.map(c => c.y)) + 4
      ink.scale(1, groundDepth(p.tilt))
      for (let y = top; y <= bottom; y += 4) for (let x = left; x <= right; x += 4) {
        const phase = x * 1.31 + y * 2.17
        const q = project(p, x + Math.sin(time * 0.14 + phase) * 0.6, y + Math.cos(time * 0.11 + phase) * 0.4)
        const cy = q.y / groundDepth(p.tilt), radius = p.scale * 2.8
        const mist = ink.createRadialGradient(q.x, cy, 0, q.x, cy, radius)
        mist.addColorStop(0, 'rgba(0,0,0,0.045)'); mist.addColorStop(1, 'rgba(0,0,0,0)')
        ink.fillStyle = mist; ink.fillRect(q.x - radius, cy - radius, radius * 2, radius * 2)
      }
    }
    for (const cell of memory) {
      const rect = planeRect(p, cell.x, cell.y, 0, this.dpr)
      ctx.save(); ctx.globalAlpha *= Math.min(1, this.darkness(cell) / MEMORY_DARKNESS)
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
      if (ink && this.fogField) ctx.drawImage(this.fogField, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height)
      ctx.restore()
    }
    this.active = true
  }

  private frontierFog(ctx: Context2d, p: Projection, cells: SceneCell[], time: number) {
    for (const cell of cells) {
      const rect = planeRect(p, cell.x, cell.y, cell.occluder ? wallHeight(this.scene, cell) : 0, this.dpr)
      for (const [dx, dy, turn] of [[0,-1,0],[1,0,Math.PI/2],[0,1,Math.PI],[-1,0,-Math.PI/2]]) {
        const neighbour = this.scene.cells.get(cellKey(cell.x + dx, cell.y + dy))
        if (neighbour && neighbour.visibility !== 'unseen' && neighbour.kind !== 'unknown') continue
        const curl = Math.sin(time * 0.45 + cell.x * 1.7 + cell.y * 2.3) * 0.05
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip()
        ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ctx.scale(rect.width, rect.height); ctx.rotate(turn); ctx.translate(-0.5, -0.5)
        const fog = ctx.createLinearGradient(0, 0, 0, 0.38)
        fog.addColorStop(0, 'rgba(0,0,0,0.76)'); fog.addColorStop(0.4, 'rgba(0,0,0,0.24)'); fog.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = fog; ctx.fillRect(0, 0, 1, 0.38)
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        for (const offset of [0.17, 0.69]) {
          ctx.beginPath(); ctx.moveTo(offset - 0.1, 0)
          ctx.bezierCurveTo(offset + 0.12, 0.05, offset + 0.16 + curl, 0.24, offset + curl, 0.3)
          ctx.bezierCurveTo(offset + 0.1 + curl, 0.16, offset - 0.07, 0.12, offset - 0.1, 0)
          ctx.fill()
        }
        ctx.restore()
      }
    }
  }

  private wall(ctx: Context2d, p: Projection, cell: SceneCell) {
    const roof = planeRect(p, cell.x, cell.y, wallHeight(this.scene, cell), this.dpr)
    const ground = planeRect(p, cell.x, cell.y, 0, this.dpr)
    const tile = cell.faceTiles?.s ?? cell.wallTile ?? cell.featureTile ?? cell.floorTile
    const surface = { ...roof, height: ground.y + ground.height - roof.y }
    const face = { ...roof, y: roof.y + roof.height, height: surface.height - roof.height }
    ctx.save()
    if (cell.wallStyle === 'transparent') ctx.globalAlpha = 0.65
    ctx.fillStyle = '#343039'
    ctx.fillRect(surface.x, surface.y, surface.width, surface.height)
    // The original stonework belongs to the horizontal roof. Extruding its
    // boundary creates a distinct vertical face without a second copy of the art.
    const layers = [{ tile }, ...(cell.wallOverlays ?? []).map(tile => ({ tile }))]
    this.tiles.drawPlane(ctx, layers, roof,
      this.light(), this.darkness(cell), cell.flash, this.surfaceLighting(cell), roof)
    this.tiles.drawWallFace(ctx, layers, face, this.light(), this.darkness(cell), cell.flash, this.surfaceLighting(cell))
    shadeWallFace(ctx, face)
    this.frontierFog(ctx, p, [cell], this.opts.animate ? this.frameTime : 0)
    ctx.restore()
    this.hits.push({ key: cellKey(cell.x, cell.y), left: roof.x, right: roof.x + roof.width, top: roof.y, bottom: ground.y + ground.height })
  }

  private actor(ctx: Context2d, p: Projection, cell: SceneCell, b: Billboard, time: number, position: { x: number; y: number; moving?: boolean } = b) {
    const s = p.scale, visible = cell.visibility === 'visible'
    if (b.kind === 'projectile') {
      if (!visible) return
      // Server beam art spans neighbouring cells. Keep its full length on
      // the ground plane; soften/trim its alpha instead of shrinking it and
      // opening gaps between segments. It has no creature shadow or hit box.
      const rect = planeRect(p, position.x, position.y, 0.28, this.dpr)
      const appearance = b.life?.projectile
      const thin = appearance ? appearance.beam : true
      ctx.save(); ctx.imageSmoothingEnabled = thin || this.opts.filterScaling; ctx.globalAlpha = b.alpha ?? 0.95
      this.tiles.drawPlane(ctx, b.layers ?? [{ tile: b.tile }], rect, 1, false, undefined, undefined, undefined, thin)
      ctx.restore()
      return
    }
    const creature = b.kind === 'player' || b.kind === 'monster' && !b.scenery
    const cloud = b.kind === 'cloud'
    const life = b.life ?? { motion: cloud ? 'cloud' : creature ? 'breath' : undefined }
    const breathing = creature && !b.lying && life.motion === 'breath' && !life.held && this.opts.animate && visible
    const pose = livingPose(life, b.x, b.y, time, this.opts.animate && visible, { strength: cloud ? 2 : 2.5, smooth: true })
    // Wound flags drive a small guarded lean and uneven breathing. This also
    // works for bloodless creatures without painting red over identifying art.
    const wound = ['uninjured', 'lightly_damaged', 'moderately_damaged', 'heavily_damaged', 'severely_damaged', 'almost_dead'].indexOf(b.damage ?? 'uninjured')
    if (creature && !b.lying && wound > 0 && visible && !life.held && life.motion !== 'still') {
      const strain = wound / 5, phase = b.x * 2.31 + b.y * 1.73
      pose.angle -= strain * 0.035
      pose.sy -= strain * 0.025
      if (this.opts.animate) {
        const effort = Math.sin(time * 1.8 + phase) * Math.sin(time * 0.9 + phase)
        pose.sy += effort * strain * 0.012
        pose.x += Math.sin(time * 0.85 + phase) * strain * 0.007
      }
    }
    if (visible && life.motion && life.motion !== 'still' && !life.held) this.active = true
    const q = project(p, position.x, position.y + 0.3)
    // The atlas already encodes a rat's size relative to an ogre. First-person
    // billboard heights shrink that art a second time and must not scale it here.
    const size = s
    const snap = (v: number) => Math.round(v * this.dpr) / this.dpr
    // Snap only idle displacement: snapping the whole frame shifts the camera-
    // centred player when half the fitted atlas size is a fractional pixel.
    const x = q.x - size / 2 + snap(pose.x * s)
    const foot = q.y - snap(pose.y * s)
    const y = foot - size - (cloud ? s * 0.15 : 0)
    ctx.save()
    // Breathing filters an integer-enlarged sprite, keeping solid pixel centres
    // while easing row transitions. Explicit smooth scaling uses the atlas directly.
    const rasterScale = breathing && !this.opts.filterScaling ? Math.max(2, Math.min(4, Math.ceil(size * this.dpr / 32))) : 1
    ctx.imageSmoothingEnabled = cloud || this.opts.filterScaling || breathing
    ctx.globalAlpha = (b.alpha ?? 1) * (cloud ? 0.58 : 1)
    if (b.lying) {
      this.plane(ctx, p, { ...cell, x: position.x, y: position.y }, b.layers ?? [{ tile: b.tile }], 0.02)
    } else {
      if (b.kind === 'player' || b.attitude === 'friendly') {
        ctx.strokeStyle = b.kind === 'player' ? '#e3c88a' : '#8bd0ab'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.ellipse(q.x, q.y - 1, s * 0.34, s * 0.13, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.translate(x, foot)
      ctx.translate(size / 2, 0)
      ctx.rotate(pose.angle)
      ctx.scale(pose.sx, pose.sy)
      ctx.translate(-size / 2, 0)
      if (!this.tile(ctx, b.layers ?? [{ tile: b.tile }], cell, 0, -size - (cloud ? s * 0.15 : 0), size, { x, y }, rasterScale)) {
        ctx.globalAlpha *= 1 - this.darkness(cell)
        ctx.fillStyle = b.kind === 'player' ? '#fff0ba' : '#e5c4ae'
        ctx.font = `${size * 0.75}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText(b.kind === 'player' ? '@' : cell.glyph ?? '?', size / 2, -size * 0.1)
      }
    }
    ctx.restore()
    if (visible && (life.motion === 'gold' || life.motion === 'gem') && pose.glow > 0.05) {
      ctx.save()
      ctx.globalAlpha = pose.glow * 0.85
      ctx.strokeStyle = life.motion === 'gem' ? '#c6f4ff' : '#fff1b4'
      ctx.lineWidth = Math.max(1, s / 40)
      ctx.beginPath()
      ctx.moveTo(q.x - s * 0.06, q.y - s * 0.22); ctx.lineTo(q.x + s * 0.06, q.y - s * 0.22)
      ctx.moveTo(q.x, q.y - s * 0.28); ctx.lineTo(q.x, q.y - s * 0.16)
      ctx.stroke(); ctx.restore()
    }
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
    if (this.opts.animate) {
      ctx.fillStyle = '#b8edf4'
      for (let i = 0; i < 5; i++) {
        const life = ((time * 0.75 + i / 5 + phase) % 1 + 1) % 1
        ctx.globalAlpha = Math.sin(life * Math.PI) * 0.45
        const side = i % 2 ? -1 : 1, size = Math.max(0.7, s / 75)
        ctx.fillRect(q.x + side * life * s * 0.2, q.y - s * (0.18 + Math.sin(life * Math.PI) * 0.19), size, size)
      }
    }
    ctx.restore()
  }

  private emitterParticles(ctx: Context2d, p: Projection, sources: Emitter[], time: number) {
    const s = p.scale
    let budget = 88
    for (const source of sources) {
      if (budget <= 0) break
      if (source.transient || !this.inFrame(p, source) || this.scene.cells.get(cellKey(source.x, source.y))?.visibility !== 'visible') continue
      const q = glowCenter(this.scene, p, source, this.tiles.source, b => this.actorPosition(b, this.frameTime))
      const phase = source.x * 1.31 + source.y * 2.17
      const fire = source.pulse === 'fire', count = Math.min(budget, fire ? 6 : 4)
      budget -= count
      ctx.save()
      // A compact core brightens the actual source instead of fogging the room.
      const radius = s * (fire ? 0.18 : 0.13)
      const core = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, radius)
      core.addColorStop(0, `rgba(${source.colour.join(',')},${Math.min(0.22, source.power * 0.28)})`)
      core.addColorStop(1, `rgba(${source.colour.join(',')},0)`)
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = core
      ctx.fillRect(q.x - radius, q.y - radius, radius * 2, radius * 2)
      if (this.opts.animate) {
        this.active = true
        ctx.fillStyle = fire ? '#ffdb91' : `rgb(${source.colour.join(',')})`
        for (let i = 0; i < count; i++) {
          const life = ((time * (fire ? 0.5 : 0.23) + i / count + phase) % 1 + 1) % 1
          ctx.globalAlpha = Math.sin(life * Math.PI) ** 2 * (fire ? 0.62 : 0.42)
          const size = Math.max(0.7, s / (fire ? 56 : 70))
          const x = q.x + Math.sin(phase + i * 8 + life * 2.4) * s * (fire ? 0.13 : 0.22)
          const y = q.y - life * s * (fire ? 0.52 : 0.38)
          ctx.fillRect(Math.round(x * this.dpr) / this.dpr, Math.round(y * this.dpr) / this.dpr, size, size * (fire && i % 3 === 0 ? 1.8 : 1))
        }
      }
      ctx.restore()
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
    this.movement.clear()
    this.life.clear()
    this.effects.clear()
    this.deaths.clear()
    this.deathArt.clear()
    this.visibility.clear()
    this.arrival.clear()
    this.fogField = null
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
    this.active = false
  }
}
