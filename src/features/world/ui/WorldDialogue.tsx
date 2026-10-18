import type { GameController } from '../../../kernel/contract.ts';
import type { FacilityAction, WorldDialogueView } from '../world-scene.ts';
import BossEvidence from '../../../shared/ui/BossEvidence.tsx';
import { CreatureArt } from '../../../shared/ui/CreatureArt.tsx';
import { FacilityNpc } from './SceneContacts.tsx';

/** A contact asks the shell to open a species' encyclopedia entry or a quest. */
export type WorldInteraction = { kind: 'species'; species: number } | { kind: 'quest'; questId: string };
export interface WorldDialogueProps {
  view: WorldDialogueView; showDetails: boolean; c: GameController;
  onNavigate?: (page: string) => void; onInteract?: (event: WorldInteraction) => void;
  onClose: () => void; onToggleDetails: () => void; onChooseStart: () => void;
}

/** A conversation with a scene contact; its buttons challenge, open pages, or show details. */
export function WorldDialogue({ view, showDetails, c, onNavigate, onInteract, onClose, onToggleDetails, onChooseStart }: WorldDialogueProps) {
  const { portrait, towerTeam, challenge } = view;
  function onChallenge() {
    const run = challenge?.run;
    if (run?.kind === 'campaign') { onClose(); onNavigate?.(`campaign:${run.campaignId}`); }
    else if (run?.kind === 'quest') onInteract?.({ kind: 'quest', questId: run.questId });
    else if (run?.kind === 'battle') c.dispatch(run.action);
  }
  function onDetails() {
    if (view.dexSpecies !== undefined && onInteract) onInteract({ kind: 'species', species: view.dexSpecies });
    else onToggleDetails();
  }
  function onFacility(action: FacilityAction) {
    if (action.heal) { c.dispatch({ type: 'heal' }); return; }
    if (action.closes) onClose();
    onNavigate?.(action.route!);
  }
  return <section className="world-dialogue" role="dialog" aria-label={view.label}>
    <button className="world-dialogue-close" aria-label="离开对话" onClick={onClose}>×</button>
    <div className="world-dialogue-body"><div className="world-dialogue-portrait">
      {'facility' in portrait ? <FacilityNpc kind={portrait.facility}/> : <CreatureArt species={portrait.species} name={portrait.name}/>}
    </div>
      <div className="world-dialogue-copy"><small>{view.kicker}</small><h3>{view.title}</h3>
        <p>{view.text}</p>
        {towerTeam && <ul className="world-tower-opponents" aria-label={`第 ${towerTeam.floor} 层对手队伍`}>{towerTeam.opponents.map((opponent, index) =>
          <li key={`${index}-${opponent.species}`}><span>{index + 1}. {opponent.name}</span><small>{opponent.level}</small></li>)}</ul>}
        <BossEvidence evidence={view.evidence}/>
        {view.reward && <p className="world-dialogue-detail">通关奖励：{view.reward}</p>}
        {showDetails && <p className="world-dialogue-detail">{view.detail}</p>}
      </div>
    </div>
    <div className="world-dialogue-actions">{challenge ? <>
      <button className="primary" disabled={challenge.disabled} onClick={onChallenge}>{challenge.label}</button>
      {challenge.chooseStart && <button onClick={onChooseStart}>选择起点</button>}<button onClick={onDetails}>详情</button>
    </> : view.facilityActions.map(action =>
      <button key={action.label} className={action.primary ? 'primary' : undefined} onClick={() => onFacility(action)}>{action.label}</button>)}
      <button className="subtle" onClick={onClose}>离开</button></div>
  </section>;
}
