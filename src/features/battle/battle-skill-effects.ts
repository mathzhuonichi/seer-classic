// Original skill effects, and when their parts load. This module is the loading boundary: Ruffle, the host SWF and the
// effect index load behind the battle loading screen (prepareSkillEffects), and every battle screen gets one host stage
// (createSkillEffectStage) that loads its effects as they are needed. Placement and the battle UI do not depend on how.
import { loadRuffle, startSkillEffectHost, type SkillEffectHost } from './skill-effect-host.ts';
import type { SkillEffectPlacement } from './skill-effect-placement.ts';

/** public/battle-effects/swf/index.json, written by tools/assets/publish_skill_effect_swfs.py. */
interface EffectIndex {
  /** The SWF path with `<skillId>`. */
  path: string;
  /** skillId -> [the frame whose script sets isEnd (the clip's last), the SWF's version]. */
  effects: Record<string, [number, string]>;
}

/** A play starts on the host's next frame. */
const START_FRAMES = 1;

let index: EffectIndex | null = null;
/** The host's frame rate, once a host has run on this page; 0 until then and when effects cannot play here. */
let hostFps = 0;
let preparing: Promise<void> | null = null;
const reported = new Set<string>();

/** Reports why effects or one effect cannot play, once per reason; the battle goes on without them. */
function report(what: string, error: unknown) {
  if (reported.has(what)) return;
  reported.add(what);
  console.warn(`Original skill effects: ${what} unavailable:`, error);
}

/** A hidden 1 px place where a first host starts. */
function offstage() {
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true');
  element.style.cssText = 'position:fixed;left:-2px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  document.body.append(element);
  return element;
}

async function warm() {
  const [data, source] = await Promise.all([import('../../../public/battle-effects/swf/index.json'), loadRuffle()]);
  // A first host compiles Ruffle's WebAssembly and starts its renderer, so a battle's own host starts without a long task.
  const place = offstage();
  try {
    const host = await startSkillEffectHost(source, place);
    hostFps = host.fps;
    host.destroy();
  } finally {
    place.remove();
  }
  // JSON rows are typed as arrays, not as the index's [frame, version] pairs.
  index = data.default as unknown as EffectIndex;
}

/** Loads the index and Ruffle and runs a first host, once per page. Never rejects: without them a battle has no effects. */
export function prepareSkillEffects(): Promise<void> {
  preparing ??= warm().catch(error => report('Ruffle', error));
  return preparing;
}

/** Index row of a skill's effect, while effects can play. */
const effectRow = (skillId: number) => (hostFps ? index?.effects[skillId] : undefined);

/**
 * How long a skill's effect plays: its timeline up to the frame that sets isEnd, at the host's frame rate, and the frame
 * before it starts. Undefined for a skill without one and while effects cannot play, so no move waits for a missing effect.
 */
export function getSkillEffectDurationMs(skillId?: number): number | undefined {
  const row = skillId === undefined ? undefined : effectRow(skillId);
  return row && (row[0] + START_FRAMES) / hostFps * 1000;
}

export interface SkillEffectStage {
  /** Starts loading these skills' effects. */
  prepare(skillIds: readonly number[]): void;
  /** Plays a skill's effect, or holds its middle frame (`still`), until the returned function stops it or it ends. */
  play(skillId: number, at: SkillEffectPlacement, still: boolean): () => void;
  /** Removes the stage's player. */
  dispose(): void;
}

/** One battle screen's effects: a host player in `container`, started once effects can play on this page. */
export function createSkillEffectStage(container: HTMLElement): SkillEffectStage {
  let disposed = false;
  const host: Promise<SkillEffectHost | null> = prepareSkillEffects().then(async () => {
    if (disposed || !hostFps) return null;
    const started = await startSkillEffectHost(await loadRuffle(), container);
    if (disposed) started.destroy();
    return disposed ? null : started;
  }).catch(error => {
    if (!disposed) report('the battle stage', error);
    return null;
  });
  const loads = new Map<number, Promise<boolean>>();
  const load = (skillId: number) => {
    const row = effectRow(skillId);
    if (!row || !index) return Promise.resolve(false);
    const url = new URL(`${index.path.replace('<skillId>', String(skillId))}?v=${row[1]}`, document.baseURI).href;
    if (!loads.has(skillId)) {
      loads.set(skillId, host.then(running => running?.load(String(skillId), url).then(() => true) ?? false)
        .catch(error => { report(`skill ${skillId}`, error); return false; }));
    }
    return loads.get(skillId)!;
  };
  return {
    prepare: skillIds => { for (const skillId of skillIds) void load(skillId); },
    play(skillId, at, still) {
      let stopped = false, id: number | null = null;
      void Promise.all([host, load(skillId)]).then(([running, loaded]) => {
        const row = effectRow(skillId);
        if (stopped || !running || !loaded || !row) return;
        id = running.play(String(skillId), at, still ? Math.ceil(row[0] / 2) : 0);
      });
      return () => {
        stopped = true;
        if (id !== null) void host.then(running => running?.stop(id!));
      };
    },
    dispose() {
      disposed = true;
      void host.then(running => running?.destroy());
    },
  };
}
