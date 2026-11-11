import type { MapRenderer, Scene } from '@orbrun/scene'
import type { CombatPopup } from './combat-feedback'
import { h } from './dom'
import './combat-popups.css'

const LIFETIME = 1100
const MAX_POPUPS = 10
const MAX_AT_ANCHOR = 3
interface LivePopup { event: CombatPopup; node: HTMLElement; born: number; slot: number }
const popupClass = (event: CombatPopup) => `combat-popup ${event.kind} ${event.tone ?? 'physical'}${event.heavy ? ' heavy' : ''}`

/** A bounded, pointer-transparent layer, positioned from the renderer after each frame. */
export class CombatPopups {
  readonly root = h('div', { class: 'combat-popups', 'aria-hidden': 'true' })
  private live: LivePopup[] = []
  get active() { return this.live.length > 0 }

  add(events: CombatPopup[], now: number) {
    this.live = this.live.filter(p => {
      if (now - p.born < LIFETIME) return true
      p.node.remove()
      return false
    })
    for (const event of events) {
      const atAnchor = (p: LivePopup) => !!p.event.player === !!event.player && p.event.x === event.x && p.event.y === event.y
      const hit = event.followup && event.text === 'HIT' ? [...this.live].reverse().find(p => atAnchor(p) && p.event.kind === 'hit' && !p.event.followup) : undefined
      if (hit) {
        hit.event = { ...hit.event, tone: event.tone, followup: true }
        hit.node.className = popupClass(hit.event)
        continue
      }
      // A kill replaces generic hit words; an actual damage number can remain beside it.
      if (event.kind === 'kill') this.live = this.live.filter(p => {
        if (!atAnchor(p) || (p.event.kind === 'hit' && /^\d+$/.test(p.event.text))) return true
        p.node.remove()
        return false
      })
      const nearby = this.live.filter(atAnchor)
      while (nearby.length >= MAX_AT_ANCHOR) {
        const oldest = nearby.shift()!
        oldest.node.remove()
        this.live.splice(this.live.indexOf(oldest), 1)
      }
      const slots = new Set(nearby.map(p => p.slot))
      let slot = 0
      while (slots.has(slot)) slot++
      const node = h('span', { class: popupClass(event) }, event.text)
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
      const anchor = e.player && firstPerson
        ? { x: width * 0.5, y: height * 0.66 }
        : renderer.project?.(e.player ? scene.player.x : e.x!, e.player ? scene.player.y : e.y!, e.player ? 0.8 : e.height)
      const visible = anchor && anchor.x >= 0 && anchor.x <= width && anchor.y >= 0 && anchor.y <= height
      p.node.hidden = !visible
      if (anchor && visible) {
        const drift = reducedMotion ? 0 : (e.kind === 'miss' ? 22 : 6) * age * (p.slot % 2 ? -1 : 1)
        const rise = reducedMotion ? 0 : 36 * age
        const pop = reducedMotion ? 1 : 1 + 0.22 * Math.sin(Math.min(1, age / 0.18) * Math.PI)
        p.node.style.left = `${Math.max(Math.min(48, width / 2), Math.min(width - Math.min(48, width / 2), anchor.x))}px`
        p.node.style.top = `${Math.max(38, anchor.y - 12 - p.slot * 24)}px`
        p.node.style.transform = `translate(calc(-50% + ${drift}px), calc(-100% - ${rise}px)) scale(${pop})`
        p.node.style.opacity = String(Math.min(1, (1 - age) / 0.35))
      }
      return true
    })
  }

  clear() { this.live = []; this.root.replaceChildren() }
}
