export { lightingFor, lightPulse, type Light, type Emitter, type LightPool } from '@orbrun/scene'
import { lightingFor, type Scene } from '@orbrun/scene'
export function lightField(scene: Scene) { return lightingFor(scene).field }
