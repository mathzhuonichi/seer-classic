import type { GameController, GameSnapshot } from '../../game-types.ts';
import type { WindowFocus, WindowKind } from '../../presentation/shell-navigation.ts';
import BattleFacilities from '../BattleFacilities.tsx';
import BraveTower from '../BraveTower.tsx';
import Breeding from '../Breeding.tsx';
import ChallengeCenter from '../ChallengeCenter.tsx';
import Dex from '../Dex.tsx';
import Fusion from '../Fusion.tsx';
import Inventory from '../Inventory.tsx';
import ItemShop from '../ItemShop.tsx';
import MonsterManager from '../MonsterManager.tsx';
import QuestPanel from '../QuestPanel.tsx';
import WorldAtlas from '../WorldAtlas.tsx';
import { RecoveryConsole, SettingsConsole } from './ShellPanels.tsx';
import type { shellRoutes } from './shell-routes.ts';
import type { useShellNavigation } from './useShellNavigation.ts';

export interface ShellWindowProps {
  kind: WindowKind; s: GameSnapshot; c: GameController; focus: WindowFocus; selected: string; inBattle: boolean;
  navigation: ReturnType<typeof useShellNavigation>; routes: ReturnType<typeof shellRoutes>;
  onSelect: (uid: string) => void; onMessage: (message: string) => void;
  onExportSave: () => void; onImportSave: () => void; onHeal: () => void; onModifier: () => void;
}

/** The body of one scene window. */
export function ShellWindowContent({ kind, s, c, focus, selected, inBattle, navigation: { show, travel }, routes, onSelect, onMessage, ...actions }: ShellWindowProps) {
  const openBag = (bagPocket: string) => show('bag', { bagPocket }), openDex = (dexSpecies: number) => show('dex', { dexSpecies });
  const openMonsters = () => show('monsters');
  switch (kind) {
    case 'atlas': return <WorldAtlas onTravel={destination => travel(destination)}/>;
    case 'monsters': return <MonsterManager s={s} c={c} selected={selected} onSelect={onSelect}/>;
    case 'fusion': return <section className="management-panel" aria-label="实验室融合面板">
      <Fusion s={s} c={c} initialRecipeId={focus.fusionRecipeId} onOpenBeads={() => openBag('essence')}/>
    </section>;
    case 'breeding': return <Breeding s={s} c={c} initialRecipeId={focus.breedingRecipeId} onOpenDex={openDex} onOpenMonsters={uid => { onSelect(uid); openMonsters(); }}/>;
    case 'shop': return <ItemShop s={s} c={c} onOpenBag={openBag}/>;
    case 'bag': return <Inventory s={s} c={c} onSave={actions.onExportSave} onMessage={onMessage} initialPocket={focus.bagPocket}/>;
    case 'dex': return <Dex s={s} c={c} onLocate={routes.locate} focusSpecies={focus.dexSpecies}/>;
    case 'challenge': return <ChallengeCenter s={s} c={c} initialCategory={focus.challengeCategory} onExplore={() => show('atlas')}
      onTravel={routes.travelToChallenge} onCampaign={routes.openCampaign} onTower={routes.openTower}/>;
    case 'facilities': return <BattleFacilities s={s} c={c} facilityId={focus.facilityId} onManage={openMonsters}/>;
    case 'tower': return <BraveTower s={s} onEnter={routes.enterTower}/>;
    case 'quests': return <QuestPanel s={s} c={c} focusQuestId={focus.questId} onTravel={routes.travelToChallenge} onLocateSpecies={openDex} onOpenBag={() => openBag('essence')}/>;
    case 'recovery': return <RecoveryConsole s={s} onHeal={actions.onHeal}/>;
    case 'settings': return <SettingsConsole inBattle={inBattle} onExport={actions.onExportSave} onImport={actions.onImportSave} onModifier={actions.onModifier} onMessage={onMessage}/>;
  }
}
