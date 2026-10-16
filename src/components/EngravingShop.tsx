import {useEffect,useState} from 'react';
import type {EngravingView,GameController,GameSnapshot,StatKey} from '../game-types';
import {ENGRAVING_EFFECT_GROUPS} from '../mechanics/engravings';

const slotNames={ability:'能力刻印',skill:'技能刻印'} as const;
const markIcon='/ui/classic/hd/petbag-nav-mark.svg';
const statOptions:[StatKey|'all6',string][]=[['hp','体力'],['atk','攻击'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','速度'],['all6','全属性']];
type SlotFilter='all'|'ability'|'skill';type KindFilter='all'|'bound'|'generic';

/** Shop page for 2013 engravings: pick a monster, then browse only what it can equip now. */
export default function EngravingShop({s,c}:{s:GameSnapshot;c:GameController}) {
  const monsters=[...s.party.map(uid=>s.monsters.find(m=>m.uid===uid)!).filter(Boolean),...s.monsters.filter(m=>!m.inParty)];
  const [uid,setUid]=useState(monsters[0]?.uid??''),[slot,setSlot]=useState<SlotFilter>('all'),[kind,setKind]=useState<KindFilter>('all');
  const [stat,setStat]=useState(''),[move,setMove]=useState(''),[group,setGroup]=useState(''),[search,setSearch]=useState('');
  const [selected,setSelected]=useState(''),[feedback,setFeedback]=useState('');
  const monster=monsters.find(m=>m.uid===uid)??monsters[0];
  useEffect(()=>{setMove('');setSelected('');setFeedback('')},[monster?.uid]);
  if(!monster||!c.engravingOptions)return <p className="management-empty">获得精灵后即可挑选刻印。</p>;
  const options=c.engravingOptions(monster.uid),equippable=options.filter(option=>option.ready);
  const levelGated=options.filter(option=>!option.ready&&option.reason?.startsWith('需要 Lv.')).length;
  const query=search.trim().toLowerCase();
  const products=equippable.filter(option=>(slot==='all'||option.slot===slot)&&(kind==='all'||(kind==='bound')===option.bound)
    &&(slot!=='ability'||!stat||(stat==='all6'?option.statKeys.length===6:option.statKeys.includes(stat as StatKey)))
    &&(slot!=='skill'||(!move||option.moveIds?.includes(Number(move)))&&(!group||option.group===group))
    &&(!query||`${option.name} ${option.effect} ${option.moveName??''}`.toLowerCase().includes(query)))
    .sort((a,b)=>Number(b.bound)-Number(a.bound));
  const skillOptions=equippable.filter(option=>option.slot==='skill');
  const moves=[...new Map(skillOptions.map(option=>[option.moveIds![0],option.moveName??''])).entries()];
  const groups=ENGRAVING_EFFECT_GROUPS.filter(([id])=>skillOptions.some(option=>option.group===id));
  const item=products.find(option=>option.id===selected)??products[0];
  const current=item?monster.engravings?.[item.slot]??null:null;
  const activeBattle=!!s.battle&&!s.battle.finished;
  const owned=item?item.stock+item.equipped:0,full=!!item&&owned>=item.maxOwned;
  const reset=()=>{setSelected('');setFeedback('')};
  function after(id:string):EngravingView|undefined{return c.engravingOptions?.(monster.uid).find(option=>option.id===id)}
  function buy(){
    if(!item||full||activeBattle)return;
    c.dispatch({type:'buyEngraving',engravingId:item.id});
    setFeedback(after(item.id)?.stock===item.stock+1?`${item.name} ×1 已放入刻印库存。`:c.snapshot().notices[0]??'购买未完成。');
  }
  function equip(){
    if(!item||!item.stock||item.equippedHere||activeBattle)return;
    c.dispatch({type:'setEngraving',uid:monster.uid,slot:item.slot,engravingId:item.id});
    setFeedback(after(item.id)?.equippedHere?`${monster.name}已装备${item.name}。`:c.snapshot().notices[0]??'装备未完成。');
  }
  const chip=<T extends string>(value:T,current:T,set:(v:T)=>void,text:string)=><button key={value} aria-pressed={current===value} className={current===value?'active':''} onClick={()=>{set(value);reset()}}>{text}</button>;
  return <div className="item-shop-inner engraving-shop">
    <aside className="shop-product-index">
      <div className="engraving-shop-filters">
        <label>精灵<select aria-label="为哪只精灵挑选刻印" value={monster.uid} onChange={event=>setUid(event.target.value)}>{monsters.map(m=><option key={m.uid} value={m.uid}>{m.name} Lv.{m.level}{m.inParty?'':'（仓库）'}</option>)}</select></label>
        <div className="engraving-chip-row" role="group" aria-label="刻印类型">{chip<SlotFilter>('all',slot,setSlot,'全部')}{chip<SlotFilter>('ability',slot,setSlot,'能力')}{chip<SlotFilter>('skill',slot,setSlot,'技能')}</div>
        <div className="engraving-chip-row" role="group" aria-label="适用范围">{chip<KindFilter>('all',kind,setKind,'全部')}{chip<KindFilter>('bound',kind,setKind,'专属')}{chip<KindFilter>('generic',kind,setKind,'通用')}</div>
        {slot==='ability'&&<select aria-label="加成属性" value={stat} onChange={event=>{setStat(event.target.value);reset()}}><option value="">全部属性</option>{statOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
        {slot==='skill'&&<><select aria-label="对应技能" value={move} onChange={event=>{setMove(event.target.value);reset()}}><option value="">全部技能</option>{moves.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="效果类别" value={group} onChange={event=>{setGroup(event.target.value);reset()}}><option value="">全部效果</option>{groups.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></>}
        <input aria-label="搜索刻印" placeholder="名称 / 效果 / 技能" value={search} onChange={event=>{setSearch(event.target.value);reset()}}/>
        <p className="engraving-result-count">可装备 <strong>{products.length}</strong> 种{levelGated>0&&<span> · {levelGated} 种待升级解锁</span>}</p>
      </div>
      <div className="shop-product-scroll">{products.map(product=><button key={product.id} className={item?.id===product.id?'active':''} aria-pressed={item?.id===product.id} onClick={()=>{setSelected(product.id);setFeedback('')}}>
        <span className="shop-product-symbol" aria-hidden="true"><img src={markIcon} alt=""/></span>
        <span><strong>{product.name}</strong><small>{slotNames[product.slot]} · {product.moveName?`${product.moveName} · `:''}{product.effect}</small></span>
        <b className={product.stock+product.equipped>=product.maxOwned&&!product.stock?'unavailable':''}>{product.equippedHere?'已装备':product.stock?`库存 ${product.stock}`:product.stock+product.equipped>=product.maxOwned?'已达上限':'免费'}</b>
      </button>)}{!products.length&&<p className="management-empty">{equippable.length?'没有符合筛选条件的刻印。':`${monster.name}当前没有可装备的刻印。`}</p>}</div>
    </aside>
    <div className="shop-detail-scroll">{item?<>
      <div className="shop-product-heading"><div className="shop-product-art engraving-product-art" aria-hidden="true"><img src={markIcon} alt=""/></div><div><small>{slotNames[item.slot]} · {item.bound?`${monster.speciesName}专属`:'通用'}</small><h3>{item.name}</h3><span>{item.effect}</span></div></div>
      <dl className="engraving-shop-facts">{item.moveName&&<div><dt>对应技能</dt><dd>{item.moveName}</dd></div>}<div><dt>装备等级</dt><dd>Lv.{item.levelMin}</dd></div><div><dt>装备位置</dt><dd>{slotNames[item.slot]}孔</dd></div></dl>
      <p className="engraving-shop-rule">每只精灵有两个刻印孔：能力、技能各一个。</p>
      <div className="shop-allowance" aria-label="刻印持有情况"><dl><div><dt>库存</dt><dd>{item.stock}</dd></div><div><dt>已装备</dt><dd>{item.equipped}</dd></div><div><dt>持有上限</dt><dd>{item.maxOwned}</dd></div></dl><p>卸下或替换的刻印会放回库存。</p></div>
      <div className="management-confirm-row"><span className={full?'shop-order-blocked':''}>{activeBattle?'请先结束当前战斗':full?`已持有 ${owned} 个，达到上限`:'单价 0 赛尔豆 · 每次 1 个'}</span><button className="primary" disabled={full||activeBattle} onClick={buy}>免费购买 ×1</button></div>
      <div className="management-confirm-row"><span>{item.equippedHere?`${monster.name}已装备此刻印。`:`${monster.name} · ${slotNames[item.slot]}孔${current?`，替换${current.name}`:''}${!item.stock?'（请先购买）':''}`}</span><button disabled={!item.stock||item.equippedHere||activeBattle} onClick={equip}>{item.equippedHere?'已装备':'装备'}</button></div>
      {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
    </>:<p className="management-empty">选择刻印查看效果与库存。</p>}</div>
  </div>;
}
