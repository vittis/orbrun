import { cellKey, combatActorId, type Billboard, type Scene, type SceneCell, type SpawnAppearance } from '@orbrun/scene'

export interface SpawnEffect extends SpawnAppearance { x: number; y: number; born: number; duration: number; key: string; billboard?: Billboard; terrain?: SceneCell; ended?: number }
const visible = (scene: Scene, p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
const overlayKey = (b: Billboard) => `${b.x},${b.y}:${b.life?.projectile ? b.life.projectile.family ?? b.tile : b.tile}`
const ENTER = 0.1, EXIT = 0.08, OVERLAY_HOLD = 0.06
const terrainKey = (cell: { x: number; y: number; life?: SceneCell['life'] }) => `terrain:${cell.x},${cell.y}:${cell.life?.spawn?.family}`
const objectKey = (b: Billboard) => b.kind === 'doll' && b.scenery ? terrainKey(b) : `${b.kind}:${b.kind === 'monster' ? combatActorId(b) : `${b.x},${b.y}`}:${b.life?.spawn?.family}`

/** Cell-bound entrances are independent of actor hits and projectile contacts. */
export class DungeonSpawns {
  effects: SpawnEffect[] = []
  private previous = new Map<string, SpawnEffect>()
  private visibleCells = new Set<ReturnType<typeof cellKey>>()
  private areaFamilies = new Set<string>()
  private anchored = new Set<string>()

  observe(scene: Scene, now: number, continuing: boolean) {
    const groups = new Map<string, Billboard[]>()
    for (const b of scene.billboards) {
      const art = b.life?.projectile
      if (b.kind !== 'projectile' || !visible(scene, b) || !art || art.angle !== undefined || art.distancePhase !== undefined) continue
      const family = art.family ?? `tile:${b.tile}`
      // Dedicated bolt artwork can bend, fork or bounce. Only the ambiguous
      // generic zap family needs a spatial fallback; named areas carry spawn.
      if (!family.startsWith('BOLT_DEFAULT_')) continue
      const group = groups.get(family) ?? []
      group.push(b); groups.set(family, group)
    }
    // Generic zap tiles serve both missiles and explosions in WebTiles. An
    // expanding, non-collinear batch is an area, never one zigzagging missile.
    // Keep that decision until the server clears this batch, including shrinkage.
    this.areaFamilies = new Set([...this.areaFamilies].filter(f => groups.has(f)))
    for (const [family, group] of groups) {
      const a = group[0], b = group.find(b => b.x !== a.x || b.y !== a.y)
      if (b && group.some(c => (b.x - a.x) * (c.y - a.y) !== (b.y - a.y) * (c.x - a.x))) this.areaFamilies.add(family)
    }
    this.anchored.clear()
    const next = new Map<string, SpawnEffect>()
    const add = (key: string, p: { x: number; y: number }, appearance: SpawnAppearance, billboard?: Billboard, terrain?: SceneCell) => {
      const previous = this.previous.get(key)
      const born = previous?.born ?? (continuing && this.visibleCells.has(cellKey(p.x, p.y)) ? now : now - ENTER)
      // Snapshot native artwork only. No particles, alternate sprites or geometry.
      const snapshot: SpawnEffect = { ...appearance, x: p.x, y: p.y, born, duration: ENTER, key,
        billboard: billboard ? { ...billboard, layers: billboard.layers?.map(layer => ({ ...layer })) } : undefined,
        terrain: terrain ? { ...terrain } : undefined }
      next.set(key, snapshot)
      if (!continuing || now - born >= ENTER) return
      this.effects = this.effects.filter(e => e.key !== key)
      this.effects.push(snapshot)
    }
    for (const cell of scene.cells.values()) if (cell.life?.spawn && cell.visibility === 'visible') add(terrainKey(cell), cell, cell.life.spawn, undefined, cell)
    for (const b of scene.billboards) {
      if (!visible(scene, b)) continue
      const art = b.life?.projectile
      const area = art && this.areaFamilies.has(art.family ?? `tile:${b.tile}`)
      if (b.kind === 'projectile' && art !== false && (area || b.life?.spawn)) {
        const key = `overlay:${overlayKey(b)}`
        this.anchored.add(overlayKey(b))
        const colour = art ? art.colour : [194, 177, 218]
        const kind = art && art.kind !== 'magic' ? art.kind : colour[0] > colour[2] * 1.5 ? 'fire' : 'magic'
        const appearance: SpawnAppearance = b.life?.spawn ?? { style: 'burst', family: art ? art.family ?? `${b.tile}` : `${b.tile}`,
          kind: kind === 'sand' || kind === 'stone' || kind === 'metal' ? 'magic' : kind }
        add(key, b, appearance, b)
      } else if (b.life?.spawn) add(objectKey(b), b, b.life.spawn, b)
    }
    if (continuing) for (const [key, old] of this.previous) {
      if (next.has(key) || !visible(scene, old) || scene.cells.get(cellKey(old.x, old.y))?.occluder) continue
      this.effects = this.effects.filter(e => e.key !== key)
      // Very short server overlays still receive one readable exposure when
      // created and cleared between draws. Persistent objects get no extra hold.
      const ended = old.billboard?.kind === 'projectile' ? Math.max(now, old.born + OVERLAY_HOLD) : now
      this.effects.push({ ...old, ended })
    }
    // Reappearance replaces a departure; do not paint the same tile twice.
    this.effects = this.effects.filter(e => e.ended === undefined || !next.has(e.key))
    this.previous = next
    this.visibleCells = new Set([...scene.cells.values()].filter(c => c.visibility === 'visible').map(c => cellKey(c.x, c.y)))
    this.tick(scene, now)
    this.effects = this.effects.slice(-192)
  }

  stationary(b: Billboard) { return this.anchored.has(overlayKey(b)) }

  private opacity(effect: SpawnEffect, now: number) {
    const enter = (time: number) => {
      const t = Math.max(0, Math.min(1, (time - effect.born) / ENTER))
      return 0.35 + 0.65 * (1 - (1 - t) ** 2)
    }
    if (effect.ended === undefined || now < effect.ended) return enter(now)
    return enter(effect.ended) * Math.max(0, 1 - (now - effect.ended) / EXIT)
  }

  overlays(scene: Scene, now: number) {
    const current = new Map(scene.billboards.filter(b => b.kind === 'projectile' && this.stationary(b) && visible(scene, b)).map(b => {
      const effect = this.effects.find(e => e.key === `overlay:${overlayKey(b)}` && e.ended === undefined)
      return [overlayKey(b), { ...b, alpha: (b.alpha ?? 0.95) * (effect ? this.opacity(effect, now) : 1) }]
    }))
    for (const e of this.effects) if (e.ended !== undefined && e.billboard?.kind === 'projectile' && !current.has(overlayKey(e.billboard))) {
      const alpha = this.opacity(e, now)
      if (alpha > 0) current.set(overlayKey(e.billboard), { ...e.billboard, alpha: (e.billboard.alpha ?? 0.95) * alpha })
    }
    return [...current.values()]
  }

  entrance(b: Billboard, now: number) {
    const effect = this.effects.find(e => e.key === objectKey(b) && e.ended === undefined)
    return effect ? this.opacity(effect, now) : 1
  }

  terrainOpacity(cell: SceneCell, now: number) {
    const effect = this.effects.find(e => e.key === terrainKey(cell) && e.ended === undefined)
    return effect ? this.opacity(effect, now) : 1
  }

  departures(now: number) {
    return this.effects.filter(e => e.ended !== undefined && e.billboard?.kind !== 'projectile')
      .map(e => ({ ...e, alpha: this.opacity(e, now) })).filter(e => e.alpha > 0)
  }

  tick(scene: Scene, now: number) {
    this.effects = this.effects.filter(e => now < (e.ended === undefined ? e.born + ENTER : e.ended + EXIT) && visible(scene, e))
  }

  clear() { this.effects = []; this.previous.clear(); this.visibleCells.clear(); this.areaFamilies.clear(); this.anchored.clear() }
}
