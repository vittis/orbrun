import type { Billboard } from '@orbrun/scene'

/** Native spell art owns its effect and must not become an occluding actor
 * in the environmental light mask. Emission remains part of its atmosphere. */
export const nativeSpellArt = (b: Billboard) => b.kind === 'projectile' || b.kind === 'cloud' || !!b.life?.spawn
