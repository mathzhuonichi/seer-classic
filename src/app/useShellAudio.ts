import { useEffect, useRef } from 'react';
import { battleLevelGained } from './action-sounds.ts';
import { gameAudio } from '../shared/audio/game-audio.ts';
import type { GameSnapshot } from '../kernel/contract.ts';
import { useGame, type GameStore } from '../shared/ui/use-game.ts';
import type { BattleView } from '../shared/views.ts';

const partyLevels = (battle: BattleView) => new Map(battle.party.map(mon => [mon.uid, mon.level]));

/** Audio that follows the shell: gesture unlock, tab visibility, battle music and the post-battle level-up cue. */
export function useShellAudio(store: GameStore<GameSnapshot>, preparing: boolean) {
  const battleOpen = useGame(store, s => !!s.battle);
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
    const battle = battleOpen ? store.snapshot().battle : null;
    gameAudio.setBattleActive(battleOpen && !preparing);
    if (battle && !levels.current) levels.current = partyLevels(battle);
    if (!battle && levels.current) {
      levels.current = null;
      if (levelUp.current) gameAudio.playSfx('level-up');
      levelUp.current = false;
    }
  }, [battleOpen, preparing]);
  return {
    /** A new battle's party levels: the baseline for the level-up cue. */
    track(battle: BattleView) { levels.current = partyLevels(battle); },
    /** Just before a battle closes: a won battle that raised a level plays the cue once it is gone. */
    closing(before: GameSnapshot) {
      levelUp.current = !!before.battle?.finished && !!before.battle.won && !!levels.current && battleLevelGained(levels.current, before.monsters);
    },
  };
}
