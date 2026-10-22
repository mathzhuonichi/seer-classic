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
}

export interface SkillEffectStage {
  /** Starts loading these skills' effects. */
  prepare(skillIds: readonly number[]): void;
  /**
   * Plays a loaded skill's effect now, or holds its middle frame (`still`), until the returned function stops it or it ends.
   * `missing` runs instead when it cannot start, and later when the page is hidden or the host dies while it plays.
   */
  play(skillId: number, at: SkillEffectPlacement, still: boolean, missing: () => void): () => void;
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

/** The skills of every creature in a battle, on both sides: the effects its loading screen loads. */
export function battleSkillIds(battle: Pick<BattleView, 'player' | 'enemy' | 'party' | 'enemyParty'>) {
  const monsters = [battle.player, battle.enemy, ...battle.party, ...battle.enemyParty];
  return [...new Set(monsters.flatMap(monster => monster.skills.map(skill => skill.id)))];
}

/** A started host and the effects asked of it. */
interface Started { host: SkillEffectHost; loads: Map<number, Promise<boolean>>; loaded: Set<number> }

/**
 * The page's host and the battle screens that borrow it. A loading screen (prepare) starts the host, or replaces one that died
 * or would hold more than RECYCLE_EFFECTS, and loads its battle's effects; between battles the host waits in its parking place,
 * suspended. A battle screen's stage takes it into its arena layer and gives it back. Effects are timed only while they can play.
 */
export class SkillEffectSession {
  readonly #deps: SessionDeps;
  #data: SkillEffectData | null = null;
  #current: Started | null = null;
  #starting: Promise<Started | null> | null = null;
  #failures = 0;
  #preparing = 0;
  /** The battle screen holding the host, and what it does when the host dies. */
  #owner: { died(): void } | null = null;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  /** Behind a loading screen: makes sure that a host runs and holds these skills' effects. Never rejects. */
  async prepare(skillIds: readonly number[]) {
    const started = await this.#hostFor(skillIds);
    if (!started) return;
    // A suspended host does not load: it runs, out of sight, until the loads are in or a battle screen takes it.
    this.#preparing++;
    started.host.resume();
    await Promise.all(skillIds.map(skillId => this.#load(started, skillId)));
    if (--this.#preparing === 0 && !this.#owner && this.#current === started) started.host.suspend();
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
    if (this.#starting) void this.#starting.then(take);
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

  #load(started: Started, skillId: number) {
    const data = this.#data, row = data?.effects[skillId];
    if (!data || !row) return Promise.resolve(false);
    let loading = started.loads.get(skillId);
    if (!loading) {
      loading = started.host.load(String(skillId), this.#deps.url(data.path, skillId, row[1])).then(() => {
        started.loaded.add(skillId);
        return true;
      }, error => {
        if (started.host.alive) this.#deps.report(`skill ${skillId}`, error);
        return false;
      });
      started.loads.set(skillId, loading);
    }
    return loading;
  }

  /** The host for a loading screen's skills: the running one, or a new one in place of none, a dead one or one that would be too full. */
  #hostFor(skillIds: readonly number[]): Promise<Started | null> {
    if (this.#starting) return this.#starting;
    const held = this.#current, adding = held ? skillIds.filter(id => this.#data?.effects[id] && !held.loads.has(id)).length : 0;
    // A host a battle screen holds is never replaced; a dead one waits for a loading screen without a battle.
    const keep = held && (this.#owner || held.host.alive && (!adding || held.loads.size + adding <= RECYCLE_EFFECTS));
    if (keep) return Promise.resolve(held.host.alive ? held : null);
    held?.host.destroy();
    this.#current = null;
    if (this.#failures >= HOST_FAILURES) return Promise.resolve(null);
    this.#starting = this.#start().finally(() => { this.#starting = null; });
    return this.#starting;
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
