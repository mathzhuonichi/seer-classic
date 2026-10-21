import { useCallback, useRef, useState } from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import { useGame } from '../../../shared/ui/use-game.ts';
import type { BattleSupplyCategory } from '../../../shared/item-categories.ts';
import { OPENED_ITEM_CATEGORY, battleResultTitle, roundStatus, shownTurn } from '../battle-hud.ts';
import BattleCombatant from './BattleCombatant.tsx';
import BattleCommandDeck, { type BattleCommand } from './BattleCommandDeck.tsx';
import BattleDialogue from './BattleDialogue.tsx';
import { BattleCreatureDetails } from './BattleDialogs.tsx';
import BattleHealth from './BattleHealth.tsx';
import BattleMatchup from './BattleMatchup.tsx';
import { useBattlePlayback } from './use-battle-playback.ts';
import './battle.css';

const ArenaLandscape = () => <div className="classic-arena-landscape" aria-hidden="true">
  <div className="classic-moon" /><div className="classic-mountains far" /><div className="classic-mountains near" /><div className="classic-floor" />
</div>;

interface BattleProps {
  c: GameController;
  background?: string;
  onSettings: () => void;
}

export default function Battle({ c, background, onSettings }: BattleProps) {
  const b = useGame(c, s => s.battle)!, inventory = useGame(c, s => s.items);
  const [tab, setTab] = useState<BattleCommand>(b.needsSwitch ? 'party' : 'battle');
  const [showLog, setShowLog] = useState(false);
  const [partySelection, setPartySelection] = useState(b.player.uid);
  const [itemCategory, setItemCategory] = useState<BattleSupplyCategory>(OPENED_ITEM_CATEGORY);
  const [showDetails, setShowDetails] = useState(false);
  const arena = useRef<HTMLDivElement>(null);
  const closeDetails = useCallback(() => setShowDetails(false), []);
  const playback = useBattlePlayback(b, c, {
    onStart: () => setShowLog(false),
    onNeedsSwitch: battle => { setTab('party'); setPartySelection(battle.party.find(mon => mon.hp > 0)?.uid || ''); },
  });
  const { frame, busy } = playback;

  const player = frame?.player ?? b.player;
  const enemy = frame?.enemy ?? b.enemy;
  const selectedParty = b.party.find(mon => mon.uid === partySelection) || b.player;
  return <section className="classic-battle" aria-label="精灵对战">
    <div ref={arena} className={`classic-arena ${background ? 'has-scene' : ''} ${busy ? 'is-playing' : ''}`}>
      <div className="classic-battle-caption">
        <span>{b.name} · 第 {shownTurn(b, busy)} 回合</span>
      </div>
      {background ? <img className="classic-scene-backdrop" src={background} alt="" aria-hidden="true" draggable={false}/> : <ArenaLandscape />}
      <div className="classic-health-row">
        <BattleHealth monster={frame ? { ...player, hp: frame.playerHp } : player} team={frame?.party ?? b.party}/>
        <BattleMatchup matchup={frame?.matchup ?? b.matchup}/>
        <BattleHealth monster={frame ? { ...enemy, hp: frame.enemyHp } : enemy} team={frame?.enemyParty ?? b.enemyParty} enemy />
      </div>
      <div className="classic-creatures">
        <BattleCombatant action={playback.sourceAction} effectCue={playback.skillEffect} monster={player} side={0} frame={frame} busy={busy}
          numbers={playback.numbers} arena={arena}/>
        <BattleCombatant action={playback.sourceAction} effectCue={playback.skillEffect} monster={enemy} side={1} frame={frame}
          captured={playback.captureResolved} busy={busy} numbers={playback.numbers} arena={arena}/>
      </div>
      <div className="classic-round-status">{roundStatus(b, busy)}</div>
    </div>
    <BattleDialogue battle={b} dialogue={playback.dialogue} busy={busy} showLog={showLog} onToggleLog={() => setShowLog(value => !value)}/>
    {b.finished && !busy
      ? <div className={`classic-battle-result ${b.won ? 'victory' : ''}`} role="status">
        <div><strong>{battleResultTitle(b)}</strong></div>
        <button onClick={onSettings}>设置</button>
      </div>
      : <BattleCommandDeck battle={b} inventory={inventory} commands={{ tab, setTab, itemCategory, setItemCategory, setPartySelection }}
        selectedParty={selectedParty} playback={playback} onDetails={() => setShowDetails(true)} onSettings={onSettings}/>}
    {showDetails && <BattleCreatureDetails c={c} monster={selectedParty} onClose={closeDetails}/>}
  </section>;
}
