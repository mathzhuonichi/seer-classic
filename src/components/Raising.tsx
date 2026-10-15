import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot,MonsterView,StatKey,Stats} from '../game-types';
import {CreatureArt} from './CreatureArt';
import TypeIcon from './TypeIcon';
import {elementName,skillIconType} from '../presentation/element-types';
import '../management.css';
const statKeys:StatKey[]=['hp','atk','def','spa','spd','spe'];
const statNames:Record<StatKey,string>={hp:'体力',atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度'};
const draftsFor=(values:Stats)=>Object.fromEntries(statKeys.map(key=>[key,String(values[key])])) as Record<StatKey,string>;
const presets:Record<string,[StatKey,StatKey]>={'物攻 + 速度':['atk','spe'],'特攻 + 速度':['spa','spe'],'体力 + 防御':['hp','def'],'体力 + 特防':['hp','spd']};
export default function Raising({m,s,c,presentation,requestedTab}:{m:MonsterView;s:GameSnapshot;c:GameController;presentation?:'petbag';requestedTab?:{tab:string;id:number}}) {
  const [tab,setTab]=useState(presentation==='petbag'?'概况':'详情'),[amount,setAmount]=useState('1000'),[nickname,setNickname]=useState(m.name);
  const [evs,setEvs]=useState(()=>draftsFor(m.evs)),[preset,setPreset]=useState(''),[feedback,setFeedback]=useState('');
  const [slot,setSlot]=useState(0),[skillSearch,setSkillSearch]=useState(''),[skillId,setSkillId]=useState<number>();
  const [itemId,setItemId]=useState('');
  const [skinFeedback,setSkinFeedback]=useState('');
  const skinOptions=m.skinOptions??[{species:m.species,name:m.speciesName}];
  const appearanceSpecies=m.appearanceSpecies??m.species;
  const skinName=skinOptions.find(option=>option.species===appearanceSpecies)?.name??m.speciesName;
  const [evolutionSelection,setEvolutionSelection]=useState<{uid:string;fromSpecies:number;toSpecies:number}>();
  const evolutionChoices=m.evolutionChoices??[];
  const chosenEvolution=evolutionChoices.find(choice=>choice.species===evolutionSelection?.toSpecies&&evolutionSelection.uid===m.uid&&evolutionSelection.fromSpecies===m.species&&choice.ready&&!choice.blockedReason);
  const evolutionTarget=chosenEvolution??(evolutionChoices.length===1&&evolutionChoices[0].ready&&!evolutionChoices[0].blockedReason?evolutionChoices[0]:undefined);
  useEffect(()=>{setEvolutionSelection(current=>current&&current.uid===m.uid&&current.fromSpecies===m.species&&evolutionChoices.some(choice=>choice.species===current.toSpecies&&choice.ready&&!choice.blockedReason)?current:undefined)},[m.uid,m.species,evolutionChoices]);
  useEffect(()=>{if(requestedTab)setTab(requestedTab.tab)},[requestedTab?.id]);
  useEffect(()=>setNickname(m.name),[m.uid,m.name]);
  useEffect(()=>setSkinFeedback(''),[m.uid,m.species]);
  useEffect(()=>setEvs(draftsFor(m.evs)),[m.uid,m.evs.hp,m.evs.atk,m.evs.def,m.evs.spa,m.evs.spd,m.evs.spe]);
  const values=statKeys.map(key=>Number(evs[key]));
  const valid=values.every((value,i)=>evs[statKeys[i]].trim()!==''&&Number.isInteger(value)&&value>=0&&value<=255);
  const total=values.reduce((a,b)=>a+b,0);
  const dirty=statKeys.some(key=>evs[key]!==String(m.evs[key]));
  const skill=m.learned.find(sk=>sk.id===skillId);
  const activeBattle=!!s.battle&&!s.battle.finished;
  const raisingItems=s.items.filter(item=>item.kind==='raising'&&item.count>0);
  const item=raisingItems.find(item=>item.id===itemId);
  function saveEvs() {
    if(!valid||total>510){setFeedback(total>510?'学习力总和超过 510，请调整后保存。':'各项学习力须为 0–255 的整数。');return}
    const target=Object.fromEntries(statKeys.map(key=>[key,Number(evs[key])])) as Stats;
    c.dispatch({type:'setEvs',uid:m.uid,evs:target});
    const result=c.snapshot().monsters.find(mon=>mon.uid===m.uid);
    setFeedback(result&&statKeys.every(key=>result.evs[key]===target[key])?'学习力已保存，当前属性已更新。':'学习力未保存，请查看提示。');
  }
  function applyPreset(){if(!preset)return;const next=Object.fromEntries(statKeys.map(key=>[key,'0'])) as Record<StatKey,string>;for(const key of presets[preset])next[key]='255';setEvs(next);setFeedback('预设已填入，点击保存学习力应用。')}
  function replaceSkill(){if(!skill)return;const ids=m.skills.map(sk=>sk.id);if(slot<ids.length)ids[slot]=skill.id;else ids.push(skill.id);c.dispatch({type:'equip',uid:m.uid,skills:ids});setFeedback(`已将${skill.name}放入第 ${slot+1} 技能位。`);setSkillId(undefined)}
  function evolve(){
    if(!evolutionTarget||activeBattle)return;
    c.dispatch({type:'evolve',uid:m.uid,toSpecies:evolutionTarget.species});
    const snapshot=c.snapshot(),result=snapshot.monsters.find(mon=>mon.uid===m.uid);
    if(result?.species===evolutionTarget.species&&result.species!==m.species){setFeedback(`已进化为${evolutionTarget.name}。`);setEvolutionSelection(undefined)}
    else setFeedback(snapshot.notices[0]??'进化未完成，请查看目标条件。');
  }
  function setSkin(species:number){
    if(activeBattle||!skinOptions.some(option=>option.species===species))return;
    c.dispatch({type:'setSkin',uid:m.uid,species:species===m.species?null:species});
    const snapshot=c.snapshot(),result=snapshot.monsters.find(mon=>mon.uid===m.uid);
    setSkinFeedback(result&&(result.appearanceSpecies??result.species)===species?'此精灵的皮肤已保存。':snapshot.notices[0]??'皮肤未更换，请重新选择。');
  }
  return <section className="raising-compact" aria-label={`${m.name}详情`}>
    <nav className="management-tabs" aria-label="精灵详情分页">{(presentation==='petbag'?[['概况','信息'],['详情','能力'],['道具','道具'],['养成','资料']]:[['详情','详情'],['技能','技能'],['养成','养成'],['道具','道具']]).map(([name,label])=><button key={name} aria-pressed={tab===name||name==='详情'&&presentation==='petbag'&&tab==='技能'} className={`${tab===name||name==='详情'&&presentation==='petbag'&&tab==='技能'?'active':''} ${presentation==='petbag'?`petbag-tab-${name}`:''}`} onClick={()=>{setTab(name);setFeedback('')}}>{label}</button>)}</nav>
    <fieldset className="raising-scroll" disabled={activeBattle}>
      {activeBattle&&<p className="management-hint">战斗中可查看详情；养成操作在战斗结束后进行。</p>}
      {presentation!=='petbag'&&(<div className="raising-profile"><div className="raising-portrait"><CreatureArt species={appearanceSpecies} name={m.name}/></div><div className="raising-identity"><small>NO. {String(m.species).padStart(4,'0')} · Lv.{m.level}</small><h3>{m.name}</h3><span className="raising-type-icons"><TypeIcon type={m.types}/></span><dl><div><dt>个体值</dt><dd>{m.iv} / 31</dd></div><div><dt>性格</dt><dd>{m.nature}</dd></div><div><dt>特性</dt><dd>{m.trait||'无'}</dd></div></dl><div className="hp-bar"><i style={{width:`${Math.max(0,Math.min(100,m.hp/m.stats.hp*100))}%`}}/></div><small>体力 {m.hp} / {m.stats.hp}</small></div></div>)}
      {(tab==='概况'||presentation!=='petbag'&&tab==='详情')&&<section className="raising-skins" aria-label="精灵皮肤">
        <div className="raising-skin-picker"><label htmlFor={`skin-${m.uid}`}>皮肤外观</label><select id={`skin-${m.uid}`} aria-label="选择精灵皮肤" value={appearanceSpecies} onChange={event=>setSkin(Number(event.target.value))}>{skinOptions.map(option=><option key={option.species} value={option.species}>{option.name}{option.species===m.species?'（默认外观）':''}</option>)}</select></div>
        <p>当前外观：{skinName}。仅改变此精灵外观，属性与技能保持当前形态。</p>
        {skinFeedback&&<p className="management-feedback" role="status">{skinFeedback}</p>}
      </section>}
      {tab==='概况'&&<div className="petbag-overview"><div className="petbag-information"><div><span>精灵编号</span><strong>{String(m.species).padStart(4,'0')}</strong></div><div><span>性格</span><strong>{m.nature}</strong></div><div><span>个体值</span><strong>{m.iv} / 31</strong></div><div><span>特性</span><strong>{m.trait||'无'}</strong></div></div><div className="petbag-stat-summary">{statKeys.map(key=><div key={key}><span>{statNames[key]}</span><strong>{m.stats[key]}</strong></div>)}</div><div className="petbag-experience"><span>升级经验</span><meter value={m.exp} max={Math.max(1,m.expToNext)}/><small>{m.exp} / {m.expToNext}</small></div><div className="petbag-skill-summary"><strong>当前技能</strong>{m.skills.map(sk=><div key={sk.id}><span>{sk.name}</span><small>PP {sk.pp}/{sk.maxPp}</small></div>)}</div></div>}
      {tab==='详情'&&<><div className="stat-table-heading"><strong>能力与学习力</strong><span>种族值总和 <b>{statKeys.reduce((sum,key)=>sum+m.baseStats[key],0)}</b></span></div><table className="management-stat-table"><thead><tr><th scope="col">能力</th><th scope="col">种族值</th><th scope="col">学习力</th><th scope="col">当前属性</th></tr></thead><tbody>{statKeys.map(key=><tr key={key}><th scope="row">{statNames[key]}</th><td>{m.baseStats[key]}</td><td><div className="ev-cell"><input aria-label={`${statNames[key]}学习力`} type="number" min="0" max="255" step="1" value={evs[key]} onChange={e=>{setEvs(old=>({...old,[key]:e.target.value}));setFeedback('')}}/><button aria-label={`清空${statNames[key]}学习力`} onClick={()=>{setEvs(old=>({...old,[key]:'0'}));setFeedback('')}}>清空</button></div></td><td><strong>{m.stats[key]}</strong></td></tr>)}</tbody></table>
        <div className={`ev-total ${!valid||total>510?'invalid':''}`}><span>学习力合计 <strong>{valid?total:'—'} / 510</strong></span><small>{!valid?'每项须为 0–255 整数':total>510?'超出总上限，请调整':dirty?'尚未保存':'已保存'}</small></div>
        <div className="ev-controls"><select aria-label="学习力预设" value={preset} onChange={e=>setPreset(e.target.value)}><option value="">选择 255 + 255 预设</option>{Object.keys(presets).map(name=><option key={name}>{name}</option>)}</select><button disabled={!preset} onClick={applyPreset}>填入预设</button><button onClick={()=>{setEvs(Object.fromEntries(statKeys.map(key=>[key,'0'])) as Record<StatKey,string>);setFeedback('已清空输入，点击保存学习力应用。')}}>清空全部</button></div><div className="management-confirm-row"><span className="management-feedback" role="status">{feedback||'直接输入学习力，保存后重新计算属性。'}</span><button className="primary" disabled={!valid||total>510||!dirty} onClick={saveEvs}>保存学习力</button></div>
      </>}
      {tab==='技能'&&<><div className="stat-table-heading"><strong>四个技能位</strong><span>选择技能位，再选择已学会的技能</span></div><div className="equipped-skill-grid">{Array.from({length:4},(_,i)=><button key={i} className={slot===i?'active':''} aria-pressed={slot===i} disabled={i>m.skills.length} onClick={()=>{setSlot(i);setSkillId(undefined);setFeedback('')}}><span>技能 {i+1}</span><strong>{m.skills[i]?.name||'空位'}</strong><small>{m.skills[i]?`${elementName(skillIconType(m.skills[i]))} · PP ${m.skills[i].pp}/${m.skills[i].maxPp}`:'尚未装备'}</small></button>)}</div>
        <input className="management-wide-input" aria-label="搜索已学会技能" placeholder="搜索已学会的技能…" value={skillSearch} onChange={e=>setSkillSearch(e.target.value)}/><div className="learned-skill-list">{m.learned.filter(sk=>`${sk.name} ${sk.type}`.includes(skillSearch)).map(sk=><button key={sk.id} className={skillId===sk.id?'active':''} disabled={m.skills.some(current=>current.id===sk.id)} onClick={()=>setSkillId(sk.id)}><span><strong>{sk.name}</strong><small className="raising-skill-meta"><TypeIcon type={skillIconType(sk)} focusable={false}/> {sk.category} · 威力 {sk.power} · PP {sk.maxPp}</small><em>{sk.description}</em></span><b>{m.skills.some(current=>current.id===sk.id)?'已装备':skillId===sk.id?'已选择':'选择'}</b></button>)}</div>
        <div className="management-confirm-row"><span className="management-feedback" role="status">{feedback||(skill?`第 ${slot+1} 位：${m.skills[slot]?.name??'空位'} → ${skill.name}`:'选择一个技能查看替换目标。')}</span><button className="primary" disabled={!skill} onClick={replaceSkill}>确认替换</button></div></>}
      {tab==='养成'&&<div className="raising-forms">
        <section><h4>精灵昵称</h4><div className="management-inline-form"><input aria-label="精灵昵称" maxLength={20} value={nickname} onChange={e=>setNickname(e.target.value)}/><button disabled={!nickname.trim()||nickname===m.name} onClick={()=>{c.dispatch({type:'rename',uid:m.uid,name:nickname.trim()});setFeedback('精灵昵称已更新。')}}>保存昵称</button></div></section>
        <section><h4>经验分配器</h4><p>当前经验 {m.exp} / {m.expToNext} · 可分配 {s.expPool.toLocaleString()}</p><div className="management-inline-form"><input aria-label="分配经验数量" type="number" min="1" max={s.expPool} value={amount} onChange={e=>setAmount(e.target.value)}/><button className="primary" disabled={!Number.isInteger(Number(amount))||Number(amount)<1||Number(amount)>s.expPool||m.level>=100} onClick={()=>{c.dispatch({type:'allocateExp',uid:m.uid,amount:Number(amount)});setFeedback('经验已分配，等级和属性已更新。')}}>分配经验</button></div></section>
        <section className="raising-evolution"><h4>精灵进化</h4>
          <p>{evolutionChoices.length>1?'请选择目标形态。每只精灵只会进化为所选分支；收集其他分支需要再获取并培养一只初始精灵。':evolutionChoices.length?'达到所需等级后，即可确认进化。':'当前形态没有普通进化路线。'}</p>
          {!!evolutionChoices.length&&<><div className="raising-evolution-options" role="group" aria-label="选择进化目标">{evolutionChoices.map(choice=>{
            const reason=choice.blockedReason??(!choice.ready?(m.level<choice.level?`需要达到 Lv.${choice.level}（当前 Lv.${m.level}）`:'暂不满足进化条件。'):undefined);
            const selected=evolutionTarget?.species===choice.species;
            return <button key={choice.species} type="button" aria-label={`选择进化为${choice.name}`} aria-pressed={selected} disabled={!choice.ready||!!reason} onClick={()=>{setEvolutionSelection({uid:m.uid,fromSpecies:m.species,toSpecies:choice.species});setFeedback('')}}>
              <span className="raising-evolution-art" aria-hidden="true"><CreatureArt species={choice.species} name={choice.name}/></span>
              <span className="raising-evolution-copy"><strong>{choice.name}</strong><small>Lv.{choice.level} 进化</small><span className={reason?'raising-evolution-blocked':'raising-evolution-state'}>{reason??(selected?'已选择':'可选择')}</span></span>
            </button>;
          })}</div>
          <button className="primary raising-evolution-confirm" disabled={!evolutionTarget} onClick={evolve}>{evolutionTarget?`进化为${evolutionTarget.name}`:evolutionChoices.some(choice=>choice.ready&&!choice.blockedReason)?'请先选择进化目标':'尚未满足进化条件'}</button></>}
        </section>
        <p className="management-feedback" role="status">{feedback}</p>
      </div>}
      {tab==='道具'&&<><p className="management-hint">为当前精灵选择培养道具，再确认使用。</p><div className="raising-item-list">{raisingItems.map(i=><button key={i.id} aria-pressed={itemId===i.id} className={itemId===i.id?'active':''} onClick={()=>setItemId(i.id)}><strong>{i.name}</strong><span>×{i.count}</span><small>{i.description}</small></button>)}</div>{!raisingItems.length&&<div className="management-empty">没有可用的培养道具。</div>}<div className="management-confirm-row"><span className="management-feedback" role="status">{feedback||(item?`${item.name} → ${m.name}`:'选择一个培养道具。')}</span><button className="primary" disabled={!item} onClick={()=>{if(item){c.dispatch({type:'useItem',uid:m.uid,itemId:item.id});setFeedback((c.snapshot().items.find(i=>i.id===item.id)?.count??0)<item.count?`已对${m.name}使用${item.name}。`:c.snapshot().notices[0]??'道具未使用。')}}}>确认使用</button></div></>}
    </fieldset>
  </section>;
}
