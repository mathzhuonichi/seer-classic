import type { GameAction } from '../../../kernel/contract.ts';
import type { BattleMonsterView, BattleView, ItemView } from '../../../shared/views.ts';
import type { BattleSupplyCategory } from '../../../shared/item-categories.ts';
import { battleItemPane, helpsActive, itemCardAction } from '../battle-hud.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';

/** Who a capsule or a battle item goes to, beside the cards. */
function ItemTarget({ label, monster }: { label: string; monster: BattleMonsterView }) {
  return <div className="classic-item-target">
    <span>{label}</span><strong>{monster.name}</strong>{!monster.hpHidden && <small>HP {monster.hp}/{monster.maxHp}</small>}
  </div>;
}

/** A click on a card acts at once: a capsule is thrown at the opponent, any other item is used on the creature in battle. */
export default function BattleItemPane({ battle, inventory, category, onCategory, disabled, canAct, act }: {
  battle: BattleView; inventory: ItemView[]; category: BattleSupplyCategory; onCategory: (category: BattleSupplyCategory) => void;
  disabled: boolean; canAct: () => boolean; act: (action: GameAction) => void;
}) {
  const pane = battleItemPane(battle, inventory, category);
  const capsules = pane.category === 'capsule', blocked = disabled || battle.needsSwitch;
  function chooseItem(item: ItemView) {
    const action = canAct() ? itemCardAction(battle, item) : null;
    if (action) act(action);
  }
  return <>
    <nav className="classic-item-category-tabs" aria-label="战斗道具分类">{pane.categories.map(([id, label]) =>
      <button key={id} className={pane.category === id ? 'active' : ''} aria-pressed={pane.category === id} disabled={blocked}
        onClick={() => onCategory(id)}>{label}</button>)}</nav>
    <div className="classic-item-workspace">
      <div className="classic-item-grid item-icon-grid">
        {pane.items.map(item => {
          const useless = !capsules && !helpsActive(battle, item);
          return <ItemTile key={item.id} size="small" icon={<ItemIcon id={item.id} kind={item.kind} label={item.name} size={30}/>}
            name={capsules ? `使用${item.name}捕捉${battle.enemy.name}` : item.name} description={item.description} quantity={item.unlimited ? '∞' : item.count}
            disabled={blocked || useless} onSelect={() => chooseItem(item)}>
            {capsules ? '单击即可投掷胶囊。' : useless ? `${battle.player.name}现在不需要这个道具。` : `单击即对${battle.player.name}使用；使用占一回合。`}
          </ItemTile>;
        })}
        {!pane.items.length && <p className="classic-panel-empty">{pane.empty}</p>}
      </div>
      <div className="classic-item-actions">
        <p>{capsules ? '点击胶囊即可立即捕捉。削减体力、施加异常状态能提高捕捉机会。' : '点击道具即对出战精灵使用，使用占一回合。'}</p>
        {capsules ? <ItemTarget label="捕捉目标" monster={battle.enemy}/> : <ItemTarget label="使用对象" monster={battle.player}/>}
      </div>
    </div>
  </>;
}
