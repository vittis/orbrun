import { h } from '../dom'
import { getSettings } from '../servers'
import { placeById } from './places'
import type { Room25d } from './room-25d'

const ROOM_MAX_DPR = 1
const GRID_COLS = 59
const GRID_ROWS = 32

/** A saved dungeon scene beneath the menus, using the gameplay renderer. */
export class RoomView {
  readonly el: HTMLCanvasElement
  readonly veil: HTMLElement
  onfit: (() => void) | null = null
  private readonly host: HTMLElement
  private readonly place: string
  private readonly media: MediaQueryList | null
  private ro: ResizeObserver | null = null
  private grid = { cw: 16, ch: 23 }
  private room: Room25d | null = null
  private raf = 0
  private needsRender = false
  private destroyed = false
  private covered = false
  private size = { w: 1, h: 1 }

  get cellWidth(): number { return this.grid.cw }

  constructor(host: HTMLElement, place: string) {
    this.host = host
    this.place = place
    this.el = h('canvas', { class: 'room', 'aria-hidden': 'true' })
    this.veil = h('div', { class: 'room-veil', 'aria-hidden': 'true' })
    this.veil.dataset.tint = placeById(place)?.tint ?? ''
    host.prepend(this.veil)
    host.prepend(this.el)
    this.media = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    this.media?.addEventListener?.('change', this.applySettings)
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this.fit)
      this.ro.observe(this.el)
    }
    this.fit()
    document.addEventListener('visibilitychange', this.onVisibility)
    void this.start()
  }

  cover(on: boolean) {
    this.covered = on
    if (on) this.stop()
    else this.invalidate()
  }

  destroy() {
    this.destroyed = true
    this.stop()
    this.ro?.disconnect()
    this.media?.removeEventListener?.('change', this.applySettings)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.room?.destroy()
    this.room = null
    this.el.remove()
    this.veil.remove()
  }

  private async start() {
    let room: Room25d | null = null
    try {
      const { Room25d } = await import('./room-25d')
      if (this.destroyed) return
      room = Room25d.create(this.el, this.media?.matches ?? false)
      await room.show(this.place)
      if (this.destroyed) return room.destroy()
      this.room = room
      this.applySettings()
      room.resize(this.size.w, this.size.h, dpr())
      this.invalidate()
    } catch (error) {
      room?.destroy()
      if (!this.destroyed) console.warn('The menu scenery could not be drawn.', error)
    }
  }

  applySettings = () => {
    this.room?.applySettings(getSettings(), this.media?.matches ?? false)
    this.invalidate()
  }

  private fit = () => {
    const w = this.el.clientWidth || window.innerWidth
    const hgt = this.el.clientHeight || window.innerHeight
    const cw = Math.min(18, Math.max(11, Math.ceil(Math.max(w / GRID_COLS, hgt / (GRID_ROWS * 1.45)))))
    const ch = Math.round(cw * 1.45), fs = Math.round(cw * 1.55)
    this.grid = { cw, ch }
    this.host.style.setProperty('--cw', cw + 'px')
    this.host.style.setProperty('--ch', ch + 'px')
    this.host.style.setProperty('--fs', fs + 'px')
    this.host.style.setProperty('--fit', (cw - fs * 0.602).toFixed(2) + 'px')
    this.size = { w, h: hgt }
    this.room?.resize(w, hgt, dpr())
    this.invalidate()
    this.onfit?.()
  }

  private stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private invalidate() {
    this.needsRender = true
    if (!this.raf && !this.destroyed && !document.hidden && !this.covered) this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    this.raf = 0
    if (this.destroyed || this.covered || document.hidden) return
    if (this.needsRender && this.room) {
      this.needsRender = this.room.render(now / 1000)
      this.el.classList.add('in')
      if (this.needsRender) this.raf = requestAnimationFrame(this.tick)
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.stop()
    else this.invalidate()
  }
}

function dpr() { return Math.min(window.devicePixelRatio || 1, ROOM_MAX_DPR) }
