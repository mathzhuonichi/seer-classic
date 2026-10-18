import {useEffect,useState} from 'react';
import type { GameController, GameSnapshot } from '../../../kernel/contract.ts';
import type { EngravingView, MonsterView } from '../../../shared/views.ts';
import {ENGRAVING_EFFECT_GROUPS} from '../../../domain/engravings/engravings.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';
import ItemCategoryTabs from '../../../shared/ui/ItemCategoryTabs.tsx';
import EngravingTransferSource from './EngravingTransferSource.tsx';
import {ENGRAVING_SLOT_LABELS} from '../../../shared/labels.ts';
import {
  ENGRAVING_STAT_TABS,engravingCapNote,engravingHolderNames,engravingMoveChoices,engravingShopProducts,equipButtonLabel,setEngravingAction,transferHolder,
  type EngravingShopFilter,
} from '../view.ts';
import {partyFirstMonsters} from '../../../shared/party-order.ts';
import {battleActive} from '../../../shared/view-helpers.ts';

const statOptions=[...ENGRAVING_STAT_TABS,['all6','全属性']] as const;
const slotFilters=[['all','全部'],['ability','能力'],['skill','技能']] as const;
const kindFilters=[['all','不限'],['bound','专属'],['generic','通用']] as const;
const NO_FILTER:EngravingShopFilter={slot:'all',kind:'all',stat:'',move:'',group:'',search:''};

/** Shop page for 2013 engravings: pick a monster, then browse only what it can equip now. */
export default function EngravingShop({s,c}:{s:GameSnapshot;c:GameController}) {
  const monsters=partyFirstMonsters(s);
  const [uid,setUid]=useState(monsters[0]?.uid??''),[filter,setFilter]=useState(NO_FILTER);
  const [selected,setSelected]=useState(''),[feedback,setFeedback]=useState(''),[sourceUid,setSourceUid]=useState('');
  const monster=monsters.find(m=>m.uid===uid)??monsters[0];
  useEffect(()=>{setFilter(f=>f.move?{...f,move:''}:f);setSelected('');setFeedback('');setSourceUid('')},[monster?.uid]);
  if(!monster)return <p className="management-empty">获得精灵后即可挑选刻印。</p>;
  const equippable=c.engravingOptions(monster.uid).filter(option=>option.ready),products=engravingShopProducts(equippable,filter);
  const moves=engravingMoveChoices(equippable);
  const groups=ENGRAVING_EFFECT_GROUPS.filter(([id])=>equippable.some(option=>option.slot==='skill'&&option.group===id));
  const item=products.find(option=>option.id===selected)??products[0],source=item&&transferHolder(item,sourceUid);
  const inBattle=battleActive(s);
  const refine=(patch:Partial<EngravingShopFilter>)=>{setFilter(f=>({...f,...patch}));setSelected('');setFeedback('');setSourceUid('')};
  function buy(){
    if(item?.canBuy&&!inBattle)setFeedback(c.dispatch({type:'buyEngraving',engravingId:item.id}).notice??'');
  }
  function equip(){
    if(item&&item.equipMode!=='blocked'&&!inBattle)setFeedback(c.dispatch(setEngravingAction(monster.uid,item.slot,item.id,source?.uid)).notice??'');
  }
  return <div className="item-shop-inner engraving-shop">
    <div className="engraving-shop-filters">
      <div className="engraving-filter-row">
        <select className="engraving-holder-select" aria-label="为哪只精灵挑选刻印" value={monster.uid} onChange={event=>setUid(event.target.value)}>
          {monsters.map(m=><option key={m.uid} value={m.uid}>{m.name} Lv.{m.level}{m.inParty?'':'（仓库）'}</option>)}</select>
        <ItemCategoryTabs label="刻印类型" value={filter.slot} options={slotFilters} onChange={slot=>refine({slot})}/>
        <ItemCategoryTabs label="适用范围" value={filter.kind} options={kindFilters} onChange={kind=>refine({kind})}/>
      </div>
      <div className="engraving-filter-row">
        <input aria-label="搜索刻印" placeholder="名称 / 效果 / 技能" value={filter.search} onChange={event=>refine({search:event.target.value})}/>
        {filter.slot==='ability'&&<select aria-label="加成属性" value={filter.stat} onChange={event=>refine({stat:event.target.value})}>
          <option value="">全部属性</option>{statOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
        {filter.slot==='skill'&&<><select aria-label="对应技能" value={filter.move} onChange={event=>refine({move:event.target.value})}>
          <option value="">全部技能</option>{moves.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
          <select aria-label="效果类别" value={filter.group} onChange={event=>refine({group:event.target.value})}><option value="">全部效果</option>
            {groups.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></>}
      </div>
    </div>
    <aside className="shop-product-index">
      <div className="shop-icon-scroll item-icon-grid">
        {products.map(product=><ItemTile key={product.id} icon={<ItemIcon id={product.id} engraving label={product.name} size={36}/>}
          name={product.name} description={`${ENGRAVING_SLOT_LABELS[product.slot]} · ${product.effect}`}
          quantity={product.unlimited?'∞':product.stock} selected={item?.id===product.id}
          onSelect={()=>{setSelected(product.id);setSourceUid('');setFeedback('')}}>Lv.{product.levelMin} · {engravingCapNote(product)}</ItemTile>)}
        {!products.length&&<p className="management-empty">{equippable.length?'没有符合筛选条件的刻印。':`${monster.name}当前没有可装备的刻印。`}</p>}
      </div>
    </aside>
    <div className="shop-detail-scroll">{item?<EngravingDetail monster={monster} item={item} source={source} inBattle={inBattle} feedback={feedback}
      onBuy={buy} onEquip={equip} onSource={setSourceUid}/>:<p className="management-empty">选择刻印查看效果与库存。</p>}</div>
  </div>;
}

interface DetailProps {
  monster:MonsterView; item:EngravingView; source?:{uid:string;name:string}; inBattle:boolean; feedback:string;
  onBuy:()=>void; onEquip:()=>void; onSource:(uid:string)=>void;
}

/** One engraving: its effect, the free restock of finite copies, and equipping or moving it to the monster. */
function EngravingDetail({monster,item,source,inBattle,feedback,onBuy,onEquip,onSource}:DetailProps) {
  const slot=ENGRAVING_SLOT_LABELS[item.slot],current=monster.engravings?.[item.slot]??null,moving=item.equipMode==='transfer';
  const target=`${moving?`从${source?.name}移装至`:'装备到'}${monster.name} · ${slot}孔${current?`，替换${current.name}`:''}${item.equipMode==='blocked'?'（请先补充）':''}`;
  return <>
    <div className="shop-product-heading">
      <div className="shop-product-art engraving-product-art" aria-hidden="true"><ItemIcon id={item.id} engraving label={item.name} size={36}/></div>
      <div><small>{slot} · {item.bound?`${monster.speciesName}专属`:'通用'}</small><h3>{item.name}</h3><span>{item.effect}</span></div></div>
    <dl className="engraving-shop-facts">{item.moveName&&<div><dt>技能</dt><dd>{item.moveName}</dd></div>}
      <div><dt>装备</dt><dd>Lv.{item.levelMin} · {slot}孔</dd></div></dl>
    <p className="shop-stock-line" aria-label="刻印持有情况">库存 <b>{item.unlimited?'∞':item.stock}</b> · 已装备 <b>{item.equipped}</b>
      {!item.unlimited&&<> · 上限 <b>{item.maxOwned}</b></>}</p>
    {!!item.equippedHolders?.length&&<p className="engraving-equipped-line">装备于：{engravingHolderNames(item)}</p>}
    {!item.unlimited&&<div className="management-confirm-row">
      <span className={item.canBuy?'':'shop-order-blocked'}>{inBattle?'请先结束当前战斗':item.canBuy?'每次免费补充 1 个':`已持有 ${item.owned} 个，达到上限`}</span>
      <button className="primary" disabled={!item.canBuy||inBattle} onClick={onBuy}>免费补充 ×1</button></div>}
    {moving&&<EngravingTransferSource className="engraving-transfer-source" holders={item.transferFrom!} value={source?.uid??''} onChange={onSource}/>}
    <div className="management-confirm-row"><span>{item.equippedHere?`${monster.name}已装备此刻印。`:target}</span>
      <button disabled={item.equipMode==='blocked'||inBattle} onClick={onEquip}>{equipButtonLabel(item)}</button></div>
    {feedback&&<p className="shop-feedback" role="status">{feedback}</p>}
  </>;
}
