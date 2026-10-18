// Imperative lifecycle of one combatant's original clip: WebGL renderer, player, clock and context loss.
import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
import type {Container, WebGLRenderer} from 'pixi.js';
import {originalAction, retainBattleAnimation, type RetainedBattleAnimation} from '../../presentation/battle-animation.ts';
import {battleRuntimeClock} from '../../presentation/battle-runtime-clock.ts';
import {fixedAnimationTransform, standbyMeshBounds, visibleStandbyBounds, type AnimationBounds} from '../../presentation/battle-animation-registration.ts';
import {clipAtlasBytes} from '../../presentation/battle-offline-clip.ts';
import {getDisplayResolution, observeDisplayResolution} from '../../presentation/display-resolution.ts';
import {prefersReducedMotion} from './reduced-motion.ts';

type Clock = Pick<typeof battleRuntimeClock, 'attach' | 'recovered'>;
type ClockDriver = ReturnType<Clock['attach']>;
interface Renderer {SwfPlayer: typeof SwfPlayer; WebGLRenderer: typeof WebGLRenderer; Container: typeof Container}

/** The clip pool, frame clock and renderer modules this lifecycle drives. */
export interface CreatureAnimationDeps {
  retain: (species: number) => RetainedBattleAnimation;
  clock: Clock;
  loadRenderer: () => Promise<Renderer>;
}

export interface CreatureAnimationOptions {
  species: number;
  /** Silhouette extent of the creature's portrait, so the clip matches its size. */
  extent: number;
  /** The motion to show, read whenever playback restarts. */
  motion: () => {kind: string; resting: boolean};
  onReady: (ready: boolean) => void;
  /** After a lost context: ask the owner for a fresh mount; false when it declines. */
  recover: () => boolean;
}

export interface CreatureAnimation {
  /** Restart playback for the current motion. */
  play(): void;
  dispose(): void;
}

/** A lost context that is not restored by then is recovered by remounting. */
const CONTEXT_RETRY_MS = 1000;

const browserDeps: CreatureAnimationDeps = {
  retain: retainBattleAnimation,
  clock: battleRuntimeClock,
  async loadRenderer() {
    const [{SwfPlayer}, {WebGLRenderer, Container}] = await Promise.all([import('@seer-pet-anim/swf-renderer'), import('pixi.js')]);
    return {SwfPlayer, WebGLRenderer, Container};
  },
};

/** Run every step even when one throws, then rethrow the last error, as nested `finally` blocks would. */
function runEach(...steps: (() => void)[]) {
  let failure: {error: unknown} | undefined;
  for (const step of steps) {
    try { step(); } catch (error) { failure = {error}; }
  }
  if (failure) throw failure.error;
}

const hostSize = (host: HTMLElement) => ({width: host.clientWidth, height: host.clientHeight});

/** A transparent renderer on its own canvas. A release requested during `init` waits for it to settle. */
function createGraphics(runtime: Renderer, host: HTMLElement) {
  const renderer = new runtime.WebGLRenderer(), stage = new runtime.Container(), canvas = document.createElement('canvas');
  let initializing = false, released = false, releaseRequested = false;
  const release = () => {
    if (initializing) { releaseRequested = true; return; }
    if (released) return;
    released = true;
    runEach(
      () => stage.destroy({children: true}),
      () => {
        const gl = renderer.gl;
        try { renderer.destroy(true); } catch (error) { gl?.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
      },
      () => { canvas.remove(); canvas.width = 0; canvas.height = 0; },
    );
  };
  /** False when a release arrived while initializing; the caller then releases. */
  const init = async () => {
    const {width, height} = hostSize(host);
    initializing = true;
    try {
      await renderer.init({canvas, width: Math.max(1, width), height: Math.max(1, height), resolution: getDisplayResolution(host),
        autoDensity: true, background: 0, backgroundAlpha: 0, antialias: true, preferWebGLVersion: 2});
    } finally { initializing = false; }
    return !releaseRequested;
  };
  return {renderer, stage, canvas, init, release};
}

/** Calibrate registration on the first visible standby pose; fall back to the standby mesh extent. */
function registrationBounds(player: SwfPlayer, host: HTMLElement, mesh: AnimationBounds): AnimationBounds {
  const {width, height} = hostSize(host);
  let visible: AnimationBounds | null = null;
  try { if (width > 0 && height > 0) visible = visibleStandbyBounds(player, mesh, width, height); } catch { visible = null; }
  host.dataset.registration = visible ? 'visible-alpha' : 'standby-mesh';
  return visible ?? mesh;
}

/** Mount the clip into `host`. The portrait stays visible until `onReady(true)`. */
export function mountCreatureAnimation(host: HTMLElement, options: CreatureAnimationOptions, deps: CreatureAnimationDeps = browserDeps): CreatureAnimation {
  const {species, extent, motion, onReady, recover} = options;
  const retained = deps.retain(species), abort = new AbortController();
  let cancelled = false, recovering = false, retried = false, contextLost = false;
  let owned: SwfPlayer | null = null, ownedDriver: ClockDriver | null = null, live: {player: SwfPlayer; driver: ClockDriver} | null = null;
  let canvas: HTMLCanvasElement | undefined, observer: ResizeObserver | undefined, recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopResolution = () => {}, releaseGraphics = () => {};

  const retry = () => {
    if (cancelled || retried || !recover()) return;
    retried = true;
    recovering = true;
    clearTimeout(recoveryTimer);
    deps.clock.recovered();
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    recovering = true;
    onReady(false);
    ownedDriver?.running(false);
    owned?.pause();
    recoveryTimer = setTimeout(retry, CONTEXT_RETRY_MS);
  };
  const restored = () => retry();
  const detach = () => {
    observer?.disconnect();
    stopResolution();
    canvas?.removeEventListener('webglcontextlost', lost);
    canvas?.removeEventListener('webglcontextrestored', restored);
    live = null;
  };
  const release = (warm: boolean) => runEach(
    () => { const driver = ownedDriver; ownedDriver = null; driver?.destroy(); },
    () => { const player = owned; owned = null; player?.destroy(); },
    () => releaseGraphics(),
    () => retained.release({warm}),
  );

  function play() {
    if (!live || contextLost) return;
    const {player, driver} = live, {kind, resting} = motion();
    const action = originalAction(kind), selected = player.getSequences().some(s => s.name === action) ? action : 'standby';
    const active = !prefersReducedMotion() && (selected !== 'standby' || resting);
    player.playSequence(selected, {loop: selected === 'standby'});
    if (!active) player.pause();
    driver.running(active);
    driver.draw();
  }

  async function mount() {
    const [prepared, runtime] = await Promise.all([retained.prepareForMount(), deps.loadRenderer()]);
    if (cancelled || !prepared) return;
    const graphics = createGraphics(runtime, host);
    releaseGraphics = graphics.release;
    if (!await graphics.init() || cancelled) { graphics.release(); return; }
    // The public embedding API keeps the source player and uploaded atlas alive on density changes.
    class BattlePlayer extends runtime.SwfPlayer {
      private hostDisposed = false;
      override getCanvas() { return graphics.canvas; }
      override draw() { if (!this.hostDisposed) graphics.renderer.render({container: graphics.stage}); }
      override destroy() {
        if (this.hostDisposed) return;
        this.hostDisposed = true;
        try { super.destroy(); } finally { graphics.release(); }
      }
    }
    const player = owned = new BattlePlayer();
    host.appendChild(player.getCanvas());
    // mountInto is always manual/fixed; only the runtime clock advances and draws it.
    await player.mountInto(graphics.stage, graphics.renderer, prepared.clip, {transparent: true, signal: abort.signal,
      releaseAtlasAfterSplit: prepared.releasePixelsAfterUpload, releaseAtlasAfterUpload: prepared.releasePixelsAfterUpload});
    if (cancelled) { owned = null; player.destroy(); return; }
    graphics.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), getDisplayResolution(host));
    retained.uploaded();
    canvas = player.getCanvas();
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    const driver = ownedDriver = deps.clock.attach(player, () => lost(new Event('webglcontextlost', {cancelable: true})), clipAtlasBytes(prepared.clip));
    const bounds = registrationBounds(player, host, standbyMeshBounds(prepared.clip));
    const layout = () => {
      if (!owned || contextLost) return;
      const {width, height} = hostSize(host), {renderer} = graphics;
      if (width <= 0 || height <= 0) return;
      const resolution = getDisplayResolution(host);
      if (renderer.screen.width !== width || renderer.screen.height !== height || renderer.resolution !== resolution) renderer.resize(width, height, resolution);
      const transform = fixedAnimationTransform(bounds, width, height, extent);
      owned.setFixedTransform(transform.position, transform.scale);
      ownedDriver?.draw();
    };
    live = {player, driver};
    layout();
    observer = new ResizeObserver(layout);
    observer.observe(host);
    stopResolution = observeDisplayResolution(host, layout);
    play();
    if (!contextLost) onReady(true);
  }

  onReady(false);
  void mount().catch(error => {
    if (!cancelled) console.warn(`Battle animation unavailable for species ${species}:`, error);
    detach();
    release(false);
  });
  return {
    play,
    dispose() {
      cancelled = true;
      abort.abort();
      clearTimeout(recoveryTimer);
      detach();
      release(recovering);
    },
  };
}
