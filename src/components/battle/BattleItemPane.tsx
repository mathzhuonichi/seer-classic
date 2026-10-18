import type { BattleView, GameAction, ItemView } from '../../game-types.ts';
import { battleItemPane, itemCardAction, type BattleItemChoice } from '../../presentation/battle-hud.ts';
import ItemIcon from '../ItemIcon.tsx';
import ItemTile from '../ItemTile.tsx';

/** Recovery and status items take a target and a Use click; a capsule card throws at once. */
export default function BattleItemPane({ battle, inventory, choice, onChoice, disabled, canAct, submit }: {
  battle: BattleView; inventory: ItemView[]; choice: BattleItemChoice; onChoice: (patch: Partial<BattleItemChoice>) => void;
  disabled: boolean; canAct: () => boolean; submit: (action: GameAction) => void;
}) {
  const pane = battleItemPane(battle, inventory, choice), { selected, target } = pane;
  const capsules = pane.category === 'capsule', blocked = disabled || battle.needsSwitch;
  function chooseItem(item: ItemView) {
    const action = canAct() ? itemCardAction(battle, item) : null;
    if (action?.type === 'select') onChoice({ selection: action.itemId });
    else if (action) submit(action);
  }
  return <>
    <nav className="classic-item-category-tabs" aria-label="战斗道具分类">{pane.categories.map(([id, label]) =>
      <button key={id} className={pane.category === id ? 'active' : ''} aria-pressed={pane.category === id} disabled={blocked}
        onClick={() => onChoice({ category: id, selection: '' })}>{label}</button>)}</nav>
    <div className="classic-item-workspace">
      <div className="classic-item-grid item-icon-grid">
        {pane.items.map(item => <ItemTile key={item.id} size="small" icon={<ItemIcon id={item.id} kind={item.kind} label={item.name} size={30}/>}
          name={capsules ? `使用${item.name}捕捉${battle.enemy.name}` : item.name} description={item.description} quantity={item.unlimited ? '∞' : item.count}
          selected={!capsules && selected?.id === item.id} disabled={blocked} onSelect={() => chooseItem(item)}>
          {capsules ? '单击即可投掷胶囊。' : '选择道具和目标后点击使用；使用占一回合。'}
        </ItemTile>)}
        {!pane.items.length && <p className="classic-panel-empty">{pane.empty}</p>}
      </div>
      {capsules ? <div className="classic-item-actions classic-capture-actions">
        <p>{battle.canCapture ? '点击胶囊即可立即捕捉。削减体力、施加异常状态能提高捕捉机会。' : battle.captureBlockedReason || '首领与招募挑战无法捕捉，请通过挑战奖励获得精元。'}</p>
        <div className="classic-capture-target">
          <span>捕捉目标</span><strong>{battle.enemy.name}</strong>{!battle.enemy.hpHidden && <small>HP {battle.enemy.hp}/{battle.enemy.maxHp}</small>}
        </div>
      </div> : <div className="classic-item-actions">
        <p className="classic-selected-item" aria-live="polite">
          <strong>{selected?.name || '请选择道具'}</strong>{!pane.helpsTarget && target && <span>当前目标无需此道具</span>}
        </p>
        <label>使用目标<select value={target?.uid || ''} disabled={blocked || !pane.targets.length} onChange={event => onChoice({ target: event.target.value })}>
          {pane.targets.map(mon => <option key={mon.uid} value={mon.uid}>
            {mon.name} · HP {mon.hp}/{mon.maxHp}{pane.category === 'status' && mon.statuses.length ? ` · ${mon.statuses.join(' / ')}` : ''}
          </option>)}
        </select></label>
        <button className="classic-confirm" disabled={blocked || !selected || !target || !pane.helpsTarget}
          onClick={() => selected && target && submit({ type: 'battleItem', itemId: selected.id, targetUid: target.uid })}>使用</button>
      </div>}
    </div>
  </>;
}
