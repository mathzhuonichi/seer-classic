import {useEffect, useRef, useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { CampaignStageView, CampaignView } from '../../../shared/views.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import BossEvidence from '../../../shared/ui/BossEvidence.tsx';
import {opponentLevelText} from '../../../shared/encounter-level.ts';
import './challenge-campaign-scene.css';

export interface ChallengeCampaignSceneProps {
  campaign: CampaignView;
  c: GameController;
  onLeave: () => void;
  onManage: () => void;
  background?: string;
}

/** Campaign progress comes from the controller; the scene only selects a stage. */
export default function ChallengeCampaignScene({campaign, c, onLeave, onManage, background}: ChallengeCampaignSceneProps) {
  const defaultStageId = campaign.nextStageId ?? campaign.stages.at(-1)?.id ?? '';
  // A picked stage holds until the campaign or its progress changes; the default stage then shows in that same render.
  const progress = `${campaign.id}/${campaign.completed}/${campaign.nextStageId ?? ''}`;
  const [picked, setPicked] = useState({progress, stageId: defaultStageId});
  const selectedId = picked.progress === progress ? picked.stageId : defaultStageId;
  const stage = campaign.stages.find(entry => entry.id === selectedId) ?? campaign.stages.find(entry => entry.id === defaultStageId) ?? campaign.stages[0];
  const stageIndex = campaign.stages.findIndex(entry => entry.id === stage?.id);
  const requirement = stage?.requiredSpecies;

  return <section className="campaign-scene" aria-label={`${campaign.name}挑战场景`}>
    <div className="campaign-scenery" aria-hidden="true">{background?<><img className="campaign-scene-backdrop" src={background} alt="" draggable={false}/><div className="campaign-scene-shade"/></>:<><div className="campaign-orbit"/><div className="campaign-horizon"/><div className="campaign-floor"/><i/><i/><i/></>}</div>
    <header className="campaign-scene-heading"><div><span>{campaign.location}</span><h2>{campaign.name}</h2></div><span className="campaign-progress">{campaign.finished ? '全部关卡已完成' : `已完成 ${campaign.completed} / ${campaign.stages.length} 关`}</span></header>
    <nav className="campaign-stage-rail" aria-label="按顺序挑战关卡"><ol>{campaign.stages.map((entry, index) => <li key={entry.id} className={`${entry.cleared ? 'cleared' : entry.available ? 'available' : 'locked'}${stage?.id === entry.id ? ' selected' : ''}`}><button aria-pressed={stage?.id === entry.id} aria-label={`第${index + 1}关 ${entry.name}，${entry.cleared ? '已完成，可重战' : entry.available ? '可挑战' : '尚未解锁'}`} onClick={() => setPicked({progress, stageId: entry.id})}><span className="campaign-stage-seal" aria-hidden="true">{entry.cleared ? '✓' : index + 1}</span><strong>{entry.name}</strong><small>{entry.cleared ? '已完成' : entry.available ? '可挑战' : '未解锁'}</small></button></li>)}</ol></nav>
    <div className="campaign-scene-main">
      <div className="campaign-guardian"><div className="campaign-guardian-art"><CreatureArt species={campaign.species} name={campaign.name} fill={.93}/></div><div className="campaign-guardian-platform" aria-hidden="true"><i/><span>✧</span></div><p>{campaign.description}</p></div>
      <div className="campaign-stage-detail" aria-label="当前关卡详情" tabIndex={0}>
        {stage ? <><div className="campaign-detail-title"><span>第 {stageIndex + 1} 关{stage.kind === 'chain' ? ' · 连续挑战' : ''}</span><h3>{stage.name}</h3><p>{stage.description}</p></div>
          <div className="campaign-opponents"><h4>{stage.opponents.length > 1 ? '依次迎战' : '本关对手'}</h4><ol>{stage.opponents.map((opponent, index) => <li key={`${index}-${opponent.species}`}><span className="campaign-opponent-order">{index + 1}</span><div className="campaign-opponent-art"><CreatureArt species={opponent.species} name={opponent.name}/></div><strong>{opponent.name}</strong><small>{opponentLevelText(opponent)}</small></li>)}</ol></div>
          <BossEvidence evidence={stage.evidence}/>
          {(requirement || stage.minLevel || stage.carry || campaign.resetOnLoss) && <div className="campaign-stage-rules"><h4>挑战条件</h4>{requirement && <div className="campaign-required-creature"><div><CreatureArt species={requirement} name="指定出战精灵"/></div><span>只派自己的{stage.requiredSpeciesName}出战</span></div>}{stage.minLevel && <p>出战精灵等级至少 {stage.minLevel} 级。</p>}{stage.carry && <p>本关连续战斗保留体力、PP 与异常状态。</p>}{campaign.resetOnLoss && <p>挑战失败后需要从第一关重新开始。</p>}</div>}
          <div className="campaign-stage-reward"><span aria-hidden="true">✦</span><div><h4>关卡奖励</h4><p>{stage.rewardText || '完成本关，继续挑战后续关卡。'}</p></div></div>
          {stage.blockedReason && <p className="campaign-blocked-reason" role="status">{stage.blockedReason}</p>}
          {!stage.available && !stage.blockedReason && !stage.cleared && <p className="campaign-blocked-reason">先完成前面的关卡，才能开启本关。</p>}
        </> : <p className="campaign-blocked-reason">暂无可用关卡。</p>}
      </div>
    </div>
    <CampaignControls campaign={campaign} stage={stage} c={c} onLeave={onLeave} onManage={onManage}/>
  </section>;
}

type ControlsProps = Pick<ChallengeCampaignSceneProps, 'campaign' | 'c' | 'onLeave' | 'onManage'> & { stage: CampaignStageView | undefined };

/** The scene's footer: leave, manage the party, reset the progress after a confirmation, and start the selected stage. */
function CampaignControls({campaign, stage, c, onLeave, onManage}: ControlsProps) {
  const [confirming, setConfirming] = useState(false);
  // Where focus goes once 取消 or 确认重置 closes the prompt, so it does not fall to the page body. A reset disables
  // 重置挑战进度 (nothing is left to clear), so it hands focus to the start button, or to 精灵背包 while the stage is blocked.
  const refocus = useRef<'restart' | 'start' | undefined>(undefined);
  const restartButton = useRef<HTMLButtonElement>(null), startButton = useRef<HTMLButtonElement>(null), manageButton = useRef<HTMLButtonElement>(null);
  useEffect(() => setConfirming(false), [campaign.id, campaign.completed]);
  useEffect(() => {
    if (confirming || !refocus.current) return;
    const start = startButton.current?.disabled ? manageButton.current : startButton.current;
    (refocus.current === 'start' ? start : restartButton.current)?.focus();
    refocus.current = undefined;
  }, [confirming]);
  const start = () => stage?.available && c.dispatch({type: 'startCampaignStage', campaignId: campaign.id, stageId: stage.id});
  const close = (focus: 'restart' | 'start') => { refocus.current = focus; setConfirming(false); };
  const reset = () => { close('start'); c.dispatch({type: 'resetCampaign', campaignId: campaign.id}); };
  return <footer className="campaign-scene-controls">
    <button className="campaign-return" onClick={onLeave}>‹ 返回探索</button>
    <button ref={manageButton} onClick={onManage}>精灵背包</button>
    {confirming ? <span className="campaign-restart-confirm" role="group" aria-label="确认重置挑战进度">
      <span>清空已完成的 {campaign.completed} 关？已获得的奖励保留。</span>
      <button className="campaign-restart-yes" onClick={reset}>确认重置</button>
      <button autoFocus onClick={() => close('restart')}>取消</button>
    </span> : <button ref={restartButton} className="campaign-restart" disabled={campaign.completed === 0}
      onClick={() => setConfirming(true)}>重置挑战进度</button>}
    <button ref={startButton} className="campaign-start" disabled={!stage?.available} onClick={start}>
      {stage?.cleared ? '再次挑战' : stage?.kind === 'chain' ? '开始连续挑战' : '开始本关挑战'}<span aria-hidden="true"> →</span></button>
  </footer>;
}
