# Combat element classification audit — 2026-11-13

Reviewed the named zap catalogue in Crawl [0.34](https://github.com/crawl/crawl/blob/stone_soup-0.34/crawl-ref/source/zap-data.h) and [trunk](https://github.com/crawl/crawl/blob/master/crawl-ref/source/zap-data.h), plus result names in [spell damage](https://github.com/crawl/crawl/blob/master/crawl-ref/source/spl-damage.cc), [monster casting](https://github.com/crawl/crawl/blob/master/crawl-ref/source/mon-cast.cc), [explosions](https://github.com/crawl/crawl/blob/master/crawl-ref/source/mon-explode.cc), beam, cloud, god/item, ability, summoning and translocation implementations. This register covers all **156 nonempty names** in those two zap tables, including utility/debug entries, with additional dynamic result names handled in the classifier. Empty names and runtime-renamed placeholders do not establish a hit.

The shared DCSS catalogue is in [effect-types.ts](../packages/scene-webtiles/src/effect-types.ts). It classifies appearance, not damage mechanics or resistance. Only an explicit result and visible recipient produce hit splatter. Native projectiles/clouds/spawns retain server artwork, directional/distance variants and independent entrance effects. Casts, selected spells, summons and status-only cues do not prove damage or supply a killing element.

## Decisions and corrections

| Family | Presentation decision |
| --- | --- |
| Searing Ray | Fire hit and death splatter, intentionally overriding its untyped mechanical damage; matches native searing artwork. |
| Magic/force/energy | Purple magic; includes Magic Dart, Prism, Mystic Blast, force lance, Battlesphere, Orb of Destruction, destruction abilities and contamination. |
| Fire/heat | Fire; includes magma, steam, foxfire, detonation, fiery plasma, Sirocco/scorching wind and fiery phlogiston. Plasma Beam's electric component remains electric. |
| Ice/cold | Cold; includes Hailstorm, frozen terrain, blighted ice and frigid brine. A cold aura now uses cold instead of magic. |
| Poison/miasma vs acid | Separate poison and acid palettes; Fulsome's noxious sulphur is poison. Confusion/petrification gas can have native cloud art without a damaging hit. |
| Electric | Electric; includes lightning, thunder, stunning bursts, Blinkbolt and flickering plasma. Shadowy lightning keeps shadow magic. |
| Necromantic/holy | Drain/holy hit accents with magic death debris. Ghostly fire and umbral torchlight are not ordinary fire; cleansing light retains golden native lighting. |
| Earth/metal/wood/flesh/water/air | Physical body/death debris; earth/air accents where known. No invented purple element for Iron Shot, Stone Arrow, LRD fragments, water, bolas or splinters. |
| Mercury Arrow | Physical result wins over the reused Sting tile, for both outgoing and incoming hits; weakening does not imply poison. |
| Fulsome Fusillade | Classify the reported substance, not the generic spell name. Fire/ice/poison/electric native flasks agree with their result; quintessence/unstable reaction uses magic. |
| Golden breath | Runtime fire and cold results retain their elements; a shared frostfire tile cannot identify the final damaging component alone. |
| Chaos | Reported rolled element wins; otherwise magic. Colour-only default tiles cannot establish an element. |
| Utility | Buffs, debuffs, healing, movement, summons and resisted results keep their own cues. No blood/death attribution from casting, poison application, resistance or status countdowns alone. |

## Zap name register

This register records the reviewed source input, rather than generating game rules from spell schools. 'Physical' includes untyped effects whose material is physical; non-physical untyped conjurations remain magic.

- **fire (24):** ball of steam, blast of flame, blazing flames, bolt of fire, bolt of magma, concussive blast, damnation, detonation, explosive embers, fiery blast, fiery breath, fiery plasma, fireball, flame wave, foxfire, glob of lava, great blast of fire, puff of flame, pyre arrow, rebounding bolt of fire, scorching wind, searing blast, searing ray, sticky flame.
- **cold (20):** blast of cold, bolt of cold, flash freeze, freeze, freezing gust, frigid blast, glacial breath, hail, ice thorns, iceblast, icy flash freeze, piercing cold, puff of frost, rebounding bolt of cold, refrigeration, salvo of frigid ice, salvo of icicles, shard of frigid ice, shard of ice, shards of blighted ice.
- **poison (8):** blast of poison, bolt of poison, foul vapour, poison arrow, poison gas, splash of poison, sting, toxic sludge.
- **acid (5):** acid spray, ball of acid, bolt of acid, glob of acid, splash of acid.
- **electric (7):** arc of electricity, bolt of electricity, bolt of lightning, living lightning, orb of electricity, stunning burst, zap.
- **magic (43):** beam of energy, blast of chaos, blast of cleansing flame, blinding ray, blood arrow, bolt of antimagic, bolt of devastation, bolt of dispelling energy, bolt of energy, bolt of flesh, bolt of light, bolt of negative energy, bomblet, concentrated momentum, condensed magic, creeping shadow, crushing gravity, destabilizing rupture, doom bolt, drain life, fortress blast, fragment of death, ghostly fireball, glimmering dart, gout of destruction, lance of force, magic dart, magical storm, mystic blast, nullifying energy, phantom echo, ray of shadow, rupture, seething chaos, shadow bullet, shadowball, shadowy lightning, shard of hardened shadow, shooting star, surge of chaos, surge of energy, umbral torchlight, wave of devouring shadow.
- **physical (35):** ball of mud, beckoning whirlwind, blast, blast of rock, blast of sand, blast of wind, burst of rock shards, crystal spear, crystallising shot, dizzying spores, falling rubble, flashing steel, glob of mercury, grasping water, harpoon shot, iron shot, jagged bones, kinetic grapnel, klown pie, mass of rock, pebble, rocky spike, seismic shockwave, shockwave, shred, slug dart, sonic wave, spray of metal splinters, spray of wooden splinters, stone arrow, swarm of vampire bats, torrent of water, volley of spikes, volley of thorns, whirling bolas.

Excluded zap names: agony, beckoning, billowing rust, blast of calcifying dust, blast of choking fumes, buggy blast, curse of agony, debugging ray, malign ofering, malmutate, noxious fumes, stinking cloud, unravelling, volatile concoction. Enchantment entries are interpreted through actual status/damage results (for example Agony's convulsion), not treated as damaging beams. Noxious/mephitic/calcifying clouds do not establish damage; billowing rust has no ordinary damage dice. Debugging Ray is debug-only. Volatile concoction and buggy blast are runtime-renamed Fulsome/golden-breath placeholders; their actual component names are classified instead.

The existing direct-result paths for Airstrike, Freeze, Flame Wave, draining, smiting, Shatter, Irradiate, Dispel Undead, Mindburst, Toxic Bog, elemental melee brands and venom are retained. Status and terrain paths remain separate from damage evidence.

## Coverage limits

Crawl sends prose and tile identities rather than a universal spell/damage ID. Generic colour tiles, renamed effects and future server versions can remain ambiguous; unknown art keeps the quiet native fallback without asserting damage. This is a bounded stable/trunk source audit, not a promise that every future/custom-server spell is recognized. The client never infers outcomes from spell selection, creature names or schools. Native artwork may depict a different component from the final hit in mixed-element attacks; confirmed result evidence owns hit/death classification.
