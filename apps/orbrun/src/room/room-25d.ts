import { Render25d } from '@orbrun/render-2.5d'
import { getSettings, type Settings } from '../settings'
import { dungeonAnimation } from '../effects-motion'
import { loadPlace, type LoadedPlace } from './places'

/** Menu scenery uses the same renderer and options as the dungeon. */
export class Room25d {
  private readonly renderer: Render25d
  place: LoadedPlace | null = null

  private constructor(canvas: HTMLCanvasElement, reducedMotion: boolean) {
    this.renderer = new Render25d(roomOptions(getSettings(), reducedMotion))
    this.renderer.mount(canvas)
  }

  static create(canvas: HTMLCanvasElement, reducedMotion = false) {
    return new Room25d(canvas, reducedMotion)
  }

  async show(id: string): Promise<LoadedPlace> {
    const place = await loadPlace(id)
    this.place = place
    this.renderer.setOptions({ center: place.center })
    this.renderer.setTiles(place.tiles)
    this.renderer.setScene(place.scene)
    return place
  }

  resize(width: number, height: number, dpr: number) { this.renderer.resize(width, height, dpr) }
  applySettings(settings: Settings, reducedMotion = false) { this.renderer.setOptions(roomOptions(settings, reducedMotion)) }
  render(now: number): boolean {
    this.renderer.render(now)
    return this.renderer.animating
  }
  destroy() { this.renderer.destroy() }
}

export function roomOptions(settings: Settings, reducedMotion: boolean) {
  return { tilt: settings.depthTilt, zoom: settings.depthZoom,
    animate: dungeonAnimation(settings, reducedMotion), movement: false }
}
