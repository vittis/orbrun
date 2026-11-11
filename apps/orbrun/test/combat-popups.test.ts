// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { emptyScene, type MapRenderer } from '@orbrun/scene'
import { CombatPopups } from '../src/combat-popups'

function preview() {
  const popups = new CombatPopups(), view = document.createElement('canvas'), scene = emptyScene()
  Object.defineProperties(view, { clientWidth: { value: 640 }, clientHeight: { value: 400 } })
  Object.assign(view.style, { left: '20px', top: '10px', width: '640px', height: '400px' })
  let anchor: { x: number; y: number } | null = { x: 200, y: 180 }
  const renderer = { project: () => anchor } as unknown as MapRenderer
  const render = (now: number, firstPerson = false, reduced = false) => popups.render(now, renderer, scene, view, firstPerson, reduced)
  return { popups, render, move: (p: typeof anchor) => { anchor = p } }
}

describe('popup presentation', () => {
  it('renders text, follows camera projection, clips behind the lens and expires', () => {
    const { popups, render, move } = preview()
    popups.add([{ kind: 'hit', text: '23', x: 1, y: 0 }], 0)
    render(100)
    const node = popups.root.querySelector<HTMLElement>('span')!
    expect(node.textContent).toBe('23')
    expect(node.style.left).toBe('200px')
    expect(popups.root.style.left).toBe('20px')
    move({ x: 300, y: 180 }); render(200)
    expect(node.style.left).toBe('300px')
    move(null); render(300)
    expect(node.hidden).toBe(true)
    render(1200)
    expect(popups.active).toBe(false)
    expect(popups.root.childElementCount).toBe(0)
  })
  it('keeps first-person player feedback in view and fades without movement when requested', () => {
    const { popups, render, move } = preview()
    popups.add([{ kind: 'hurt', text: '-7', player: true }], 0)
    move(null); render(10, true, true)
    const node = popups.root.querySelector<HTMLElement>('span')!
    const transform = node.style.transform
    expect(node.hidden).toBe(false)
    expect(node.style.left).toBe('320px')
    render(1000, true, true)
    expect(node.style.transform).toBe(transform)
    expect(Number(node.style.opacity)).toBeLessThan(1)
  })
  it('bounds rapid effects, stacks simultaneous hits and clears on teardown', () => {
    const { popups, render } = preview()
    popups.add(Array.from({ length: 50 }, () => ({ kind: 'hit' as const, text: '5', x: 1, y: 0 })), 0)
    expect(popups.root.childElementCount).toBe(16)
    render(100)
    popups.clear()
    expect(popups.active).toBe(false)
    expect(popups.root.childElementCount).toBe(0)
  })
})
