// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../src/servers'
import { Room25d, roomOptions } from '../src/room/room-25d'

const mocks = vi.hoisted(() => ({ mount: vi.fn(), setOptions: vi.fn(), setTiles: vi.fn(), setScene: vi.fn(), render: vi.fn(), destroy: vi.fn() }))
vi.mock('@orbrun/render-2.5d', () => ({ Render25d: class {
  mount = mocks.mount; setOptions = mocks.setOptions; setTiles = mocks.setTiles; setScene = mocks.setScene
  render = mocks.render; destroy = mocks.destroy; animating = false
} }))
vi.mock('../src/room/places', () => ({ loadPlace: async () => ({ center: { x: 3, y: 4 }, tiles: 'atlas', scene: 'saved-scene' }) }))

describe('menu dungeon renderer', () => {
  it('uses the existing 2.5D renderer with the saved scene and view centre', async () => {
    const canvas = document.createElement('canvas'), room = Room25d.create(canvas)
    await room.show('lair-grove')
    expect(mocks.mount).toHaveBeenCalledWith(canvas)
    expect(mocks.setOptions).toHaveBeenCalledWith({ center: { x: 3, y: 4 } })
    expect(mocks.setTiles).toHaveBeenCalledWith('atlas')
    expect(mocks.setScene).toHaveBeenCalledWith('saved-scene')
    expect(room.render(5)).toBe(false)
    expect(mocks.render).toHaveBeenCalledWith(5)
    room.destroy(); expect(mocks.destroy).toHaveBeenCalledOnce()
  })
  it('preserves tilt and zoom with the same Auto, On and Still policy as gameplay', () => {
    const settings = { ...defaultSettings, depthTilt: 65, depthZoom: 1.2 }
    expect(roomOptions(settings, false)).toEqual({ tilt: 65, zoom: 1.2, animate: true, movement: false })
    expect(roomOptions({ ...settings, depthAnimate: false }, false).animate).toBe(false)
    expect(roomOptions({ ...settings, depthAnimate: 'auto' }, true).animate).toBe(false)
    expect(roomOptions({ ...settings, depthAnimate: true }, true).animate).toBe(true)
  })
})
