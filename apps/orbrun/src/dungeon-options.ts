import type { Render25dOptions } from '@orbrun/render-2.5d'
import type { Settings } from './settings'

/** Bound the phone dungeon's backing store to 2.25 times its CSS pixel area. */
export function phoneDungeonDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 1.5)
}

/** Shared appearance for gameplay and the recorded menu; owns no input, audio or storage. */
export function dungeonOptions(st: Settings): Render25dOptions {
  return {
    tilt: st.depthTilt, zoom: st.depthZoom, animate: true,
    unexploredFog: st.depthFog, unexploredAtmosphere: st.depthAtmosphere,
    visibilityFade: st.depthLosFade, visibilitySmoothing: st.depthLosSmoothing,
    meleeBumpStrength: st.meleeBumpStrength, meleeBumpSnap: st.meleeBumpSnap,
    hitGore: st.hitGore, deathGore: st.deathGore,
    hitSprayOutward: st.hitSprayOutward, deathSprayOutward: st.deathSprayOutward,
    combatVfxVariation: st.combatVfxVariation,
    movement: st.depthMovement, movementDuration: st.depthMovementDuration, movementEasing: st.depthMovementEasing,
    movementHopHeight: st.depthMovementHopHeight, movementSquash: st.depthMovementSquash, movementSway: st.depthMovementSway,
  }
}
