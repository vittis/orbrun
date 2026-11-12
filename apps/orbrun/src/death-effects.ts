import { combatActorId, type Billboard, type DeathEffect, type DeathKind } from '@orbrun/scene'

/** Prefer material-specific names to generic idle motion (a floating skull is bone). */
export function deathFor(b: Billboard, from: { x: number; y: number }): DeathEffect {
  const name = b.name?.toLowerCase() ?? ''
  const motion = b.life?.motion
  const kind: DeathKind = /skeleton|skeletal|skull|bone|lich/.test(name) ? 'bone'
    : /ice|icy|frost|rime|frozen|simulacr/.test(name) ? 'ice'
    : /fire|flame|magma|molten|efreet|brimstone/.test(name) || motion === 'flame' ? 'fire'
    : /water elemental|water spirit|wellspring|spatial maelstrom/.test(name) ? 'water'
    : /gargoyle|golem|statue|earth elemental|iron elemental|crystal|saltling|ushabti/.test(name) || motion === 'crystal' ? 'stone'
    : /jell|slime|ooze|acid blob|amoeba|dissolution/.test(name) || motion === 'ooze' ? 'slime'
    : /ghost|spectr|phantom|wraith|wisp|^shadow$|vortex|air elemental|ball lightning|orb of|ballistomycete spore/.test(name) || motion === 'swirl' ? 'spirit'
    : /fung|mushroom|plant|bush|tree|thorn|vine|cact|oklob|ballistomycete/.test(name) || motion === 'plant' ? 'plant'
    : /\bant\b|beetle|roach|spider|scorpion|hornet|wasp|\bbee\b|scarab|moth|mosquito|centipede|cicada/.test(name) ? 'insect'
    : 'flesh'
  const dx = b.x - from.x, dy = b.y - from.y, length = Math.hypot(dx, dy) || 1
  return { actorId: combatActorId(b), x: b.x, y: b.y, height: Math.max(0.35, Math.min(1.4, b.height)), kind, direction: { x: dx / length, y: dy / length } }
}

