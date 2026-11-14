import { afterEach, describe, expect, it, vi } from 'vitest'
import { GamepadInput, type PadEvent } from '../src/gamepad'

/** A standard-mapping pad with `down` held (RT is button 7) and the sticks centred. */
function fakePad(down: number | null): Gamepad {
  return {
    id: 'Xbox Wireless Controller (045e)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === down, touched: false, value: i === down ? 1 : 0 })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * A held button beats like a held key, because what it repeats is autofight,
 * which the keyboard plays by leaning on Tab: the OS's own key repeat is the
 * cadence to copy, not the faster one a held direction steps at.
 */
describe('a held button repeats at the keyboard’s cadence', () => {
  it.each(['button', 'dpad', 'touch'] as const)('keeps %s repeat cadence across uneven frames and skips stalled beats', source => {
    vi.stubGlobal('navigator', { getGamepads: () => source === 'touch' ? [] : [fakePad(source === 'button' ? 7 : 15)] })
    const gp = new GamepadInput({ repeatDelay: 350, repeatInterval: 90, buttonRepeatDelay: 350, buttonRepeatInterval: 90 })
    const repeats: number[] = []
    let now = 0
    gp.on(e => { if (source === 'button' ? e.type === 'repeat' : e.type === 'dirRepeat') repeats.push(now) })
    if (source === 'touch') gp.virtualDown('DR', 0, true)
    gp.poll(0)
    // Each poll is late; lateness must not accumulate into slower movement.
    for (now of [360, 450, 540, 630]) gp.poll(now)
    expect(repeats).toEqual([360, 450, 540, 630])
    now = 1200; gp.poll(now)
    expect(repeats).toHaveLength(5)
    // No replay of missed turns on this or the next frame.
    now = 1210; gp.poll(now)
    expect(repeats).toHaveLength(5)
    now = 1250; gp.poll(now)
    expect(repeats).toEqual([360, 450, 540, 630, 1200, 1250])
    gp.virtualRelease()
    vi.stubGlobal('navigator', { getGamepads: () => [] })
    now = 2000; gp.poll(now)
    expect(repeats).toHaveLength(6)
  })

  it('waits out the delay, then beats once an interval, for as long as it is down', () => {
    let down: number | null = null
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad(down)] })
    const gp = new GamepadInput()
    const events: PadEvent[] = []
    gp.on((e) => events.push(e))

    down = 7
    gp.poll(0)
    expect(events).toEqual([{ type: 'press', button: 'RT', t: 0 }])

    // polled a good deal finer than the cadence, so each tick is dated to the ms
    const at: number[] = []
    gp.on((e) => { if (e.type === 'repeat') at.push(now) })
    let now = 0
    for (now = 1; now <= 1000; now++) gp.poll(now)
    // nothing until the delay is out, then one every interval
    expect(at[0]).toBe(420)
    expect(at).toEqual([420, 520, 620, 720, 820, 920])

    down = null
    gp.poll(1036)
    expect(events.at(-1)).toMatchObject({ type: 'release', button: 'RT' })
    gp.poll(1136)
    expect(at).toHaveLength(6)
  })
})
