import {Fragment,useEffect,useState} from 'react';
import type {GameController,GameSnapshot,MonsterView} from '../game-types.ts';
import {battleActive} from '../presentation/view-helpers.ts';
import OverviewTab from './raising/OverviewTab.tsx';
import AbilityTab from './raising/AbilityTab.tsx';
import SkillsTab from './raising/SkillsTab.tsx';
import ProfileTab from './raising/ProfileTab.tsx';
import ItemsTab from './raising/ItemsTab.tsx';
import '../management.css';
import './Raising.css';

export type RaisingTab='概况'|'详情'|'技能'|'养成'|'道具';
/** The PetBag tab buttons. 技能 has no button: it opens from the bag's skill button and lights up 能力. */
const TABS:readonly (readonly [RaisingTab,string])[]=[['概况','信息'],['详情','能力'],['道具','道具'],['养成','资料']];

/** One monster's PetBag detail panel; `requestedTab` opens a tab from the bag's side buttons. */
export default function Raising({m,s,c,requestedTab}:{m:MonsterView;s:GameSnapshot;c:GameController;requestedTab?:{tab:RaisingTab;id:number}}) {
  // Every opening gets a new `key`, so the panel starts without old drafts or feedback.
  const [view,setView]=useState({tab:'概况' as RaisingTab,editing:false,key:0});
  const open=(tab:RaisingTab,editing=false)=>setView(old=>({tab,editing,key:old.key+1}));
  useEffect(()=>{if(requestedTab)open(requestedTab.tab,requestedTab.tab==='详情')},[requestedTab?.id]);
  const busy=battleActive(s),{tab}=view;
  const panel=tab==='概况'?<OverviewTab m={m} c={c}/>
    :tab==='详情'?<AbilityTab m={m} c={c} startEditing={view.editing}/>
    :tab==='技能'?<SkillsTab m={m} c={c}/>
    :tab==='养成'?<ProfileTab m={m} c={c} expPool={s.expPool}/>
    :<ItemsTab m={m} c={c} items={s.items}/>;
  return <section className="raising-compact" aria-label={`${m.name}详情`}>
    <nav className="management-tabs" aria-label="精灵详情分页">{TABS.map(([name,label])=>{
      const active=tab===name||name==='详情'&&tab==='技能';
      return <button key={name} aria-pressed={active} className={`${active?'active':''} petbag-tab-${name}`} onClick={()=>open(name)}>{label}</button>;
    })}</nav>
    <fieldset className="raising-scroll" disabled={busy}>
      {busy&&<p className="management-hint">战斗中可查看详情；养成操作在战斗结束后进行。</p>}
      <Fragment key={view.key}>{panel}</Fragment>
    </fieldset>
  </section>;
}
