import type { GameAction, GameSnapshot } from '../../kernel/contract.ts';
import type { BossEvidenceView, BossView, CampaignView, EncounterOpponentView, QuestView, SpeciesView } from '../../shared/views.ts';
import { CHALLENGE_CATEGORY } from '../../domain/challenges/challenge-campaigns.ts';
import { BRAVE_TOWER_LOCATION, LABORATORY_LOCATION, findSceneChallenges, isWorldLocation, type WorldPlanet, type WorldRegion } from '../../domain/world/world.ts';
import { opponentLevelText } from '../../shared/encounter-level.ts';
import { speciesName } from '../../shared/monster-views.ts';
import type { ScenePoint } from './scene-geometry.ts';

/** What the player is talking to in the current scene. */
export type WorldSelection =
  | { kind: 'creature'; id: number; instanceId?: string; level?: number }
  | { kind: 'boss'; id: string }
  | { kind: 'campaign'; id: string }
  | { kind: 'facility' };
export type FacilityKind = NonNullable<WorldRegion['facility']>;

/** A piece of equipment drawn in the original background: walking to it opens a page. */
export interface SceneEquipment extends ScenePoint {
  /** A station terminal shows a caption with a hint; laboratory equipment shows only its name. */
  kind: 'lab' | 'terminal';
  page: string; name: string; width: number; height: number; approach: ScenePoint;
  hint?: string; captionAbove?: boolean;
}
// One interaction on each retained piece of equipment. These footprints are
// visual adaptations of the original backgrounds, not additional map rooms.
const SCENE_EQUIPMENT: Record<string, SceneEquipment[]> = {
  // The original laboratory map contains the equipment: bind interaction to its actual footprint.
  [`${LABORATORY_LOCATION.planetId}/${LABORATORY_LOCATION.regionId}`]: [
    { kind: 'lab', page: 'fusion', name: '精灵融合舱', x: 8.5, y: 33.5, width: 14, height: 34, approach: { x: 17, y: 58 } },
    { kind: 'lab', page: 'breeding', name: '精灵繁殖舱', x: 28.2, y: 34.6, width: 14, height: 33, approach: { x: 31, y: 58 } },
    { kind: 'lab', page: 'shop', name: '道具商城', x: 48, y: 28, width: 22, height: 23, approach: { x: 48, y: 58 } },
  ],
  'space-station/resources': [
    { kind: 'terminal', page: 'facilities:random', name: '对战终端', hint: '随机 · 巅峰 · 经典', x: 74, y: 18, width: 17, height: 36, approach: { x: 69, y: 44 } },
  ],
  'space-station/dark-arena': [
    { kind: 'terminal', page: 'challenge:dark', name: '暗黑挑战终端', hint: '选择挑战之门', x: 49, y: 93, width: 16, height: 12, approach: { x: 49, y: 78 }, captionAbove: true },
  ],
};
const FACILITY_NAMES: Record<FacilityKind, string> = { missions: '罗杰船长', recovery: '派特博士', battle: '对战管理员', challenges: '传送管理员' };
const FACILITY_GREETINGS: Partial<Record<FacilityKind, string>> = {
  missions: '欢迎回来，赛尔！看看航行日志，继续我们的探索吧。',
  recovery: '把精灵交给恢复舱，体力与技能 PP 会完全恢复。',
};

export interface TowerScene {
  floor: number; complete: boolean; highestCleared: number; totalFloors: number; boss?: BossView; opponents: EncounterOpponentView[];
}
export interface CampaignContact { campaign: CampaignView; name: string; progress: string }
export interface WorldSceneView {
  planet: WorldPlanet; region: WorldRegion;
  /** Set only inside the Brave Tower. */
  tower?: TowerScene;
  name: string;
  /** Changes whenever the scene must remount: a new region, Tower floor or Tower completion. */
  key: string;
  background: string;
  /** Recovered or remastered original artwork, rather than authored scenery. */
  official: boolean;
  bosses: BossView[];
  campaign?: CampaignContact;
  facilityName: string;
  laboratory: boolean;
  /** Laboratory equipment and station terminals. */
  equipment: SceneEquipment[];
  hint: string;
}

function towerScene(s: GameSnapshot): TowerScene {
  const { highestCleared, totalFloors, position: { floor, bossId, climbComplete } } = s.braveTower;
  const boss = s.bosses.find(entry => entry.id === bossId);
  const opponents = boss?.opponents?.length ? boss.opponents
    : boss ? [{ species: boss.species, name: speciesName(s, boss.species, boss.name), level: boss.level, evidence: boss.evidence }] : [];
  return { floor, complete: climbComplete, highestCleared, totalFloors, boss, opponents };
}

function campaignContact(s: GameSnapshot, region: WorldRegion): CampaignContact | undefined {
  const campaign = s.campaigns.find(entry => entry.id === region.campaignId);
  if (!campaign) return undefined;
  const next = campaign.stages.find(stage => stage.id === campaign.nextStageId);
  const progress = campaign.finished ? '全部挑战已完成' : next ? `当前挑战：${next.name}` : '查看挑战进度';
  return { campaign, name: campaign.speciesName, progress };
}

function groundHint(tower: TowerScene | undefined) {
  if (!tower) return '点击地图任意位置移动 · 点击精灵互动';
  return tower.complete ? '本轮挑战已完成 · 可选择起点重新登塔' : '点击中央对手挑战本层 · 胜利后前往下一层';
}

export function buildWorldScene(s: GameSnapshot, planet: WorldPlanet, region: WorldRegion, targetBossId?: string): WorldSceneView {
  const tower = isWorldLocation(planet, region, BRAVE_TOWER_LOCATION) ? towerScene(s) : undefined;
  const background = region.background ?? planet.background;
  return {
    planet, region, tower, background, laboratory: isWorldLocation(planet, region, LABORATORY_LOCATION),
    name: tower ? `勇者之塔 · 第 ${tower.floor} 层` : region.name,
    key: `${planet.id}/${region.id}${tower ? `/${tower.floor}/${tower.complete ? 'complete' : 'ready'}` : ''}`,
    official: region.backgroundKind === 'official' || region.backgroundKind === 'remastered' || background.includes('/maps/original/'),
    bosses: tower ? (tower.boss ? [tower.boss] : []) : findSceneChallenges(planet.id, region.id, s.bosses, targetBossId),
    campaign: campaignContact(s, region),
    facilityName: FACILITY_NAMES[region.facility ?? 'challenges'],
    equipment: SCENE_EQUIPMENT[`${planet.id}/${region.id}`] ?? [],
    hint: groundHint(tower),
  };
}

/** The location HUD tooltip: Tower progress, or the planet subtitle with the level range. */
export function sceneTitle({ planet, region, tower }: WorldSceneView) {
  return tower ? `最高通过 ${tower.highestCleared} / ${tower.totalFloors} 层`
    : `${planet.subtitle} · ${region.facility ? '飞船设施' : `Lv.${region.levels[0]}–${region.levels[1]}`}`;
}
/** A Tower contact shows its first opponent's name. */
export const contactName = (scene: WorldSceneView, boss: BossView) => scene.tower ? scene.tower.opponents[0]?.name ?? boss.name : boss.name;

/** The primary dialogue button: what it says and what it does. */
export type DialogueChallenge =
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'quest'; questId: string }
  | { kind: 'battle'; action: GameAction }
  | { kind: 'none' };
export interface FacilityAction { label: string; primary: boolean; route?: string; heal?: boolean; closes: boolean }
export interface WorldDialogueView {
  label: string;
  portrait: { species: number; name: string } | { facility: FacilityKind };
  kicker: string; title: string; text: string;
  /** Shown when the player asks for details. */
  detail: string;
  /** The 详情 button opens this species' encyclopedia entry instead of toggling the detail. */
  dexSpecies?: number;
  towerTeam?: { floor: number; opponents: { species: number; name: string; level: string }[] };
  evidence?: BossEvidenceView;
  reward?: string;
  /** Set for a creature, boss or campaign contact; facilities use `facilityActions`. */
  challenge?: { label: string; disabled: boolean; chooseStart: boolean; run: DialogueChallenge };
  facilityActions: FacilityAction[];
}


function facilityActions(scene: WorldSceneView): FacilityAction[] {
  const { region, laboratory } = scene, actions: FacilityAction[] = [];
  if (region.facility === 'recovery') actions.push({ label: '恢复全队', primary: true, heal: true, closes: false });
  if (laboratory) for (const [label, route] of [['精灵融合', 'fusion'], ['精灵繁殖', 'breeding'], ['道具商城', 'shop']])
    actions.push({ label, primary: false, route, closes: true });
  if (region.facility === 'missions') actions.push({ label: '航行任务', primary: true, route: 'quests', closes: false });
  if (region.facility === 'challenges') actions.push({ label: '挑战档案', primary: true, route: 'challenge', closes: false });
  if (region.facility === 'battle' && region.battleFacility) actions.push({ label: '选择对战', primary: true, route: `facilities:${region.battleFacility}`, closes: true });
  return actions;
}

function campaignDialogue(scene: WorldSceneView, { campaign, name, progress }: CampaignContact): WorldDialogueView {
  return {
    label: `与${name}交谈`, portrait: { species: campaign.species, name }, kicker: '封印挑战', title: name,
    text: `${scene.region.description} ${progress}。已完成 ${campaign.completed} / ${campaign.stages.length} 关。`,
    detail: campaign.description, facilityActions: [],
    challenge: { label: '查看封印进度', disabled: false, chooseStart: false, run: { kind: 'campaign', campaignId: campaign.id } },
  };
}

function creatureNote(creature: SpeciesView, recruitment: QuestView | undefined) {
  if (recruitment) return '完成精灵招募的收集与首领条件后领取精元。';
  if (creature.wildCapture === false) return '战胜后领取精元，在道具背包孵化。';
  // Niao is captured only with one of its partner species active.
  if (creature.id === 416) return '捕捉时需派出尼尔、菲斯利、艾斯菲亚或其闪光形态。';
  return '在战斗道具中使用精灵胶囊捕捉。';
}

function creatureDialogue(s: GameSnapshot, scene: WorldSceneView, creature: SpeciesView, level: number): WorldDialogueView {
  const { planet, region } = scene;
  const recruitment = region.recruitmentSpecies?.includes(creature.id)
    ? s.quests.find(quest => quest.group === 'spt-recruitment' && quest.rewardSpecies === creature.id) : undefined;
  const capture = creature.wildCapture === false ? '击败后通过精元孵化获得，不能使用胶囊。' : '先削弱野生精灵的体力，再从战斗道具使用精灵胶囊。';
  return {
    label: `与${creature.name}交谈`, portrait: { species: creature.id, name: creature.name },
    kicker: recruitment ? '收集招募' : creature.wildCapture === false ? '野外挑战' : '野生精灵', title: creature.name,
    text: `Lv.${level} · ${creature.types.join(' / ')}系 · ${creature.owned ? '已经结识的伙伴' : '还未加入收集档案'}。${creatureNote(creature, recruitment)}`,
    detail: `精灵编号 #${creature.id}，等级 Lv.${level}。${capture}`, dexSpecies: creature.id, facilityActions: [],
    challenge: { label: recruitment ? '查看招募任务' : '挑战', disabled: false, chooseStart: false, run: recruitment
      ? { kind: 'quest', questId: recruitment.id }
      : { kind: 'battle', action: { type: 'startTraining', species: creature.id, level, planetId: planet.id, regionId: region.id } } },
  };
}

function towerText(tower: TowerScene) {
  if (tower.complete) return `本轮已通过全部 ${tower.totalFloors} 层。选择起点后可重新登塔。`;
  const next = tower.floor < tower.totalFloors ? `全部战胜后进入第 ${tower.floor + 1} 层。` : '全部战胜后完成本轮登塔。';
  return `本层共有 ${tower.opponents.length} 只精灵。${next}退出或失败后保留当前层。`;
}

function bossDialogue(scene: WorldSceneView, boss: BossView): WorldDialogueView {
  const { region, tower } = scene, name = contactName(scene, boss);
  const staging = region.challengeStaging;
  const text = tower ? towerText(tower)
    : `${opponentLevelText(boss)} · ${boss.cleared ? '已经挑战成功，随时可以再次切磋。' : '准备好你的战队，点击下方挑战开始战斗。'}${staging ? ' 接驳平台已就绪，确认后进入战场。' : ''}`;
  const run: DialogueChallenge = !tower ? { kind: 'battle', action: { type: 'startBattle', bossId: boss.id } }
    : !tower.complete && boss.id === tower.boss?.id ? { kind: 'battle', action: { type: 'startTower', floor: tower.floor } } : { kind: 'none' };
  return {
    label: `与${name}交谈`, portrait: { species: boss.species, name }, title: name, text,
    kicker: tower ? scene.name : `${CHALLENGE_CATEGORY[boss.category]}${staging ? ' · 挑战接驳' : ''}`,
    detail: boss.description, dexSpecies: boss.species, evidence: boss.evidence, facilityActions: [],
    towerTeam: tower && { floor: tower.floor,
      opponents: tower.opponents.map(opponent => ({ species: opponent.species, name: opponent.name, level: opponentLevelText(opponent) })) },
    reward: tower ? boss.rewardText : undefined,
    challenge: { label: tower?.complete ? '本轮已通关' : tower ? `挑战第 ${tower.floor} 层` : '挑战', disabled: !!tower?.complete, chooseStart: !!tower?.complete, run },
  };
}

function facilityDialogue(scene: WorldSceneView): WorldDialogueView {
  const facility = scene.region.facility!;
  return {
    label: '设施互动', portrait: { facility }, kicker: '飞船联络', title: scene.facilityName,
    text: FACILITY_GREETINGS[facility] ?? (facility === 'battle' ? scene.region.description : '选择下一站，或者从挑战档案寻找新的对手。'),
    detail: scene.region.description, facilityActions: facilityActions(scene),
  };
}

/** The dialogue for a selection, or undefined when it is not shown (an unknown Tower contact). */
export function buildWorldDialogue(s: GameSnapshot, scene: WorldSceneView, selection: WorldSelection): WorldDialogueView | undefined {
  const { campaign, region, tower } = scene;
  const boss = selection.kind === 'boss' ? (tower ? scene.bosses : s.bosses).find(entry => entry.id === selection.id) : undefined;
  if (tower && !boss) return undefined;
  if (selection.kind === 'campaign' && campaign && selection.id === campaign.campaign.id) return campaignDialogue(scene, campaign);
  const creature = selection.kind === 'creature' ? s.species.find(species => species.id === selection.id) : undefined;
  if (creature) return creatureDialogue(s, scene, creature, selection.kind === 'creature' ? selection.level ?? region.levels[0] : region.levels[0]);
  return boss ? bossDialogue(scene, boss) : facilityDialogue(scene);
}
