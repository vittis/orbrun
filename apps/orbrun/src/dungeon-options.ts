import type { Render25dOptions } from '@orbrun/render-2.5d'
import { dungeonAnimation } from './effects-motion'
import type { Settings } from './settings'

/** Shared appearance for gameplay and the recorded menu; owns no input, audio or storage. */
export function dungeonOptions(st: Settings, reducedMotion: boolean): Render25dOptions {
  return {
    tilt: st.depthTilt, zoom: st.depthZoom, animate: dungeonAnimation(st, reducedMotion),
    unexploredFog: st.depthFog, unexploredAtmosphere: st.depthAtmosphere,
    meleeBumpStrength: st.meleeBumpStrength, meleeBumpSnap: st.meleeBumpSnap,
    hitGore: st.hitGore, deathGore: st.deathGore,
    hitSprayOutward: st.hitSprayOutward, deathSprayOutward: st.deathSprayOutward,
    combatVfxVariation: st.combatVfxVariation,
    movement: st.depthMovement, movementDuration: st.depthMovementDuration, movementEasing: st.depthMovementEasing,
    movementHopHeight: st.depthMovementHopHeight, movementSquash: st.depthMovementSquash, movementSway: st.depthMovementSway,
  }
}
