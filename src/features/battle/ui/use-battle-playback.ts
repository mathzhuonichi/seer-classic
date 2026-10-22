import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameAction, GameController } from '../../../kernel/contract.ts';
import type { BattlePresentationFrame, BattleView } from '../../../shared/views.ts';
import { gameAudio } from '../../../shared/audio/game-audio.ts';
import { holdIdle } from '../../../shared/idle.ts';
import { appearanceOf } from '../../../shared/monster-views.ts';
import { prefersReducedMotion } from '../../../shared/ui/reduced-motion.ts';
import { battleAnimationTiming } from '../battle-animation.ts';
import { createBattlePlayer, type PlaybackClock, type PlaybackEvents, type PlaybackState } from '../battle-player.ts';
import { isMoveFrame } from '../battle-playback.ts';
import { getSkillEffectTiming } from '../battle-skill-effects.ts';

export interface BattlePlayback extends PlaybackState {
  /** No turn is playing or being submitted, and the battle is still on. */
  canAct(): boolean;
  /** Send a battle command and say whether the controller took it; a rejected command shows its notice and unlocks. */
  submit(action: GameAction): boolean;
}

/** A finished battle returns to its scene after its last action and capsule settle. */
const CLOSE_DELAY_MS = 700;
const BROWSER_CLOCK: PlaybackClock = {
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: id => window.clearTimeout(id),
  now: () => performance.now(),
};

/** A move frame plays its actor's loaded clip and its skill effect, if it can play; every frame follows the reduced-motion preference. */
function frameMotion(frame: BattlePresentationFrame) {
  if (!isMoveFrame(frame)) return { reducedMotion: prefersReducedMotion() };
  const species = appearanceOf(frame.side === 0 ? frame.player : frame.enemy);
  return {
    reducedMotion: prefersReducedMotion(), timing: battleAnimationTiming(species, frame.kind), effect: getSkillEffectTiming(frame.skillId, species),
  };
}

/** Play each new turn's presentation frames in order, and own the command lock while they run. */
export function useBattlePlayback(battle: BattleView, c: GameController, events: PlaybackEvents): BattlePlayback {
  const latest = useRef({ battle, c, events });
  latest.current = { battle, c, events };
  const [player] = useState(() => createBattlePlayer({
    battle: () => latest.current.battle,
    dispatch: action => latest.current.c.dispatch(action),
    onStart: () => latest.current.events.onStart(),
    onNeedsSwitch: settled => latest.current.events.onNeedsSwitch(settled),
    sound: cue => gameAudio.playSfx(cue),
    motion: frameMotion,
    clock: BROWSER_CLOCK,
    holdIdle,
  }));
  const state = useSyncExternalStore(player.subscribe, player.state, player.state);
  const revision = battle.animation.revision;

  useEffect(() => player.play(latest.current.battle), [revision, player]);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    if (!battle.finished || state.busy) return;
    const timer = setTimeout(() => c.dispatch({ type: 'closeBattle' }), CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [battle.finished, state.busy, revision, c]);

  return { ...state, canAct: player.canAct, submit: player.submit };
}
