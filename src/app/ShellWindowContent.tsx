import type { GameController } from '../kernel/contract.ts';
import type { WindowFocus, WindowKind } from './shell-navigation.ts';
import {BattleFacilities} from '../features/challenges/ui.ts';
import {BraveTower} from '../features/challenges/ui.ts';
import {Breeding} from '../features/collection/ui.ts';
import {ChallengeCenter} from '../features/challenges/ui.ts';
import {Dex} from '../features/collection/ui.ts';
import {Fusion} from '../features/collection/ui.ts';
import {Inventory} from '../features/items/ui.ts';
import {ItemShop} from '../features/items/ui.ts';
import {MonsterManager} from '../features/raising/ui.ts';
import {QuestPanel} from '../features/challenges/ui.ts';
import {WorldAtlas} from '../features/world/ui.ts';
import { RecoveryConsole, SettingsConsole } from './ShellPanels.tsx';
import type { shellRoutes } from './shell-routes.ts';
import type { useShellNavigation } from './useShellNavigation.ts';
import type { SaveLibrary } from '../kernel/save-library.ts';

export interface ShellWindowProps {
  kind: WindowKind; c: GameController; saves: SaveLibrary; focus: WindowFocus; selected: string; inBattle: boolean;
  navigation: ReturnType<typeof useShellNavigation>; routes: ReturnType<typeof shellRoutes>;
  onSelect: (uid: string) => void; onMessage: (message: string) => void;
  onExportSave: () => void; onExportFile: (text: string, fileName: string) => void; onImportSave: () => void; onHeal: () => void; onModifier: () => void;
}

/** The body of one scene window. */
export function ShellWindowContent(
  { kind, c, saves, focus, selected, inBattle, navigation: { show, travel }, routes, onSelect, onMessage, ...actions }: ShellWindowProps,
) {
  const openBag = (pocket: string, itemId?: string) => show('bag', { bag: { pocket, itemId } });
  const openDex = (dexSpecies: number) => show('dex', { dexSpecies });
  const openMonsters = () => show('monsters');
  switch (kind) {
    case 'atlas': return <WorldAtlas onTravel={destination => travel(destination)}/>;
    case 'monsters': return <MonsterManager c={c} selected={selected} onSelect={onSelect}/>;
    case 'fusion': return <section className="management-panel" aria-label="实验室融合面板">
      <Fusion c={c} initialRecipeId={focus.fusionRecipeId} onOpenBeads={itemId => openBag('essence', itemId)}/>
    </section>;
    case 'breeding': return <Breeding c={c} initialRecipeId={focus.breedingRecipeId} onOpenDex={openDex}
      onOpenMonsters={uid => { onSelect(uid); openMonsters(); }}/>;
    case 'shop': return <ItemShop c={c} onOpenBag={openBag}/>;
    case 'bag': return <Inventory c={c} onSave={actions.onExportSave} onLoad={actions.onImportSave} focus={focus.bag}/>;
    case 'dex': return <Dex c={c} onLocate={routes.locate} focusSpecies={focus.dexSpecies}/>;
    case 'challenge': return <ChallengeCenter c={c} initialCategory={focus.challengeCategory} onExplore={() => show('atlas')}
      onTravel={routes.travelToChallenge} onCampaign={routes.openCampaign} onTower={routes.openTower}/>;
    case 'facilities': return <BattleFacilities c={c} facilityId={focus.facilityId} onManage={openMonsters}/>;
    case 'tower': return <BraveTower c={c} onEnter={routes.enterTower}/>;
    case 'quests': return <QuestPanel c={c} focusQuestId={focus.questId} onTravel={routes.travelToChallenge} onLocateSpecies={openDex}
      onOpenBag={itemId => openBag('essence', itemId)}/>;
    case 'recovery': return <RecoveryConsole c={c} onHeal={actions.onHeal}/>;
    case 'settings': return <SettingsConsole inBattle={inBattle} saves={saves} onExport={actions.onExportSave} onImport={actions.onImportSave}
      onExportFile={actions.onExportFile} onModifier={actions.onModifier} onMessage={onMessage}/>;
  }
}
