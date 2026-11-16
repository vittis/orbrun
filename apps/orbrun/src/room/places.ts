import type { Scene } from '@orbrun/scene'
import list from './places.json'
import { readScene, type PlaceFile } from './place-data'
import { RoomTiles } from './tiles'

/** Recorded scenery retained by development renderer fixtures; the home runs a disposable live engine. */
export type Tint = 'depths' | 'abyss' | 'lair' | 'dungeon' | 'shoals' | 'zot' | 'spider'

export interface PlaceEntry {
  id: string
  /** where the game stood, for the room's label */
  place: string
  /** Tint metadata retained for the scenery fixture. */
  tint: Tint
  /** Original recording selection metadata. */
  cycle?: boolean

}

export const PLACES: readonly PlaceEntry[] = list as PlaceEntry[]

export function placeById(id: string): PlaceEntry | undefined {
  return PLACES.find((p) => p.id === id)
}


/** A place loaded: the renderer's tiles, the level, and view centre. */
export interface LoadedPlace {
  id: string
  tiles: RoomTiles
  scene: Scene
  center: { x: number; y: number }
}

const loads = new Map<string, Promise<LoadedPlace>>()

/** The place's file and its atlas, fetched once and kept for the next time a screen stands there. */
export function loadPlace(id: string): Promise<LoadedPlace> {
  let p = loads.get(id)
  if (!p) {
    p = (async () => {
      const [file, image] = await Promise.all([
        fetch(`/room/places/${id}.json`).then((r) => {
          if (!r.ok) throw new Error(`place ${id}: HTTP ${r.status}`)
          return r.json() as Promise<PlaceFile>
        }),
        loadImage(`/room/places/${id}.png`),
      ])
      if (file.format !== 2) throw new Error(`place ${id}: format ${String(file.format)} is not one this build reads`)
      return { id, tiles: RoomTiles.fromPlace(file, image), scene: readScene(file.scene), center: placeCenter(file) }
    })()
    loads.set(id, p)
    p.catch(() => loads.delete(id))
  }
  return p
}

/** The saved view centre, independent of gameplay input. */
export function placeCenter(file: Pick<PlaceFile, 'center'>): { x: number; y: number } {
  return { ...file.center }
}

function loadImage(url: string): Promise<TexImageSource> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${url}`))
    img.src = url
  })
}
