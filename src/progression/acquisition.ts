import { NIAO_CAPTURE_PARTNERS } from '../../battle/core/src/capture.ts';
import { MAX_LEVEL } from '../../raising/core/growth.ts';
import { bundledCatalog } from '../mechanics/catalog.ts';
import { WORLD_PLANETS, type WorldPlanet } from '../world.ts';
import {
  JOURNEY_QUEST_SPECIES, NPC_ONLY_SPECIES, STARTER_SPECIES,
  type AcquisitionCatalog, type AcquisitionEncounter, type AcquisitionFamily, type AcquisitionRoute, type AcquisitionSeed, type AcquisitionSpecies,
  type SpeciesAcquisition,
} from './acquisition-model.ts';
import { BREEDING_RECIPES, getBreedingGender, type BreedingRecipe } from './breeding.ts';
import { FUSION_RECIPES, type FusionRecipe } from './fusion.ts';
import { buildInitialFormAcquisitionIndex, type InitialFormAcquisition } from './initial-acquisition.ts';
import { bossEssenceRewards, habitatEntries } from './native-acquisition.ts';
import { buildRecruitmentRewards, MAX_RECRUITMENT_PREREQUISITES } from './recruitment.ts';
import { buildPredecessors } from './species-graph.ts';
import { getEligibleRecruitmentSPTs } from './spt-recruitment.ts';

export { NPC_ONLY_SPECIES } from './acquisition-model.ts';
export { resolveEncounterEssenceSpecies } from './native-acquisition.ts';
export type { AcquisitionCatalog, AcquisitionRoute } from './acquisition-model.ts';

/** Niao (尼奥) can only be captured while one of NIAO_CAPTURE_PARTNERS is active. */
const NIAO_SPECIES = 416;
const JOURNEY_QUEST_LABELS: Record<keyof typeof JOURNEY_QUEST_SPECIES, string> = {
  'first-victory': '船长任务「初次胜利」：赢得一场战斗后领取皮皮',
  'three-victories': '船长任务「成长之路」：赢得三场战斗后领取比比鼠',
  'first-spt': '船长任务「SPT 挑战者」：完成一次首领挑战后领取巴鲁斯',
};

interface RouteIndex {
  index: Map<number, SpeciesAcquisition>;
  available(id: number): boolean;
  hasLabel(id: number, label: string): boolean;
  /** False when the species is outside the catalog or NPC-only. */
  add(id: number, route: AcquisitionRoute): boolean;
}

function createRouteIndex(catalog: AcquisitionCatalog): RouteIndex {
  const index = new Map<number, SpeciesAcquisition>();
  for (const species of catalog.species) index.set(species.id, {
    status: NPC_ONLY_SPECIES.has(species.id) ? 'npc' : 'unimplemented',
    description: NPC_ONLY_SPECIES.has(species.id) ? '本作将这个剧情伙伴家族列为展示精灵，不计入常规收集目标。' : '当前版本尚未实现这只精灵的获取路线。',
    routes: [],
  });
  return {
    index,
    available: id => index.get(id)?.status === 'available',
    hasLabel: (id, label) => !!index.get(id)?.routes.some(route => route.label === label),
    add(id, route) {
      const entry = index.get(id);
      if (!entry || entry.status === 'npc') return false;
      entry.status = 'available';
      entry.description = '通过已实现的野外、任务、挑战、融合、繁殖或进化路线获得。';
      entry.routes.push(route);
      return true;
    },
  };
}

type SpeciesName = (id: number) => string;
type Definitions = ReadonlyMap<number, AcquisitionSpecies>;

/** New-journey starters and the captain's journey quests. */
function journeySeeds(): AcquisitionSeed[] {
  const quests = Object.entries(JOURNEY_QUEST_LABELS).map(([questId, label]): AcquisitionSeed => {
    const id = JOURNEY_QUEST_SPECIES[questId as keyof typeof JOURNEY_QUEST_SPECIES];
    return { species: id, route: { kind: 'quest', entrySpecies: id, questId, label } };
  });
  return [...STARTER_SPECIES.map((id): AcquisitionSeed => ({ species: id, route: { kind: 'starter', entrySpecies: id, label: '新旅程开始时赠送 Lv.5 初始伙伴' } })), ...quests];
}

/** Field captures and challenge-for-essence encounters; Niao's capture waits for a reachable partner. */
function habitatSeeds(catalog: AcquisitionCatalog, planets: readonly WorldPlanet[], definitions: Definitions): { direct: AcquisitionSeed[]; conditional: AcquisitionSeed[] } {
  const direct: AcquisitionSeed[] = [], conditional: AcquisitionSeed[] = [];
  for (const { species, planet, region, kind, levels: [low, high] } of habitatEntries(catalog, planets)) {
    const id = species.id, at = { kind: 'wild' as const, entrySpecies: id, planetId: planet.id, regionId: region.id };
    if (kind === 'essence') {
      direct.push({ species: id, route: { ...at, label: `${region.name}：挑战 Lv.${low}–${high} 的${species.name.zh}，胜利后获得精元并孵化` } });
      continue;
    }
    const route: AcquisitionRoute = { ...at, label: `${region.name}：与 Lv.${low}–${high} 的${species.name.zh}对战，使用胶囊捕捉` };
    if (id !== NIAO_SPECIES) { direct.push({ species: id, route }); continue; }
    route.requiredActiveSpecies = NIAO_CAPTURE_PARTNERS;
    route.label += `（需先获得并派出${NIAO_CAPTURE_PARTNERS.map(partner => definitions.get(partner)?.name.zh ?? `#${partner}`).join(' / ')}中的任一形态）`;
    conditional.push({ species: id, route });
  }
  return { direct, conditional };
}

/** Boss and campaign victories that grant an essence, matching the controller's essence registry. */
function bossEssenceSeeds(catalog: AcquisitionCatalog, definitions: Definitions): AcquisitionSeed[] {
  return bossEssenceRewards(catalog).map(({ boss, campaign, species, authored }): AcquisitionSeed => ({ species, route: {
    kind: campaign ? 'campaign' : 'boss', entrySpecies: species,
    ...(campaign ? { campaignId: campaign.id } : { bossId: boss.id }),
    authoredReward: authored,
    label: campaign ? `完成「${campaign.name}」全部阶段 → 道具背包孵化精元`
      : `通过「${boss.name?.zh ?? boss.id}」挑战 → 道具背包孵化${definitions.get(species)?.name.zh ?? species}精元${authored ? '（本作挑战奖励）' : ''}`,
  } }));
}

/** Collection-recruitment quests, granted once all of their prerequisites are reachable. */
function recruitmentSeeds(catalog: AcquisitionCatalog, planets: readonly WorldPlanet[], definitions: Definitions, eligibleBosses: ReadonlyMap<string, AcquisitionEncounter>): AcquisitionSeed[] {
  return buildRecruitmentRewards(catalog, planets).map((reward): AcquisitionSeed => {
    const requirements = reward.prerequisites.map(condition => condition.kind === 'species'
      ? `收集${definitions.get(condition.species)?.name.zh ?? condition.species}`
      : `击败${eligibleBosses.get(condition.bossId)?.name?.zh ?? condition.bossId}`);
    return { species: reward.rewardSpecies, prerequisites: reward.prerequisites,
      route: { kind: 'quest', entrySpecies: reward.rewardSpecies, questId: reward.questId,
        label: `精灵招募：${requirements.join('、')} → 领取${reward.name}精元并孵化` } };
  });
}

function addConditionalCaptures(routes: RouteIndex, seeds: readonly AcquisitionSeed[]): boolean {
  let added = false;
  for (const seed of seeds) {
    if (!seed.route.requiredActiveSpecies!.some(routes.available) || routes.hasLabel(seed.species, seed.route.label)) continue;
    added = routes.add(seed.species, seed.route) || added;
  }
  return added;
}

function addGatedSeeds(routes: RouteIndex, seeds: readonly AcquisitionSeed[], eligibleBosses: ReadonlyMap<string, unknown>): boolean {
  let added = false;
  for (const { species, route, prerequisites = [] } of seeds) {
    if (!routes.index.has(species) || NPC_ONLY_SPECIES.has(species)
      || !prerequisites.length || prerequisites.length > MAX_RECRUITMENT_PREREQUISITES
      || !prerequisites.every(condition => condition.kind === 'species' ? routes.available(condition.species) : eligibleBosses.has(condition.bossId))
      || routes.hasLabel(species, route.label)) continue;
    added = routes.add(species, route) || added;
  }
  return added;
}

function addBreedingRoutes(routes: RouteIndex, recipes: readonly BreedingRecipe[], name: SpeciesName): boolean {
  let added = false;
  // The original client requires a first-generation male; female generation is unrestricted.
  const firstGeneration = (id: number) => routes.index.get(id)?.routes.some(route => !route.breedingRecipeId);
  for (const recipe of recipes) {
    if (recipe.minLevel > MAX_LEVEL) continue;
    const male = recipe.maleSpecies.filter(id => getBreedingGender(id) === 1 && firstGeneration(id));
    const female = recipe.femaleSpecies.filter(id => getBreedingGender(id) === 2 && routes.available(id));
    if (!male.length || !female.length) continue;
    const parents = `${male.map(name).join(' / ')}（第一代雄性） + ${female.map(name).join(' / ')}（雌性），均达到 Lv.${recipe.minLevel}`;
    for (const outcome of recipe.outcomes) {
      const target = routes.index.get(outcome.species);
      if (outcome.weight <= 0 || !target || target.status === 'npc' || target.routes.some(route => route.kind === 'breeding' && route.breedingRecipeId === recipe.id)) continue;
      added = routes.add(outcome.species, { kind: 'breeding', entrySpecies: outcome.species, breedingRecipeId: recipe.id,
        label: `精灵繁殖「${recipe.name}」：${parents} → 立即随机获得${name(outcome.species)}（${outcome.weight}%）` }) || added;
    }
  }
  return added;
}

function addFusionRoutes(routes: RouteIndex, recipes: readonly FusionRecipe[], name: SpeciesName): boolean {
  let added = false;
  for (const recipe of recipes) {
    if (recipe.minPrimaryLevel > MAX_LEVEL || recipe.minSecondaryLevel > MAX_LEVEL) continue;
    const primary = recipe.primary.filter(id => routes.available(id)), secondary = recipe.secondary.filter(id => routes.available(id));
    if (!primary.length || !secondary.length) continue;
    const parents = `${primary.map(name).join(' / ')}（主） + ${secondary.map(name).join(' / ')}（副）`;
    for (const outcome of recipe.outcomes) {
      if (outcome.weight <= 0) continue;
      const target = routes.index.get(outcome.species);
      if (!target || target.status === 'npc' || target.routes.some(route => route.fusionRecipeId === recipe.id && route.kind === 'fusion')) continue;
      const chance = outcome.weight < 100 ? `（${Number(outcome.weight.toFixed(2))}%）` : '';
      added = routes.add(outcome.species, { kind: 'fusion', entrySpecies: outcome.species, fusionRecipeId: recipe.id,
        label: `精灵融合「${recipe.name}」：${parents} → ${outcome.beadName} → 道具背包立即孵化${name(outcome.species)}${chance}` }) || added;
    }
  }
  return added;
}

/** Only executable forward level evolutions extend an obtainable form. */
function addEvolutionRoutes(routes: RouteIndex, catalog: AcquisitionCatalog, name: SpeciesName): boolean {
  let added = false;
  for (const species of catalog.species) for (const evolution of species.evolution) {
    if (evolution.method !== 'level' || evolution.level === undefined || evolution.level > MAX_LEVEL) continue;
    const previous = routes.index.get(species.id)!, target = routes.index.get(evolution.to);
    if (!target || target.status === 'npc') continue;
    for (const route of [...previous.routes]) {
      const chain = [...(route.evolutionChain ?? []), { from: species.id, to: evolution.to, level: evolution.level }];
      if (chain.some(step => step.from === evolution.to)) continue;
      const label = `${route.label} → ${species.name.zh} Lv.${evolution.level}${evolution.automatic === false ? ' 在精灵养成中确认' : ''}进化为${name(evolution.to)}`;
      if (target.routes.some(existing => existing.label === label)) continue;
      added = routes.add(evolution.to, { ...route, kind: 'evolution', sourceSpecies: species.id, evolutionChain: chain, label }) || added;
    }
  }
  return added;
}

/** Omitting additionalSeeds enables gated recruitment; an explicit array replaces it. */
export function buildAcquisitionIndex(catalog: AcquisitionCatalog, planets: readonly WorldPlanet[] = WORLD_PLANETS, recipes: readonly FusionRecipe[] = FUSION_RECIPES, additionalSeeds?: readonly AcquisitionSeed[], breedingRecipes: readonly BreedingRecipe[] = BREEDING_RECIPES): Map<number, SpeciesAcquisition> {
  const definitions = new Map(catalog.species.map(species => [species.id, species]));
  const name: SpeciesName = id => definitions.get(id)!.name.zh;
  const eligibleBosses = new Map(getEligibleRecruitmentSPTs(catalog)
    .filter(boss => boss.team.every(mon => definitions.has(mon.species)))
    .map(boss => [boss.id, boss]));
  const routes = createRouteIndex(catalog), habitat = habitatSeeds(catalog, planets, definitions);
  const direct = [...journeySeeds(), ...habitat.direct, ...bossEssenceSeeds(catalog, definitions), ...(additionalSeeds ?? []).filter(seed => seed.prerequisites === undefined)];
  for (const seed of direct) routes.add(seed.species, seed.route);
  const gated = additionalSeeds === undefined
    ? recruitmentSeeds(catalog, planets, definitions, eligibleBosses) : additionalSeeds.filter(seed => seed.prerequisites !== undefined);
  // Recruitment, conditional capture, fusion, breeding and evolution share a
  // fixed point. An unavailable prerequisite never grants its dependent reward.
  // Labels depend on the recipe/output, not every combination of parent routes.
  // This bounds the graph and keeps alternate parent acquisition paths readable.
  for (let pass = 0; pass < catalog.species.length; pass++) {
    const added = [addConditionalCaptures(routes, habitat.conditional), addGatedSeeds(routes, gated, eligibleBosses),
      addBreedingRoutes(routes, breedingRecipes, name), addFusionRoutes(routes, recipes, name), addEvolutionRoutes(routes, catalog, name)];
    if (!added.includes(true)) break;
  }
  return routes.index;
}

function familyStatus(available: readonly number[], missing: readonly number[]): AcquisitionFamily['status'] {
  return available.length ? missing.length ? 'partial' : 'complete' : missing.length ? 'missing' : 'npc';
}

/** Source-defined ancestry groups forms; only executable rules grant coverage. */
export function buildAcquisitionFamilies(catalog: AcquisitionCatalog, index = buildAcquisitionIndex(catalog)): AcquisitionFamily[] {
  const definitions = new Map(catalog.species.map(species => [species.id, species]));
  const predecessors = buildPredecessors(catalog.species);
  const parents = new Map(catalog.species.map(species => [species.id, species.id]));
  function root(id: number): number {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent); parents.set(id, result); return result;
  }
  for (const [id, previous] of predecessors) for (const from of previous) parents.set(root(id), root(from));
  const groups = new Map<number, number[]>();
  for (const species of catalog.species) { const key = root(species.id); groups.set(key, [...(groups.get(key) ?? []), species.id]); }
  return [...groups.values()].map((memberIds): AcquisitionFamily => {
    memberIds.sort((a, b) => a - b);
    const withStatus = (status: SpeciesAcquisition['status']) => memberIds.filter(id => index.get(id)?.status === status);
    const availableSpecies = withStatus('available'), missingSpecies = withStatus('unimplemented'), excludedSpecies = withStatus('npc');
    const rootSpecies = memberIds.filter(id => !predecessors.get(id)!.size);
    const routes = memberIds.flatMap(id => index.get(id)?.routes.filter(route => route.kind !== 'evolution') ?? []);
    const entryRoutes = [...new Map(routes.map(route => [route.label, route])).values()];
    return { id: memberIds[0], name: definitions.get(rootSpecies[0] ?? memberIds[0])!.name.zh, memberIds, rootSpecies,
      availableSpecies, missingSpecies, excludedSpecies, status: familyStatus(availableSpecies, missingSpecies), entryRoutes };
  }).sort((a, b) => a.id - b.id);
}

export interface AcquisitionViews {
  index: Map<number, SpeciesAcquisition>;
  families: AcquisitionFamily[];
  familyBySpecies: Map<number, AcquisitionFamily>;
  initialForms: Map<number, InitialFormAcquisition>;
}

/** Every acquisition view the Dex, fusion and breeding screens read, as a pure function of the catalog. */
export function buildAcquisitionViews(catalog: AcquisitionCatalog): AcquisitionViews {
  const index = buildAcquisitionIndex(catalog), families = buildAcquisitionFamilies(catalog, index);
  return { index, families, initialForms: buildInitialFormAcquisitionIndex(catalog, index),
    familyBySpecies: new Map(families.flatMap(family => family.memberIds.map(id => [id, family] as const))) };
}

// Module-level views of the bundled catalog, built on first use. They predate
// passing the controller's catalog to the screens that read them.
let bundledViews: AcquisitionViews | undefined;
const views = () => bundledViews ??= buildAcquisitionViews(bundledCatalog() as unknown as AcquisitionCatalog);
export function getSpeciesAcquisition(id: number): SpeciesAcquisition {
  return views().index.get(id) ?? { status: 'unimplemented', description: '当前版本没有这只精灵的获取记录。', routes: [] };
}
export function getAcquisitionFamily(id: number): AcquisitionFamily | undefined { return views().familyBySpecies.get(id); }
export function getAcquisitionFamilies(): readonly AcquisitionFamily[] { return views().families; }

export function getInitialFormAcquisition(id: number) { return views().initialForms.get(id); }
