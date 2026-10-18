import type {GameSnapshot,ItemView,MonsterView} from '../game-types.ts';
import {CreatureArt} from './CreatureArt.tsx';
import ItemIcon from './ItemIcon.tsx';
import {encounterLevelText} from '../presentation/encounter-level.ts';
import {battleSupplyLabel,itemContentCategory,itemKindLabel} from '../presentation/item-categories.ts';
import {itemStock,itemTargets,itemUse} from '../presentation/inventory-views.ts';
import {partyMonsters} from '../presentation/party-order.ts';
import {battleActive} from '../presentation/view-helpers.ts';

interface Props {s:GameSnapshot;item?:ItemView;monster?:MonsterView;feedback:string;onTarget:(uid:string)=>void;onUse:()=>void}

/** The bag's detail pane: what the selected item does, its target and the confirm action. */
export default function InventoryDetail({s,item,monster,feedback,onTarget,onUse}:Props) {
  if(!item)return <div className="inventory-detail-scroll">
    <div className="management-empty">选择左侧道具查看详情。首领精元和融合元神珠均放入精元 / 元神珠口袋。</div></div>;
  const inBattle=battleActive(s),use=itemUse(s,item,monster);
  const group=item.kind==='battle'?battleSupplyLabel(item):itemKindLabel(item.kind);
  return <div className="inventory-detail-scroll">
    <div className="inventory-detail-heading">
      <span className="management-item-symbol inventory-item-art"><ItemIcon id={item.id} kind={item.kind} label={item.name} size={48}/></span>
      <div><small>{group} · 库存 {itemStock(item)}</small><h3>{item.name}</h3></div></div>
    <p className="inventory-description">{item.description}{item.unlimited?(inBattle?' 无限供应，使用占一回合。':' 无限供应，可直接取用。'):''}</p>
    {use.picksTarget&&<TargetPicker s={s} item={item} monster={monster} onTarget={onTarget}/>}
    {item.kind==='essence'&&<EssenceNote item={item}/>}
    {use.captures&&<CaptureNote s={s} item={item}/>}
    {!['raising','essence','capsule'].includes(item.kind)&&!use.picksTarget&&<div className="inventory-use-preview">
      <p>{item.battleUsable?'在战斗的道具包中，为出战精灵使用。':'查看道具说明，按对应用途使用。'}</p></div>}
    <div className="management-confirm-row">
      <span className="management-feedback" role="status">{feedback||(use.captures&&!inBattle?'在野外战斗中使用胶囊。':'')}</span>
      {use.confirmable&&<button className="primary" disabled={!use.enabled} onClick={onUse}>
        {item.kind==='essence'?'确认孵化':item.kind==='capsule'?'确认捕捉':'确认使用'}</button>}</div>
  </div>;
}

function TargetPicker({s,item,monster,onTarget}:Pick<Props,'s'|'monster'|'onTarget'>&{item:ItemView}) {
  return <><div className="stat-table-heading"><strong>选择使用对象</strong><span>出战背包</span></div>
    <div className="inventory-target-grid">{partyMonsters(s).map(m=>
      <button key={m.uid} className={monster?.uid===m.uid?'active':''} aria-pressed={monster?.uid===m.uid} onClick={()=>onTarget(m.uid)}>
        <div className="target-creature-art"><CreatureArt species={m.appearanceSpecies??m.species} name={m.name}/></div>
        <strong>{m.name}</strong><small>Lv.{m.level}</small></button>)}</div>
    <label className="inventory-storage-target">{battleActive(s)?'出战精灵':'仓库精灵'}
      <select aria-label="道具使用对象" value={monster?.uid??''} onChange={e=>onTarget(e.target.value)}>
        {itemTargets(s).map(m=><option key={m.uid} value={m.uid}>{m.inParty?'出战':'仓库'} · {m.name} · Lv.{m.level}</option>)}</select></label>
    <div className="inventory-use-preview"><strong>{item.name}</strong><span>→</span><strong>{monster?.name??'请选择精灵'}</strong></div></>;
}

function EssenceNote({item}:{item:ItemView}) {
  const name=itemContentCategory(item)==='fusion'?'元神珠':'精元';
  return <div className="essence-hatch-info"><strong>分子转化器</strong><p>消耗 1 个{name}，立即孵化；背包有空位时入队，否则进入仓库。</p>
    <span>剩余{name}：{item.count}</span></div>;
}

function CaptureNote({s,item}:{s:GameSnapshot;item:ItemView}) {
  const enemy=s.battle?.enemy,evidence=enemy?.evidence;
  return <><div className="inventory-capture-note"><strong>野生精灵捕捉</strong>
    <p>进入普通野外对战，在对方仍有体力时使用胶囊。降低体力、附加异常状态可以提高捕捉机会。</p><p>捕捉成功后，精灵会加入背包；背包已满时进入仓库。</p></div>
    {battleActive(s)&&enemy&&<div className="inventory-capture-preview">
      <div className="capture-target-art"><CreatureArt species={enemy.species} name={enemy.name}/></div>
      <div><small>捕捉对象</small><strong>{enemy.name} · {encounterLevelText(enemy.level,evidence?.hasInferredLevel,evidence?.displayLevelUnknown)}</strong>
        <span>体力 {enemy.hp} / {enemy.maxHp}</span>
        <p>{s.battle!.canCapture?`${item.name} → ${enemy.name}`:s.battle!.captureBlockedReason||'当前对手无法捕捉。'}</p></div></div>}</>;
}
