import type { Scene } from '@orbrun/scene'
import type { GameState, ServerMessage } from '@orbrun/webtiles'
import { h } from './dom'
import './near-death.css'

const LOW_HP = 0.3
const FADE_MS = 2800
const ATTACK_MS = 160
const snapshot = (state: GameState) => ({
  hp: state.player.hp, max: state.player.hp_max,
  place: `${state.player.place}:${state.player.depth}`,
})

/** The native low-HP warning washes the whole view red. Local spell flashes
 * retain their tile effects; a view-wide warning belongs on the screen. */
export function withoutHealthFlash(scene: Scene): Scene {
  const visible = [...scene.cells.values()].filter(c => c.visibility === 'visible')
  const flash = visible[0]?.flash
  if (!scene.playerOnLevel || visible.length < 2 || !flash || flash.a <= 0
    || flash.r <= flash.g * 1.3 || flash.r <= flash.b * 1.3
    || !visible.every(c => c.flash?.r === flash.r && c.flash.g === flash.g
      && c.flash.b === flash.b && c.flash.a === flash.a)) return scene
  return { ...scene, cells: new Map([...scene.cells].map(([key, cell]) =>
    [key, cell.visibility === 'visible' ? { ...cell, flash: undefined } : cell])) }
}

/** A single fading envelope, independent of popup settings and game turns. */
export class NearDeath {
  readonly root = h('div', { class: 'near-death', 'aria-hidden': 'true' })
  private previous: ReturnType<typeof snapshot>
  private born = -Infinity
  private startOpacity = 0
  private filtered = new WeakMap<Scene, Scene>()

  constructor(state: GameState) {
    this.previous = snapshot(state)
    this.root.hidden = true
  }

  observe(state: GameState, msg: ServerMessage, now: number) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.clear()
      this.previous = { hp: 0, max: 0, place: '' }
    } else if (msg.msg === 'player') {
      const next = snapshot(state), prev = this.previous
      if (next.place !== prev.place || next.hp <= 0 || next.max <= 0) this.clear()
      else if (prev.max > 0 && next.max === prev.max && next.hp < prev.hp
        && next.hp / next.max <= LOW_HP && now - this.born >= 600) {
        this.startOpacity = this.opacity(now)
        this.born = now
      }
      this.previous = next
    }
  }

  /** Filter before receipt-time observations can turn the warning into fire. */
  scene(scene: Scene): Scene {
    if (this.previous.max <= 0 || this.previous.hp / this.previous.max > LOW_HP) return scene
    let filtered = this.filtered.get(scene)
    if (!filtered) {
      filtered = withoutHealthFlash(scene)
      this.filtered.set(scene, filtered)
    }
    return filtered
  }

  private opacity(now: number) {
    const age = now - this.born
    if (age < 0 || age >= FADE_MS) return 0
    if (age < ATTACK_MS) {
      const t = age / ATTACK_MS
      return this.startOpacity + (1 - this.startOpacity) * t * t * (3 - 2 * t)
    }
    return Math.pow(1 - (age - ATTACK_MS) / (FADE_MS - ATTACK_MS), 2)
  }

  render(now: number, visible: boolean, reducedMotion: boolean) {
    if (now - this.born >= FADE_MS) this.born = -Infinity
    const opacity = this.opacity(now)
    this.root.hidden = !visible || opacity <= 0
    this.root.style.opacity = String(opacity * (reducedMotion ? 0.65 : 1))
  }

  get active() { return this.born !== -Infinity }

  clear() {
    this.born = -Infinity
    this.startOpacity = 0
    this.root.hidden = true
    this.root.style.opacity = '0'
    this.filtered = new WeakMap()
  }
}
