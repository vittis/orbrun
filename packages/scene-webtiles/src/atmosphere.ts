import type { Atmosphere } from '@orbrun/scene'

// DCSS branch short/long/abbreviated names (branch-data.h). Keep this knowledge
// in the producer; the renderer receives only a visual mood, never a branch ID.
const groups: readonly [Atmosphere, readonly string[]][] = [
  ['earth', ['orc', 'orcish mines', 'snake', 'snake pit', 'spider', 'spider nest', 'gauntlet']],
  ['verdant', ['lair', 'lair of beasts', 'forest', 'enchanted forest']],
  ['marsh', ['swamp', 'slime', 'slime pits', 'pits of slime', 'sewer']],
  ['sea', ['shoals']],
  ['frost', ['icecv', 'ice cave', 'coc', 'cocytus']],
  ['embers', ['hell', 'vestibule of hell', 'geh', 'gehenna', 'volcano']],
  ['spectral', ['crypt', 'tomb', 'tomb of the ancients', 'ossuary', 'tar', 'tartarus']],
  ['arcane', ['elf', 'elven halls', 'zot', 'realm of zot', 'zig', 'ziggurat', 'wizlab', "wizard's laboratory", 'bazaar', 'trove']],
  ['chaos', ['abyss', 'pan', 'pandemonium']],
  ['holy', ['temple', 'ecumenical temple', 'desolation', 'desolation of salt']],
]
const moods = new Map(groups.flatMap(([mood, names]) => names.map(name => [name, mood] as const)))

/** Only the player's server-reported place selects the theme; no map inference. */
export function branchAtmosphere(place: string): Atmosphere {
  const name = place.replace(/<[^>]*>/g, '').toLowerCase().split(':')[0].trim().replace(/^(the|a) /, '')
  return moods.get(name) ?? 'stone'
}
