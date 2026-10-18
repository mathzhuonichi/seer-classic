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
import {bagItems,bagSelection,itemStock,itemUseAction,itemUseFeedback,pageOf,pocketItems} from '../inventory-views.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import '../../../shared/ui/management.css';
import './Inventory.css';

const PAGE_SIZE=48;
interface Props {
  c:GameController;onSave:()=>void;onMessage:(text:string)=>void;
  /** The pocket to open, and the item to select in it when the bag holds that item. */
  focus?:{pocket:string;itemId?:string};
}

export default function Inventory({c,onSave,onMessage,focus}:Props) {
  const held=useGame(c,s=>s.items),monsters=useGame(c,s=>s.monsters),party=useGame(c,s=>s.party),battle=useGame(c,s=>s.battle);
  const coins=useGame(c,s=>s.coins),expPool=useGame(c,s=>s.expPool),inBattle=battleActive({battle});
  const [pocket,setPocket]=useState<ItemPocket>(focus&&isItemPocket(focus.pocket)?focus.pocket:inBattle?'battle':'raising');
  // The picked item id: '' until the player picks one; a pick that ran out stays named and selects nothing.
  const [search,setSearch]=useState(''),[itemId,setItemId]=useState('');
  const [target,setTarget]=useState(inBattle?battle!.player.uid:party[0]??''),[feedback,setFeedback]=useState('');
  const inPocket=pocketItems(held,pocket),content=useItemContent(pocket,inPocket,clearList);
  const items=bagItems(inPocket,pocket,content.content,search);
  const pager=usePager(items.length,PAGE_SIZE),pageItems=items.slice(pager.start,pager.end);
  const item=bagSelection(items,pageItems,itemId),pickGone=!!itemId&&!item;
  const monster=monsters.find(m=>m.uid===target)??monsters.find(m=>m.uid===party[0])??monsters[0];
  const action=item&&itemUseAction(item,monster?.uid,!!battle?.canCapture);
  function clearList(){pager.setPage(0);setItemId('');setFeedback('')}
  function turnPage(step:number){pager.setPage(page=>page+step);setItemId('');setFeedback('')}
  /** Opens a pocket afresh, with `pick` selected on its page when the pocket holds it. */
  function openPocket(next:ItemPocket,pick=''){
    const listed=bagItems(pocketItems(held,next),next,'all',''),picked=listed.some(i=>i.id===pick)?pick:'';
    setPocket(next);content.setContent('all');setSearch('');setFeedback('');pager.setPage(pageOf(listed,picked,PAGE_SIZE));setItemId(picked);
  }
  useEffect(()=>{if(focus&&isItemPocket(focus.pocket))openPocket(focus.pocket,focus.itemId)},[focus]);
  useEffect(()=>{if(pickGone)setFeedback('')},[pickGone]);
  function confirmUse() {
    if(item&&action)setFeedback(itemUseFeedback(c.dispatch(action),item,monster));
  }
  return <section className="management-panel inventory-management" aria-label="道具背包面板">
    <div className="inventory-resources" aria-label="航行资源"><span>赛尔豆 <b>{coins.toLocaleString()}</b></span>
      <span>积累经验 <b>{expPool.toLocaleString()}</b></span></div>
    <ItemCategoryTabs label="道具口袋" value={pocket} options={ITEM_POCKETS} className="inventory-primary-categories" onChange={openPocket}/>
    {inBattle&&<p className="inventory-battle-hint">{pocket==='capsule'?'选择胶囊，确认捕捉对方野生精灵。':'战斗期间为出战精灵选择补给，再确认使用。'}</p>}
    <div className="inventory-inner"><aside className="inventory-item-list">
      {content.options.length>2&&<ItemCategoryTabs label="道具用途" value={content.content} options={content.options}
        onChange={id=>{content.setContent(id);clearList()}}/>}
      <div className="management-filter">
        <input aria-label="搜索当前口袋道具" value={search} onChange={e=>{setSearch(e.target.value);clearList()}} placeholder="搜索道具…"/></div>
      <div className="inventory-icon-scroll item-icon-grid">
        {pageItems.map(i=><ItemTile key={i.id} icon={<ItemIcon id={i.id} kind={i.kind} label={i.name}/>} name={i.name} description={i.description}
          quantity={itemStock(i)} selected={item?.id===i.id} onSelect={()=>{setItemId(i.id);setFeedback('')}}/>)}
        {!items.length&&<div className="management-empty">这个口袋中没有匹配的道具。</div>}
      </div>
      {pager.pages>1&&<div className="management-pagination">
        <button aria-label="上一页道具" disabled={!pager.page} onClick={()=>turnPage(-1)}>‹</button>
        <span>{pager.page+1} / {pager.pages}</span>
        <button aria-label="下一页道具" disabled={pager.page+1>=pager.pages} onClick={()=>turnPage(1)}>›</button>
      </div>}
    </aside>
      <InventoryDetail item={item} monster={monster} monsters={monsters} party={party} battle={battle} enabled={!!action} feedback={feedback}
        onTarget={uid=>{setTarget(uid);setFeedback('')}} onUse={confirmUse}/>
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
