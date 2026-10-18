import {useEffect,useState} from 'react';
import type {EngravingView,GameController,GameSnapshot,StatKey} from '../game-types.ts';
import {ENGRAVING_EFFECT_GROUPS} from '../mechanics/engravings.ts';
import ItemIcon from './ItemIcon.tsx';
import ItemTile from './ItemTile.tsx';
import ItemCategoryTabs from './ItemCategoryTabs.tsx';

const slotNames={ability:'能力刻印',skill:'技能刻印'} as const;
const statOptions:[StatKey|'all6',string][]=[['hp','体力'],['atk','攻击'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','速度'],['all6','全属性']];
type SlotFilter='all'|'ability'|'skill';type KindFilter='all'|'bound'|'generic';
const slotFilters=[['all','全部'],['ability','能力'],['skill','技能']] as const;
const kindFilters=[['all','不限'],['bound','专属'],['generic','通用']] as const;

/** Shop page for 2013 engravings: pick a monster, then browse only what it can equip now. */
export default function EngravingShop({s,c}:{s:GameSnapshot;c:GameController}) {
  const monsters=[...s.party.map(uid=>s.monsters.find(m=>m.uid===uid)!).filter(Boolean),...s.monsters.filter(m=>!m.inParty)];
  const [uid,setUid]=useState(monsters[0]?.uid??''),[slot,setSlot]=useState<SlotFilter>('all'),[kind,setKind]=useState<KindFilter>('all');
  const [stat,setStat]=useState(''),[move,setMove]=useState(''),[group,setGroup]=useState(''),[search,setSearch]=useState('');
  const [selected,setSelected]=useState(''),[feedback,setFeedback]=useState(''),[sourceUid,setSourceUid]=useState('');
  const monster=monsters.find(m=>m.uid===uid)??monsters[0];
  useEffect(()=>{setMove('');setSelected('');setFeedback('');setSourceUid('')},[monster?.uid]);
  if(!monster||!c.engravingOptions)return <p className="management-empty">获得精灵后即可挑选刻印。</p>;
  const options=c.engravingOptions(monster.uid),equippable=options.filter(option=>option.ready);
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
  const owned=item?item.stock+item.equipped:0,full=!!item&&!item.unlimited&&owned>=item.maxOwned;
  const holders=(item?.equippedHolders??[]).filter(holder=>holder.uid!==monster.uid),source=holders.find(holder=>holder.uid===sourceUid)??holders[0];
  const canEquip=!!item&&(item.unlimited||item.stock>0||holders.length>0),moving=!!item&&!item.unlimited&&(!item.stock||item.equipped>=item.maxOwned)&&!item.equippedHere&&holders.length>0;
  const reset=()=>{setSelected('');setFeedback('');setSourceUid('')};
  function after(id:string):EngravingView|undefined{return c.engravingOptions?.(monster.uid).find(option=>option.id===id)}
  function buy(){
    if(!item||item.unlimited||full||activeBattle)return;
    c.dispatch({type:'buyEngraving',engravingId:item.id});
    setFeedback(after(item.id)?.stock===item.stock+1?`${item.name} ×1 已放入刻印库存。`:c.snapshot().notices[0]??'购买未完成。');
  }
  function equip(){
    if(!item||!canEquip||item.equippedHere||activeBattle)return;
    c.dispatch({type:'setEngraving',uid:monster.uid,slot:item.slot,engravingId:item.id,...(moving&&source?{fromUid:source.uid}:{})});
    setFeedback(after(item.id)?.equippedHere?`${monster.name}已装备${item.name}。`:c.snapshot().notices[0]??'装备未完成。');
  }
  return <div className="item-shop-inner engraving-shop">
    <div className="engraving-shop-filters">
      <div className="engraving-filter-row">
        <select className="engraving-holder-select" aria-label="为哪只精灵挑选刻印" value={monster.uid} onChange={event=>setUid(event.target.value)}>{monsters.map(m=><option key={m.uid} value={m.uid}>{m.name} Lv.{m.level}{m.inParty?'':'（仓库）'}</option>)}</select>
        <ItemCategoryTabs label="刻印类型" value={slot} options={slotFilters} onChange={value=>{setSlot(value);reset()}}/>
        <ItemCategoryTabs label="适用范围" value={kind} options={kindFilters} onChange={value=>{setKind(value);reset()}}/>
      </div>
      <div className="engraving-filter-row">
        <input aria-label="搜索刻印" placeholder="名称 / 效果 / 技能" value={search} onChange={event=>{setSearch(event.target.value);reset()}}/>
        {slot==='ability'&&<select aria-label="加成属性" value={stat} onChange={event=>{setStat(event.target.value);reset()}}><option value="">全部属性</option>{statOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
        {slot==='skill'&&<><select aria-label="对应技能" value={move} onChange={event=>{setMove(event.target.value);reset()}}><option value="">全部技能</option>{moves.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="效果类别" value={group} onChange={event=>{setGroup(event.target.value);reset()}}><option value="">全部效果</option>{groups.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></>}
      </div>
    </div>
    <aside className="shop-product-index">
      <div className="shop-icon-scroll item-icon-grid">{products.map(product=><ItemTile key={product.id} icon={<ItemIcon id={product.id} engraving label={product.name} size={36}/>} name={product.name} description={`${slotNames[product.slot]} · ${product.effect}`} quantity={product.unlimited?'∞':product.stock} selected={item?.id===product.id} onSelect={()=>{setSelected(product.id);setSourceUid('');setFeedback('')}}>Lv.{product.levelMin} · {product.unlimited?'无限装备':`每种上限 ${product.maxOwned}`}{product.equippedHolders?.length?` · 装备于 ${product.equippedHolders.map(holder=>holder.name).join('、')}`:''}</ItemTile>)}{!products.length&&<p className="management-empty">{equippable.length?'没有符合筛选条件的刻印。':`${monster.name}当前没有可装备的刻印。`}</p>}</div>
    </aside>
    <div className="shop-detail-scroll">{item?<>
      <div className="shop-product-heading"><div className="shop-product-art engraving-product-art" aria-hidden="true"><ItemIcon id={item.id} engraving label={item.name} size={36}/></div><div><small>{slotNames[item.slot]} · {item.bound?`${monster.speciesName}专属`:'通用'}</small><h3>{item.name}</h3><span>{item.effect}</span></div></div>
      <dl className="engraving-shop-facts">{item.moveName&&<div><dt>技能</dt><dd>{item.moveName}</dd></div>}<div><dt>装备</dt><dd>Lv.{item.levelMin} · {slotNames[item.slot]}孔</dd></div></dl>
      <p className="shop-stock-line" aria-label="刻印持有情况">库存 <b>{item.unlimited?'∞':item.stock}</b> · 已装备 <b>{item.equipped}</b>{!item.unlimited&&<> · 上限 <b>{item.maxOwned}</b></>}</p>
      {!!item.equippedHolders?.length&&<p className="engraving-equipped-line">装备于：{item.equippedHolders.map(holder=>holder.name).join('、')}</p>}
      {!item.unlimited&&<div className="management-confirm-row"><span className={full?'shop-order-blocked':''}>{activeBattle?'请先结束当前战斗':full?`已持有 ${owned} 个，达到上限`:'每次免费补充 1 个'}</span><button className="primary" disabled={full||activeBattle} onClick={buy}>免费补充 ×1</button></div>}
      {moving&&<label className="engraving-transfer-source">移装来源<select aria-label="刻印移装来源" value={source?.uid??''} onChange={event=>setSourceUid(event.target.value)}>{holders.map(holder=><option key={holder.uid} value={holder.uid}>{holder.name}</option>)}</select></label>}
      <div className="management-confirm-row"><span>{item.equippedHere?`${monster.name}已装备此刻印。`:`${moving?`从${source?.name}移装至`:'装备到'}${monster.name} · ${slotNames[item.slot]}孔${current?`，替换${current.name}`:''}${!canEquip?'（请先补充）':''}`}</span><button disabled={!canEquip||item.equippedHere||activeBattle} onClick={equip}>{item.equippedHere?'已装备':moving?'确认移装':'确认装备'}</button></div>
      {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
    </>:<p className="management-empty">选择刻印查看效果与库存。</p>}</div>
  </div>;
}
