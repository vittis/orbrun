import { cellKey, emittersFor, type Billboard, type Emitter, type MeleeAttack, type Scene } from '@orbrun/scene'

export interface MeleeStroke extends MeleeAttack { born: number; duration: number }
export interface SpellTrace { source: Emitter; born: number; duration: number }
const visible = (scene: Scene, p: { x: number; y: number }) => scene.cells.get(cellKey(p.x, p.y))?.visibility === 'visible'
const signature = (s: Emitter) => `${s.x},${s.y}:${s.colour.join(',')}`

/** Small, bounded visual histories. No game rules, prose parsing or timers. */
export class DungeonEffects {
  strokes: MeleeStroke[] = []
  traces: SpellTrace[] = []
  private spells = new Map<string, Emitter>()
  private level: string | undefined
  private onLevel = false

  observe(scene: Scene, now: number, animate: boolean) {
    if (!animate || !scene.playerOnLevel || !this.onLevel || scene.levelKey !== this.level) this.clear()
    this.level = scene.levelKey
    this.onLevel = scene.playerOnLevel
    const next = new Map(emittersFor(scene).filter(s => s.transient).map(s => [signature(s), s]))
    if (animate && scene.playerOnLevel) for (const [key, source] of this.spells) {
      if (next.has(key) || !visible(scene, source)) continue
      // Fire smoulders longer; electrical/cold/magic traces dissipate sooner.
      const duration = source.pulse === 'electric' ? 1.25 : source.pulse === 'fire' ? 2.8 : 2.1
      this.traces = this.traces.filter(t => signature(t.source) !== key)
      this.traces.push({ source, born: now, duration })
    }
    this.spells = animate ? next : new Map()
    this.tick(scene, now)
    this.traces = this.traces.slice(-48)
  }

  melee(scene: Scene, attack: MeleeAttack, now: number) {
    const distance = Math.hypot(attack.to.x - attack.from.x, attack.to.y - attack.from.y)
    if (!scene.playerOnLevel || !visible(scene, attack.from) || !visible(scene, attack.to) || distance < 0.5 || distance > 2.9) return false
    // Multiple reports for a cleave/brand must not stack the same stroke.
    if (this.strokes.some(s => s.from.x === attack.from.x && s.from.y === attack.from.y && s.to.x === attack.to.x && s.to.y === attack.to.y && Math.abs(now - s.born) < 0.09)) return false
    this.strokes.push({ ...attack, from: { ...attack.from }, to: { ...attack.to }, born: now, duration: attack.style === 'crush' || attack.style === 'cleave' ? 0.3 : 0.23 })
    this.strokes = this.strokes.slice(-12)
    return true
  }

  offset(b: Billboard, now: number) {
    let x = 0, y = 0
    if (b.lying || b.scenery || b.life?.held || b.kind !== 'monster' && b.kind !== 'player') return { x, y }
    for (const stroke of this.strokes) {
      const age = (now - stroke.born) / stroke.duration
      if (age < 0 || age >= 1) continue
      const dx = stroke.to.x - stroke.from.x, dy = stroke.to.y - stroke.from.y, length = Math.hypot(dx, dy)
      const attacker = b.x === stroke.from.x && b.y === stroke.from.y
      const target = stroke.hit && b.x === stroke.to.x && b.y === stroke.to.y
      const kick = attacker ? Math.sin(Math.PI * age) * 0.085
        : target ? Math.sin(Math.PI * Math.max(0, (age - 0.22) / 0.78)) * 0.045 : 0
      x += dx / length * kick; y += dy / length * kick
    }
    // Rapid actions never accumulate more than a small fraction of a cell.
    const limit = Math.max(1, Math.hypot(x, y) / 0.12)
    return { x: x / limit, y: y / limit }
  }

  tick(scene: Scene, now: number) {
    this.strokes = this.strokes.filter(s => now - s.born < s.duration && visible(scene, s.from) && visible(scene, s.to))
    this.traces = this.traces.filter(t => now - t.born < t.duration && visible(scene, t.source))
  }

  clear() { this.strokes = []; this.traces = []; this.spells.clear(); this.onLevel = false; this.level = undefined }
}
