import { cellKey, type CellKey, type Scene, type SceneCell } from '@orbrun/scene'

export interface Light { colour: [number, number, number]; strength: number }
export interface Emitter { x: number; y: number; radius: number; colour: Light['colour']; power: number }
export interface LightPool { source: Emitter; cells: SceneCell[] }

/** Light follows known geometry. Unseen and remembered cells never emit light. */
function reaches(scene: Scene, from: Emitter, to: SceneCell) {
  const dx = to.x - from.x, dy = to.y - from.y
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2)
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + dx * i / steps), y = Math.round(from.y + dy * i / steps)
    if (x === to.x && y === to.y) continue // the wall's near face may receive light
    const cell = scene.cells.get(cellKey(x, y))
    if (!cell || cell.visibility !== 'visible' || cell.occluder) return false
  }
  return true
}

/** Baked on scene updates, never inferred from names or spell-message text. */
export function lightingFor(scene: Scene): { field: Map<CellKey, Light>; pools: LightPool[] } {
  const emitters: Emitter[] = []
  for (const cell of scene.cells.values()) {
    if (cell.visibility !== 'visible') continue
    if (cell.flags.lava) emitters.push({ ...cell, radius: 3, colour: [255, 112, 32], power: 0.4 })
    else if (cell.feature?.type === 'portal' || cell.feature?.type === 'transporter') emitters.push({ ...cell, radius: 3, colour: [105, 155, 255], power: 0.35 })
    else if (cell.feature?.type === 'altar') emitters.push({ ...cell, radius: 2.5, colour: [190, 166, 255], power: 0.25 })
  }
  emitters.sort((a, b) => Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
  emitters.length = Math.min(48, emitters.length)
  const result = new Map<CellKey, Light>()
  const pools = emitters.map(source => ({ source, cells: [] as SceneCell[] }))
  for (const [key, cell] of scene.cells) {
    if (cell.visibility !== 'visible') continue
    let r = 0, g = 0, b = 0, strength = 0
    for (const pool of pools) {
      const emitter = pool.source
      const distance = Math.hypot(cell.x - emitter.x, cell.y - emitter.y)
      if (distance >= emitter.radius || !reaches(scene, emitter, cell)) continue
      if (!cell.occluder) pool.cells.push(cell)
      const weight = emitter.power * (1 - distance / emitter.radius) ** 2
      r += emitter.colour[0] * weight
      g += emitter.colour[1] * weight
      b += emitter.colour[2] * weight
      strength += weight
    }
    if (strength > 0.015) result.set(key, {
      colour: [r, g, b].map(c => Math.min(255, Math.round(c / strength / 32) * 32)) as Light['colour'],
      strength: Math.round(Math.min(0.4, strength) * 32) / 32,
    })
  }
  return { field: result, pools }
}

export function lightField(scene: Scene) { return lightingFor(scene).field }
