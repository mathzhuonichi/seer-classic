// Original skill effects, and when their parts load. This module is the loading boundary. Nothing of Ruffle loads before the
// first battle's loading screen. There, once the creature art and animations are in, the page's one effect host starts in a
// hidden 1x1 px parking place, and every loading screen loads its battle's effects into it (prepareSkillEffects), waiting at
// most SKILL_EFFECTS_WAIT_MS for them. Each battle screen takes the host into its arena layer and gives it back
// (createSkillEffectStage); the playback asks how a move's effect is timed (getSkillEffectTiming). skill-effect-session.ts holds
// the rules; placement and the battle UI do not depend on them.
import type { BattleView } from '../../shared/views.ts';
import { startSkillEffectHost } from './skill-effect-host.ts';
import { SkillEffectSession, battleSkillIds, type SkillEffectData, type SkillEffectRow } from './skill-effect-session.ts';

const reported = new Set<string>();

/** Reports why effects or one effect cannot play, once per reason; the battle goes on without them. */
function report(what: string, error: unknown) {
  if (reported.has(what)) return;
  reported.add(what);
  console.warn(`Original skill effects: ${what} unavailable:`, error);
}

let parking: HTMLElement | null = null;

/** The hidden 1x1 px place where the host starts and waits between battles: its canvas is 1x1 px too. */
function park() {
  if (parking?.isConnected) return parking;
  parking = document.createElement('div');
  parking.className = 'skill-effect-parking';
  parking.setAttribute('aria-hidden', 'true');
  parking.style.cssText = 'position:fixed;left:-2px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  document.body.append(parking);
  return parking;
}

/** The effect index (public/battle-effects/swf/index.json) and the original's label-timed species, in one lazy chunk. */
async function data(): Promise<SkillEffectData> {
  const [index, timing] = await Promise.all([import('../../../public/battle-effects/swf/index.json'), import('../../../data/original-fight-timing.json')]);
  // JSON rows are typed as arrays, not as the index's [end, version, hit] rows.
  const effects = index.default.effects as unknown as Record<string, SkillEffectRow>;
  return { path: index.default.path, effects, labelTimed: new Set(timing.default.species) };
}

const session = new SkillEffectSession({
  data,
  start: () => startSkillEffectHost(park()),
  park,
  url: (path, skillId, version, attempt) =>
    new URL(`${path.replace('<skillId>', String(skillId))}?v=${version}${attempt > 1 ? `&attempt=${attempt}` : ''}`, document.baseURI).href,
  hidden: () => document.hidden,
  onHidden(listener) {
    const changed = () => { if (document.hidden) listener(); };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
  report,
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
});

/**
 * Behind a battle's loading screen, after its art and animations: starts the page's host if none runs (or replaces one that died
 * or would be too full) and loads the effects of every creature in the battle. Resolves once the host runs and the two opening
 * creatures' effects are in, at most SKILL_EFFECTS_WAIT_MS later. Never rejects: without them a battle has no effects.
 */
export function prepareSkillEffects(battle: BattleView) {
  const { all, lead } = battleSkillIds(battle);
  return session.prepare(all, lead);
}

/**
 * When a move's effect starts and hurts the target, from the attacker clip's hit marker, and how long it plays; undefined unless
 * it can play now, so that no move waits for an effect that does not show.
 */
export const getSkillEffectTiming = (skillId: number | undefined, species: number) => session.timing(skillId, species);

/** One battle screen's effects: the page's host, taken into `container` (the arena layer) while the screen shows. */
export const createSkillEffectStage = (container: HTMLElement) => session.stage(container);
