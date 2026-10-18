import type { CSSProperties } from 'react';
import type { BattleMonsterView, BattlePresentationFrame } from '../../../kernel/contract.ts';
import { getCreatureArt } from '../../../shared/creature-art.ts';
import { STATUS_LABELS } from '../../../shared/labels.ts';
import { appearanceOf } from '../../../shared/monster-views.ts';
import BattleCreatureAnimation from './BattleCreatureAnimation.tsx';
import BattleSkillEffect from './BattleSkillEffect.tsx';
import type { SkillEffectCue } from './use-battle-playback.ts';

/** Frame kinds with their own CSS motion on the combatant. */
const MOTION_KINDS = new Set(['physical', 'special', 'status', 'hit', 'heal', 'switch', 'capture']);
/** Statuses that hold a creature still instead of its idle sway. */
const STILL_STATUSES = [STATUS_LABELS.sleep, STATUS_LABELS.petrify, STATUS_LABELS.frozen_solid];
const IMPACT_PATH = 'm60 5 10 33 29-18-18 29 34 11-34 10 18 29-29-18-10 34-11-34-29 18 18-29L5 60l33-11-18-29 29 18Z';

function CaptureEffect({ animating, success }: { animating: boolean; success: boolean }) {
  return <div className={`classic-capture-effect ${animating ? 'animating' : 'settled'} ${success ? 'success' : 'failure'}`} aria-hidden="true">
    <div className="classic-capsule">
      <div className="classic-capsule-lid" />
      <div className="classic-capsule-shell"><span className="classic-capsule-window" /><i /></div>
      <div className="classic-capsule-base" />
    </div>
    <div className="classic-capture-beam" />
    {success && <div className="classic-capture-stars"><i>✦</i><i>✦</i><i>✦</i></div>}
  </div>;
}

/**
 * One side's creature with the current frame's motion and overlays. Original source timelines
 * retain their registration; unavailable clips use the portrait.
 */
export default function BattleCombatant({ monster, side, frame, captured = false, busy = false, action, effectCue }: {
  monster: BattleMonsterView; side: 0 | 1; frame: BattlePresentationFrame | null; captured?: boolean; busy?: boolean;
  action?: BattlePresentationFrame | null; effectCue?: SkillEffectCue | null;
}) {
  const effect = frame?.side === side ? frame.kind : 'idle';
  const originalFrame = action?.side === side ? action : frame?.side === side ? frame : null;
  const critical = effect === 'hit' && !!frame?.critical;
  const effectActor = effectCue?.move.side === side, effectTarget = effectCue?.move.targetSide === side;
  const appearance = appearanceOf(monster), art = getCreatureArt(appearance);
  const groundY = 50 + art.bounds.height / Math.max(art.bounds.width, art.bounds.height) * art.physicalScale * .9 * 50;
  const held = monster.statuses.some(status => STILL_STATUSES.includes(status));
  const resting = !busy && !frame && monster.hp > 0 && !monster.fainted && !captured && !held;
  const motion = MOTION_KINDS.has(effect) ? `motion-${effect}` : resting ? 'motion-idle' : '';
  const capturing = effect === 'capture';
  const className = `classic-combatant side-${side}${monster.hp <= 0 ? ' is-fainted' : ''}${critical ? ' is-critical' : ''}`
    + `${captured && !capturing ? ' is-captured' : ''}${capturing && frame?.captureSuccess ? ' capture-success' : ''}`;
  return <div className={className} style={{ '--direction': side === 0 ? 1 : -1, '--ground-y': `${groundY}%` } as CSSProperties}>
    <div className={`classic-creature-motion ${motion}`}>
      <div className="classic-ground-shadow" />
      <div className={`classic-creature-facing ${side === 1 ? 'mirrored' : ''}`}>
        <div className="classic-art-box">
          <BattleCreatureAnimation species={appearance} name={monster.name} kind={originalFrame?.kind || 'idle'}
            eventKey={originalFrame?.id || 'idle'} resting={resting}/>
        </div>
      </div>
      {effect === 'status' && !effectActor && <div className="classic-status-ring" aria-hidden="true"><i /><i /><i /></div>}
      {effect === 'heal' && <div className="classic-heal-sparks" aria-hidden="true">＋<span>＋</span><i>＋</i></div>}
      {effect === 'hit' && (critical || !effectTarget)
        && <svg className={`classic-impact ${critical ? 'critical-impact' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
        <path d={IMPACT_PATH} />
      </svg>}
    </div>
    {effect === 'special' && !effectActor && <div className="classic-energy-projectile" aria-hidden="true"><i /></div>}
    {(effect === 'hit' || effect === 'heal') && frame?.amount !== undefined
      && <strong key={frame.id} className={`classic-damage-number ${effect === 'heal' ? 'healing' : ''}${critical ? ' critical-number' : ''}`}>
        {effect === 'heal' ? '+' : '−'}{frame.amount}
      </strong>}
    {critical && <span key={`critical-${frame?.id}`} className="classic-critical-popup" aria-hidden="true">致命一击！</span>}
    {effectCue && effectTarget && <BattleSkillEffect skillId={effectCue.move.skillId} eventKey={effectCue.move.id} side={effectCue.move.side} targetSide={side}
      startDelayMs={effectCue.delay} durationMs={effectCue.duration}/>}
    {(capturing || captured) && <CaptureEffect key={capturing ? frame?.id : 'captured'} animating={capturing} success={!!frame?.captureSuccess || captured} />}
  </div>;
}
