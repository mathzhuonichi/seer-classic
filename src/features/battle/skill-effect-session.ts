// The page's one skill-effect host and the battle screens that borrow it: when it starts, when it is replaced or given up,
// which screen holds it, which effects it has loaded, and how a move's effect is timed. The host, the effect data and the page
// come in through SessionDeps; battle-skill-effects.ts gives the real ones.
import type { BattleView } from '../../shared/views.ts';
import type { SkillEffectTiming } from './battle-playback.ts';
import type { SkillEffectHost } from './skill-effect-host.ts';
import type { SkillEffectPlacement } from './skill-effect-placement.ts';

/** One effect of public/battle-effects/swf/index.json: the frame that sets isEnd (its last), its SWF's version, the frame that sets hit. */
export type SkillEffectRow = readonly [end: number, version: string, hit: number | null];

export interface SkillEffectData {
  /** The SWF path with `<skillId>`. */
  path: string;
  effects: Readonly<Record<string, SkillEffectRow>>;
  /** Species whose effect starts with the attacker clip's hit frame (data/original-fight-timing.json); the others' one stage frame later. */
  labelTimed: ReadonlySet<number>;
}

/** What the session takes from the page. */
export interface SessionDeps {
  /** The effect data, asked for once, with the first host. */
  data(): Promise<SkillEffectData>;
  /** Starts a host in the parking place; rejects when it cannot. */
  start(): Promise<SkillEffectHost>;
  /** The hidden 1x1 px place where the host waits between battles. */
  park(): HTMLElement;
  url(path: string, skillId: number, version: string): string;
  hidden(): boolean;
  /** Calls `listener` whenever the page is hidden; returns the function that stops it. */
  onHidden(listener: () => void): () => void;
  /** Says why effects or one effect cannot play, once per reason. */
  report(what: string, error: unknown): void;
  /** Resolves after `ms`. */
  wait(ms: number): Promise<void>;
}

export interface SkillEffectStage {
  /** Starts loading these skills' effects. */
  prepare(skillIds: readonly number[]): void;
  /**
   * Plays a loaded skill's effect now, or holds its middle frame (`still`), until the returned function stops it or it ends.
   * `missing` runs instead when it cannot start, and later when the page is hidden or the host dies while it plays.
   */
  play(skillId: number, at: SkillEffectPlacement, still: boolean, missing: () => void): () => void;
  /** Stops every effect the stage plays, and their `missing` run: the arena moved or changed size under them. */
  stopAll(): void;
  /** Gives the host back: it goes to its parking place, suspended. */
  dispose(): void;
}

/**
 * Distinct effects one host may hold. Ruffle 0.7.1 never gives back the 1.1-1.6 MiB an effect costs, even when it is unloaded,
 * so a loading screen that would go past this replaces the host (about 0.3 s, inside the screen's own pauses) before it loads.
 */
export const RECYCLE_EFFECTS = 64;
/** Hosts that may fail to start or die on one page; after that, the page plays no effects. */
export const HOST_FAILURES = 2;
/**
 * The longest a loading screen waits for its battle's effects (on a first run, Ruffle's start), and the longest any loading
 * screen waits for one start or load: the battle then opens without them, and takes them when they come.
 */
export const SKILL_EFFECTS_WAIT_MS = 3000;
/** The host starts a clip on its next frame after fxPlay, and removes it after the frame that sets isEnd. */
const START_FRAMES = 1;
/** fxPlay to the drawn frame 1, on average: the host's next frame (measured in the app, Chrome and WebKit: 13-18 ms). */
export const PLAY_LATENCY_MS = 15;
/** The original fight module first looks at the clip's `hit` two stage frames after its frame 1, and hurts the target then. */
const HURT_FRAMES = 2;

/**
 * How the original fight module (PetFightDLL_201308: UseSkillController.petPlay, BaseAnimatorCon) timed an effect against the
 * attacker clip's hit frame, at the host's frame rate (the original stage's 24 fps): its frame 1 shows with the hit frame for a
 * label-timed species and one stage frame later for the others; it plays to the frame that sets isEnd; the target is hurt
 * HURT_FRAMES after frame 1, or on the effect's own later hit frame.
 */
export function skillEffectTiming([end, , hit]: SkillEffectRow, fps: number, labelTimed: boolean): SkillEffectTiming {
  const frameMs = 1000 / fps, firstFrame = labelTimed ? 0 : frameMs;
  return { startMs: firstFrame - PLAY_LATENCY_MS, durationMs: (end + START_FRAMES) * frameMs, hurtMs: firstFrame + Math.max(HURT_FRAMES, hit ?? 0) * frameMs };
}

/**
 * The effects a battle's loading screen loads, the skills of every creature on both sides (`all`), and those it waits for, the
 * skills of the two creatures that open the battle (`lead`); the others' follow behind the battle.
 */
export function battleSkillIds(battle: Pick<BattleView, 'player' | 'enemy' | 'party' | 'enemyParty'>) {
  const skills = (monsters: readonly BattleView['player'][]) => [...new Set(monsters.flatMap(monster => monster.skills.map(skill => skill.id)))];
  return { all: skills([battle.player, battle.enemy, ...battle.party, ...battle.enemyParty]), lead: skills([battle.player, battle.enemy]) };
}

/**
 * A start or a load: `done` settles with its outcome (it never rejects); `waited` settles with true when it was done in time,
 * or with false SKILL_EFFECTS_WAIT_MS after it began. Loading screens wait for `waited`, so none waits again for work that
 * already held an earlier one to its limit, such as a request that never answers.
 */
interface Work<T> { done: Promise<T>; waited: Promise<boolean> }
const settled = <T>(value: T): Work<T> => ({ done: Promise.resolve(value), waited: Promise.resolve(true) });
const NO_LOAD = settled(false);

/** A started host and the effects asked of it. */
interface Started { host: SkillEffectHost; loads: Map<number, Work<boolean>>; loaded: Set<number> }

/**
 * The page's host and the battle screens that borrow it. A loading screen (prepare) starts the host, or replaces one that died
 * or would hold more than RECYCLE_EFFECTS, and loads its battle's effects; between battles the host waits in its parking place,
 * suspended. A battle screen's stage takes it into its arena layer and gives it back. Effects are timed only while they can play.
 */
export class SkillEffectSession {
  readonly #deps: SessionDeps;
  #data: SkillEffectData | null = null;
  #current: Started | null = null;
  #starting: Work<Started | null> | null = null;
  #failures = 0;
  /** A start held a loading screen to its limit: the page's requests are too slow, and no later start is waited for. */
  #slowStart = false;
  #preparing = 0;
  /** The battle screen holding the host, and what it does when the host dies. */
  #owner: { died(): void } | null = null;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  /**
   * Behind a loading screen: makes sure that a host runs and loads these skills' effects. Resolves once the host runs and the
   * `first` skills' effects are in, but at most SKILL_EFFECTS_WAIT_MS after the call, and never waits for a start or a load that
   * began longer ago than that. Never rejects.
   */
  async prepare(skillIds: readonly number[], first: readonly number[] = skillIds) {
    const starting = this.#hostFor(skillIds);
    // The loads follow the host, however late it starts.
    const loading = starting.done.then(started => started ? this.#loadAll(started, skillIds, first) : true);
    const ready = async () => {
      if (await starting.waited) return loading;
      this.#slowStart = true;
      return false;
    };
    if (!await Promise.race([ready(), this.#deps.wait(SKILL_EFFECTS_WAIT_MS).then(() => false)])) {
      this.#deps.report('this battle\'s effects', new Error(`not in after ${SKILL_EFFECTS_WAIT_MS} ms: the battle opens without them`));
    }
  }

  /** How a move's effect is timed, while it can play now: a battle screen holds a host that answers, the effect is in, the page shows. */
  timing(skillId: number | undefined, species: number): SkillEffectTiming | undefined {
    const held = this.#owner && this.#current, data = this.#data, row = skillId === undefined ? undefined : data?.effects[skillId];
    if (!held || !data || !row || this.#deps.hidden()) return undefined;
    // An effect that is not in yet plays from its next use on.
    if (!held.loaded.has(skillId!)) {
      void this.#load(held, skillId!);
      return undefined;
    }
    return held.host.ping() ? skillEffectTiming(row, held.host.fps, data.labelTimed.has(species)) : undefined;
  }

  /** A battle screen's stage: it takes the host into `container` as soon as one runs, and gives it back when disposed. */
  stage(container: HTMLElement): SkillEffectStage {
    const plays = new Map<number, () => void>(), self = { died: () => cut() };
    let held: Started | null = null, disposed = false;
    /** Stops every effect the stage plays: none of them shows any longer. */
    const cut = () => {
      for (const [id, missing] of plays) {
        held?.host.stop(id);
        missing();
      }
      plays.clear();
    };
    const take = (started: Started | null) => {
      if (disposed || !started?.host.alive || started !== this.#current) return;
      held = started;
      this.#owner = self;
      started.host.moveTo(container);
      started.host.resume();
    };
    if (this.#starting) void this.#starting.done.then(take);
    else take(this.#current);
    const unwatch = this.#deps.onHidden(cut);
    const holds = () => (this.#owner === self && held?.host.alive ? held : null);
    return {
      prepare: skillIds => {
        const host = holds();
        if (host) for (const skillId of skillIds) void this.#load(host, skillId);
      },
      play: (skillId, at, still, missing) => {
        const host = holds(), row = this.#data?.effects[skillId], ready = host && row && host.loaded.has(skillId) && !this.#deps.hidden();
        const id = ready ? host.host.play(String(skillId), at, still ? Math.ceil(row[0] / 2) : 0) : null;
        if (id === null) {
          missing();
          return () => {};
        }
        plays.set(id, missing);
        return () => { if (plays.delete(id)) held?.host.stop(id); };
      },
      stopAll: cut,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        unwatch();
        for (const id of plays.keys()) held?.host.stop(id);
        plays.clear();
        if (this.#owner !== self) return;
        this.#owner = null;
        if (!held?.host.alive) return;
        held.host.moveTo(this.#deps.park());
        if (!this.#preparing) held.host.suspend();
      },
    };
  }

  /**
   * Loads skills' effects behind a loading screen; true once the `first` are in, false once one of them outlived its wait. A
   * suspended host does not load: it runs, out of sight, until the loads are in (at most SKILL_EFFECTS_WAIT_MS) or a battle
   * screen takes it.
   */
  #loadAll(started: Started, skillIds: readonly number[], first: readonly number[]) {
    this.#preparing++;
    started.host.resume();
    const loads = Promise.all(skillIds.map(skillId => this.#load(started, skillId).done));
    void Promise.race([loads, this.#deps.wait(SKILL_EFFECTS_WAIT_MS)]).then(() => {
      if (--this.#preparing === 0 && !this.#owner && this.#current === started) started.host.suspend();
    });
    return Promise.all(first.map(skillId => this.#load(started, skillId).waited)).then(inTime => inTime.every(Boolean));
  }

  #load(started: Started, skillId: number): Work<boolean> {
    const data = this.#data, row = data?.effects[skillId];
    if (!data || !row) return NO_LOAD;
    let loading = started.loads.get(skillId);
    if (!loading) {
      loading = this.#work(started.host.load(String(skillId), this.#deps.url(data.path, skillId, row[1])).then(() => {
        started.loaded.add(skillId);
        return true;
      }, error => {
        if (started.host.alive) this.#deps.report(`skill ${skillId}`, error);
        return false;
      }));
      started.loads.set(skillId, loading);
    }
    return loading;
  }

  /** Work that loading screens wait for at most SKILL_EFFECTS_WAIT_MS after it began, or not at all (`waited` false). */
  #work<T>(done: Promise<T>, waited = true): Work<T> {
    if (!waited) return { done, waited: Promise.resolve(false) };
    return { done, waited: Promise.race([done.then(() => true), this.#deps.wait(SKILL_EFFECTS_WAIT_MS).then(() => false)]) };
  }

  /** The host for a loading screen's skills: the running one, or a new one in place of none, a dead one or one that would be too full. */
  #hostFor(skillIds: readonly number[]): Work<Started | null> {
    if (this.#starting) return this.#starting;
    const held = this.#current, adding = held ? skillIds.filter(id => this.#data?.effects[id] && !held.loads.has(id)).length : 0;
    // A host a battle screen holds is never replaced; a dead one waits for a loading screen without a battle.
    const keep = held && (this.#owner || held.host.alive && (!adding || held.loads.size + adding <= RECYCLE_EFFECTS));
    if (keep) return settled(held.host.alive ? held : null);
    held?.host.destroy();
    this.#current = null;
    if (this.#failures >= HOST_FAILURES) return settled(null);
    return this.#starting = this.#work(this.#start().finally(() => { this.#starting = null; }), !this.#slowStart);
  }

  async #start(): Promise<Started | null> {
    try {
      this.#data ??= await this.#deps.data();
      const host = await this.#deps.start();
      host.onDeath(reason => {
        this.#failures++;
        this.#deps.report('the effect host', new Error(reason));
        this.#owner?.died();
      });
      return this.#current = { host, loads: new Map(), loaded: new Set() };
    } catch (error) {
      this.#failures++;
      this.#deps.report('Ruffle', error);
      return null;
    }
  }
}
