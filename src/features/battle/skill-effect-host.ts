// Ruffle and the skill-effect host SWF (tools/assets/skill-effect-host/FxHost.as). One player runs the host, which plays
// every effect of a stage; JS calls its ExternalInterface callbacks and it answers with trace() lines ("fx|<kind>|...").
import ruffle from '@ruffle-rs/ruffle/package.json';
import hostSwf from './skill-effect-host.swf?url&no-inline';
import type { SkillEffectPlacement } from './skill-effect-placement.ts';

/** The part of Ruffle's player API (PlayerV1) the host uses. */
interface RufflePlayer {
  load(options: Record<string, unknown>): Promise<void>;
  volume: number;
  traceObserver: ((message: string) => void) | null;
  callExternalInterface(name: string, ...args: unknown[]): unknown;
}
interface RuffleElement extends HTMLElement { ruffle(): RufflePlayer }
export interface RuffleSource { createPlayer(): RuffleElement }
declare global {
  interface Window { RufflePlayer?: { config?: Record<string, unknown>; newest?(): RuffleSource | null } }
}

const RUFFLE_PATH = `${import.meta.env.BASE_URL}ruffle/`;
/** A host that has neither started nor failed by then never will. */
const HOST_START_TIMEOUT_MS = 20_000;
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

/** Ruffle's self-hosted script, once per page. It is configured first, so it never scans the page for Flash embeds. */
export function loadRuffle(): Promise<RuffleSource> {
  script ??= new Promise((resolve, reject) => {
    window.RufflePlayer = { ...window.RufflePlayer, config: { polyfills: false, publicPath: RUFFLE_PATH } };
    const element = document.createElement('script');
    element.src = `${RUFFLE_PATH}ruffle.js?v=${ruffle.version}`;
    element.onload = () => {
      const source = window.RufflePlayer?.newest?.();
      if (source) resolve(source);
      else reject(new Error('Ruffle did not register'));
    };
    element.onerror = () => reject(new Error('Ruffle could not be loaded'));
    document.head.append(element);
  });
  return script;
}

export interface SkillEffectHost {
  /** The host stage's frame rate, at which every effect plays. */
  readonly fps: number;
  /** Loads one skill SWF; resolves once it can play. */
  load(key: string, url: string): Promise<void>;
  /** Places a loaded effect, playing or holding frame `still` (> 0); null when the host cannot. */
  play(key: string, at: SkillEffectPlacement, still: number): number | null;
  stop(id: number): void;
  /** Removes the player: nothing loads or plays afterwards. */
  destroy(): void;
}

type Pending = { resolve(): void; reject(error: Error): void };

/** The host's trace() lines: ready with its frame rate, and each load's outcome. */
function hostLines(loads: Map<string, Pending>, ready: (fps: number) => void) {
  return (line: string) => {
    const [tag, kind, key, ...reason] = String(line).split('|');
    if (tag !== 'fx') return;
    if (kind === 'ready') ready(Number(key));
    else if (kind === 'loaded') loads.get(key)?.resolve();
    else if (kind === 'error') loads.get(key)?.reject(new Error(`skill effect ${key}: ${reason.join('|')}`));
  };
}

/** Starts a host player in `container` and resolves once the host runs; until then, and after a failure, nothing shows. */
export async function startSkillEffectHost(source: RuffleSource, container: HTMLElement): Promise<SkillEffectHost> {
  const element = source.createPlayer(), loads = new Map<string, Pending>();
  element.style.visibility = 'hidden';
  container.append(element);
  let ready = (_fps: number) => {}, timer = 0;
  const started = new Promise<number>((resolve, reject) => {
    ready = resolve;
    timer = window.setTimeout(() => reject(new Error('the skill-effect host did not start')), HOST_START_TIMEOUT_MS);
  });
  // A timeout while Ruffle is still loading is handled where `started` is awaited.
  started.catch(() => {});
  try {
    const player = element.ruffle();
    await player.load({ ...PLAYER_OPTIONS, url: new URL(hostSwf, document.baseURI).href });
    player.volume = 0;
    player.traceObserver = hostLines(loads, ready);
    const fps = await started;
    element.style.visibility = '';
    return hostApi(element, player, loads, fps);
  } catch (error) {
    element.remove();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hostApi(element: RuffleElement, player: RufflePlayer, loads: Map<string, Pending>, fps: number): SkillEffectHost {
  return {
    fps,
    load(key, url) {
      return new Promise((resolve, reject) => {
        loads.set(key, { resolve, reject });
        if (player.callExternalInterface('fxLoad', key, url) !== true) reject(new Error(`skill effect ${key}: the host did not take it`));
      });
    },
    play(key, at, still) {
      const id = player.callExternalInterface('fxPlay', key, at.x, at.y, at.scaleX, at.scaleY, still);
      if (typeof id === 'number' && id > 0) return id;
      // A host that no longer answers has stopped (a Ruffle panic shows its own message in the player): keep it out of sight.
      if (id === undefined || id === null) element.style.visibility = 'hidden';
      return null;
    },
    stop(id) {
      player.callExternalInterface('fxStop', id);
    },
    destroy() {
      loads.clear();
      element.remove();
    },
  };
}
