import type { BattleView, ItemView, MonsterView } from '../../../shared/views.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import {encounterLevelText} from '../../../shared/encounter-level.ts';
import {battleSupplyLabel,itemContentCategory,itemKindLabel} from '../../../shared/item-categories.ts';
import {itemStock} from '../inventory-views.ts';
import {partyMonsters} from '../../../shared/party-order.ts';
import {battleActive} from '../../../shared/view-helpers.ts';

interface Props {
  item?:ItemView; monster?:MonsterView; monsters:MonsterView[]; party:string[]; battle:BattleView|null;
  /** The confirm button can use the item on `monster` now. */
  enabled:boolean; feedback:string; onTarget:(uid:string)=>void; onUse:()=>void;
  /** The picked item is not in the bag: it ran out, or a link named one the bag holds none of. */
  pickGone:boolean;
}
const CONFIRM_LABELS={use:'确认使用',hatch:'确认孵化',capture:'确认捕捉'} as const;

/** The bag's detail pane: what the selected item does, its target and the confirm action. */
export default function InventoryDetail({item,monster,monsters,party,battle,enabled,feedback,onTarget,onUse,pickGone}:Props) {
  if(!item)return <div className="inventory-detail-scroll">
    <div className="management-empty">{pickGone&&'背包中暂无所选道具。'}选择左侧道具查看详情。首领精元和融合元神珠均放入精元 / 元神珠口袋。</div></div>;
  const inBattle=battleActive({battle}),picksTarget=item.useAction==='use';
  const group=item.kind==='battle'?battleSupplyLabel(item):itemKindLabel(item.kind);
  return <div className="inventory-detail-scroll">
    <div className="inventory-detail-heading">
      <span className="management-item-symbol inventory-item-art"><ItemIcon id={item.id} kind={item.kind} label={item.name} size={48}/></span>
      <div><small>{group} · 库存 {itemStock(item)}</small><h3>{item.name}</h3></div></div>
    <p className="inventory-description">{item.description}{item.unlimited?(inBattle?' 无限供应，使用占一回合。':' 无限供应，可直接取用。'):''}</p>
    {picksTarget&&<TargetPicker item={item} monster={monster} monsters={monsters} party={party} inBattle={inBattle} onTarget={onTarget}/>}
    {item.kind==='essence'&&<EssenceNote item={item}/>}
    {item.kind==='capsule'&&<CaptureNote battle={inBattle?battle:null} item={item}/>}
    {!['raising','essence','capsule'].includes(item.kind)&&!picksTarget&&<div className="inventory-use-preview">
      <p>{item.battleUsable?'在战斗的道具包中，为出战精灵使用。':'查看道具说明，按对应用途使用。'}</p></div>}
    <div className="management-confirm-row">
      <span className="management-feedback" role="status">{feedback||(item.kind==='capsule'&&!inBattle?'在野外战斗中使用胶囊。':'')}</span>
      {item.useAction&&<button className="primary" disabled={!enabled} onClick={onUse}>{CONFIRM_LABELS[item.useAction]}</button>}</div>
  </div>;
}

/** The party as cards, and every monster the item can be used on now (and the chosen one) in a list. */
function TargetPicker({item,monster,monsters,party,inBattle,onTarget}:Pick<Props,'monster'|'monsters'|'party'|'onTarget'>&{item:ItemView;inBattle:boolean}) {
  const usable=new Set(item.useTargets),listed=monsters.filter(m=>usable.has(m.uid)||m.uid===monster?.uid);
  return <><div className="stat-table-heading"><strong>选择使用对象</strong><span>出战背包</span></div>
    <div className="inventory-target-grid">{partyMonsters({party,monsters}).map(m=>
      <button key={m.uid} className={monster?.uid===m.uid?'active':''} aria-pressed={monster?.uid===m.uid} onClick={()=>onTarget(m.uid)}>
        <div className="target-creature-art"><CreatureArt species={m.appearanceSpecies??m.species} name={m.name}/></div>
        <strong>{m.name}</strong><small>Lv.{m.level}</small></button>)}</div>
    <label className="inventory-storage-target">{inBattle?'出战精灵':'仓库精灵'}
      <select aria-label="道具使用对象" value={monster?.uid??''} onChange={e=>onTarget(e.target.value)}>
        {listed.map(m=><option key={m.uid} value={m.uid}>{m.inParty?'出战':'仓库'} · {m.name} · Lv.{m.level}</option>)}</select></label>
    <div className="inventory-use-preview"><strong>{item.name}</strong><span>→</span><strong>{monster?.name??'请选择精灵'}</strong></div></>;
}

function EssenceNote({item}:{item:ItemView}) {
  const name=itemContentCategory(item)==='fusion'?'元神珠':'精元';
  return <div className="essence-hatch-info"><strong>分子转化器</strong><p>消耗 1 个{name}，立即孵化；背包有空位时入队，否则进入仓库。</p>
    <span>剩余{name}：{item.count}</span></div>;
}

/** How capturing works, and the wild opponent during a battle. */
function CaptureNote({battle,item}:{battle:BattleView|null;item:ItemView}) {
  const enemy=battle?.enemy,evidence=enemy?.evidence;
  return <><div className="inventory-capture-note"><strong>野生精灵捕捉</strong>
    <p>进入普通野外对战，在对方仍有体力时使用胶囊。降低体力、附加异常状态可以提高捕捉机会。</p><p>捕捉成功后，精灵会加入背包；背包已满时进入仓库。</p></div>
    {battle&&enemy&&<div className="inventory-capture-preview">
      <div className="capture-target-art"><CreatureArt species={enemy.species} name={enemy.name}/></div>
      <div><small>捕捉对象</small><strong>{enemy.name} · {encounterLevelText(enemy.level,evidence?.hasInferredLevel,enemy.levelMasked)}</strong>
        <span>体力 {enemy.hp} / {enemy.maxHp}</span>
        <p>{battle.canCapture?`${item.name} → ${enemy.name}`:battle.captureBlockedReason||'当前对手无法捕捉。'}</p></div></div>}</>;
}
