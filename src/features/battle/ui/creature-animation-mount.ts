// Imperative lifecycle of one combatant's original clip: WebGL renderer, player, clock and context loss.
import type {SwfPlayer} from '@seer-pet-anim/swf-renderer';
import type {Container, WebGLRenderer} from 'pixi.js';
import {originalAction, retainBattleAnimation, type PreparedBattleAnimation, type RetainedBattleAnimation} from '../battle-animation.ts';
import {battleRuntimeClock} from '../battle-runtime-clock.ts';
import {
  canvasMargins, fixedAnimationTransform, standbyMeshBounds, visibleStandbyBounds, type AnimationBounds, type CanvasMargins,
} from '../battle-animation-registration.ts';
import {OPEN_ROOM, containPath, type SequencePath} from '../battle-animation-path.ts';
import {clipAtlasBytes} from '../battle-offline-clip.ts';
import {getDisplayResolution, observeDisplayResolution} from '../../../shared/display-resolution.ts';
import {prefersReducedMotion} from '../../../shared/ui/reduced-motion.ts';

type Clock = Pick<typeof battleRuntimeClock, 'attach' | 'recovered'>;
type ClockDriver = ReturnType<Clock['attach']>;
interface Renderer {SwfPlayer: typeof SwfPlayer; WebGLRenderer: typeof WebGLRenderer; Container: typeof Container}
type Graphics = ReturnType<typeof createGraphics>;

/** The clip pool, frame clock and renderer modules this lifecycle drives. */
export interface CreatureAnimationDeps {
  retain: (species: number) => RetainedBattleAnimation;
  clock: Clock;
  loadRenderer: () => Promise<Renderer>;
}

/** A box in viewport pixels. */
export interface ViewportBox {left: number; right: number; top: number; bottom: number}

export interface CreatureAnimationOptions {
  species: number;
  /** Share of the creature box that the largest side of the first standby pose fills; the portrait fallback has the same. */
  extent: number;
  /** The box a move must keep the creature inside (the arena, which clips it), read at each layout; null: no limit. */
  room?: () => ViewportBox | null;
  /** The host is drawn mirrored (the opponent's side), so the clip's forward points left on screen. */
  mirrored?: boolean;
  /** The motion to show, read whenever playback restarts. */
  motion: () => {kind: string; resting: boolean};
  onReady: (ready: boolean) => void;
  /** After a lost context: whether one more remount is allowed, and the request for it. */
  allowRecovery: () => boolean;
  remount: () => void;
}

export interface CreatureAnimation {
  /** Restart playback for the current motion. */
  play(): void;
  dispose(): void;
}

/** A lost context that is not restored by then is recovered by remounting. */
const CONTEXT_RETRY_MS = 1000;
/** Remounts allowed after lost contexts while one species is shown. */
const CONTEXT_RECOVERIES = 2;

/** Remount allowance of one owner; showing another species starts it afresh. */
export class RecoveryBudget {
  private species: number | undefined;
  private attempts = 0;
  /** Note the species the owner shows now. */
  track(species: number) {
    if (species === this.species) return;
    this.species = species;
    this.attempts = 0;
  }
  /** Spend one remount; false once spent, or when the owner has moved on to another species. */
  take(species: number) {
    if (species !== this.species || this.attempts >= CONTEXT_RECOVERIES) return false;
    this.attempts++;
    return true;
  }
}

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
const NO_MARGINS: CanvasMargins = {left: 0, right: 0, top: 0, bottom: 0};
const UNLIMITED = {x: Infinity, y: Infinity};

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

/** A player that draws through the shared graphics, places each frame first, and releases the graphics with itself. */
function createPlayer(runtime: Renderer, graphics: Graphics, place: () => void): SwfPlayer {
  // The public embedding API keeps the source player and uploaded atlas alive on density changes.
  class BattlePlayer extends runtime.SwfPlayer {
    private hostDisposed = false;
    override getCanvas() { return graphics.canvas; }
    override draw() {
      if (this.hostDisposed) return;
      place();
      graphics.renderer.render({container: graphics.stage});
    }
    override destroy() {
      if (this.hostDisposed) return;
      this.hostDisposed = true;
      try { super.destroy(); } finally { graphics.release(); }
    }
  }
  return new BattlePlayer();
}

/** Calibrate registration on the first visible standby pose; fall back to the standby mesh extent. */
function registrationBounds(player: SwfPlayer, host: HTMLElement, mesh: AnimationBounds): AnimationBounds {
  const {width, height} = hostSize(host);
  let visible: AnimationBounds | null = null;
  try { if (width > 0 && height > 0) visible = visibleStandbyBounds(player, mesh, width, height); } catch { visible = null; }
  host.dataset.registration = visible ? 'visible-alpha' : 'standby-mesh';
  return visible ?? mesh;
}

/** How far beyond the host a canvas can still be seen: the host's largest distance to a viewport edge on each axis, in host pixels. */
function visibleReach(host: HTMLElement) {
  const rect = host.getBoundingClientRect(), zoom = rect.width / host.clientWidth || 1;
  return {x: Math.max(rect.left, window.innerWidth - rect.right, 0) / zoom, y: Math.max(rect.top, window.innerHeight - rect.bottom, 0) / zoom};
}

/** The margins the playing sequence's extent `reach` needs beyond the host, within what can be seen; none while it stays inside. */
function sequenceMargins(host: HTMLElement, reach: AnimationBounds | undefined, transform: ReturnType<typeof fixedAnimationTransform>) {
  if (!reach) return NO_MARGINS;
  const {width, height} = hostSize(host), needed = canvasMargins(reach, transform, width, height, UNLIMITED);
  if (!needed.left && !needed.right && !needed.top && !needed.bottom) return NO_MARGINS;
  return canvasMargins(reach, transform, width, height, visibleReach(host));
}

/** The playing sequence's path, the standby extent it travels from, and the room it must stay in. */
interface Travel {path: SequencePath; home: AnimationBounds; room: ViewportBox | null; mirrored: boolean}
/** The clip's place in its canvas: the fixed registration, and each frame's offset from it (canvas pixels). */
interface Placement {position: {x: number; y: number}; scale: {x: number; y: number}; offsets: readonly {x: number; y: number}[]}

/** `room`, as far as it lies in the viewport, in the clip's mesh units (x forward, y up) under `transform`. */
function roomInMesh(host: HTMLElement, room: ViewportBox, mirrored: boolean, transform: ReturnType<typeof fixedAnimationTransform>): AnimationBounds {
  const rect = host.getBoundingClientRect(), zoom = rect.width / host.clientWidth || 1;
  const left = Math.max(room.left, 0), right = Math.min(room.right, window.innerWidth);
  const top = Math.max(room.top, 0), bottom = Math.min(room.bottom, window.innerHeight);
  const meshX = (x: number) => ((mirrored ? rect.right - x : x - rect.left) / zoom - transform.position.x) / transform.scale.x;
  const meshY = (y: number) => ((y - rect.top) / zoom - transform.position.y) / transform.scale.y;
  const xs = [meshX(left), meshX(right)], ys = [meshY(top), meshY(bottom)];
  return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
}

/**
 * Match the renderer to the host's layout size and density, widened by the margins the playing sequence reaches into (a
 * move travels to the opponent) once its travel is kept inside the room, and place the clip at its fixed registration. The
 * canvas is positioned around the host. Returns the placement, or null while the host has no size.
 */
function fitToHost(host: HTMLElement, renderer: WebGLRenderer, player: SwfPlayer, bounds: AnimationBounds, extent: number,
  travel?: Travel): Placement | null {
  const {width, height} = hostSize(host);
  if (width <= 0 || height <= 0) return null;
  const resolution = getDisplayResolution(host);
  const transform = fixedAnimationTransform(bounds, width, height, extent);
  const room = travel?.room ? roomInMesh(host, travel.room, travel.mirrored, transform) : OPEN_ROOM;
  const contained = travel && containPath(travel.path, travel.home, room), margins = sequenceMargins(host, contained?.bounds, transform);
  const canvasWidth = width + margins.left + margins.right, canvasHeight = height + margins.top + margins.bottom;
  if (renderer.screen.width !== canvasWidth || renderer.screen.height !== canvasHeight || renderer.resolution !== resolution) {
    renderer.resize(canvasWidth, canvasHeight, resolution);
  }
  Object.assign(player.getCanvas().style, {left: `${-margins.left}px`, top: `${-margins.top}px`, width: `${canvasWidth}px`, height: `${canvasHeight}px`});
  const {scale} = transform, offsets = contained?.offsets.map(offset => ({x: offset.x * scale.x, y: offset.y * scale.y})) ?? [];
  return {position: {x: transform.position.x + margins.left, y: transform.position.y + margins.top}, scale, offsets};
}

class CreatureAnimationMount implements CreatureAnimation {
  private readonly retained: RetainedBattleAnimation;
  private readonly abort = new AbortController();
  private cancelled = false;
  private recovering = false;
  private retried = false;
  private contextLost = false;
  /** Created objects, disposed on release; `live` is set once the clip is mounted and playing. */
  private owned: SwfPlayer | null = null;
  private ownedDriver: ClockDriver | null = null;
  private live: {player: SwfPlayer; driver: ClockDriver} | null = null;
  /** Each sequence's path, the playing one, and where the clip and each of its frames sit in the canvas. */
  private paths: ReadonlyMap<string, SequencePath> = new Map();
  private sequence: string | undefined;
  private placement: Placement | null = null;
  private layout = () => {};
  private canvas: HTMLCanvasElement | undefined;
  private observer: ResizeObserver | undefined;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private stopResolution = () => {};
  private releaseGraphics = () => {};

  constructor(private readonly host: HTMLElement, private readonly options: CreatureAnimationOptions, private readonly deps: CreatureAnimationDeps) {
    this.retained = deps.retain(options.species);
    options.onReady(false);
    void this.mount().catch(error => {
      if (!this.cancelled) console.warn(`Battle animation unavailable for species ${options.species}:`, error);
      this.detach();
      this.release(false);
    });
  }

  play() {
    if (!this.live || this.contextLost) return;
    const {player, driver} = this.live, {kind, resting} = this.options.motion();
    const action = originalAction(kind), selected = player.getSequences().some(s => s.name === action) ? action : 'standby';
    const active = !prefersReducedMotion() && (selected !== 'standby' || resting);
    player.playSequence(selected, {loop: selected === 'standby'});
    if (!active) player.pause();
    driver.running(active);
    this.sequence = selected;
    this.layout();
  }

  dispose() {
    this.cancelled = true;
    this.abort.abort();
    clearTimeout(this.recoveryTimer);
    this.detach();
    this.release(this.recovering);
  }

  private readonly retry = () => {
    if (this.cancelled || this.retried || !this.options.allowRecovery()) return;
    this.retried = true;
    this.recovering = true;
    clearTimeout(this.recoveryTimer);
    this.deps.clock.recovered();
    this.options.remount();
  };

  private readonly lost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.recovering = true;
    this.options.onReady(false);
    this.ownedDriver?.running(false);
    this.owned?.pause();
    this.recoveryTimer = setTimeout(this.retry, CONTEXT_RETRY_MS);
  };

  private readonly restored = () => this.retry();

  /** Before each draw: the playing frame at the registration plus its own offset. */
  private readonly place = () => {
    const placement = this.placement, player = this.live?.player;
    if (!placement || !player) return;
    const offset = placement.offsets[player.getFrameIndex()], {position} = placement;
    player.setFixedTransform(offset ? {x: position.x + offset.x, y: position.y + offset.y} : position, placement.scale);
  };

  private detach() {
    this.observer?.disconnect();
    this.stopResolution();
    this.canvas?.removeEventListener('webglcontextlost', this.lost);
    this.canvas?.removeEventListener('webglcontextrestored', this.restored);
    this.live = null;
  }

  private release(warm: boolean) {
    runEach(
      () => { const driver = this.ownedDriver; this.ownedDriver = null; driver?.destroy(); },
      () => { const player = this.owned; this.owned = null; player?.destroy(); },
      () => this.releaseGraphics(),
      () => this.retained.release({warm}),
    );
  }

  private async mount() {
    const [prepared, runtime] = await Promise.all([this.retained.prepareForMount(), this.deps.loadRenderer()]);
    if (this.cancelled || !prepared) return;
    const graphics = createGraphics(runtime, this.host);
    this.releaseGraphics = graphics.release;
    if (!await graphics.init() || this.cancelled) { graphics.release(); return; }
    const player = this.owned = createPlayer(runtime, graphics, this.place);
    this.host.appendChild(player.getCanvas());
    // mountInto is always manual/fixed; only the runtime clock advances and draws it.
    await player.mountInto(graphics.stage, graphics.renderer, prepared.clip, {transparent: true, signal: this.abort.signal,
      releaseAtlasAfterSplit: prepared.releasePixelsAfterUpload, releaseAtlasAfterUpload: prepared.releasePixelsAfterUpload});
    if (this.cancelled) { this.owned = null; player.destroy(); return; }
    this.start(graphics, player, prepared);
  }

  /** Hand the mounted player to the clock, calibrate it, follow the host's size and start playing. */
  private start(graphics: Graphics, player: SwfPlayer, prepared: PreparedBattleAnimation) {
    const host = this.host;
    graphics.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), getDisplayResolution(host));
    this.retained.uploaded();
    const canvas = this.canvas = player.getCanvas();
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
    const onDrawError = () => this.lost(new Event('webglcontextlost', {cancelable: true}));
    const driver = this.ownedDriver = this.deps.clock.attach(player, onDrawError, clipAtlasBytes(prepared.clip));
    const home = standbyMeshBounds(prepared.clip), bounds = registrationBounds(player, host, home);
    this.paths = prepared.paths;
    const layout = this.layout = () => {
      if (!this.live || this.contextLost) return;
      const {room, mirrored = false, extent} = this.options, path = this.sequence === undefined ? undefined : this.paths.get(this.sequence);
      this.placement = fitToHost(host, graphics.renderer, player, bounds, extent, path && {path, home, room: room?.() ?? null, mirrored});
      driver.draw();
    };
    this.live = {player, driver};
    layout();
    this.observer = new ResizeObserver(layout);
    this.observer.observe(host);
    this.stopResolution = observeDisplayResolution(host, layout);
    this.play();
    if (!this.contextLost) this.options.onReady(true);
  }
}

/** Mount the clip into `host`. The portrait stays visible until `onReady(true)`. */
export function mountCreatureAnimation(host: HTMLElement, options: CreatureAnimationOptions, deps: CreatureAnimationDeps = browserDeps): CreatureAnimation {
  return new CreatureAnimationMount(host, options, deps);
}
