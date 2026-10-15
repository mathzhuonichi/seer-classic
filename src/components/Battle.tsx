import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BattleMonsterView, BattlePresentationFrame, GameAction, GameController, GameSnapshot, ItemView } from '../game-types';
import { creatureArtStyle, getCreatureArt } from '../presentation/creature-art';
import BattleTeamStrip from './BattleTeamStrip';
import BattleSkillEffect from './BattleSkillEffect';
import {getSkillEffectDurationMs} from './battle-skill-effects';
import TypeIcon from './TypeIcon';
import {skillIconType} from '../presentation/element-types';
import '../battle.css';
import BattleCreatureAnimation from './BattleCreatureAnimation';
import {battleAnimationTiming} from '../presentation/battle-animation';
import {gameAudio} from '../audio/game-audio';

type Command = 'battle' | 'items' | 'party' | 'escape';
type ItemCategory = 'recovery' | 'capsule' | 'status';
const itemCategories: { id: ItemCategory; label: string }[] = [{ id: 'recovery', label: '体力 / PP 恢复' }, { id: 'capsule', label: '精灵胶囊' }, { id: 'status', label: '异常解除' }];
const commands: { id: Command; label: string; asset: string }[] = [
  { id: 'battle', label: '战斗', asset: 'battle-fight' },
  { id: 'items', label: '道具', asset: 'battle-items' },
  { id: 'party', label: '精灵', asset: 'battle-creatures' },
  { id: 'escape', label: '逃跑', asset: 'battle-retreat' },
];
const stageLabels: Record<string, string> = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', acc: '命中', eva: '闪避' };
const durations = { physical: 680, special: 700, status: 620, hit: 490, heal: 530, switch: 620, capture: 2200, message: 480 };

function Health({ monster, team, enemy }: { monster: BattleMonsterView; team: BattleMonsterView[]; enemy?: boolean }) {
  const appearance=monster.appearanceSpecies??monster.species;
  const percent = Math.max(0, Math.min(100, monster.hp / monster.maxHp * 100));
  const conditionDescription = [...monster.statuses, ...Object.entries(monster.stages).filter(([, value]) => value !== 0).map(([stat, value]) => `${stageLabels[stat] || stat}${value > 0 ? '提升' : '下降'} ${Math.abs(value)} 级`)].join('，') || '无异常状态或能力变化';
  return <section className={`classic-health ${enemy ? 'foe' : 'ally'}`} aria-label={`${enemy ? '对手' : '我方'}${monster.name}体力`}>
    <div className="classic-health-portrait"><img src={getCreatureArt(appearance).src} style={creatureArtStyle(appearance,undefined,{scaleByStage:false,fill:.9,verticalAlign:'center'})} alt="" draggable={false}/></div>
    <div className="classic-health-type"><TypeIcon type={monster.types}/></div>
    <div className="classic-health-heading"><strong title={monster.name}>{monster.name}</strong></div><span className="classic-health-level" aria-label={`等级 ${monster.level}`}>{monster.level}</span>
    <div className="classic-hp-track" role="progressbar" aria-valuenow={monster.hp} aria-valuemin={0} aria-valuemax={monster.maxHp} aria-label="体力"><i style={{ width: `${percent}%` }} /><span>{monster.hp} / {monster.maxHp}</span></div>
    <div className="classic-health-footer"><div className="classic-conditions" title={conditionDescription} aria-label={conditionDescription}>{monster.statuses.map(status => <span key={status} className="condition">{status}</span>)}{Object.entries(monster.stages).filter(([, value]) => value !== 0).map(([stat, value]) => <span key={stat} className={value > 0 ? 'stage-up' : 'stage-down'}>{stageLabels[stat] || stat}{value > 0 ? '↑' : '↓'}{Math.abs(value)}</span>)}</div><BattleTeamStrip team={team} activeUid={monster.uid} enemy={enemy}/></div>
  </section>;
}

type SkillEffectCue={move:BattlePresentationFrame;delay:number;duration:number};
/** Original source timelines retain their registration; unavailable clips use the portrait. */
function Combatant({ monster, side, frame, captured = false, busy = false, action, effectCue }: { monster: BattleMonsterView; side: 0 | 1; frame: BattlePresentationFrame | null; captured?: boolean; busy?: boolean; action?: BattlePresentationFrame | null; effectCue?:SkillEffectCue|null }) {
  const effect = frame?.side === side ? frame.kind : 'idle';
  const originalFrame = action?.side === side ? action : frame?.side === side ? frame : null;
  const critical = effect === 'hit' && !!frame?.critical;
  const sourceEffectActor=effectCue?.move.side===side;
  const sourceEffectTarget=effectCue?.move.targetSide===side;
  const art = getCreatureArt(monster.appearanceSpecies??monster.species);
  const groundY = 50 + art.bounds.height / Math.max(art.bounds.width, art.bounds.height) * art.physicalScale * .9 * 50;
  const resting = !busy && !frame && monster.hp > 0 && !monster.fainted && !captured && !monster.statuses.some(status => ['睡眠', '石化', '冰封'].includes(status));
  const actionClass = ['physical', 'special', 'status', 'hit', 'heal', 'switch', 'capture'].includes(effect) ? `motion-${effect}` : resting ? 'motion-idle' : '';
  return <div className={`classic-combatant side-${side}${monster.hp <= 0 ? ' is-fainted' : ''}${critical ? ' is-critical' : ''}${captured && effect !== 'capture' ? ' is-captured' : ''}${effect === 'capture' && frame?.captureSuccess ? ' capture-success' : ''}`} style={{ '--direction': side === 0 ? 1 : -1, '--ground-y':`${groundY}%` } as CSSProperties}>
    <div className={`classic-creature-motion ${actionClass}`}>
      <div className="classic-ground-shadow" />
      <div className={`classic-creature-facing ${side === 1 ? 'mirrored' : ''}`}>
        <div className="classic-art-box"><BattleCreatureAnimation species={monster.appearanceSpecies??monster.species} name={monster.name} kind={originalFrame?.kind || 'idle'} eventKey={originalFrame?.id || 'idle'} resting={resting}/></div>
      </div>
      {effect === 'status' && !sourceEffectActor && <div className="classic-status-ring" aria-hidden="true"><i /><i /><i /></div>}
      {effect === 'heal' && <div className="classic-heal-sparks" aria-hidden="true">＋<span>＋</span><i>＋</i></div>}
      {effect === 'hit' && (critical||!sourceEffectTarget) && <svg className={`classic-impact ${critical ? 'critical-impact' : ''}`} viewBox="0 0 120 120" aria-hidden="true"><path d="m60 5 10 33 29-18-18 29 34 11-34 10 18 29-29-18-10 34-11-34-29 18 18-29L5 60l33-11-18-29 29 18Z" /></svg>}
    </div>
    {effect === 'special' && !sourceEffectActor && <div className="classic-energy-projectile" aria-hidden="true"><i /></div>}
    {(effect === 'hit' || effect === 'heal') && frame?.amount !== undefined && <strong key={frame.id} className={`classic-damage-number ${effect === 'heal' ? 'healing' : ''}${critical ? ' critical-number' : ''}`}>{effect === 'heal' ? '+' : '−'}{frame.amount}</strong>}
    {critical && <span key={`critical-${frame?.id}`} className="classic-critical-popup" aria-hidden="true">致命一击！</span>}
    {effectCue&&effectCue.move.targetSide===side&&<BattleSkillEffect skillId={effectCue.move.skillId} eventKey={effectCue.move.id} side={effectCue.move.side} targetSide={side} startDelayMs={effectCue.delay} durationMs={effectCue.duration}/>}
    {(effect === 'capture' || captured) && <div key={effect === 'capture' ? frame?.id : 'captured'} className={`classic-capture-effect ${effect === 'capture' ? 'animating' : 'settled'} ${frame?.captureSuccess || captured ? 'success' : 'failure'}`} aria-hidden="true"><div className="classic-capsule"><div className="classic-capsule-lid" /><div className="classic-capsule-shell"><span className="classic-capsule-window" /><i /></div><div className="classic-capsule-base" /></div><div className="classic-capture-beam" />{(frame?.captureSuccess || captured) && <div className="classic-capture-stars"><i>✦</i><i>✦</i><i>✦</i></div>}</div>}
  </div>;
}

export default function Battle({ s, c, commandRequest, background, onSettings }: { s: GameSnapshot; c: GameController; commandRequest?: { command: 'party' | 'items'; id: number }; background?:string; onSettings?:()=>void }) {
  const b = s.battle!;
  const [tab, setTab] = useState<Command>(b.needsSwitch ? 'party' : 'battle');
  const [frame, setFrame] = useState<BattlePresentationFrame | null>(null);
  const [sourceAction,setSourceAction] = useState<BattlePresentationFrame | null>(null);
  const [skillEffect,setSkillEffect] = useState<SkillEffectCue|null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const recordId = useId();
  const [partySelection, setPartySelection] = useState(b.player.uid);
  const [itemSelection, setItemSelection] = useState('');
  const [itemCategory, setItemCategory] = useState<ItemCategory>('recovery');
  const [captureResolved, setCaptureResolved] = useState(false);
  const [itemTarget, setItemTarget] = useState(b.player.uid);
  const [showDetails, setShowDetails] = useState(false);
  const [dialogue, setDialogue] = useState(b.log.at(-1) || '请选择指令。');
  const locked = useRef(false);
  const latest = useRef(b);
  latest.current = b;
  const revision = b.animation.revision;

  useEffect(() => {
    if (commandRequest) setTab(commandRequest.command);
  }, [commandRequest?.id, commandRequest?.command]);

  useEffect(() => { setItemTarget(b.player.uid); }, [b.player.uid]);

  useEffect(() => {
    const batch = latest.current.animation.frames;
    if (!batch.length) { locked.current = false; setBusy(false); setFrame(null); return; }
    locked.current = true;
    setBusy(true);
    setShowLog(false);
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout>;
    let outcomeTimer: ReturnType<typeof setTimeout> | undefined;
    let actionTimer: ReturnType<typeof setTimeout> | undefined;
    let effectTimer: ReturnType<typeof setTimeout> | undefined;
    let actionEndsAt = 0;
    let effectEndsAt = 0;
    const advance = () => {
      if (cursor >= batch.length) {
        setFrame(null);
        setSourceAction(null);
        setSkillEffect(null);
        if (latest.current.finished && !latest.current.captured && !['flee','turn_cap'].includes(latest.current.resultReason??'')) gameAudio.playSfx(latest.current.won ? 'win' : 'lose');
        setBusy(false);
        locked.current = false;
        if (latest.current.needsSwitch) { setTab('party'); setPartySelection(latest.current.party.find(mon => mon.hp > 0)?.uid || ''); setDialogue('精灵失去战斗能力，请选择下一位出战精灵。'); }
        else if (latest.current.finished) setDialogue(latest.current.result);
        else setDialogue(batch.at(-1)?.text || '请选择下一回合的指令。');
        return;
      }
      const next = batch[cursor++];
      const actor=next.side===0?next.player:next.enemy;
      const actorAppearance=actor.appearanceSpecies??actor.species;
      setFrame(next);
      if (next.kind === 'capture') setCaptureResolved(!!next.captureSuccess);
      if (next.kind === 'heal') gameAudio.playSfx('heal');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (next.kind === 'capture') {
        setDialogue(`正在使用${next.capsuleName || '精灵胶囊'}捕捉${next.enemy.name}…`);
        outcomeTimer = setTimeout(() => {setDialogue(next.text);if(next.captureSuccess)gameAudio.playSfx('capture');}, 1700);
      } else setDialogue(next.text);
      let delay = next.kind === 'capture' ? durations.capture : reducedMotion ? 160 : next.kind === 'hit' && next.critical ? 800 : durations[next.kind];
      if (['physical','special','status'].includes(next.kind)) {
        const effectDuration=getSkillEffectDurationMs(next.skillId);
        if(effectDuration){
          const timing=battleAnimationTiming(actorAppearance,next.kind);
          const startDelay=reducedMotion?0:timing?.hitMs??0;
          const duration=reducedMotion?160:effectDuration;
          setSkillEffect({move:next,delay:startDelay,duration});clearTimeout(effectTimer);
          effectEndsAt=performance.now()+startDelay+duration;
          effectTimer=setTimeout(()=>setSkillEffect(null),startDelay+duration);
        }else{setSkillEffect(null);effectEndsAt=0;}
      }
      if (!reducedMotion && ['physical','special','status'].includes(next.kind)) {
        const timing=battleAnimationTiming(actorAppearance,next.kind);
        if (timing) {
          setSourceAction(next);clearTimeout(actionTimer);
          actionEndsAt=performance.now()+timing.durationMs;
          actionTimer=setTimeout(()=>setSourceAction(null),timing.durationMs);
          const following=batch[cursor];
          delay=timing.hitMs!==null && following?.kind==='hit' ? timing.hitMs : timing.durationMs;
        }
      }
      if(next.kind==='hit'||['physical','special','status'].includes(next.kind)&&batch[cursor]?.kind!=='hit')delay=Math.max(delay,actionEndsAt-performance.now(),effectEndsAt-performance.now());
      timer = setTimeout(advance, delay);
    };
    advance();
    return () => { clearTimeout(timer); clearTimeout(outcomeTimer); clearTimeout(actionTimer); clearTimeout(effectTimer); setSourceAction(null);setSkillEffect(null); locked.current = false; };
  }, [revision]);

  useEffect(() => {
    if (!b.finished || busy || locked.current) return;
    // Finish the last action and capsule animation before returning to its scene.
    const timer = setTimeout(() => c.dispatch({ type: 'closeBattle' }), 700);
    return () => clearTimeout(timer);
  }, [b.finished, busy, revision, c]);

  const submit = (action: GameAction) => {
    if (locked.current || busy || b.finished) return;
    gameAudio.playSfx('click');
    locked.current = true;
    setBusy(true);
    const before = b.animation.revision;
    c.dispatch(action);
    if (c.snapshot().battle?.animation.revision === before) {
      locked.current = false;
      setBusy(false);
      setDialogue(c.snapshot().notices[0] || '该指令当前无法使用，请重新选择。');
    }
  };
  const player = frame?.player ?? b.player;
  const enemy = frame?.enemy ?? b.enemy;
  const hpPlayer = frame ? { ...player, hp: frame.playerHp } : player;
  const hpEnemy = frame ? { ...enemy, hp: frame.enemyHp } : enemy;
  const disabled = busy || b.finished;
  function chooseItem(item:ItemView) {
    if (disabled || locked.current || b.needsSwitch || item.count <= 0) return;
    if (item.battleCategory === 'capsule') {
      if (b.canCapture) submit({type:'capture',itemId:item.id});
      return;
    }
    setItemSelection(item.id);
  }
  const visibleItemCategories = itemCategories.filter(category => category.id !== 'capsule' || b.canCapture);
  const activeItemCategory = itemCategory === 'capsule' && !b.canCapture ? 'recovery' : itemCategory;
  const items = s.items.filter(item => item.count > 0 && item.battleCategory === activeItemCategory);
  const selectedParty = b.party.find(mon => mon.uid === partySelection) || b.player;
  const selectedItem = items.find(item => item.id === itemSelection) || items[0];
  const targets = b.party.filter(mon => selectedItem?.targetMode === 'fainted' ? mon.hp <= 0 : mon.hp > 0);
  const target = targets.find(mon => mon.uid === itemTarget) || targets.find(mon => mon.uid === b.player.uid) || targets[0];
  const itemHelpsTarget = !!target && !!selectedItem?.usableTargetUids?.includes(target.uid);
  const skillSlots = b.player.skills.some(skill => skill.pp > 0) ? b.player.skills : [{ id: 0, name: '挣扎', type: '普通', category: '物理', power: 50, pp: 0, maxPp: 0, description: '技能 PP 全部耗尽时使用，会受到反作用伤害。' }];

  return <section className="classic-battle" aria-label="精灵对战">
    <div className={`classic-arena ${background ? 'has-scene' : ''} ${busy ? 'is-playing' : ''}`}><div className="classic-battle-caption">{b.name} · 第 {b.turn} 回合</div>
      {background?<img className="classic-scene-backdrop" src={background} alt="" aria-hidden="true" draggable={false}/>:<div className="classic-arena-landscape" aria-hidden="true"><div className="classic-moon" /><div className="classic-mountains far" /><div className="classic-mountains near" /><div className="classic-floor" /></div>}
      <div className="classic-health-row"><Health monster={hpPlayer} team={frame?.party ?? b.party}/><div className="classic-versus" aria-hidden="true">VS</div><Health monster={hpEnemy} team={frame?.enemyParty ?? b.enemyParty} enemy /></div>
      <div className="classic-creatures"><Combatant action={sourceAction} effectCue={skillEffect} monster={player} side={0} frame={frame} busy={busy}/><Combatant action={sourceAction} effectCue={skillEffect} monster={enemy} side={1} frame={frame} captured={captureResolved} busy={busy}/></div>
      <div className="classic-round-status">{busy ? '精灵行动中' : b.finished ? '战斗结束' : b.needsSwitch ? '选择出战精灵' : '等待你的指令'}</div>
    </div>
    <section className={`classic-dialogue${showLog ? ' is-expanded' : ''}`} aria-label="战斗信息">
      <div className="classic-dialogue-header">
        <strong className="classic-record-title">对战信息</strong>
        <span className={`classic-dialogue-signal ${busy ? 'playing' : ''}`} aria-hidden="true" />
        <div className="classic-dialogue-lines"><p aria-live="polite" aria-atomic="true">{dialogue}</p>{!showLog&&!busy&&b.turn>0&&!b.finished&&<div className="classic-recent-log" role="log" aria-label="最近行动记录">{b.log.slice(b.log.reduce((last,line,index)=>/^第 \d+ 回合$/.test(line)?index:last,-1)+1).slice(-2).map((line,index)=><p key={index}>{line}</p>)}</div>}</div>
        <button className={`classic-log-toggle${showLog?' is-collapse':''}`} disabled={busy&&!showLog} aria-label={showLog?'收起战斗记录':undefined} aria-expanded={showLog} aria-controls={recordId} onClick={() => setShowLog(value => !value)}>{showLog ? '×' : '战斗记录'}</button>
      </div>
      {showLog && <div id={recordId} className="classic-battle-history" role="log" aria-label="完整战斗记录" tabIndex={0}>{b.log.map((line, index) => <p key={index}>{line}</p>)}</div>}
    </section>
    {b.finished && !busy ? <div className={`classic-battle-result ${b.won ? 'victory' : ''}`} role="status"><div><strong>{b.captured ? '捕捉成功！' : b.won ? '挑战胜利！' : b.resultReason==='turn_cap'?'本场平局':'战斗结束'}</strong><p>{b.result}</p></div>{onSettings&&<button onClick={onSettings}>设置</button>}</div> : <div className="classic-command-deck" aria-busy={busy}>
      <nav className={`classic-command-tabs${onSettings?' has-settings':''}`} aria-label="战斗指令"><div className="classic-command-diamond"><button className={`command-capture ${tab==='items'&&itemCategory==='capsule'?'active':''}`} aria-label="捕捉" title="捕捉" aria-pressed={tab==='items'&&itemCategory==='capsule'} disabled={disabled||b.needsSwitch||!b.canCapture} onClick={()=>{gameAudio.playSfx('tab');setItemCategory('capsule');setItemSelection('');setTab('items')}}><img src="/ui/classic/hd/battle-capture.svg" alt="" draggable={false}/></button>{commands.map(command => <button key={command.id} className={`command-${command.id} ${tab === command.id&&(command.id!=='items'||itemCategory!=='capsule') ? 'active' : ''}`} aria-label={command.label} title={command.label} disabled={disabled || (b.needsSwitch && command.id !== 'party' && command.id !== 'escape')} aria-pressed={tab === command.id&&(command.id!=='items'||itemCategory!=='capsule')} onClick={() => {gameAudio.playSfx('tab');if(command.id==='items')setItemCategory('recovery');setTab(command.id);}}><img src={`/ui/classic/hd/${command.asset}.svg`} alt="" draggable={false}/></button>)}</div>{onSettings&&<button className="classic-battle-settings" onClick={onSettings}>设置</button>}</nav>
      <div className={`classic-command-content command-content-${tab} ${tab === 'items' ? 'classic-item-panel' : ''}`}>
        {tab === 'battle' && <><div className="classic-command-caption"><span>选择技能</span><small>将鼠标停留在技能上查看效果</small></div><div className="classic-skill-grid">{Array.from({ length: 4 }, (_, slot) => {
          const skill = skillSlots[slot];
          return skill ? <button key={`${slot}-${skill.id}`} className={`classic-skill category-${skill.category}`} title={skill.description || `${skill.name}：${skill.category}技能，威力 ${skill.power}`} disabled={disabled || b.needsSwitch || (skill.maxPp > 0 && skill.pp <= 0)} onClick={() => submit({ type: 'move', skillId: skill.id })}><div><TypeIcon type={skillIconType(skill)} focusable={false}/><small>{skill.category}</small></div><strong>{skill.name}</strong><footer><span>威力 <b>{skill.power || '—'}</b></span><span>PP <b>{skill.pp}</b> / {skill.maxPp}</span></footer></button> : <div className="classic-empty-skill" key={slot}>未装备技能</div>;
        })}</div></>}
        {tab === 'items' && <><nav className="classic-item-category-tabs" aria-label="战斗道具分类">{visibleItemCategories.map(category => <button key={category.id} className={activeItemCategory === category.id ? 'active' : ''} aria-pressed={activeItemCategory === category.id} disabled={disabled || b.needsSwitch} onClick={() => { setItemCategory(category.id); setItemSelection(''); }}>{category.label}</button>)}</nav><div className="classic-item-workspace"><div className="classic-item-grid">{items.map(item => <button key={item.id} title={item.description} className={activeItemCategory !== 'capsule' && selectedItem?.id === item.id ? 'selected' : ''} disabled={disabled || b.needsSwitch} aria-pressed={activeItemCategory === 'capsule' ? undefined : selectedItem?.id === item.id} aria-label={activeItemCategory === 'capsule' ? `使用${item.name}捕捉${b.enemy.name}` : undefined} onClick={() => chooseItem(item)}><span className="classic-item-symbol">{activeItemCategory === 'capsule' ? '◉' : activeItemCategory === 'status' ? '✧' : '＋'}</span><strong>{item.name}</strong><span>× {item.count}</span></button>)}{!items.length && <p className="classic-panel-empty">{activeItemCategory === 'capsule' ? '暂无精灵胶囊，请到道具管理补充。' : activeItemCategory === 'status' ? '暂无异常解除道具。' : '暂无体力或 PP 恢复道具。'}</p>}</div>{activeItemCategory === 'capsule' ? <div className="classic-item-actions classic-capture-actions"><p>{b.canCapture ? '点击胶囊即可立即捕捉。削减体力、施加异常状态能提高捕捉机会。' : b.captureBlockedReason || '首领与招募挑战无法捕捉，请通过挑战奖励获得精元。'}</p><div className="classic-capture-target"><span>捕捉目标</span><strong>{b.enemy.name}</strong><small>HP {b.enemy.hp}/{b.enemy.maxHp}</small></div></div> : <div className="classic-item-actions"><p>{!itemHelpsTarget && target ? `${target.name}当前无需此道具，请选择需要恢复的精灵或其他道具。` : selectedItem?.description || '先选择道具，再选择目标精灵。'}</p><label>使用目标<select value={target?.uid || ''} disabled={disabled || b.needsSwitch || !targets.length} onChange={event => setItemTarget(event.target.value)}>{targets.map(mon => <option key={mon.uid} value={mon.uid}>{mon.name} · HP {mon.hp}/{mon.maxHp}{activeItemCategory === 'status' && mon.statuses.length ? ` · ${mon.statuses.join(' / ')}` : ''}</option>)}</select></label><button className="classic-confirm" disabled={disabled || b.needsSwitch || !selectedItem || !target || !itemHelpsTarget} onClick={() => selectedItem && target && submit({ type: 'battleItem', itemId: selectedItem.id, targetUid: target.uid })}>使用</button></div>}</div></>}
        {tab === 'party' && <><div className="classic-command-caption"><span>{b.needsSwitch ? '当前精灵无法战斗，请选择替补' : '选择精灵'}</span><small>选择后点击出战</small></div><div className="classic-party-grid">{b.party.map(monster => <button key={monster.uid} disabled={disabled} className={`${monster.uid === b.player.uid ? 'current' : ''} ${monster.uid === selectedParty.uid ? 'selected' : ''}`} aria-pressed={monster.uid === selectedParty.uid} onClick={() => setPartySelection(monster.uid)}><img src={getCreatureArt(monster.appearanceSpecies??monster.species).src} alt="" /><strong>{monster.name}<small>Lv.{monster.level}</small></strong><span>{monster.uid === b.player.uid ? '出战中' : monster.hp <= 0 ? '无法战斗' : `${monster.hp} / ${monster.maxHp}`}</span><i style={{ width: `${Math.max(0, monster.hp / monster.maxHp * 100)}%` }} /></button>)}</div><div className="classic-party-actions"><span>{selectedParty.name} · <TypeIcon type={selectedParty.types}/> · HP {selectedParty.hp}/{selectedParty.maxHp}</span><button disabled={disabled} onClick={() => setShowDetails(true)}>详情</button><button className="classic-confirm" disabled={disabled || selectedParty.uid === b.player.uid || selectedParty.hp <= 0} onClick={() => submit({ type: 'switch', uid: selectedParty.uid })}>出战</button></div></>}
        {tab === 'escape' && <div className="classic-escape-panel"><div><strong>{b.needsSwitch ? `${b.player.name}已失去战斗能力` : '撤离本场战斗'}</strong><p>{b.needsSwitch ? '可以派出替补精灵，或直接撤离。' : '立即离开当前战斗，不再执行本回合攻击。'}撤离不会获得本场战斗奖励。</p></div><button disabled={disabled} onClick={() => submit({ type: 'flee' })}>撤离战斗 →</button></div>}
      </div>
    </div>}
    {showDetails && <div className="classic-detail-backdrop" onClick={() => setShowDetails(false)}><section className="classic-creature-details" role="dialog" aria-modal="true" aria-label={`${selectedParty.name}战斗详情`} onClick={event => event.stopPropagation()}><header><strong>{selectedParty.name} · Lv.{selectedParty.level}</strong><button aria-label="关闭精灵详情" onClick={() => setShowDetails(false)}>×</button></header><p><TypeIcon type={selectedParty.types}/> · 体力 {selectedParty.hp}/{selectedParty.maxHp}</p><p>{selectedParty.statuses.length ? selectedParty.statuses.join(' · ') : '无异常状态'}</p><div>{selectedParty.skills.map(skill => <article key={skill.id}><strong>{skill.name}</strong><span><TypeIcon type={skillIconType(skill)}/> {skill.category} · 威力 {skill.power || '—'} · PP {skill.pp}/{skill.maxPp}</span><p>{skill.description}</p></article>)}</div></section></div>}
  </section>;
}
