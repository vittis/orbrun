export type CellKey = number

/** Coordinates in [-512, 512) pack into one integer key. */
export function cellKey(x: number, y: number): CellKey {
  return ((y + 512) << 10) | (x + 512)
}

export function keyToXY(key: CellKey): { x: number; y: number } {
  return { x: (key & 1023) - 512, y: (key >> 10) - 512 }
}
