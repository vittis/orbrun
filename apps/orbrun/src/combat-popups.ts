import type { MapRenderer, Scene } from '@orbrun/scene'
import type { CombatPopup } from './combat-feedback'
import { combatIcon, type CombatIcon } from './combat-icons'
import { h } from './dom'
import './combat-popups.css'

const LIFETIME = 1100
const MAX_POPUPS = 10
const MAX_AT_ANCHOR = 3
interface LivePopup { event: CombatPopup; node: HTMLElement; born: number; slot: number }
const popupClass = (event: CombatPopup) => `combat-popup ${event.kind} ${event.tone ?? 'physical'}${event.heavy ? ' heavy' : ''}${event.estimated ? ' estimated' : ''}${event.amount === 0 ? ' no-damage' : ''}`
const statusIcons: Record<string, CombatIcon> = {
  POISONED: 'poison', CONFUSED: 'confused', PARALYSED: 'paralysed', SLOWED: 'slowed',
  HASTED: 'hasted', BERSERK: 'berserk', CORRODED: 'acid', PETRIFYING: 'petrifying',
  INVISIBLE: 'invisible', SILENCED: 'silenced', HELD: 'held',
}
function popupContent(event: CombatPopup): { icon: CombatIcon; value: string; label: string } {
  if (event.amount === 0) return { icon: 'armor', value: '', label: 'Blocked (no damage)' }
  if (event.text === 'POISON CLEARED') return { icon: 'cured', value: '', label: event.text }
  if (event.kind === 'status') {
    const icon = statusIcons[event.text]
    return { icon: icon ?? 'magic', value: icon ? '' : event.text, label: event.text }
  }
  if (event.kind === 'level') return { icon: 'level', value: event.text.replace(/^LEVEL\s+/, ''), label: event.text }
  if (event.kind === 'heal') return { icon: 'heal', value: event.text.replace(/ HP$/, ''), label: event.text }
  if (event.kind === 'miss' || event.kind === 'block' || event.kind === 'kill') {
    return { icon: event.kind === 'block' ? 'shield' : event.kind, value: '', label: event.text }
  }
  const icon = event.tone && event.tone !== 'physical' ? event.tone : event.kind === 'hurt' ? 'hurt' : 'hit'
  return { icon, value: event.estimated ? String(event.amount) : event.text === 'HIT' ? '' : event.text, label: event.text }
}
function paintPopup(node: HTMLElement, event: CombatPopup) {
  node.className = popupClass(event)
  const { icon, value, label } = popupContent(event)
  node.title = label
  node.classList.toggle('icon-only', !value)
  let number = node.querySelector('.combat-number')
  if (!number) { number = h('span', { class: 'combat-number' }); node.append(number) }
  // Keep this wrapper mounted when an estimate/brand refines the same hit,
  // so its compositor entrance runs once instead of restarting.
  number.replaceChildren(combatIcon(icon))
  if (value) {
    if (event.estimated) number.append(h('span', { class: 'combat-estimate' }, '≈'))
    number.append(h('span', { class: 'combat-value' }, value))
  }
}

/** Bounded trajectories driven by the same frame clock as placement/fading.
 * Elemental motion is applied to the number, leaving its anchor stable. */
export function popupMotion(event: CombatPopup, age: number, direction: number, reduced: boolean) {
  if (reduced || event.amount === 0 || event.kind === 'block' || event.kind === 'miss') return { x: 0, y: 0, scale: 1, sx: 1, sy: 1, angle: 0, glow: 0 }
  const settle = Math.exp(-age * 9), wave = Math.sin(age * Math.PI * 2)
  let x = 0, y = 0, sx = 1, sy = 1, angle = 0
  const tone = event.kind === 'heal' ? 'heal' : event.tone ?? 'physical'
  if (tone === 'fire') { x = Math.sin(age * 9) * 3 * (1 - age); y = -age * 9; angle = wave * 3 }
  else if (tone === 'cold') { x = direction * age * 5; sx += settle * 0.1; sy -= settle * 0.12; angle = direction * settle * 3 }
  else if (tone === 'poison') { x = wave * 4; y = Math.sin(age * Math.PI) * 3; angle = wave * 4 }
  else if (tone === 'acid') { x = Math.sin(age * 7) * 2; y = age * 6; sy -= settle * 0.15 }
  else if (tone === 'electric') { x = Math.sin(age * 28) * 3 * Math.exp(-age * 7); angle = Math.sin(age * 22) * 4 * settle }
  else if (tone === 'magic') { x = Math.sin(age * 12) * 2 * settle; angle = Math.sin(age * 9) * 5 * settle }
  else if (tone === 'heal') y = -Math.sin(age * Math.PI / 2) * 7
  else { x = direction * 5 * Math.sin(Math.min(1, age / 0.28) * Math.PI) * settle; sy -= settle * 0.08; sx += settle * 0.06 }
  const kick = Math.sin(Math.min(1, age / 0.22) * Math.PI)
  return { x, y, sx, sy, angle, scale: 1 + kick * (event.heavy ? 0.08 : 0.03), glow: (tone === 'physical' ? 0.12 : 0.45) + settle * 0.4 }
}

/** A bounded, pointer-transparent layer, positioned from the renderer after each frame. */
export class CombatPopups {
  readonly root = h('div', { class: 'combat-popups', 'aria-hidden': 'true' })
  private live: LivePopup[] = []
  get active() { return this.live.length > 0 }

  add(events: CombatPopup[], now: number, concise = false) {
    this.live = this.live.filter(p => {
      if (now - p.born < LIFETIME) return true
      p.node.remove()
      return false
    })
    for (const event of events) {
      const atAnchor = (p: LivePopup) => !!p.event.player === !!event.player && (event.actorId && p.event.actorId ? event.actorId === p.event.actorId : p.event.x === event.x && p.event.y === event.y)
      const hit = (event.brandOnly ?? event.followup) && (event.estimated || event.text === 'HIT') ? [...this.live].reverse().find(p => atAnchor(p) && p.event.kind === 'hit' && !p.event.followup && (event.turn === undefined || p.event.turn === event.turn)) : undefined
      if (hit) {
        hit.event = { ...hit.event, tone: event.tone, followup: true }
        paintPopup(hit.node, hit.event)
        continue
      }
      const previous = event.estimated && event.turn !== undefined ? this.live.find(p => atAnchor(p) && p.event.kind === 'hit' && p.event.estimated && p.event.turn === event.turn) : undefined
      if (previous) {
        // A delayed wound observation refines the existing estimate. Separate
        // attack messages in the same turn accumulate without more text clutter.
        const amount = event.fromWound || previous.event.fromWound ? Math.max(previous.event.amount!, event.amount!) : previous.event.amount! + event.amount!
        previous.event = { ...event, amount, text: '≈' + amount, heavy: amount >= 18 }
        paintPopup(previous.node, previous.event)
        if (!event.fromWound) previous.born = now
        continue
      }
      // A kill replaces generic hit words; an actual damage number can remain beside it.
      if (event.kind === 'kill') this.live = this.live.filter(p => {
        if (!atAnchor(p) || (p.event.kind === 'hit' && (p.event.estimated || /^\d+$/.test(p.event.text)))) return true
        p.node.remove()
        return false
      })
      // Retain kill events for damage estimation and cleanup, without adding
      // a redundant death label. Unknown brand hits can still recolor a number above.
      if (concise && (event.kind === 'kill' || event.kind === 'hit' && event.amount === undefined && !/^\d+$/.test(event.text))) continue
      const nearby = this.live.filter(atAnchor)
      while (nearby.length >= MAX_AT_ANCHOR) {
        const oldest = nearby.shift()!
        oldest.node.remove()
        this.live.splice(this.live.indexOf(oldest), 1)
      }
      const slots = new Set(nearby.map(p => p.slot))
      let slot = 0
      while (slots.has(slot)) slot++
      const node = h('span')
      paintPopup(node, event)
      this.root.append(node)
      this.live.push({ event, node, born: now, slot })
    }
    while (this.live.length > MAX_POPUPS) this.live.shift()!.node.remove()
  }

  render(now: number, renderer: MapRenderer, scene: Scene, view: HTMLCanvasElement, firstPerson: boolean, reducedMotion: boolean) {
    Object.assign(this.root.style, { left: view.style.left, top: view.style.top, width: view.style.width, height: view.style.height })
    const width = view.clientWidth, height = view.clientHeight
    this.live = this.live.filter(p => {
      const age = (now - p.born) / LIFETIME
      if (age >= 1) { p.node.remove(); return false }
      const e = p.event
      const billboard = scene.billboards.find(b => e.player ? b.kind === 'player'
        : b.kind === 'monster' && (e.actorId?.startsWith('id:') ? `id:${b.id ?? (b.ref as { id?: number } | undefined)?.id}` === e.actorId : b.x === e.x && b.y === e.y))
      const anchorHeight = e.player ? 0.8 : e.height
      const anchor = e.player && firstPerson
        ? { x: width * 0.5, y: height * 0.66 }
        : billboard && renderer.projectBillboard ? renderer.projectBillboard(billboard, anchorHeight)
          : renderer.project?.(e.player ? scene.player.x : e.x!, e.player ? scene.player.y : e.y!, anchorHeight)
      const visible = anchor && anchor.x >= 0 && anchor.x <= width && anchor.y >= 0 && anchor.y <= height
      p.node.hidden = !visible
      if (anchor && visible) {
        const motion = popupMotion(e, age, p.slot % 2 ? -1 : 1, reducedMotion)
        const drift = reducedMotion ? 0 : (e.kind === 'miss' ? 22 : 6) * age * (p.slot % 2 ? -1 : 1)
        const rise = reducedMotion ? 0 : (e.amount === 0 || e.kind === 'block' ? 22 : 30) * age
        p.node.style.left = `${Math.max(Math.min(48, width / 2), Math.min(width - Math.min(48, width / 2), anchor.x))}px`
        p.node.style.top = `${Math.max(32, anchor.y - 12 - p.slot * 20)}px`
        p.node.style.transform = `translate(calc(-50% + ${drift + motion.x}px), calc(-100% - ${rise - motion.y}px)) rotate(${motion.angle}deg) scale(${motion.scale * motion.sx}, ${motion.scale * motion.sy})`
        p.node.style.setProperty('--glow', `${motion.glow}`)
        p.node.style.setProperty('--heat-rise', `${reducedMotion ? -3 : -3 - age * 3}px`)
        p.node.dataset.motion = reducedMotion ? 'still' : 'full'
        p.node.style.opacity = String(Math.min(1, (1 - age) / 0.35))
      }
      return true
    })
    this.root.dataset.estimates = String(this.live.some(p => p.event.estimated && !p.node.hidden))
  }

  clear() { this.live = []; this.root.replaceChildren(); delete this.root.dataset.estimates }
}
