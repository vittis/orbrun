// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { emptyScene, type MapRenderer } from '@orbrun/scene'
import { CombatPopups, popupMotion } from '../src/combat-popups'

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
  it('gives each damage type a distinct bounded trajectory and stops motion when requested', () => {
    const tones = ['physical', 'fire', 'cold', 'poison', 'acid', 'electric', 'magic'] as const
    const poses = tones.map(tone => popupMotion({ kind: 'hit', text: '7', tone }, 0.12, 1, false))
    expect(new Set(poses.map(p => JSON.stringify(p))).size).toBe(tones.length)
    for (const tone of tones) for (let frame = 0; frame <= 66; frame++) {
      const event = { kind: 'hit' as const, text: '7', tone }
      const p = popupMotion(event, frame / 66, 1, false)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(6)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(10)
      expect(Math.abs(p.angle)).toBeLessThanOrEqual(5)
      expect(popupMotion(event, frame / 66, 1, true)).toEqual({ x: 0, y: 0, scale: 1, sx: 1, sy: 1, angle: 0, glow: 0 })
    }
    const event = { kind: 'hit' as const, text: '20' }
    expect(popupMotion({ ...event, heavy: true }, 0.1, 1, false).scale).toBeGreaterThan(popupMotion(event, 0.1, 1, false).scale)
  })
  it('keeps damage and useful feedback in concise mode without generic hit or slain labels', () => {
    const { popups } = preview()
    popups.add([
      { kind: 'hit', text: 'HIT', x: 1, y: 0 },
      { kind: 'hit', text: '≈7', amount: 7, estimated: true, x: 1, y: 0 },
      { kind: 'hit', text: 'HIT', followup: true, tone: 'fire', x: 1, y: 0 },
      { kind: 'kill', text: 'SLAIN', x: 1, y: 0 },
      { kind: 'hurt', text: '-3', player: true },
      { kind: 'miss', text: 'DODGED', player: true },
    ], 0, true)
    expect([...popups.root.children].map(n => n.textContent)).toEqual(['≈7', '-3', 'DODGED'])
    expect(popups.root.querySelector('.hit')?.classList.contains('fire')).toBe(true)
    popups.clear()
    popups.add([{ kind: 'kill', text: 'SLAIN', x: 1, y: 0 }], 10, true)
    expect(popups.active).toBe(false)
  })
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
    expect(popups.root.childElementCount).toBe(3)
    render(100)
    const tops = [...popups.root.children].map(n => (n as HTMLElement).style.top)
    expect(new Set(tops).size).toBe(3)
    popups.clear()
    expect(popups.active).toBe(false)
    expect(popups.root.childElementCount).toBe(0)
  })
  it('caps total effects across different targets', () => {
    const { popups } = preview()
    popups.add(Array.from({ length: 50 }, (_, x) => ({ kind: 'hit' as const, text: 'HIT', x, y: 0 })), 0)
    expect(popups.root.childElementCount).toBe(10)
  })
  it('merges delayed weapon brands and replaces generic hit words on a kill', () => {
    const { popups } = preview()
    popups.add([{ kind: 'hit', text: 'HIT', x: 1, y: 0 }], 0)
    popups.add([{ kind: 'hit', text: 'HIT', tone: 'fire', followup: true, x: 1, y: 0 }], 50)
    expect(popups.root.childElementCount).toBe(1)
    expect(popups.root.firstElementChild?.classList.contains('fire')).toBe(true)
    popups.add([{ kind: 'kill', text: 'SLAIN', x: 1, y: 0 }], 100)
    expect(popups.root.childElementCount).toBe(1)
    expect(popups.root.textContent).toBe('SLAIN')
    popups.clear()
    popups.add([{ kind: 'hit', text: '7', x: 1, y: 0 }, { kind: 'kill', text: 'SLAIN', x: 1, y: 0 }], 200)
    expect(popups.root.childElementCount).toBe(2)
  })
})

describe('estimated number UX', () => {
  it('marks estimates separately, explains the symbol and keeps their number beside a kill', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'hit', text: '≈12', amount: 12, estimated: true, x: 1, y: 0, turn: 1 }], 0)
    render(100)
    expect(popups.root.querySelector('.combat-estimate')?.textContent).toBe('≈')
    expect(popups.root.querySelector('.combat-value')?.textContent).toBe('12')
    expect(popups.root.dataset.estimates).toBe('true')
    popups.add([{ kind: 'kill', text: 'SLAIN', x: 1, y: 0 }], 120)
    expect(popups.root.childElementCount).toBe(2)
    popups.clear()
    expect(popups.root.dataset.estimates).toBeUndefined()
  })
  it('accumulates a same-turn number across frames without creating a stack', () => {
    const { popups } = preview()
    const hit = { kind: 'hit' as const, text: '≈4', amount: 4, estimated: true, turn: 10, actorId: 'id:1', x: 1, y: 0 }
    popups.add([hit], 0)
    popups.add([{ ...hit, x: 2 }], 100)
    expect(popups.root.childElementCount).toBe(1)
    expect(popups.root.textContent).toBe('≈8')
    popups.add([{ ...hit, turn: 11 }], 200)
    expect(popups.root.childElementCount).toBe(2)
    popups.add([{ ...hit, amount: 9, text: '≈9', fromWound: true }], 250)
    expect(popups.root.childElementCount).toBe(2)
    expect(popups.root.textContent).toBe('≈9≈4')
  })
  it('recolors a delayed unknown brand without adding a guessed second hit', () => {
    const { popups } = preview()
    const hit = { kind: 'hit' as const, text: '≈4', amount: 4, estimated: true, turn: 10, x: 1, y: 0 }
    popups.add([hit], 0)
    const entrance = popups.root.querySelector('.combat-number')
    popups.add([{ ...hit, text: '≈12', amount: 12, tone: 'fire', followup: true, brandOnly: true }], 100)
    expect(popups.root.childElementCount).toBe(1)
    expect(popups.root.textContent).toBe('≈4')
    expect(popups.root.firstElementChild?.classList.contains('fire')).toBe(true)
    expect(popups.root.querySelector('.combat-number')).toBe(entrance)
  })
  it('does not mark exact damage as approximate', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'hit', text: '12', amount: 12, x: 1, y: 0 }], 0)
    render(100)
    expect(popups.root.querySelector('.combat-estimate')).toBeNull()
    expect(popups.root.dataset.estimates).toBe('false')
  })
})
