import type { BattleMonsterView, BattleView, ItemView } from '../../../shared/views.ts';
import { gameAudio } from '../../../shared/audio/game-audio.ts';
import { OPENED_ITEM_PANE, type BattleItemChoice } from '../battle-hud.ts';
import BattleItemPane from './BattleItemPane.tsx';
import BattlePartyPane from './BattlePartyPane.tsx';
import BattleSkillPane from './BattleSkillPane.tsx';
import type { BattlePlayback } from './use-battle-playback.ts';

export type BattleCommand = 'battle' | 'items' | 'party' | 'escape';
const COMMANDS: { id: BattleCommand; label: string; asset: string }[] = [
  { id: 'battle', label: '战斗', asset: 'battle-fight' },
  { id: 'items', label: '道具', asset: 'battle-items' },
  { id: 'party', label: '精灵', asset: 'battle-creatures' },
  { id: 'escape', label: '逃跑', asset: 'battle-retreat' },
];
const commandIcon = (asset: string) => <img src={`/ui/classic/hd/${asset}.svg`} alt="" draggable={false}/>;

export interface BattleCommandState {
  tab: BattleCommand;
  setTab: (tab: BattleCommand) => void;
  items: BattleItemChoice;
  chooseItems: (patch: Partial<BattleItemChoice>) => void;
  setPartySelection: (uid: string) => void;
}

function EscapePane({ battle, disabled, onFlee }: { battle: BattleView; disabled: boolean; onFlee: () => void }) {
  return <div className="classic-escape-panel">
    <div>
      <strong>{battle.needsSwitch ? `${battle.player.name}已失去战斗能力` : '撤离本场战斗'}</strong>
      <p>{battle.needsSwitch ? '可以派出替补精灵，或直接撤离。' : '立即离开当前战斗，不再执行本回合攻击。'}撤离不会获得本场战斗奖励。</p>
    </div>
    <button disabled={disabled} onClick={onFlee}>撤离战斗 →</button>
  </div>;
}

/** The command diamond (capture plus four commands) and the open command's pane. */
export default function BattleCommandDeck({ battle, inventory, commands, selectedParty, playback, onDetails, onSettings }: {
  battle: BattleView; inventory: ItemView[]; commands: BattleCommandState; selectedParty: BattleMonsterView; playback: BattlePlayback;
  onDetails: () => void; onSettings?: () => void;
}) {
  const { tab, setTab, items, chooseItems } = commands, { busy, submit } = playback;
  const disabled = busy || battle.finished, blocked = disabled || battle.needsSwitch;
  const capsuleTab = tab === 'items' && items.category === 'capsule';
  const openCapture = () => { gameAudio.playSfx('tab'); chooseItems({ category: 'capsule', selection: '' }); setTab('items'); };
  const openCommand = (command: BattleCommand) => {
    gameAudio.playSfx('tab');
    if (command === 'items') chooseItems(OPENED_ITEM_PANE);
    setTab(command);
  };
  return <div className="classic-command-deck" aria-busy={busy}>
    <nav className={`classic-command-tabs${onSettings ? ' has-settings' : ''}`} aria-label="战斗指令">
      <div className="classic-command-diamond">
        <button className={`command-capture ${capsuleTab ? 'active' : ''}`} aria-label="捕捉" title="捕捉" aria-pressed={capsuleTab} disabled={blocked || !battle.canCapture}
          onClick={openCapture}>{commandIcon('battle-capture')}</button>
        {COMMANDS.map(command => {
          const active = tab === command.id && !capsuleTab;
          const unavailable = disabled || (battle.needsSwitch && command.id !== 'party' && command.id !== 'escape');
          return <button key={command.id} className={`command-${command.id} ${active ? 'active' : ''}`} aria-label={command.label} title={command.label}
            disabled={unavailable} aria-pressed={active} onClick={() => openCommand(command.id)}>{commandIcon(command.asset)}</button>;
        })}
      </div>
      {onSettings && <button className="classic-battle-settings" onClick={onSettings}>设置</button>}
    </nav>
    <div className={`classic-command-content command-content-${tab} ${tab === 'items' ? 'classic-item-panel' : ''}`}>
      {tab === 'battle' && <BattleSkillPane player={battle.player} blocked={blocked} onMove={skillId => submit({ type: 'move', skillId })}/>}
      {tab === 'items' && <BattleItemPane battle={battle} inventory={inventory} choice={items} onChoice={chooseItems} disabled={disabled}
        canAct={playback.canAct} submit={submit}/>}
      {tab === 'party' && <BattlePartyPane battle={battle} selected={selectedParty} disabled={disabled} onSelect={commands.setPartySelection}
        onDetails={onDetails} onSwitch={uid => submit({ type: 'switch', uid })}/>}
      {tab === 'escape' && <EscapePane battle={battle} disabled={disabled} onFlee={() => submit({ type: 'flee' })}/>}
    </div>
  </div>;
}
