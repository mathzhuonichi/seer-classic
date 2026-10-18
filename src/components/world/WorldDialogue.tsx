import type { FacilityAction, WorldDialogueView } from '../../presentation/world-scene.ts';
import BossEvidence from '../BossEvidence.tsx';
import { CreatureArt } from '../CreatureArt.tsx';
import { FacilityNpc } from './SceneContacts.tsx';

export interface WorldDialogueProps {
  view: WorldDialogueView; showDetails: boolean;
  onClose: () => void; onChallenge: () => void; onDetails: () => void; onChooseStart: () => void;
  onFacility: (action: FacilityAction) => void;
}

export function WorldDialogue({ view, showDetails, onClose, onChallenge, onDetails, onChooseStart, onFacility }: WorldDialogueProps) {
  const { portrait, towerTeam, challenge } = view;
  return <section className="world-dialogue" role="dialog" aria-label={view.label}>
    <button className="world-dialogue-close" aria-label="离开对话" onClick={onClose}>×</button>
    <div className="world-dialogue-body"><div className="world-dialogue-portrait">{'facility' in portrait ? <FacilityNpc kind={portrait.facility}/> : <CreatureArt species={portrait.species} name={portrait.name}/>}</div>
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
    </> : view.facilityActions.map(action => <button key={action.label} className={action.primary ? 'primary' : undefined} onClick={() => onFacility(action)}>{action.label}</button>)}
      <button className="subtle" onClick={onClose}>离开</button></div>
  </section>;
}
