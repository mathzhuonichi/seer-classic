// The scenes Brave Tower and campaign battles are fought in front of.
import type { GameAction, GameSnapshot } from '../../kernel/contract.ts';
import { braveTowerFloor } from '../../domain/challenges/brave-tower.ts';
import { BRAVE_TOWER_LOCATION, findChallengeLocation, type WorldLocationId } from '../../domain/world/world.ts';
import { type BattleBackdrop, locationBackdrop } from '../battle/index.ts';

/** Where a campaign is staged: its first encounter's location. */
export function campaignLocation(s: Pick<GameSnapshot, 'campaigns' | 'bosses'>, campaignId: string): WorldLocationId | undefined {
  const campaign = s.campaigns.find(entry => entry.id === campaignId);
  const boss = s.bosses.find(entry => entry.id === campaign?.stages[0]?.bossIds[0]);
  return boss && findChallengeLocation(boss);
}

/** A campaign is fought in its first encounter's arena, under the campaign's location name. */
export function campaignBackdrop(s: Pick<GameSnapshot, 'campaigns' | 'bosses'>, campaignId: string): BattleBackdrop | undefined {
  const location = campaignLocation(s, campaignId);
  return location && locationBackdrop(location, s.campaigns.find(entry => entry.id === campaignId)?.location);
}

/** Tower floors are fought on map 500, whether entered by floor or by encounter. */
export const entersTower = (action: GameAction) =>
  action.type === 'startTower' || action.type === 'startBattle' && braveTowerFloor(action.bossId) !== undefined;
export const towerBackdrop = () => locationBackdrop(BRAVE_TOWER_LOCATION);
