import {useEffect,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import OverviewTab from './raising/OverviewTab.tsx';
import AbilityTab from './raising/AbilityTab.tsx';
import SkillsTab from './raising/SkillsTab.tsx';
import ProfileTab from './raising/ProfileTab.tsx';
import ItemsTab from './raising/ItemsTab.tsx';
import '../../../shared/ui/management.css';
import './Raising.css';

export type RaisingTab='概况'|'详情'|'技能'|'养成'|'道具';
/** A side button's request: the tab, with 学习力 editing (on by default for 能力) and a section to scroll to. */
export interface TabRequest {tab:RaisingTab;id:number;editing?:boolean;section?:'engravings'}
/** The PetBag tab buttons. 技能 has no button: it opens from the bag's skill button and lights up 能力. */
const TABS:readonly (readonly [RaisingTab,string])[]=[['概况','信息'],['详情','能力'],['道具','道具'],['养成','资料']];

/** One monster's PetBag detail panel; `requestedTab` opens a tab from the bag's side buttons. */
export default function Raising({m,c,requestedTab}:{m:MonsterView;c:GameController;requestedTab?:TabRequest}) {
  // `editing` is the 学习力 editor; the bag's 学习力 button opens 能力 with it on.
  const [view,setView]=useState<{tab:RaisingTab;editing:boolean}>({tab:'概况',editing:false}),[feedback,say]=useState('');
  useEffect(()=>{if(requestedTab)setView({tab:requestedTab.tab,editing:requestedTab.editing??requestedTab.tab==='详情'})},[requestedTab?.id]);
  const busy=useGame(c,battleActive),{tab}=view,props={m,c,feedback,say};
  const panel=tab==='概况'?<OverviewTab m={m} onAllocate={()=>setView({tab:'养成',editing:false})}/>
    :tab==='详情'?<AbilityTab {...props} editing={view.editing} setEditing={editing=>setView({tab,editing})}
      reveal={requestedTab?.section==='engravings'?requestedTab.id:undefined}/>
    :tab==='技能'?<SkillsTab {...props}/>
    :tab==='养成'?<ProfileTab {...props}/>
    :<ItemsTab {...props}/>;
  return <section className="raising-compact" aria-label={`${m.name}详情`}>
    <nav className="management-tabs" aria-label="精灵详情分页">{TABS.map(([name,label])=>{
      const active=tab===name||name==='详情'&&tab==='技能';
      const open=()=>{setView({tab:name,editing:false});say('')};
      return <button key={name} aria-pressed={active} className={`${active?'active':''} petbag-tab-${name}`} onClick={open}>
        {label}
      </button>;
    })}</nav>
    <fieldset className="raising-scroll" disabled={busy}>
      {busy&&<p className="management-hint">战斗中可查看详情；养成操作在战斗结束后进行。</p>}
      {panel}
    </fieldset>
  </section>;
}
