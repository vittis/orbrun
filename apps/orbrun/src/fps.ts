import { h } from './dom'

/** Counts actual map draws on the game's clock, without keeping its frame loop awake. */
export class FpsCounter {
  readonly root = h('div', { class: 'fps-counter', hidden: true, 'aria-hidden': 'true' }, '— FPS')
  private start: number | null = null
  private frames = 0

  place(view: { left: number; top: number } | null) {
    const hidden = view === null
    if (this.root.hidden !== hidden) {
      this.start = null
      this.frames = 0
      this.root.textContent = '— FPS'
      this.root.hidden = hidden
    }
    if (view) {
      this.root.style.left = view.left + 8 + 'px'
      this.root.style.top = view.top + 8 + 'px'
    }
  }

  update(now: number, rendered: boolean) {
    if (this.root.hidden) return
    if (this.start === null) {
      this.start = now
      return
    }
    if (rendered) this.frames++
    const elapsed = now - this.start
    if (elapsed < 500) return
    this.root.textContent = `${Math.round(this.frames * 1000 / elapsed)} FPS`
    this.start = now
    this.frames = 0
  }
}
