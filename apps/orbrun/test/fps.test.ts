// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { FpsCounter } from '../src/fps'

describe('dungeon FPS counter', () => {
  it.each([30, 60, 120])('measures %i rendered frames per second', hz => {
    const counter = new FpsCounter()
    counter.place({ left: 0, top: 0 })
    counter.update(0, true)
    for (let frame = 1; frame <= hz; frame++) counter.update(frame * 1000 / hz, true)
    expect(counter.root.textContent).toBe(`${hz} FPS`)
  })

  it('counts map draws rather than callbacks and settles to zero while idle', () => {
    const counter = new FpsCounter()
    counter.place({ left: 0, top: 0 })
    counter.update(0, true)
    for (let frame = 1; frame <= 60; frame++) counter.update(frame * 1000 / 60, frame % 2 === 0)
    expect(counter.root.textContent).toBe('30 FPS')
    counter.update(1250, false)
    counter.update(1500, false)
    expect(counter.root.textContent).toBe('0 FPS')
  })

  it('discards samples when hidden and starts fresh on returning to the dungeon', () => {
    const counter = new FpsCounter()
    counter.place({ left: 10, top: 20 })
    counter.update(0, true)
    counter.update(500, true)
    counter.place(null)
    counter.update(1000, true)
    expect(counter.root.hidden).toBe(true)
    counter.place({ left: 30, top: 40 })
    expect(counter.root.hidden).toBe(false)
    expect(counter.root.style.left).toBe('38px')
    expect(counter.root.style.top).toBe('48px')
    expect(counter.root.textContent).toBe('— FPS')
    counter.update(10_000, true)
    for (let frame = 1; frame <= 60; frame++) counter.update(10_000 + frame * 1000 / 60, true)
    expect(counter.root.textContent).toBe('60 FPS')
  })
})
