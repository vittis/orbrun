import type { Billboard } from './index.js'
import type { DeathKind } from './death.js'

/** Shared body material for wounds and deaths; explicit names take precedence over idle motion. */
export function creatureMaterial(b: Billboard): DeathKind {
  const name = b.name?.toLowerCase() ?? ''
  const motion = b.life?.motion
  return /skeleton|skeletal|skull|bone|lich/.test(name) ? 'bone'
    : /ice|icy|frost|rime|frozen|simulacr/.test(name) ? 'ice'
    : /fire|flame|magma|molten|efreet|brimstone/.test(name) || motion === 'flame' ? 'fire'
    : /water elemental|water spirit|wellspring|spatial maelstrom/.test(name) ? 'water'
    : /gargoyle|golem|statue|earth elemental|iron elemental|crystal|saltling|ushabti/.test(name) || motion === 'crystal' ? 'stone'
    : /jell|slime|ooze|acid blob|amoeba|dissolution/.test(name) || motion === 'ooze' ? 'slime'
    : /ghost|spectr|phantom|wraith|wisp|^shadow$|vortex|air elemental|ball lightning|orb of|ballistomycete spore/.test(name) || motion === 'swirl' ? 'spirit'
    : /fung|mushroom|plant|bush|tree|thorn|vine|cact|oklob|ballistomycete/.test(name) || motion === 'plant' ? 'plant'
    : /\bant\b|beetle|roach|spider|scorpion|hornet|wasp|\bbee\b|scarab|moth|mosquito|centipede|cicada/.test(name) ? 'insect'
    : 'flesh'
}
