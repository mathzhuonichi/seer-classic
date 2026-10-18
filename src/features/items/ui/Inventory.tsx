import {useEffect,useRef,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';
import ItemCategoryTabs from '../../../shared/ui/ItemCategoryTabs.tsx';
import InventoryDetail from './InventoryDetail.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import {useItemContent} from './use-item-content.ts';
import {ITEM_POCKETS,isItemPocket,type ItemPocket} from '../../../shared/item-categories.ts';
import {bagItems,itemStock,itemUseAction,itemUseFeedback,pocketItems} from '../inventory-views.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import '../../../shared/ui/management.css';
import './Inventory.css';

const PAGE_SIZE=48;
interface Props {c:GameController;onSave:()=>void;onMessage:(text:string)=>void;initialPocket?:string}

export default function Inventory({c,onSave,onMessage,initialPocket}:Props) {
  const s=useGame(c,snapshot=>snapshot);
  const inBattle=battleActive(s);
  const [pocket,setPocket]=useState<ItemPocket>(initialPocket&&isItemPocket(initialPocket)?initialPocket:inBattle?'battle':'raising');
  const [search,setSearch]=useState(''),[itemId,setItemId]=useState('');
  const [target,setTarget]=useState(inBattle?s.battle!.player.uid:s.party[0]??''),[feedback,setFeedback]=useState('');
  const inPocket=pocketItems(s.items,pocket),content=useItemContent(pocket,inPocket,clearList);
  const items=bagItems(inPocket,pocket,content.content,search);
  const pager=usePager(items.length,PAGE_SIZE),pageItems=items.slice(pager.start,pager.end);
  const item=items.find(i=>i.id===itemId)??pageItems[0]??items[0];
  const monster=s.monsters.find(m=>m.uid===target)??s.monsters.find(m=>m.uid===s.party[0])??s.monsters[0];
  function clearList(){pager.setPage(0);setItemId('')}
  function openPocket(next:ItemPocket){setPocket(next);content.setContent('all');setSearch('');setFeedback('');clearList()}
  useEffect(()=>{if(initialPocket&&isItemPocket(initialPocket))openPocket(initialPocket)},[initialPocket]);
  function confirmUse() {
    const action=item&&itemUseAction(s,item,monster);
    if(!item||!action)return;
    c.dispatch(action);
    setFeedback(itemUseFeedback(s,c.snapshot(),item,monster));
  }
  return <section className="management-panel inventory-management" aria-label="道具背包面板">
    <div className="inventory-resources" aria-label="航行资源"><span>赛尔豆 <b>{s.coins.toLocaleString()}</b></span>
      <span>积累经验 <b>{s.expPool.toLocaleString()}</b></span></div>
    <ItemCategoryTabs label="道具口袋" value={pocket} options={ITEM_POCKETS} className="inventory-primary-categories" onChange={openPocket}/>
    {inBattle&&<p className="inventory-battle-hint">{pocket==='capsule'?'选择胶囊，确认捕捉对方野生精灵。':'战斗期间为出战精灵选择补给，再确认使用。'}</p>}
    <div className="inventory-inner"><aside className="inventory-item-list">
      {content.options.length>2&&<ItemCategoryTabs label="道具用途" value={content.content} options={content.options}
        onChange={id=>{content.setContent(id);setFeedback('');clearList()}}/>}
      <div className="management-filter">
        <input aria-label="搜索当前口袋道具" value={search} onChange={e=>{setSearch(e.target.value);clearList()}} placeholder="搜索道具…"/></div>
      <div className="inventory-icon-scroll item-icon-grid">
        {pageItems.map(i=><ItemTile key={i.id} icon={<ItemIcon id={i.id} kind={i.kind} label={i.name}/>} name={i.name} description={i.description}
          quantity={itemStock(i)} selected={item?.id===i.id} onSelect={()=>{setItemId(i.id);setFeedback('')}}/>)}
        {!items.length&&<div className="management-empty">{pocket==='battle'&&content.content==='status'?'暂无匹配的异常解除道具。':'这个口袋中没有匹配的道具。'}</div>}
      </div>
      {pager.pages>1&&<div className="management-pagination">
        <button aria-label="上一页道具" disabled={!pager.page} onClick={()=>{pager.setPage(p=>p-1);setItemId('')}}>‹</button>
        <span>{pager.page+1} / {pager.pages}</span>
        <button aria-label="下一页道具" disabled={pager.page+1>=pager.pages} onClick={()=>{pager.setPage(p=>p+1);setItemId('')}}>›</button>
      </div>}
    </aside>
      <InventoryDetail s={s} item={item} monster={monster} feedback={feedback} onTarget={uid=>{setTarget(uid);setFeedback('')}} onUse={confirmUse}/>
    </div>
    <SaveControls inBattle={inBattle} onSave={onSave} onLoad={text=>{c.importSave(text);onMessage('已载入航行存档。');setTarget('');setItemId('');setFeedback('')}}
      onError={error=>onMessage(`存档无法读取：${String(error)}`)}/>
  </section>;
}

/** Export and import of the journey save, folded away below the bag. */
function SaveControls({inBattle,onSave,onLoad,onError}:{inBattle:boolean;onSave:()=>void;onLoad:(text:string)=>void;onError:(error:unknown)=>void}) {
  const [open,setOpen]=useState(false),file=useRef<HTMLInputElement>(null);
  return <>
    <div className="inventory-save-strip"><button onClick={()=>setOpen(value=>!value)}>存档管理 {open?'▴':'▾'}</button></div>
    {open&&<div className="management-save-controls"><p>旅程自动保存。可导出当前存档，或导入已有存档继续游戏。</p><button onClick={onSave}>导出存档</button>
      <button disabled={inBattle} onClick={()=>file.current?.click()}>导入存档</button></div>}
    <input ref={file} type="file" accept=".json" hidden onChange={async event=>{
      const f=event.target.files?.[0];
      if(f)try{onLoad(await f.text())}catch(error){onError(error)}
      event.target.value='';
    }}/>
  </>;
}
