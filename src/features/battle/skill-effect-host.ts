// Ruffle and the skill-effect host SWF (tools/assets/skill-effect-host/FxHost.as). One player runs the host, which plays
// every effect of the page; JS calls its ExternalInterface callbacks and it answers with trace() lines ("fx|<kind>|...").
import ruffle from '@ruffle-rs/ruffle/package.json';
import hostSwf from './skill-effect-host.swf?url&no-inline';
import type { SkillEffectPlacement } from './skill-effect-placement.ts';

/** The part of Ruffle's player API (PlayerV1) the host uses. */
interface RufflePlayer {
  load(options: Record<string, unknown>): Promise<void>;
  /** Stops the player's frames until resume(): it neither plays nor loads meanwhile. */
  suspend(): void;
  resume(): void;
  volume: number;
  traceObserver: ((message: string) => void) | null;
  callExternalInterface(name: string, ...args: unknown[]): unknown;
}
/** Ruffle's player element; its disconnectedCallback ends its instance. */
interface RuffleElement extends HTMLElement { ruffle(): RufflePlayer; disconnectedCallback(): void }
export interface RuffleSource { createPlayer(): RuffleElement }
declare global {
  interface Window { RufflePlayer?: { config?: Record<string, unknown>; newest?(): RuffleSource | null } }
}

const RUFFLE_PATH = `${import.meta.env.BASE_URL}ruffle/`;
/** The host's player element (keptPlayer). */
const PLAYER_TAG = 'seer-skill-effect-player';
/**
 * A host that has neither started nor failed by then never will: a request for Ruffle's script, its WebAssembly or the host SWF
 * that never answers would otherwise hold its start forever.
 */
const HOST_START_TIMEOUT_MS = 20_000;
/** Ruffle's pause() (the host's suspend) shows its play button over the movie; the host never shows it. */
const HIDDEN_UI = '#play-button{display:none!important}';
/**
 * The host draws on a transparent canvas, takes no input, shows none of Ruffle's own UI and is silent (the skill SWFs have no
 * sound). Only the wgpu-webgl renderer draws the blur and glow filters that 1,053 effects use.
 */
const PLAYER_OPTIONS = {
  allowScriptAccess: true, autoplay: 'on', backgroundColor: null, contextMenu: 'off', letterbox: 'off', logLevel: 'error', menu: false,
  openUrlMode: 'deny', polyfills: false, preferredRenderer: 'wgpu-webgl', quality: 'high', salign: 'TL', scale: 'noScale',
  splashScreen: false, unmuteOverlay: 'hidden', warnOnUnsupportedContent: false, wmode: 'transparent',
};

let script: Promise<RuffleSource> | null = null;

/**
 * Ruffle's self-hosted script, once per page (a load that failed, or neither loaded nor failed within HOST_START_TIMEOUT_MS, is
 * tried again on the next call). It is configured first, so it never scans the page for Flash embeds.
 */
function loadRuffle(): Promise<RuffleSource> {
  script ??= new Promise((resolve, reject) => {
    window.RufflePlayer = { ...window.RufflePlayer, config: { polyfills: false, publicPath: RUFFLE_PATH } };
    const element = document.createElement('script');
    const fail = (message: string) => {
      clearTimeout(timer);
      element.remove();
      script = null;
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('Ruffle did not load in time'), HOST_START_TIMEOUT_MS);
    element.src = `${RUFFLE_PATH}ruffle.js?v=${ruffle.version}`;
    element.onload = () => {
      clearTimeout(timer);
      const source = window.RufflePlayer?.newest?.();
      if (source) resolve(source);
      else fail('Ruffle did not register');
    };
    element.onerror = () => fail('Ruffle could not be loaded');
    document.head.append(element);
  });
  return script;
}

export interface SkillEffectHost {
  /** The host stage's frame rate, at which every effect plays. */
  readonly fps: number;
  /** False once the host has died or was destroyed: nothing loads or plays on it again. */
  readonly alive: boolean;
  /** Whether the host still answers; one that does not has died. */
  ping(): boolean;
  /** Calls `listener` when the host dies: it stopped answering, Ruffle reloaded or panicked, or its WebGL context was lost. */
  onDeath(listener: (reason: string) => void): void;
  /** Moves the player into `container`, whose box sizes its canvas, keeping its instance, its loaded effects and its WebGL context. */
  moveTo(container: HTMLElement): void;
  /** Stops the host's frames (nothing plays or loads) until resume(), also when the page is hidden and shown meanwhile. */
  suspend(): void;
  resume(): void;
  /** Loads one skill SWF; resolves once it can play. */
  load(key: string, url: string): Promise<void>;
  /** Places a loaded effect, playing or holding frame `still` (> 0); null when the host cannot. */
  play(key: string, at: SkillEffectPlacement, still: number): number | null;
  stop(id: number): void;
  /** Ends the player: nothing loads or plays afterwards. */
  destroy(): void;
}

type Pending = { resolve(): void; reject(error: Error): void };

/** The host's trace() lines: ready with its frame rate, each load's outcome, and a second ready when Ruffle reloaded the movie. */
function hostLines(loads: Map<string, Pending>, ready: (fps: number) => void, reloaded: () => void) {
  let readies = 0;
  return (line: string) => {
    const [tag, kind, key, ...reason] = String(line).split('|');
    if (tag !== 'fx') return;
    if (kind === 'ready') {
      if (readies++) reloaded();
      else ready(Number(key));
    } else if (kind === 'loaded') loads.get(key)?.resolve();
    else if (kind === 'error') loads.get(key)?.reject(new Error(`skill effect ${key}: ${reason.join('|')}`));
  };
}

/** The host's player: Ruffle's element, kept alive outside the document until end(). */
interface KeptPlayer extends RuffleElement {
  /** Ends the Ruffle instance and removes the element. */
  end(): void;
}

/**
 * Ruffle 0.7.1's player element ends its instance in disconnectedCallback, so it could neither move between battle screens nor
 * wait between them. The host's player is a subclass of Ruffle's element class, which Ruffle defines on its first createPlayer(),
 * under its own tag: it keeps its instance when it leaves the document, and moveBefore() (Chrome) moves it with only a
 * connectedMoveCallback. Its instance ends with end().
 */
function keptPlayer(source: RuffleSource): KeptPlayer {
  if (!customElements.get(PLAYER_TAG)) {
    const Base = customElements.get(source.createPlayer().localName) as (new () => RuffleElement) | undefined;
    if (!Base) throw new Error('Ruffle defined no player element');
    customElements.define(PLAYER_TAG, class extends Base implements KeptPlayer {
      kept = true;
      disconnectedCallback() { if (!this.kept) super.disconnectedCallback(); }
      connectedMoveCallback() {}
      end() {
        this.kept = false;
        if (this.isConnected) this.remove();
        else super.disconnectedCallback();
      }
    });
  }
  return document.createElement(PLAYER_TAG) as KeptPlayer;
}

/** Moves the player with moveBefore() where the engine has it (Chrome), else with a plain append (WebKit); it is kept either way. */
function moveInto(element: HTMLElement, container: HTMLElement) {
  if (element.parentElement === container) return;
  const move = (container as { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  if (move && element.isConnected && container.isConnected) {
    try {
      move.call(container, element, null);
      return;
    } catch {
      // A move that moveBefore does not allow: the append below does it.
    }
  }
  container.append(element);
}

/**
 * Starts a host player in `container` and resolves once the host runs; until then, and after a failure, nothing shows. It rejects
 * when Ruffle cannot start it, or has not within HOST_START_TIMEOUT_MS.
 */
export async function startSkillEffectHost(container: HTMLElement): Promise<SkillEffectHost> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('the skill-effect host did not start in time')), HOST_START_TIMEOUT_MS);
  });
  // Each step races the timeout; a timeout that no step is waiting for is not unhandled.
  timeout.catch(() => {});
  const inTime = <T>(step: Promise<T>) => Promise.race([step, timeout]);
  try {
    return await startPlayer(await inTime(loadRuffle()), container, inTime);
  } finally {
    clearTimeout(timer);
  }
}

async function startPlayer(source: RuffleSource, container: HTMLElement, inTime: <T>(step: Promise<T>) => Promise<T>) {
  const element = keptPlayer(source), loads = new Map<string, Pending>();
  // The player fills its container, whose box sizes its canvas: the arena in a battle, 1x1 px while it waits.
  element.style.cssText = 'display:block;width:100%;height:100%;visibility:hidden';
  element.shadowRoot?.append(Object.assign(document.createElement('style'), { textContent: HIDDEN_UI }));
  container.append(element);
  let ready = (_fps: number) => {}, host: ReturnType<typeof hostApi> | null = null, loading: Promise<void> | null = null;
  const started = new Promise<number>(resolve => { ready = resolve; });
  try {
    const player = element.ruffle();
    loading = player.load({ ...PLAYER_OPTIONS, url: new URL(hostSwf, document.baseURI).href });
    await inTime(loading);
    player.volume = 0;
    player.traceObserver = hostLines(loads, ready, () => host?.die('Ruffle reloaded it'));
    const fps = await inTime(started);
    element.style.visibility = '';
    return host = hostApi(element, player, loads, fps);
  } catch (error) {
    element.end();
    // A load that ends after the timeout has built an instance into the ended element: that one ends too.
    void loading?.then(() => element.end(), () => {});
    throw error;
  }
}

/**
 * The running host. It dies when it stops answering (an ExternalInterface call returns nothing or throws), when Ruffle reloads
 * the movie, panics (its #panic screen) or loses its WebGL context (Chrome does that silently: the host would answer and draw
 * nothing). A dead host ends at once, so that Ruffle neither reloads it nor paints its panic screen over the arena.
 */
function hostApi(element: KeptPlayer, player: RufflePlayer, loads: Map<string, Pending>, fps: number) {
  let alive = true, suspended = false;
  const listeners: ((reason: string) => void)[] = [], canvas = element.shadowRoot?.querySelector('canvas');
  const panic = new MutationObserver(() => { if (element.shadowRoot?.getElementById('panic')) die('Ruffle panicked'); });
  const lost = () => die('its WebGL context was lost');
  // Ruffle's own handler, which runs first, plays the movie again when the page shows if it played when the page was hidden:
  // a host suspended meanwhile (given back to its parking place while hidden) is suspended again.
  const shown = () => { if (suspended && !document.hidden) player.suspend(); };
  const end = () => {
    alive = false;
    panic.disconnect();
    canvas?.removeEventListener('webglcontextlost', lost);
    document.removeEventListener('visibilitychange', shown);
    for (const pending of loads.values()) pending.reject(new Error('the skill-effect host ended'));
    loads.clear();
    element.end();
  };
  function die(reason: string) {
    if (!alive) return;
    end();
    for (const listener of listeners.splice(0)) listener(reason);
  }
  if (element.shadowRoot) panic.observe(element.shadowRoot, { childList: true, subtree: true });
  canvas?.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', shown);
  const call = (name: string, ...args: unknown[]) => {
    if (!alive) return undefined;
    let answer: unknown;
    try {
      answer = player.callExternalInterface(name, ...args);
    } catch {
      answer = undefined;
    }
    if (answer === undefined || answer === null) die('it stopped answering');
    return answer;
  };
  return {
    fps,
    get alive() { return alive; },
    die,
    // No effect has id 0: a host that answers says it stopped nothing.
    ping: () => call('fxStop', 0) === false,
    onDeath: (listener: (reason: string) => void) => { listeners.push(listener); },
    moveTo: (container: HTMLElement) => moveInto(element, container),
    suspend: () => {
      if (!alive) return;
      suspended = true;
      player.suspend();
    },
    resume: () => {
      if (!alive) return;
      suspended = false;
      player.resume();
    },
    load: (key: string, url: string) => new Promise<void>((resolve, reject) => {
      loads.set(key, { resolve, reject });
      if (call('fxLoad', key, url) !== true) reject(new Error(`skill effect ${key}: the host did not take it`));
    }),
    play(key: string, at: SkillEffectPlacement, still: number) {
      const id = call('fxPlay', key, at.x, at.y, at.scaleX, at.scaleY, still);
      return typeof id === 'number' && id > 0 ? id : null;
    },
    stop: (id: number) => { call('fxStop', id); },
    destroy: () => { if (alive) end(); },
  } satisfies SkillEffectHost & { die(reason: string): void };
}
