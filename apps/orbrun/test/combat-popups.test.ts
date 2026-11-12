// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { emptyScene, type MapRenderer } from '@orbrun/scene'
import { CombatPopups, popupMotion } from '../src/combat-popups'
import { combatText, type CombatPopup } from '../src/combat-feedback'

function preview() {
  const popups = new CombatPopups(), view = document.createElement('canvas'), scene = emptyScene()
  Object.defineProperties(view, { clientWidth: { value: 640 }, clientHeight: { value: 400 } })
  Object.assign(view.style, { left: '20px', top: '10px', width: '640px', height: '400px' })
  let anchor: { x: number; y: number } | null = { x: 200, y: 180 }
  const renderer = { project: () => anchor } as unknown as MapRenderer
  const render = (now: number, firstPerson = false, reduced = false) => popups.render(now, renderer, scene, view, firstPerson, reduced)
  return { popups, renderer, render, move: (p: typeof anchor) => { anchor = p } }
}

describe('popup presentation', () => {
  it('lets animated material sprays replace generic hit icons while keeping damage numbers and defenses', () => {
    const { popups, renderer, render } = preview()
    Object.assign(renderer, { materialHitEffects: true })
    popups.add([
      { kind: 'hit', text: 'HIT', x: 1, y: 0 },
      { kind: 'hit', text: '7', amount: 7, x: 1, y: 0 },
      { kind: 'hit', text: '0', amount: 0, x: 2, y: 0 },
      { kind: 'miss', text: 'MISS', x: 3, y: 0 },
    ], 0)
    render(100)
    expect(popups.root.querySelector<HTMLElement>('.visual-hit')!.hidden).toBe(true)
    for (const selector of ['.hit:not(.visual-hit):not(.no-damage)', '.no-damage', '.miss']) {
      expect(popups.root.querySelector<HTMLElement>(selector)!.hidden).toBe(false)
    }
    render(100, false, true)
    expect(popups.root.querySelector<HTMLElement>('.visual-hit')!.hidden).toBe(false)
    Object.assign(renderer, { materialHitEffects: false })
    render(100)
    expect(popups.root.querySelector<HTMLElement>('.visual-hit')!.hidden).toBe(false)
  })
  it.each([false, true])('shows a subtle armor symbol and separate cold damage feedback (concise=%s)', concise => {
    const { popups, render } = preview()
    popups.add([{ kind: 'hit', text: '0', amount: 0, tone: 'cold', x: 1, y: 0, turn: 1 }], 0, concise)
    render(100)
    const zero = popups.root.querySelector<HTMLElement>('.no-damage')!
    expect(zero.textContent).toBe('')
    expect(zero.title).toBe('Blocked (no damage)')
    expect(zero.querySelector('[data-icon="armor"]')).not.toBeNull()
    expect(zero.hidden).toBe(false)
    expect(zero.querySelector('.combat-estimate')).toBeNull()
    expect(popupMotion({ kind: 'hit', text: '0', amount: 0, tone: 'cold' }, 0.1, 1, false).glow).toBe(0)
    popups.add([{ kind: 'hit', text: '4', amount: 4, tone: 'cold', x: 1, y: 0, turn: 2 }], 150, concise)
    render(200)
    expect([...popups.root.children].map(n => n.textContent)).toEqual(['', '4'])
    expect(popups.root.querySelector('.hit:not(.no-damage) [data-icon="cold"]')).not.toBeNull()
  })

  it.each([false, true])('distinguishes player and enemy armor from shield blocks (concise=%s)', concise => {
    const { popups } = preview()
    popups.add(combatText('You hit the goblin but do no damage. The goblin hits you but does no damage. You block the goblin\'s attack. The goblin blocks your attack.'), 0, concise)
    expect([...popups.root.querySelectorAll('.combat-icon')].map(n => n.getAttribute('data-icon'))).toEqual(['armor', 'armor', 'shield', 'shield'])
    expect(popups.root.querySelectorAll('.no-damage')).toHaveLength(2)
    expect(popups.root.textContent).toBe('')
  })

  it.each<[CombatPopup, string | undefined, string]>([
    [{ kind: 'miss', text: 'MISS' }, 'miss', ''],
    [{ kind: 'miss', text: 'DODGED', player: true }, 'miss', ''],
    [{ kind: 'kill', text: 'SLAIN' }, 'kill', ''],
    [{ kind: 'hit', text: 'HIT' }, 'hit', ''],
    [{ kind: 'hit', text: '7', amount: 7 }, undefined, '7'],
    [{ kind: 'heal', text: '+7 HP', player: true }, 'heal', '+7'],
    [{ kind: 'heal', text: 'POISON CLEARED', player: true }, 'cured', ''],
    [{ kind: 'level', text: 'LEVEL 4', player: true }, undefined, 'LEVEL UP · 4'],
    ...Object.entries({ POISONED: 'poison', CONFUSED: 'confused', PARALYSED: 'paralysed', SLOWED: 'slowed', HASTED: 'hasted', BERSERK: 'berserk', CORRODED: 'acid', PETRIFYING: 'petrifying', INVISIBLE: 'invisible', SILENCED: 'silenced', HELD: 'held' }).map(([text, icon]): [CombatPopup, string, string] => [{ kind: 'status', text, player: true }, icon, '']),
    [{ kind: 'status', text: 'NEW STATUS', player: true }, 'magic', 'NEW STATUS'],
  ])('uses recognizable symbols and compact values for %j', (event, icon, value) => {
    const { popups } = preview()
    popups.add([event], 0)
    expect(popups.root.querySelector('.combat-icon')?.getAttribute('data-icon')).toBe(icon)
    expect(popups.root.textContent).toBe(value)
    expect((popups.root.firstElementChild as HTMLElement).title).toBe(event.text === 'HIT' ? 'light physical hit' : event.text)
  })

  it('identifies the receiver for defenses and other effects, including zero-damage player hits', () => {
    const { popups } = preview()
    popups.add(combatText('You miss the goblin. The goblin misses you. You block the goblin\'s attack. The goblin blocks your attack. You hit the goblin but do no damage. The goblin hits you but does no damage.'), 0)
    expect([...popups.root.children].map(n => n.classList.contains('on-player'))).toEqual([false, true, true, false, false, true])
    expect(popups.root.querySelectorAll('.on-player')).toHaveLength(3)
    expect(popups.root.querySelectorAll('.on-enemy')).toHaveLength(3)
  })

  it('keeps a level celebration alive longer than damage and freezes its particles with the frame clock', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'level', text: 'LEVEL 4', player: true }, { kind: 'hurt', text: '-3', player: true }], 0)
    render(400)
    const level = popups.root.querySelector<HTMLElement>('.level')!
    expect(level.querySelector('svg')).toBeNull()
    expect(level.querySelectorAll('.combat-confetti')).toHaveLength(48)
    const piece = level.querySelector<HTMLElement>('.combat-confetti')!
    const transform = piece.style.transform
    render(400)
    expect(piece.style.transform).toBe(transform)
    render(1300)
    expect(popups.root.querySelector('.hurt')).toBeNull()
    expect(popups.root.querySelector('.level')).toBe(level)
    expect(piece.style.transform).not.toBe(transform)
    popups.add([{ kind: 'hurt', text: '-4', player: true }], 1400)
    expect(popups.root.querySelector('.level')).toBe(level)
    render(2400)
    expect(popups.root.querySelector('.level')).toBeNull()
    popups.clear()
    expect(popups.root.querySelector('.combat-confetti')).toBeNull()
  })

  it('suppresses level confetti and movement in Still mode while keeping the announcement', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'level', text: 'LEVEL 4', player: true }], 0)
    render(100, true, true)
    const level = popups.root.querySelector<HTMLElement>('.level')!
    const transform = level.style.transform
    expect(level.textContent).toBe('LEVEL UP · 4')
    expect(level.querySelector<HTMLElement>('.combat-celebration')!.hidden).toBe(true)
    render(1000, true, true)
    expect(level.style.transform).toBe(transform)
  })

  it('anchors text to interpolated entities while the camera and target are moving', () => {
    const popups = new CombatPopups(), view = document.createElement('canvas'), scene = emptyScene()
    Object.defineProperties(view, { clientWidth: { value: 640 }, clientHeight: { value: 400 } })
    scene.billboards = [{ kind: 'player', tile: 1, x: 1, y: 0, height: 1 }, { kind: 'monster', id: 7, tile: 2, x: 2, y: 0, height: 1 }]
    const renderer = { project: () => ({ x: 999, y: 999 }), projectBillboard: (b: typeof scene.billboards[number]) => ({ x: b.kind === 'player' ? 320 : 400, y: 180 }) } as unknown as MapRenderer
    popups.add([{ kind: 'hurt', text: '-3', player: true }, { kind: 'hit', text: '7', actorId: 'id:7', x: 1, y: 0 }], 0)
    popups.render(100, renderer, scene, view, false, false)
    const nodes = [...popups.root.children] as HTMLElement[]
    expect(nodes.map(n => n.hidden)).toEqual([false, false])
    expect(nodes.map(n => n.style.left)).toEqual(['320px', '400px'])
  })

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
      { kind: 'hit', text: '7', amount: 7, x: 1, y: 0 },
      { kind: 'hit', text: 'HIT', followup: true, tone: 'fire', x: 1, y: 0 },
      { kind: 'kill', text: 'SLAIN', x: 1, y: 0 },
      { kind: 'hurt', text: '-3', player: true },
      { kind: 'miss', text: 'DODGED', player: true },
    ], 0, true)
    expect([...popups.root.children].map(n => n.textContent)).toEqual(['', '7', '-3', ''])
    expect(popups.root.querySelector('.miss [data-icon="miss"]')).not.toBeNull()
    expect(popups.root.querySelector('.hit.fire')).not.toBeNull()
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
    expect(popups.root.childElementCount).toBe(2)
    expect(popups.root.textContent).toBe('')
    expect(popups.root.querySelector('[data-icon="kill"]')).not.toBeNull()
    popups.clear()
    popups.add([{ kind: 'hit', text: '7', x: 1, y: 0 }, { kind: 'kill', text: 'SLAIN', x: 1, y: 0 }], 200)
    expect(popups.root.childElementCount).toBe(2)
  })
})

describe('contact feedback', () => {
  it('shows unknown amounts as typed intensity symbols and keeps exact amounts numeric', () => {
    const { popups, render } = preview()
    popups.add([
      { kind: 'hit', text: 'HIT', intensity: 'light', tone: 'cold', x: 1, y: 0 },
      { kind: 'hit', text: 'HIT', intensity: 'heavy', tone: 'fire', x: 2, y: 0 },
      { kind: 'hit', text: '8', amount: 8, x: 3, y: 0 },
    ], 0, true)
    render(100)
    expect(popups.root.textContent).toBe('8')
    expect(popups.root.querySelector('.intensity-light [data-icon="cold"]')).not.toBeNull()
    expect(popups.root.querySelector('.intensity-heavy [data-icon="fire"]')).not.toBeNull()
    expect(popups.root.querySelector('.combat-estimate')).toBeNull()
    render(550)
    expect(popups.root.textContent).toBe('8')
    expect(popups.root.querySelectorAll('.visual-hit')).toHaveLength(0)
  })
  it('keeps a popup hidden until contact and measures its lifetime from impact', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'hit', text: '8', amount: 8, x: 1, y: 0, delay: 150 }], 0)
    const node = popups.root.firstElementChild as HTMLElement
    expect(node.hidden).toBe(true)
    render(149)
    expect(node.hidden).toBe(true)
    expect(popups.active).toBe(true)
    render(150)
    expect(node.hidden).toBe(false)
    expect(node.textContent).toBe('8')
    render(1200)
    expect(popups.active).toBe(true)
    render(1250)
    expect(popups.active).toBe(false)
  })
  it('recolors a delayed brand while preserving a confirmed number and its contact time', () => {
    const { popups, render } = preview()
    popups.add([{ kind: 'hit', text: '7', amount: 7, turn: 10, x: 1, y: 0, delay: 150 }], 0)
    const entrance = popups.root.querySelector('.combat-number')
    popups.add([{ kind: 'hit', text: 'HIT', tone: 'fire', followup: true, brandOnly: true, turn: 10, x: 1, y: 0 }], 50)
    expect(popups.root.childElementCount).toBe(1)
    expect(popups.root.textContent).toBe('7')
    expect(popups.root.querySelector('.combat-number')).toBe(entrance)
    render(100)
    expect((popups.root.firstElementChild as HTMLElement).hidden).toBe(true)
    render(150)
    expect(popups.root.querySelector('[data-icon="fire"]')).not.toBeNull()
  })
})
