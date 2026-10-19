import type { WorldPlanet, WorldRegion } from '../world/world.ts';
import { isRegularEncounter } from '../challenges/boss-encounter.ts';
import { braveTowerFloor } from '../challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign } from '../challenges/challenge-campaigns.ts';
import type { AcquisitionCatalog, AcquisitionEncounter, AcquisitionSpecies } from './acquisition-model.ts';
import { buildPredecessors, initialFormOf } from './species-graph.ts';

type EssenceSource = Pick<AcquisitionEncounter, 'reward_hatches' | 'reward' | 'team'>;
/**
 * Original infant reward bindings take precedence; otherwise the essence hatches the initial form of the defeated final form's
 * line at Lv1, as the original 分子转化器 did. Undefined only for an empty team.
 */
function encounterEssenceSpecies(boss: EssenceSource, predecessors: ReadonlyMap<number, ReadonlySet<number>>) {
  const final = boss.team.at(-1)?.species;
  return boss.reward_hatches ?? boss.reward?.monster?.species ?? (final === undefined ? undefined : initialFormOf(final, predecessors));
}

/** The controller redirects a field species that appears in a regular boss team. */
export function interceptedFieldSpecies(bosses: readonly Pick<AcquisitionEncounter, 'id' | 'team'>[]): Set<number> {
  return new Set(bosses.filter(isRegularEncounter).flatMap(boss => boss.team.map(mon => mon.species)));
}

export interface HabitatEntry {
  species: AcquisitionSpecies;
  planet: WorldPlanet;
  region: WorldRegion;
  /** Capsule capture of a catchable wild species, otherwise a challenge-for-essence battle. */
  kind: 'capture' | 'essence';
  levels: readonly [number, number];
}

/** Executable field encounters. A collection-task map marker is never an encounter, even with generated tasks disabled. */
export function habitatEntries(catalog: AcquisitionCatalog, planets: readonly WorldPlanet[]): HabitatEntry[] {
  const definitions = new Map(catalog.species.map(species => [species.id, species]));
  const intercepted = interceptedFieldSpecies(catalog.bosses);
  const entries: HabitatEntry[] = [];
  for (const planet of planets) for (const region of planet.regions) for (const id of region.creatures) {
    const species = definitions.get(id);
    if (!species || intercepted.has(id) || region.recruitmentSpecies?.includes(id)) continue;
    const kind = species.obtain?.includes('wild') && (species.catch_rate ?? 0) > 0 ? 'capture' : region.creatureLevels?.[id] ? 'essence' : undefined;
    if (kind) entries.push({ species, planet, region, kind, levels: region.creatureLevels?.[id] ?? region.levels });
  }
  return entries;
}

export interface BossEssenceReward {
  boss: AcquisitionEncounter;
  campaign?: Campaign;
  itemId: string;
  species: number;
  /** The remake grants this essence; the encounter record names no essence item. */
  authored: boolean;
}

/**
 * Essence items won from encounters: the encounter's explicit `essence_*` rewards, otherwise one authored essence
 * unless the encounter is an intermediate campaign stage, teaches a skill, or is a brave-tower floor. A shared item
 * ID keeps its catalog or first binding; an encounter with nothing to hatch grants nothing. The catalog enrichment
 * registers these items for the controller.
 */
export function bossEssenceRewards(catalog: AcquisitionCatalog): BossEssenceReward[] {
  const bindings = new Map((catalog.items ?? []).filter(item => item.kind === 'essence' && item.hatches !== undefined).map(item => [item.id, item.hatches!]));
  const predecessors = buildPredecessors(catalog.species);
  return catalog.bosses.flatMap(boss => {
    const campaign = CHALLENGE_CAMPAIGNS.find(candidate => candidate.stages.some(stage => stage.bossIds.includes(boss.id)));
    const intermediate = !!campaign && !campaign.stages.at(-1)!.bossIds.includes(boss.id);
    const explicit = Object.keys(boss.reward?.items ?? {}).filter(id => id.startsWith('essence_'));
    const authored = !explicit.length && !intermediate && !boss.reward?.learn_skill
      && boss.id !== 'boss_tower_brave_mystery' && braveTowerFloor(boss.id) === undefined;
    return (authored ? [`essence_${boss.id}`] : explicit).flatMap(itemId => {
      const species = bindings.get(itemId) ?? encounterEssenceSpecies(boss, predecessors);
      if (species === undefined) return [];
      bindings.set(itemId, species);
      return [{ boss, campaign, itemId, species, authored }];
    });
  });
}
