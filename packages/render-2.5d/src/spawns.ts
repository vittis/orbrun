import { cellKey, combatActorId, type Billboard, type Scene, type SpawnAppearance } from '@orbrun/scene'

export interface SpawnEffect extends SpawnAppearance { x: number; y: number; born: number; duration: number; key: string; billboard?: Billboard }
const visible = (scene: Scene, p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
const overlayKey = (b: Billboard) => `${b.x},${b.y}:${b.life?.projectile ? b.life.projectile.family ?? b.tile : b.tile}`
const objectKey = (b: Billboard) => `${b.kind}:${b.kind === 'monster' ? combatActorId(b) : `${b.x},${b.y}`}:${b.life?.spawn?.family}`

/** Cell-bound entrances are independent of actor hits and projectile contacts. */
export class DungeonSpawns {
  effects: SpawnEffect[] = []
  private previous = new Set<string>()
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
    const next = new Set<string>()
    const add = (key: string, p: { x: number; y: number }, appearance: SpawnAppearance, billboard?: Billboard) => {
      next.add(key)
      if (!continuing || this.previous.has(key) || !this.visibleCells.has(cellKey(p.x, p.y))) return
      this.effects = this.effects.filter(e => e.key !== key)
      this.effects.push({ ...appearance, x: p.x, y: p.y, born: now, duration: appearance.style === 'burst' ? 0.24 : 0.3, key, billboard })
    }
    for (const cell of scene.cells.values()) if (cell.life?.spawn && cell.visibility === 'visible') add(`terrain:${cell.x},${cell.y}:${cell.life.spawn.family}`, cell, cell.life.spawn)
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
        // Copy coordinates/art: reducers may reuse and mutate scene objects.
        add(key, b, appearance, { ...b })
      } else if (b.life?.spawn) add(objectKey(b), b, b.life.spawn)
    }
    this.previous = next
    this.visibleCells = new Set([...scene.cells.values()].filter(c => c.visibility === 'visible').map(c => cellKey(c.x, c.y)))
    this.tick(scene, now)
    this.effects = this.effects.slice(-192)
  }

  stationary(b: Billboard) { return this.anchored.has(overlayKey(b)) }

  overlays(scene: Scene, now: number) {
    const current = new Map(scene.billboards.filter(b => b.kind === 'projectile' && this.stationary(b) && visible(scene, b)).map(b => [overlayKey(b), b]))
    for (const e of this.effects) if (e.billboard && !current.has(overlayKey(e.billboard))) {
      current.set(overlayKey(e.billboard), { ...e.billboard, alpha: (e.billboard.alpha ?? 1) * Math.max(0, 1 - (now - e.born) / e.duration) })
    }
    return [...current.values()]
  }

  overlayScale(b: Billboard, now: number) {
    const effect = this.effects.find(e => e.key === `overlay:${overlayKey(b)}`)
    const t = effect ? Math.max(0, Math.min(1, (now - effect.born) / 0.1)) : 1
    return 0.55 + 0.45 * (1 - (1 - t) ** 3)
  }

  entrance(b: Billboard, now: number) {
    const effect = this.effects.find(e => e.key === objectKey(b))
    return effect ? Math.max(0, Math.min(1, (now - effect.born) / effect.duration)) : 1
  }

  tick(scene: Scene, now: number) {
    this.effects = this.effects.filter(e => now - e.born < e.duration && visible(scene, e))
  }

  clear() { this.effects = []; this.previous.clear(); this.visibleCells.clear(); this.areaFamilies.clear(); this.anchored.clear() }
}
