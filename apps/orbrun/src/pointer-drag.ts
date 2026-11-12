/** Pointer displacement and click slop shared by dungeon selection and map dragging. */
export class PointerDrag {
  readonly x0: number
  readonly y0: number
  x: number
  y: number
  moved = false

  constructor(readonly touch: boolean, at: { x: number; y: number; t: number }) {
    this.x0 = this.x = at.x
    this.y0 = this.y = at.y
  }

  move(samples: readonly { x: number; y: number; t: number }[]): { dx: number; dy: number } | null {
    const at = samples.at(-1)
    if (!at) return null
    const dx = at.x - this.x, dy = at.y - this.y
    this.x = at.x
    this.y = at.y
    if (!this.moved && Math.hypot(at.x - this.x0, at.y - this.y0) < (this.touch ? 8 : 6)) return null
    this.moved = true
    return { dx, dy }
  }
}
