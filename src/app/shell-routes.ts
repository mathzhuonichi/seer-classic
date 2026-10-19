import type { GameController } from '../kernel/contract.ts';
import type { BossView } from '../shared/views.ts';
import {campaignBackdrop} from '../features/battle/index.ts';
import { locateTarget, parseRoute } from './shell-navigation.ts';
import type { AcquisitionRoute } from '../domain/acquisition/acquisition-model.ts';
import { braveTowerFloor } from '../domain/challenges/brave-tower.ts';
import { BRAVE_TOWER_LOCATION, findChallengeLocation } from '../domain/world/world.ts';
import type { BattleBackdrops } from './useBattlePreparation.ts';
import type { useShellNavigation } from './useShellNavigation.ts';

/** The shell's destinations: campaigns, the Tower, challenge locations, scene routes and encyclopedia routes. */
export function shellRoutes({ c, navigation, backdrops, setMessage, setSelected }: {
  c: GameController; navigation: ReturnType<typeof useShellNavigation>; backdrops: { current: BattleBackdrops };
  setMessage: (message: string) => void; setSelected: (uid: string) => void;
}) {
  const { show, travel, enterCampaign } = navigation;
  function openCampaign(id: string) {
    backdrops.current.campaign = campaignBackdrop(c.snapshot(), id) ?? backdrops.current.exploration;
    if (c.snapshot().battle?.finished) c.dispatch({ type: 'closeBattle' });
    enterCampaign(id); setMessage('');
  }
  const openTower = () => travel(BRAVE_TOWER_LOCATION);
  function enterTower(floor: number) {
    if (c.dispatch({ type: 'enterTower', floor }).ok) openTower();
  }
  /** A Tower floor lands in the Tower and a Tower side challenge also opens its panel; other encounters land at their contact. */
  function travelToChallenge(boss: BossView) {
    if (braveTowerFloor(boss.id) !== undefined) { openTower(); return; }
    if (boss.towerSideFloor !== undefined) { travel(BRAVE_TOWER_LOCATION, 'tower'); return; }
    const { planetId, regionId } = findChallengeLocation(boss);
    travel({ planetId, regionId, bossId: boss.id });
  }
  /** A page requested by a scene contact or terminal. */
  function navigate(page: string) {
    const route = parseRoute(page);
    if (route.kind === 'tower') openTower();
    else if (route.kind === 'campaign') { if (c.snapshot().campaigns.some(campaign => campaign.id === route.campaignId)) openCampaign(route.campaignId); }
    else show(route.windowKind, route.focus);
  }
  function locate(_species: number, route: AcquisitionRoute) {
    const target = locateTarget(route), s = c.snapshot();
    if (target.kind === 'travel') travel(target.destination, target.windowKind, target.focus);
    else if (target.kind === 'campaign') openCampaign(target.campaignId);
    else if (target.kind === 'boss') travelToChallenge(s.bosses.find(boss => boss.id === target.bossId)!);
    else if (target.kind === 'quest') show('quests', { questId: target.questId }, true);
    else {
      const owned = s.monsters.find(mon => mon.species === target.species);
      if (owned) setSelected(owned.uid);
      show('monsters', {}, true);
      if (!owned) setMessage('初始伙伴在新旅程开始时赠送，可在精灵仓库查看。');
    }
  }
  return { openCampaign, openTower, enterTower, travelToChallenge, navigate, locate };
}
