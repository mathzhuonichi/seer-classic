import {useEffect,useRef,useState} from 'react';
import type {GameController,GameSnapshot,ItemView} from '../game-types';
import {CreatureArt} from './CreatureArt';
import '../management.css';
const pockets=[['raising','培养道具','◇'],['battle','战斗补给','✚'],['capsule','精灵胶囊','◈'],['essence','精元 / 元神珠','◉'],['other','其他','▣']] as const;
const supplyGroups=[['all','全部补给'],['recovery','体力 / PP'],['status','异常解除']] as const;
const supplyCategory=(item:ItemView)=>item.battleCategory??(item.kind==='capsule'?'capsule':'recovery');
const categoryLabel=(item:ItemView)=>supplyCategory(item)==='status'?'异常解除':'体力 / PP 恢复';
export default function Inventory({s,c,onSave,onMessage,initialPocket}:{s:GameSnapshot;c:GameController;onSave:()=>void;onMessage:(text:string)=>void;initialPocket?:string}) {
  const [pocket,setPocket]=useState(initialPocket&&pockets.some(p=>p[0]===initialPocket)?initialPocket:s.battle&&!s.battle.finished?'battle':'raising'),[supply,setSupply]=useState('all');
  const [search,setSearch]=useState(''),[itemId,setItemId]=useState(''),[page,setPage]=useState(0);
  const [target,setTarget]=useState(s.battle&&!s.battle.finished?s.battle.player.uid:s.party[0]??''),[feedback,setFeedback]=useState(''),[saveOpen,setSaveOpen]=useState(false);
  const file=useRef<HTMLInputElement>(null);
  const activeBattle=!!s.battle&&!s.battle.finished;
  const belongs=(kind:string)=>pocket==='other'?!pockets.some(p=>p[0]===kind):kind===pocket;
  const items=s.items.filter(i=>belongs(i.kind)&&i.name.includes(search)&&(pocket!=='battle'||supply==='all'||supplyCategory(i)===supply)).sort((a,b)=>pocket==='battle'&&supplyCategory(a)!==supplyCategory(b)?(supplyCategory(a)==='recovery'?-1:1):a.name.localeCompare(b.name,'zh'));
  const pages=Math.max(1,Math.ceil(items.length/10));
  const pageItems=items.slice(page*10,(page+1)*10);
  const item=items.find(i=>i.id===itemId)??pageItems[0]??items[0];
  const monster=s.monsters.find(m=>m.uid===target)??s.monsters.find(m=>m.uid===s.party[0])??s.monsters[0];
  const usesPartyTarget=!!item&&(item.kind==='raising'||activeBattle&&item.kind==='battle'&&item.battleUsable);
  const captures=!!item&&item.kind==='capsule';
  const isFusionBead=!!item?.id.startsWith('fusion_bead_');
  const canUse=!!item&&item.count>0&&(captures?activeBattle&&!!s.battle?.canCapture:!!monster&&(!activeBattle||item.kind==='battle'&&item.battleUsable&&!!item.usableTargetUids?.includes(monster.uid)));
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  useEffect(()=>{if(initialPocket&&pockets.some(p=>p[0]===initialPocket)){setPocket(initialPocket);setSupply('all');setSearch('');setPage(0);setItemId('');setFeedback('')}},[initialPocket]);
  function useItem() {
    if(!item||!canUse)return;
    const count=item.count,known=new Set(s.monsters.map(m=>m.uid));
    if(activeBattle&&item.kind==='capsule')c.dispatch({type:'capture',itemId:item.id});
    else if(activeBattle){if(!monster||item.kind!=='battle'||!item.battleUsable||!s.battle!.party.some(m=>m.uid===monster.uid))return;c.dispatch({type:'battleItem',itemId:item.id,targetUid:monster.uid})}
    else {if(!monster)return;c.dispatch({type:'useItem',uid:monster.uid,itemId:item.id})}
    const next=c.snapshot();
    if((next.items.find(i=>i.id===item.id)?.count??0)<count){
      const acquired=next.monsters.find(m=>!known.has(m.uid));
      if(item.kind==='capsule')setFeedback(acquired?`捕捉成功：${acquired.name}已加入${acquired.inParty?'背包':'仓库'}。`:`已使用${item.name}，本次捕捉未成功。`);
      else if(item.kind==='essence')setFeedback(`孵化成功：${acquired?.name??'新精灵'}已加入${acquired?.inParty?'背包':'仓库'}。`);
      else setFeedback(`已对${monster?.name??'选中的精灵'}使用${item.name}。`);
    }else setFeedback(next.notices[0]??'道具未使用，请查看提示。');
  }
  return <section className="management-panel inventory-management" aria-label="道具背包面板">
    <div className="inventory-resources" aria-label="航行资源"><span>赛尔豆 <b>{s.coins.toLocaleString()}</b></span><span>积累经验 <b>{s.expPool.toLocaleString()}</b></span></div>
    <nav className="management-tabs inventory-pockets" aria-label="道具口袋">{pockets.map(([kind,name,icon])=><button key={kind} className={pocket===kind?'active':''} aria-pressed={pocket===kind} onClick={()=>{setPocket(kind);setSupply('all');setSearch('');setPage(0);setItemId('');setFeedback('')}}><span>{icon}</span> {name}<small>{s.items.filter(i=>kind==='other'?!pockets.some(p=>p[0]===i.kind):i.kind===kind).length}</small></button>)}</nav>
    {activeBattle&&<p className="inventory-battle-hint">{pocket==='capsule'?'选择胶囊，确认捕捉对方野生精灵。':'战斗期间为出战精灵选择补给，再确认使用。'}</p>}
    <div className="inventory-inner"><aside className="inventory-item-list"><div className="management-filter"><input aria-label="搜索当前口袋道具" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);setItemId('')}} placeholder="搜索道具名称…"/></div>
      {pocket==='battle'&&<nav className="inventory-supply-groups" aria-label="战斗补给用途">{supplyGroups.map(([id,label])=><button key={id} className={supply===id?'active':''} aria-pressed={supply===id} onClick={()=>{setSupply(id);setItemId('');setPage(0);setFeedback('')}}>{label}<small>{s.items.filter(i=>i.kind==='battle'&&(id==='all'||supplyCategory(i)===id)).length}</small></button>)}</nav>}
      <div className="inventory-list-scroll">{pageItems.map((i,index)=><div key={i.id} className="inventory-grouped-row">{pocket==='battle'&&supply==='all'&&(index===0||supplyCategory(pageItems[index-1])!==supplyCategory(i))&&<h4 className="inventory-group-label">{categoryLabel(i)}</h4>}<button className={item?.id===i.id?'active':''} aria-pressed={item?.id===i.id} onClick={()=>{setItemId(i.id);setFeedback('')}}><span>{i.kind==='battle'&&supplyCategory(i)==='status'?'✦':pockets.find(p=>p[0]===i.kind)?.[2]??'▣'}</span><strong>{i.name}</strong><small>×{i.count}</small></button></div>)}{!items.length&&<div className="management-empty">{pocket==='battle'&&supply==='status'?'暂无匹配的异常解除道具。':'这个口袋中没有匹配的道具。'}</div>}</div><div className="management-pagination"><button aria-label="上一页道具" disabled={!page} onClick={()=>{setPage(p=>p-1);setItemId('')}}>‹</button><span>{page+1} / {pages}</span><button aria-label="下一页道具" disabled={page+1>=pages} onClick={()=>{setPage(p=>p+1);setItemId('')}}>›</button></div></aside>
      <div className="inventory-detail-scroll">{item?<><div className="inventory-detail-heading"><span className={`management-item-symbol ${item.kind==='essence'?'essence-symbol':''}`}>{item.kind==='battle'&&supplyCategory(item)==='status'?'✦':pockets.find(p=>p[0]===item.kind)?.[2]??'▣'}</span><div><small>{item.kind==='battle'?categoryLabel(item):pockets.find(p=>p[0]===item.kind)?.[1]??'其他道具'} · 库存 {item.count}</small><h3>{item.name}</h3></div></div><p className="inventory-description">{item.description}</p>
      {usesPartyTarget&&<><div className="stat-table-heading"><strong>选择使用对象</strong><span>出战背包</span></div><div className="inventory-target-grid">{s.party.map(uid=>s.monsters.find(m=>m.uid===uid)).filter(m=>!!m).map(m=><button key={m.uid} className={monster?.uid===m.uid?'active':''} aria-pressed={monster?.uid===m.uid} onClick={()=>{setTarget(m.uid);setFeedback('')}}><div className="target-creature-art"><CreatureArt species={m.appearanceSpecies??m.species} name={m.name}/></div><strong>{m.name}</strong><small>Lv.{m.level}</small></button>)}</div><label className="inventory-storage-target">{activeBattle?'出战精灵':'仓库精灵'}<select aria-label="道具使用对象" value={monster?.uid??''} onChange={e=>{setTarget(e.target.value);setFeedback('')}}>{s.monsters.filter(m=>!activeBattle||s.battle!.party.some(bm=>bm.uid===m.uid)).map(m=><option key={m.uid} value={m.uid}>{m.inParty?'出战':'仓库'} · {m.name} · Lv.{m.level}</option>)}</select></label><div className="inventory-use-preview"><strong>{item.name}</strong><span>→</span><strong>{monster?.name??'请选择精灵'}</strong></div></>}
      {item.kind==='essence'&&<div className="essence-hatch-info"><strong>分子转化器</strong><p>消耗 1 个{isFusionBead?'元神珠':'精元'}，立即孵化；背包有空位时入队，否则进入仓库。</p><span>剩余{isFusionBead?'元神珠':'精元'}：{item.count}</span></div>}
      {captures&&<><div className="inventory-capture-note"><strong>野生精灵捕捉</strong><p>进入普通野外对战，在对方仍有体力时使用胶囊。降低体力、附加异常状态可以提高捕捉机会。</p><p>捕捉成功后，精灵会加入背包；背包已满时进入仓库。</p></div>{activeBattle&&s.battle&&<div className="inventory-capture-preview"><div className="capture-target-art"><CreatureArt species={s.battle.enemy.species} name={s.battle.enemy.name}/></div><div><small>捕捉对象</small><strong>{s.battle.enemy.name} · Lv.{s.battle.enemy.level}</strong><span>体力 {s.battle.enemy.hp} / {s.battle.enemy.maxHp}</span><p>{s.battle.canCapture?`${item.name} → ${s.battle.enemy.name}`:s.battle.captureBlockedReason||'当前对手无法捕捉。'}</p></div></div>}</>}
      {!['raising','essence','capsule'].includes(item.kind)&&!usesPartyTarget&&<div className="inventory-use-preview"><p>{item.battleUsable?'在战斗的道具包中，为出战精灵使用。':'查看道具说明，按对应用途使用。'}</p></div>}
      <div className="management-confirm-row"><span className="management-feedback" role="status">{feedback||(captures&&!activeBattle?'在野外战斗中使用胶囊。':'')}</span>{(['raising','essence'].includes(item.kind)||activeBattle&&(item.kind==='capsule'||item.kind==='battle'&&item.battleUsable))&&<button className="primary" disabled={!canUse} onClick={useItem}>{item.kind==='essence'?'确认孵化':item.kind==='capsule'?'确认捕捉':'确认使用'}</button>}</div></>:<div className="management-empty">选择左侧道具查看详情。首领精元和融合元神珠均放入精元 / 元神珠口袋。</div>}</div>
    </div>
    <div className="inventory-save-strip"><button onClick={()=>setSaveOpen(open=>!open)}>存档管理 {saveOpen?'▴':'▾'}</button></div>
    {saveOpen&&<div className="management-save-controls"><p>旅程自动保存。可导出当前存档，或导入已有存档继续游戏。</p><button onClick={onSave}>导出存档</button><button disabled={activeBattle} onClick={()=>file.current?.click()}>导入存档</button></div>}
    <input ref={file} type="file" accept=".json" hidden onChange={async event=>{const f=event.target.files?.[0];if(f)try{c.importSave(await f.text());onMessage('已载入航行存档。');setTarget('');setItemId('');setFeedback('')}catch(error){onMessage(`存档无法读取：${String(error)}`)}event.target.value=''}}/>
  </section>;
}
