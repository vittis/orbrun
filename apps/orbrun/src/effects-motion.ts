import type { Settings } from './settings'

/** Auto follows accessibility preferences; an explicit On/Still is decisive. */
export function dungeonAnimation(settings: Pick<Settings, 'depthAnimate'>, reducedMotion: boolean) {
  return settings.depthAnimate === 'auto' ? !reducedMotion : settings.depthAnimate
}
