import type { BattleView, GameAction, GameSnapshot } from '../game-types.ts';
import { braveTowerFloor } from '../progression/brave-tower.ts';
import { BRAVE_TOWER_LOCATION, findChallengeLocation, readWorldPreference, resolveWorldLocation, type WorldLocationId } from '../world.ts';
import { getCreatureArt } from './creature-art.ts';
import { appearanceOf } from './monster-views.ts';

/** The background and location name a battle is fought in front of. */
export interface BattleBackdrop { src: string; name: string }

export function locationBackdrop({ planetId, regionId }: WorldLocationId, name?: string): BattleBackdrop {
  const { planet, region } = resolveWorldLocation(planetId, regionId);
  return { src: region.background ?? planet.background, name: name ?? region.name };
}
/** The explorer's saved scene, before the world map reports its own. */
export const savedSceneBackdrop = () => locationBackdrop(readWorldPreference());

/** A campaign is fought in its first encounter's arena, under the campaign's location name. */
export function campaignBackdrop(s: Pick<GameSnapshot, 'campaigns' | 'bosses'>, campaignId: string): BattleBackdrop | undefined {
  const campaign = s.campaigns.find(entry => entry.id === campaignId);
  const boss = s.bosses.find(entry => entry.id === campaign?.stages[0]?.bossIds[0]);
  return boss && locationBackdrop(findChallengeLocation(boss), campaign?.location);
}

/** Tower floors are fought on map 500, whether entered by floor or by encounter. */
export const entersTower = (action: GameAction) =>
  action.type === 'startTower' || action.type === 'startBattle' && braveTowerFloor(action.bossId) !== undefined;
export const towerBackdrop = () => locationBackdrop(BRAVE_TOWER_LOCATION);

/** Every image the battle scene shows first: the backdrop, each creature's art and portrait. */
export function battleImageSources(backdrop: BattleBackdrop, battle: Pick<BattleView, 'party' | 'enemyParty'>): string[] {
  const creatures = [...battle.party, ...battle.enemyParty];
  return [...new Set([backdrop.src, ...creatures.flatMap(mon => [getCreatureArt(appearanceOf(mon)).src, mon.portrait])])];
}
