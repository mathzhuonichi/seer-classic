import type { GameAction } from '../kernel/contract.ts';
import type { AcquisitionRoute } from '../domain/acquisition/acquisition.ts';
import { CHALLENGE_CAMPAIGNS, CHALLENGE_CATEGORY, type Campaign } from '../domain/challenges/challenge-campaigns.ts';
import { LABORATORY_LOCATION, type WorldLocationId } from '../domain/world/world.ts';

/** The game shell's scene windows, toolbar and navigation routes. */
export type WindowKind = 'atlas' | 'monsters' | 'fusion' | 'breeding' | 'shop' | 'bag' | 'dex' | 'quests' | 'challenge' | 'facilities' | 'tower' | 'recovery' | 'settings';
export const WINDOW_TITLES: Record<WindowKind, string> = {
  atlas: '星际地图', monsters: '精灵背包', fusion: '实验室 · 精灵融合', breeding: '实验室 · 精灵繁殖', shop: '实验室 · 道具商城', bag: '道具背包', dex: '精灵图鉴',
  quests: '航行任务', challenge: 'SPT 挑战档案', facilities: '太空站 · 对战设施', tower: '勇者之塔 · 选择起点', recovery: '精灵恢复舱', settings: '航行设置',
};
export const COMPACT_WINDOWS: ReadonlySet<WindowKind> = new Set(['recovery', 'settings', 'quests']);

export interface ToolbarTool { id: WindowKind; label: string; icon: string; showLabel: boolean }
const tool = (id: WindowKind, label: string, icon: string, showLabel = false): ToolbarTool => ({ id, label, icon: `/ui/classic/${icon}`, showLabel });
/** Left wing, the central map button, right wing. */
export const TOOLBAR: { left: ToolbarTool[]; center: ToolbarTool; right: ToolbarTool[] } = {
  left: [tool('quests', '任务', 'mission.svg'), tool('challenge', 'SPT', 'new-spt-vector.svg'), tool('bag', '道具', 'bag.svg'), tool('dex', '图鉴', 'dex.svg', true)],
  center: tool('atlas', '地图', 'hd/map-v44.svg'),
  right: [tool('monsters', '精灵', 'hd/creatures-no-circle-v50.svg'), tool('recovery', '恢复', 'restore.svg', true), tool('settings', '设置', 'profile.svg', true)],
};

/** Initial selections handed to a window when it opens. */
export interface WindowFocus {
  dexSpecies?: number; fusionRecipeId?: string; breedingRecipeId?: string; bagPocket?: string;
  questId?: string; facilityId?: string; challengeCategory?: string;
}
/** Opening a window from the toolbar clears the selection it was last opened with. */
export const TOOLBAR_RESETS: Partial<Record<WindowKind, keyof WindowFocus>> = {
  quests: 'questId', monsters: 'fusionRecipeId', bag: 'bagPocket', challenge: 'challengeCategory',
};

/** A navigation request from a scene, as a page string: a window, `campaign:<id>`, `facilities:<id>` or a Tower action. */
export type ShellRoute =
  | { kind: 'tower' }
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'window'; windowKind: WindowKind | null; focus: WindowFocus };
const ROUTE_WINDOWS: Record<string, WindowKind> = {
  atlas: 'atlas', map: 'atlas', home: 'quests', monsters: 'monsters', fusion: 'fusion', breeding: 'breeding', shop: 'shop', bag: 'bag', dex: 'dex',
  quests: 'quests', challenge: 'challenge', facilities: 'facilities', recovery: 'recovery', settings: 'settings',
};
/** A plain window route opens without the selection it was last opened with. */
const ROUTE_RESETS: Record<string, keyof WindowFocus> = {
  challenge: 'challengeCategory', breeding: 'breedingRecipeId', quests: 'questId', home: 'questId', fusion: 'fusionRecipeId',
};

export function parseRoute(page: string): ShellRoute {
  if (page === 'tower') return { kind: 'tower' };
  if (page === 'tower:choose') return { kind: 'window', windowKind: 'tower', focus: {} };
  if (page === 'challenge:dark') return { kind: 'window', windowKind: 'challenge', focus: { challengeCategory: CHALLENGE_CATEGORY.dark } };
  if (page.startsWith('campaign:')) return { kind: 'campaign', campaignId: page.slice('campaign:'.length) };
  if (page.startsWith('facilities:')) return { kind: 'window', windowKind: 'facilities', focus: { facilityId: page.slice('facilities:'.length) } };
  const reset = ROUTE_RESETS[page];
  return { kind: 'window', windowKind: ROUTE_WINDOWS[page] ?? null, focus: reset ? { [reset]: undefined } : {} };
}

/** Where an encyclopedia acquisition route leads. */
export type LocateTarget =
  | { kind: 'travel'; destination: WorldLocationId; windowKind?: WindowKind; focus?: WindowFocus }
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'boss'; bossId: string }
  | { kind: 'quest'; questId: string }
  /** No location: the starter partner, shown in the monster storage. */
  | { kind: 'starter'; species: number };
export function locateTarget(route: AcquisitionRoute): LocateTarget {
  if (route.breedingRecipeId) return { kind: 'travel', destination: LABORATORY_LOCATION, windowKind: 'breeding', focus: { breedingRecipeId: route.breedingRecipeId } };
  if (route.fusionRecipeId) return { kind: 'travel', destination: LABORATORY_LOCATION, windowKind: 'fusion', focus: { fusionRecipeId: route.fusionRecipeId } };
  if (route.campaignId) return { kind: 'campaign', campaignId: route.campaignId };
  if (route.bossId) return { kind: 'boss', bossId: route.bossId };
  if (route.questId) return { kind: 'quest', questId: route.questId };
  if (route.planetId && route.regionId) return { kind: 'travel', destination: { planetId: route.planetId, regionId: route.regionId } };
  return { kind: 'starter', species: route.entrySpecies };
}

/** The campaign whose stage scene opens instead of a direct battle: a campaign boss, or a wild form of a campaign's species.
 * A skill-training campaign trains the player's own creature, so meeting that species is not its entry. */
export function campaignForAction(action: GameAction): Campaign | undefined {
  if (action.type === 'startBattle') return CHALLENGE_CAMPAIGNS.find(entry => entry.stages.some(stage => stage.bossIds.includes(action.bossId)));
  if (action.type === 'startTraining') return CHALLENGE_CAMPAIGNS.find(entry => entry.species === action.species && entry.reward !== 'skills');
  return undefined;
}
const BATTLE_STARTS: ReadonlySet<GameAction['type']> = new Set(['startBattle', 'startTraining', 'startCampaignStage', 'startFacility', 'startTower']);
/** Actions that start a battle go through the loading screen. */
export const startsBattle = (action: GameAction) => BATTLE_STARTS.has(action.type);
