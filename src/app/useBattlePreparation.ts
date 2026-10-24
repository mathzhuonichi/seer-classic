import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameController } from '../kernel/contract.ts';
import type { BattleView } from '../shared/views.ts';
import {clearIdleBattleAnimations, preloadBattleAnimations} from '../features/battle/index.ts';
import {battleImageSources, type BattleBackdrop} from '../features/battle/index.ts';
import {entersTower, towerBackdrop} from '../features/challenges/index.ts';
import {preloadBattleImages, prepareSkillEffects, waitForBattleLoad} from '../features/battle/index.ts';
import { appearanceOf } from '../shared/monster-views.ts';
import { CHALLENGE_CAMPAIGNS } from '../domain/challenges/challenge-campaigns.ts';
import type {BattlePreparation} from '../features/battle/ui.ts';

/** The scenes a battle can open over: where the explorer stands, and the open campaign's arena. */
export interface BattleBackdrops { exploration: BattleBackdrop; campaign: BattleBackdrop | null }

// Pauses that let the loading screen paint before and after the preloads.
const SETTLE_MS = 250, DEPLOY_MS = 600, START_MS = 350;
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * Starts a battle behind the loading screen: dispatches the action, then preloads the backdrop,
 * creature art, animations and skill effects before revealing the battle. A newer request or `leave` cancels it.
 */
export function useBattlePreparation(c: GameController, backdrops: { current: BattleBackdrops }, inBattle: boolean, events: {
  /** The battle is starting: close windows and messages. */
  onStart: () => void;
  /** The battle was created and is being loaded. */
  onBattle: (battle: BattleView) => void;
}) {
  const [preparation, setPreparation] = useState<BattlePreparation | null>(null);
  const [backdrop, setBackdrop] = useState(() => backdrops.current.exploration);
  const preparing = useRef(false), latest = useRef(0), abort = useRef<AbortController | null>(null);
  useEffect(() => () => { latest.current++; abort.current?.abort(); clearIdleBattleAnimations(); }, []);
  useEffect(() => { if (!inBattle) clearIdleBattleAnimations(); }, [inBattle]);

  async function begin(action: GameAction) {
    if (preparing.current) return;
    preparing.current = true;
    const scene = entersTower(action) ? towerBackdrop()
      : action.type === 'startCampaignStage' && backdrops.current.campaign ? backdrops.current.campaign : backdrops.current.exploration;
    setBackdrop(scene);
    const request = ++latest.current, current = () => request === latest.current;
    events.onStart(); c.dispatch({ type: 'dismissNotice' }); c.dispatch(action);
    const battle = c.snapshot().battle;
    if (!battle || battle.finished) { preparing.current = false; return; }
    abort.current?.abort();
    const loading = new AbortController(), { signal } = loading;
    abort.current = loading;
    events.onBattle(battle);
    const campaign = action.type === 'startCampaignStage' ? CHALLENGE_CAMPAIGNS.find(entry => entry.id === action.campaignId) : undefined;
    const initial: BattlePreparation = {
      name: battle.name, species: battle.enemy.species, location: campaign?.location ?? scene.name, progress: 0, step: '连接战斗场景…',
      deploying: false,
    };
    const report = (progress: number, step: string, deploying = false) => setPreparation({ ...initial, progress, step, deploying });
    setPreparation(initial);
    try {
      await nextPaint();
      await waitForBattleLoad(SETTLE_MS, signal);
      if (!current()) return;
      await preloadBattleImages(battleImageSources(scene, battle), signal, (loaded, total) => { if (current()) report(Math.round(loaded / total * 75), '准备精灵立绘与场景…'); });
      if (!current()) return;
      report(80, '准备精灵动作…');
      await preloadBattleAnimations([appearanceOf(battle.player), appearanceOf(battle.enemy)], { signal });
      if (!current()) return;
      // From here the battle mounts hidden behind the screen: each creature's whole atlas uploads in this step's pause, not as the
      // battle shows (design/notes/battle-entry-longtask-2026-10-24.md).
      report(90, '部署出战精灵…', true);
      // The skill effects load in the screen's own last pauses, once the art and animations are in, so that they slow neither:
      // the page's effect host starts here on the first battle. They hold the screen at most SKILL_EFFECTS_WAIT_MS (3 s); leaving
      // is handled by the pauses' waits.
      const effects = prepareSkillEffects(battle);
      await waitForBattleLoad(DEPLOY_MS, signal);
      report(100, '战斗开始！', true);
      await Promise.all([waitForBattleLoad(START_MS, signal), effects]);
      if (current()) { setPreparation(null); preparing.current = false; }
    } catch (error) {
      if (!signal.aborted && current()) setPreparation(state => state ? { ...state, error: error instanceof Error ? error.message : String(error) } : state);
    } finally {
      if (abort.current === loading) abort.current = null;
    }
  }
  /** Leave a loading battle: it never began, so it counts no attempt or loss and settles nothing. */
  function leave() {
    latest.current++; abort.current?.abort(); abort.current = null;
    c.dispatch({ type: 'abandonBattle' });
    setPreparation(null); preparing.current = false;
    clearIdleBattleAnimations();
  }
  return { preparation, backdrop, begin, leave };
}
