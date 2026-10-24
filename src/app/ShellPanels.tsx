import type { GameController } from '../kernel/contract.ts';
import { partyMonsters } from '../shared/party-order.ts';
import { useGame } from '../shared/ui/use-game.ts';
import { TOOLBAR, type ToolbarTool, type WindowKind } from './shell-navigation.ts';
import AudioSettings from './AudioSettings.tsx';
import { AboutSection } from './AboutSection.tsx';
import { SaveSlots, type SaveSlotsProps } from './SaveSlots.tsx';

export function GameToolbar({ hidden, active, questAlert, onOpen }: {
  hidden: boolean; active: WindowKind | null; questAlert: boolean; onOpen: (kind: WindowKind) => void;
}) {
  const button = (tool: ToolbarTool) => <button key={tool.id} className={`toolbar-${tool.id} ${active === tool.id ? 'active' : ''}`}
    aria-label={tool.label} title={tool.label} aria-pressed={active === tool.id} onClick={() => onOpen(tool.id)}>
    <img src={tool.icon} alt="" draggable={false}/>
    {tool.showLabel && <span className="toolbar-label">{tool.label}</span>}
    {tool.id === 'quests' && questAlert && <i className="hud-alert"/>}
  </button>;
  return <footer className="game-hud" hidden={hidden}><nav className="game-toolbar" aria-label="主界面功能">
    <div className="toolbar-side toolbar-side-left">{TOOLBAR.left.map(button)}</div>
    {button(TOOLBAR.center)}
    <div className="toolbar-side toolbar-side-right">{TOOLBAR.right.map(button)}</div>
  </nav></footer>;
}

export function RecoveryConsole({ c, onHeal }: { c: GameController; onHeal: () => void }) {
  const party = useGame(c, s => s.party), monsters = useGame(c, s => s.monsters), roster = partyMonsters({ party, monsters });
  return <section className="recovery-console"><div className="recovery-symbol">✚</div><h3>恢复体力与技能 PP</h3>
    <div className="recovery-roster">{roster.map(mon => <div key={mon.uid}><span>{mon.name}</span><span>{mon.hp} / {mon.stats.hp}</span></div>)}</div>
    <button className="primary" onClick={onHeal}>恢复全队</button>
  </section>;
}

export function SettingsConsole({ inBattle, onModifier, onMessage, ...saves }: SaveSlotsProps & { inBattle: boolean; onModifier: () => void }) {
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => onMessage('当前预览窗口不支持全屏，可扩大游戏窗口。'));
  }
  return <section className="settings-console"><AudioSettings/>
    <SaveSlots {...saves} onMessage={onMessage}/>
    <h3>开发工具</h3><button disabled={inBattle} onClick={onModifier}>修改器</button>
    <h3>画面</h3><button onClick={toggleFullscreen}>切换全屏</button>
    <p className="small muted">Escape 关闭场景窗口 · 点击地面行走 · 方向键移动</p>
    <AboutSection/>
  </section>;
}
