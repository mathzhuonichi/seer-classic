import { BRAVE_TOWER_FLOORS } from '../../../domain/challenges/brave-tower.ts';
import type { TowerScene } from '../world-scene.ts';

/** Brave Tower controls over the scene: the start-floor selector and the completion notice. */
export function TowerHud({ tower, onChooseStart }: { tower: TowerScene; onChooseStart: () => void }) {
  return <>
    <button className="world-tower-choose" data-tower-action="choose" onClick={event => { event.stopPropagation(); onChooseStart(); }}>选择起点</button>
    {tower.complete && <div className="world-tower-complete" role="status">{`已通过全部 ${BRAVE_TOWER_FLOORS} 层 · 选择起点再次挑战`}</div>}
  </>;
}
