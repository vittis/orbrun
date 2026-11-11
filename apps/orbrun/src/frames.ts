/** Input is sampled before presentation, including a screen woken by that input. */
export class FrameScheduler {
  private input = new Map<number, FrameRequestCallback>()
  private render = new Map<number, FrameRequestCallback>()
  private nextId = 0
  private frame = 0
  private ticking = false

  constructor(
    private request = (fn: FrameRequestCallback) => requestAnimationFrame(fn),
    private cancel = (id: number) => cancelAnimationFrame(id),
  ) {}

  requestInput(fn: FrameRequestCallback): number {
    return this.add(this.input, fn)
  }

  requestRender(fn: FrameRequestCallback): number {
    return this.add(this.render, fn)
  }

  cancelFrame(id: number): void {
    this.input.delete(id)
    this.render.delete(id)
    if (!this.input.size && !this.render.size && this.frame) {
      this.cancel(this.frame)
      this.frame = 0
    }
  }

  private add(queue: Map<number, FrameRequestCallback>, fn: FrameRequestCallback): number {
    const id = ++this.nextId
    queue.set(id, fn)
    this.schedule()
    return id
  }

  private schedule(): void {
    if (!this.ticking && !this.frame && (this.input.size || this.render.size)) this.frame = this.request(this.tick)
  }

  private flush(queue: Map<number, FrameRequestCallback>, now: number): void {
    // A callback may cancel another, or request its own next frame.
    for (const id of [...queue.keys()]) {
      const fn = queue.get(id)
      if (!fn) continue
      queue.delete(id)
      fn(now)
    }
  }

  private tick = (now: number): void => {
    this.frame = 0
    this.ticking = true
    try {
      this.flush(this.input, now)
      // Take this snapshot AFTER input: a newly woken game paints this frame.
      this.flush(this.render, now)
    } finally {
      this.ticking = false
      this.schedule()
    }
  }
}

const frames = new FrameScheduler()
export const requestInputFrame = (fn: FrameRequestCallback) => frames.requestInput(fn)
export const requestRenderFrame = (fn: FrameRequestCallback) => frames.requestRender(fn)
export const cancelFrame = (id: number) => frames.cancelFrame(id)
