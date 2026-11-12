import { afterEach, describe, expect, it, vi } from 'vitest'
import { GamepadInput, isPadActivity, standardView, type PadEvent } from '../src/gamepad'

/** A standard-mapping pad with nothing pressed and the sticks at the given axes. */
function fakePad(axes: number[]): Gamepad {
  return {
    id: 'Xbox Wireless Controller (045e)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad
}

function withPad(axes: number[]) {
  vi.stubGlobal('navigator', { getGamepads: () => [fakePad(axes)] })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('right stick pan has hysteresis', () => {
  it('a stick resting off centre inside the enter threshold emits no pan, so it never counts as the pad speaking', () => {
    const gp = new GamepadInput()
    const pans: PadEvent[] = []
    gp.on((e) => { if (e.type === 'pan') pans.push(e) })
    // drift of 0.2 is past the 0.15 deadzone but short of the 0.3 entry
    withPad([0, 0, 0.2, 0.05])
    for (let t = 0; t < 10; t++) gp.poll(t * 16)
    expect(pans).toEqual([])
    expect(gp.isPanning).toBe(false)
  })

  it('a deliberate deflection starts a pan, keeps it down to the deadzone, and settles once', () => {
    const gp = new GamepadInput()
    const pans: { dx: number; dy: number }[] = []
    gp.on((e) => { if (e.type === 'pan') pans.push({ dx: e.dx, dy: e.dy }) })
    withPad([0, 0, 0.6, 0])
    gp.poll(0)
    expect(gp.isPanning).toBe(true)
    expect(pans.length).toBe(1)
    expect(pans[0].dx).toBeGreaterThan(0)
    // easing back to 0.2 is still inside the pan once it has started
    withPad([0, 0, 0.2, 0])
    gp.poll(16)
    expect(gp.isPanning).toBe(true)
    expect(pans.length).toBe(2)
    expect(pans[1].dx).toBeGreaterThan(0)
    // under the deadzone: one settling event with zero delta, then silence
    withPad([0, 0, 0.1, 0])
    gp.poll(32)
    gp.poll(48)
    expect(gp.isPanning).toBe(false)
    expect(pans.length).toBe(3)
    expect(pans[2]).toEqual({ dx: 0, dy: 0 })
  })
  it('only the first frame of a pan is the pad speaking: a stick held past the threshold, or resting there, does not keep saying so', () => {
    const gp = new GamepadInput()
    const events: PadEvent[] = []
    gp.on((e) => events.push(e))
    withPad([0, 0, 0.6, 0])
    gp.poll(0)
    gp.poll(16)
    gp.poll(32)
    withPad([0, 0, 0.1, 0])
    gp.poll(48)
    expect(events.map((e) => isPadActivity(e))).toEqual([true, false, false, false])
    expect(events.map((e) => e.type === 'pan' && e.start === true)).toEqual([true, false, false, false])
  })
})

describe('which pad is primary on a Steam Deck with an external controller', () => {
  /** The raw device as Chrome sees it without a mapping: triggers rest at -1 on axes 2 and 5. */
  function rawPad(index: number): Gamepad {
    const buttons = Array.from({ length: 11 }, () => ({ pressed: false, touched: false, value: 0 }))
    return { ...fakePad([0, 0, -1, 0, 0, -1, 0, 0]), buttons, id: 'Microsoft X-Box 360 pad (045e-028e)', index, mapping: '' } as unknown as Gamepad
  }

  it('a raw pad resting its triggers at -1 does not take the primary from the pad being pressed', () => {
    const deck = { ...fakePad([0, 0, 0, 0]), id: 'Steam Virtual Gamepad', index: 0 } as unknown as Gamepad
    const raw = rawPad(1)
    vi.stubGlobal('navigator', { getGamepads: () => [deck, raw] })
    const gp = new GamepadInput()
    const events: PadEvent[] = []
    gp.on((e) => events.push(e))
    gp.poll(0)
    // no pan from the raw pad's resting -1 on axis 2
    expect(events).toEqual([])
    deck.buttons[0] = { pressed: true, touched: true, value: 1 }
    gp.poll(16)
    expect(gp.isHeld('A')).toBe(true)
  })

  it('the unmapped pad alone is read once it is used', () => {
    const raw = rawPad(0)
    vi.stubGlobal('navigator', { getGamepads: () => [raw] })
    const gp = new GamepadInput()
    gp.poll(0)
    raw.buttons[0] = { pressed: true, touched: true, value: 1 }
    gp.poll(16)
    expect(gp.isHeld('A')).toBe(true)
  })

  it('when a Steam Input pad and its raw twin wake together, the standard one is read', () => {
    const deck = { ...fakePad([0, 0, 0, 0]), index: 0 } as unknown as Gamepad
    const virt = { ...fakePad([0, 0, 0, 0]), index: 1 } as unknown as Gamepad
    const raw = rawPad(2)
    vi.stubGlobal('navigator', { getGamepads: () => [deck, virt, raw] })
    const gp = new GamepadInput()
    gp.poll(0)
    // Back on the external pad: index 8 on the virtual pad, index 6 (LT's slot) on the raw one
    virt.buttons[8] = { pressed: true, touched: true, value: 1 }
    raw.buttons[6] = { pressed: true, touched: true, value: 1 }
    gp.poll(16)
    expect(gp.isHeld('SELECT')).toBe(true)
    expect(gp.isHeld('LT')).toBe(false)
  })
})

describe('an unmapped pad is read in the standard layout', () => {
  function raw(nButtons: number, axes: number[], down: number[]): Gamepad {
    const buttons = Array.from({ length: nButtons }, (_, i) => ({ pressed: down.includes(i), touched: false, value: down.includes(i) ? 1 : 0 }))
    return { id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b13)', index: 0, mapping: '', axes, buttons } as unknown as Gamepad
  }
  const held = (v: { buttons: boolean[] }) => v.buttons.flatMap((d, i) => (d ? [i] : []))

  it('a wired (xpad) pad: Back, Start, Guide and the stick clicks move to their slots, the triggers and d-pad come off axes', () => {
    expect(held(standardView(raw(11, [0, 0, -1, 0, 0, -1, 0, 0], [6, 7, 8, 9, 10])))).toEqual([8, 9, 10, 11, 16])
    expect(held(standardView(raw(11, [0, 0, 1, 0, 0, 1, -1, 1], [])))).toEqual([6, 7, 13, 14])
    expect(standardView(raw(11, [0.1, 0.2, -1, 0.3, 0.4, -1, 0, 0], [])).axes).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it('a Bluetooth pad: X and Y skip the gaps, the bumpers come off 6 and 7, the triggers off axes 5 and 4', () => {
    expect(held(standardView(raw(15, [0, 0, 0, 0, -1, -1, 0, 0], [0, 1, 3, 4, 6, 7, 10, 11, 12, 13, 14])))).toEqual([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 16])
    expect(held(standardView(raw(15, [0, 0, 0, 0, 1, 1, 1, -1], [])))).toEqual([6, 7, 12, 15])
    expect(standardView(raw(15, [0.1, 0.2, 0.3, 0.4, -1, -1, 0, 0], [])).axes).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  it('a resting raw pad presses nothing', () => {
    expect(held(standardView(raw(11, [0, 0, -1, 0, 0, -1, 0, 0], [])))).toEqual([])
    expect(held(standardView(raw(15, [0, 0, 0, 0, -1, -1, 0, 0], [])))).toEqual([])
  })

  it.each([16, 17])('preserves every Android canonical button with an empty mapping (%i buttons)', (count) => {
    for (let i = 0; i < count; i++) {
      const pad = { ...raw(count, [0.1, 0.2, 0.3, 0.4], [i]), id: 'Odin Controller' }
      expect(held(standardView(pad))).toEqual([i])
      expect(standardView(pad).axes).toEqual([0.1, 0.2, 0.3, 0.4])
    }
  })

  it('does not mistake extra Android axes for Linux triggers or a d-pad hat', () => {
    const pad = raw(17, [0, 0, 0, 0, -1, 1, -1, 1], [6])
    expect(held(standardView(pad))).toEqual([6])
  })

  it.each([11, 15])('requires raw axes as well as a matching button count (%i)', (count) => {
    expect(held(standardView(raw(count, [0, 0, 0, 0], [6])))).toEqual([6])
  })

  it.each([
    [11, 2, 6], [11, 5, 7], [15, 5, 6], [15, 4, 7],
  ])('keeps Linux %i-button trigger axis %i on button %i', (count, axis, button) => {
    const axes = count === 11 ? [0, 0, -1, 0, 0, -1, 0, 0] : [0, 0, 0, 0, -1, -1, 0, 0]
    axes[axis] = 1
    expect(held(standardView(raw(count, axes, [])))).toEqual([button])
  })

  it('trusts an explicit browser standard mapping even when its dimensions match Linux', () => {
    expect(held(standardView({ ...raw(15, [0, 0, 0, 0, 1, 1, 1, 1], [6]), mapping: 'standard' }))).toEqual([6])
  })
})

describe('Android canonical input without a standard mapping flag', () => {
  it('emits distinct LT/RT presses and d-pad directions, repeats and releases', () => {
    const pad = { ...fakePad([0, 0, 0, 0]), id: 'Odin Controller', mapping: '' } as Gamepad
    vi.stubGlobal('navigator', { getGamepads: () => [pad] })
    const gp = new GamepadInput()
    const events: PadEvent[] = []
    gp.on((ev) => events.push(ev))
    const set = (i: number, down: boolean) => { pad.buttons[i] = { pressed: down, touched: down, value: down ? 1 : 0 } }
    gp.poll(0)
    set(6, true)
    gp.poll(16)
    expect(gp.isHeld('LT')).toBe(true)
    expect(gp.isHeld('RT')).toBe(false)
    expect(gp.isHeld('LB')).toBe(false)
    set(6, false)
    set(7, true)
    gp.poll(32)
    expect(gp.isHeld('RT')).toBe(true)
    expect(gp.isHeld('LT')).toBe(false)
    expect(gp.isHeld('RB')).toBe(false)
    set(7, false)
    let now = 1000
    for (const [button, dir] of [[12, 0], [13, 4], [14, 6], [15, 2]]) {
      set(button, true)
      gp.poll(now)
      gp.poll(now + 400)
      set(button, false)
      gp.poll(now + 500)
      expect(events).toContainEqual({ type: 'dir', source: 'dpad', dir })
      expect(events).toContainEqual({ type: 'dirRepeat', source: 'dpad', dir, n: 1 })
      expect(events.at(-1)).toEqual({ type: 'dir', source: 'dpad', dir: null })
      now += 1000
    }
  })
})

describe('a pad that goes away', () => {
  it('lets go of what it held and settles its pan', () => {
    const gp = new GamepadInput()
    const events: PadEvent[] = []
    gp.on((e) => events.push(e))
    const pad = fakePad([0, 0, 0.8, 0])
    ;(pad.buttons[0] as { pressed: boolean }).pressed = true
    vi.stubGlobal('navigator', { getGamepads: () => [pad] })
    gp.poll(0)
    expect(gp.isPanning).toBe(true)
    expect(gp.isHeld('A')).toBe(true)
    vi.stubGlobal('navigator', { getGamepads: () => [null] })
    gp.poll(16)
    expect(gp.connected).toBe(false)
    expect(gp.isPanning).toBe(false)
    expect(gp.isHeld('A')).toBe(false)
    expect(events).toContainEqual({ type: 'release', button: 'A', t: 16, held: 16 })
    expect(events.at(-1)).toEqual({ type: 'pan', dx: 0, dy: 0 })
    const n = events.length
    gp.poll(32)
    expect(events.length).toBe(n)
  })
})

describe('the left stick compass directions', () => {
  const dirs = (gp: GamepadInput) => {
    const out: (number | null)[] = []
    gp.on((e) => { if (e.type === 'dir') out.push(e.dir) })
    return out
  }

  it('keeps all eight compass directions', () => {
    const gp = new GamepadInput()
    const out = dirs(gp)
    withPad([0.7, -0.7, 0, 0])
    gp.poll(0)
    expect(out).toEqual([1])
  })
})

describe('the right stick', () => {
  it('sends no directions, only a pan', () => {
    const gp = new GamepadInput()
    const out: PadEvent[] = []
    gp.on((e) => { if (e.type !== 'pan' || e.dx !== 0 || e.dy !== 0) out.push(e) })
    withPad([0, 0, 0.9, 0])
    gp.poll(0)
    expect(out).toEqual([{ type: 'pan', dx: expect.any(Number), dy: 0, start: true }])
  })
})
