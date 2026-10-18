import { useEffect, useRef } from 'react';
import { battleLevelGained } from '../../audio/action-sounds.ts';
import { gameAudio } from '../../audio/game-audio.ts';
import type { BattleView, GameSnapshot } from '../../game-types.ts';

const partyLevels = (battle: BattleView) => new Map(battle.party.map(mon => [mon.uid, mon.level]));

/** Audio that follows the shell: gesture unlock, tab visibility, battle music and the post-battle level-up cue. */
export function useShellAudio(s: GameSnapshot, preparing: boolean) {
  const levels = useRef<Map<string, number> | null>(null), levelUp = useRef(false);
  useEffect(() => {
    const unlock = () => { void gameAudio.unlock(); };
    const visibility = () => gameAudio.setVisible(!document.hidden);
    window.addEventListener('pointerdown', unlock, { capture: true }); window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', visibility); visibility();
    return () => {
      window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', visibility); gameAudio.shutdown();
    };
  }, []);
  useEffect(() => {
    gameAudio.setBattleActive(!!s.battle && !preparing);
    if (s.battle && !levels.current) levels.current = partyLevels(s.battle);
    if (!s.battle && levels.current) {
      levels.current = null;
      if (levelUp.current) gameAudio.playSfx('level-up');
      levelUp.current = false;
    }
  }, [!!s.battle, preparing]);
  return {
    /** A new battle's party levels: the baseline for the level-up cue. */
    track(battle: BattleView) { levels.current = partyLevels(battle); },
    /** Just before a battle closes: a won battle that raised a level plays the cue once it is gone. */
    closing(before: GameSnapshot) {
      levelUp.current = !!before.battle?.finished && !!before.battle.won && !!levels.current && battleLevelGained(levels.current, before.monsters);
    },
  };
}
