/** Drive the production creature-animation lifecycle with controlled renderer, pool and clock failures. */
import assert from 'node:assert/strict';
import {suite, withSsr} from './_harness.mjs';

const browserGlobals = ['window', 'document', 'getComputedStyle', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
const saved = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

/** One scenario: a host element, browser stubs and the injected dependencies, all counting their calls. */
function scenario(options = {}) {
  const h = {...options, players: [], renderers: [], canvases: [], resizeObservers: [], mutationObservers: [], queries: [], raf: new Map(), nextFrame: 0,
    windowListeners: new Set(), leases: 0, releases: 0, uploads: 0, initCalls: 0, mountCalls: 0, plays: 0, alphaReads: 0, draws: 0, resizeCalls: 0,
    clockAttaches: 0, clockDestroys: 0, clockRecoveries: 0, playerDestroys: 0, rendererDestroys: 0, stageDestroys: 0, lostContexts: 0, ready: [], recoverRequests: 0};
  h.root = {parentElement: null, zoom: '1.5'};
  h.host = {parentElement: h.root, clientWidth: 170, clientHeight: 170, dataset: {}, appendChild(canvas) { canvas.parent = this; }};
  h.window = {devicePixelRatio: 2,
    matchMedia(media) {
      const query = {media, matches: false, listeners: new Set(), addEventListener(_type, fn) { this.listeners.add(fn); }, removeEventListener(_type, fn) { this.listeners.delete(fn); }};
      h.queries.push(query); return query;
    },
    addEventListener(_type, fn) { h.windowListeners.add(fn); }, removeEventListener(_type, fn) { h.windowListeners.delete(fn); }};
  class SwfPlayer {
    constructor() { h.players.push(this); this.frame = 0; }
    async mountInto() { h.mountCalls++; if (h.failMount) throw Error('mount failed'); }
    getSequences() { return [{name: 'standby'}, {name: 'attack'}]; }
    pause() {} setSequence() {} gotoFrame(frame) { this.frame = frame; }
    setFixedTransform(position, scale) { this.position = position; this.scale = scale; }
    playSequence() { h.plays++; this.frame = 0; }
    getFrameIndex() { return this.frame; }
    destroy() { h.playerDestroys++; if (h.failPlayerDestroy) throw Error('player destroy failed'); }
  }
  class WebGLRenderer {
    constructor() {
      h.renderers.push(this); this.screen = {width: 0, height: 0};
      this.gl = {RGBA: 1, UNSIGNED_BYTE: 2, getExtension: () => ({loseContext: () => h.lostContexts++}),
        readPixels: (_x, _y, w, height, _format, _type, pixels) => {
          h.alphaReads++;
          for (let y = Math.floor(height / 3); y < Math.floor(2 * height / 3); y++) for (let x = Math.floor(w / 3); x < Math.floor(2 * w / 3); x++) pixels[(y * w + x) * 4 + 3] = 255;
        }};
    }
    async init(init) {
      h.initCalls++; this.canvas = init.canvas; this.canvas.gl = this.gl;
      if (h.delayInit) await new Promise(resolve => { h.finishInit = resolve; });
      if (h.failInit) throw Error('init failed');
      this.resize(init.width, init.height, init.resolution);
    }
    resize(width, height, resolution) {
      this.screen = {width, height}; this.resolution = resolution;
      this.canvas.width = Math.round(width * resolution); this.canvas.height = Math.round(height * resolution); h.resizeCalls++;
    }
    render() { h.draws++; }
    destroy() { h.rendererDestroys++; if (h.failRendererDestroy) throw Error('renderer destroy failed'); }
  }
  class Container { destroy() { h.stageDestroys++; if (h.failStageDestroy) throw Error('stage destroy failed'); } }
  const clip = {atlasWidth: 512, atlasHeight: 512, sequences: [{name: 'standby', frames: [{mesh: {positions: [-1, -1, 1, 1]}}]}]};
  h.deps = {
    loadRenderer: async () => ({SwfPlayer, WebGLRenderer, Container}),
    retain() {
      let released = false; h.leases++;
      return {prepareForMount: async () => ({clip, releasePixelsAfterUpload: true}), uploaded() { h.uploads++; }, release(release) { if (!released) { released = true; h.releases++; h.warm = !!release?.warm; } }};
    },
    clock: {attach(player) { h.clockAttaches++; return {running(value) { h.running = value; }, draw() { player.draw(); }, destroy() { h.clockDestroys++; }}; }, recovered() { h.clockRecoveries++; }},
  };
  return h;
}

function install(h) {
  globalThis.window = h.window;
  globalThis.document = {createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = {width: 0, height: 0, style: {}, listeners: new Map(), getContext() { return this.gl; },
      addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); },
      remove() { this.removed = true; this.parent = null; }};
    h.canvases.push(canvas); return canvas;
  }};
  globalThis.getComputedStyle = element => ({zoom: element.zoom ?? '1'});
  globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; h.resizeObservers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; h.mutationObservers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  globalThis.requestAnimationFrame = fn => { const id = ++h.nextFrame; h.raf.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => h.raf.delete(id);
}
const flush = h => { const callbacks = [...h.raf.values()]; h.raf.clear(); for (const fn of callbacks) fn(0); };
async function waitFor(predicate) {
  for (let i = 0; i < 80; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw Error('Lifecycle did not settle');
}

try {
  await withSsr('battle-display-lifecycle', async load => {
    const {mountCreatureAnimation} = await load('/src/components/battle/creature-animation-mount.ts');
    const t = suite('battle-display-lifecycle');
    /** Mount species 6 mid-attack and return its dispose function. */
    const start = h => {
      install(h);
      const animation = mountCreatureAnimation(h.host, {species: 6, extent: .9, motion: () => ({kind: 'physical', resting: true}), onReady: ready => h.ready.push(ready), recover: () => { h.recoverRequests++; return !!h.grantRecovery; }}, h.deps);
      return () => animation.dispose();
    };
    const assertReleased = h => {
      assert.equal(h.releases, 1); assert.equal(h.stageDestroys, 1); assert.equal(h.rendererDestroys, 1);
      assert.equal(h.canvases[0].width, 0); assert.equal(h.canvases[0].height, 0); assert.equal(h.canvases[0].removed, true);
    };

    await t.checkAsync('DPR, zoom and size changes preserve the mounted player, source frame, uploaded atlas and registration', async () => {
      const h = scenario(), cleanup = start(h);
      await waitFor(() => h.plays === 1);
      assert.deepEqual(h.ready, [false, true]); assert.equal(h.host.dataset.registration, 'visible-alpha');
      assert.equal(h.renderers[0].resolution, 3); assert.equal(h.canvases[0].width, 510); h.players[0].frame = 11;
      h.root.zoom = '2'; h.mutationObservers[0].callback(); flush(h);
      assert.equal(h.renderers[0].resolution, 4); assert.equal(h.canvases[0].width, 680); assert.equal(h.players[0].frame, 11);
      h.window.devicePixelRatio = 1; for (const fn of h.queries.find(q => q.media.includes('resolution')).listeners) fn(); flush(h);
      assert.equal(h.renderers[0].resolution, 2); assert.equal(h.canvases[0].width, 340); assert.equal(h.players[0].frame, 11);
      h.host.clientWidth = 200; h.host.clientHeight = 200; h.resizeObservers[0].callback(); assert.equal(h.canvases[0].width, 400); assert.equal(h.players[0].frame, 11);
      assert.equal(h.players.length, 1); assert.equal(h.renderers.length, 1); assert.equal(h.mountCalls, 1); assert.equal(h.uploads, 1);
      assert.equal(h.alphaReads, 1); assert.equal(h.plays, 1); assert.equal(h.clockAttaches, 1);
      cleanup(); assertReleased(h); assert.equal(h.clockDestroys, 1); assert.equal(h.playerDestroys, 1); assert.equal(h.windowListeners.size, 0);
      assert.equal(h.resizeObservers[0].disconnected, true); assert.equal(h.mutationObservers[0].disconnected, true);
    });
    await t.checkAsync('Initialization failure releases graphics before a player exists', async () => {
      const h = scenario({failInit: true}), cleanup = start(h);
      await waitFor(() => h.releases === 1); assertReleased(h); assert.equal(h.players.length, 0); assert.equal(h.clockAttaches, 0);
      cleanup(); assertReleased(h);
    });
    await t.checkAsync('Unmount during initialization waits for initialization then disposes without mounting', async () => {
      const h = scenario({delayInit: true}), cleanup = start(h);
      await waitFor(() => h.initCalls === 1); cleanup(); assert.equal(h.rendererDestroys, 0);
      h.finishInit(); await waitFor(() => h.rendererDestroys === 1); assertReleased(h); assert.equal(h.players.length, 0);
    });
    await t.checkAsync('Rejected embedding disposes the player, renderer and retained clip', async () => {
      const h = scenario({failMount: true}), cleanup = start(h);
      await waitFor(() => h.releases === 1); assertReleased(h); assert.equal(h.playerDestroys, 1); assert.equal(h.clockAttaches, 0);
      cleanup(); assertReleased(h);
    });
    await t.checkAsync('A lost context shows the portrait, stops the clock and asks once for a remount', async () => {
      const h = scenario({grantRecovery: true}), cleanup = start(h);
      await waitFor(() => h.plays === 1);
      const canvas = h.canvases[0], resizes = h.resizeCalls;
      canvas.listeners.get('webglcontextlost')({preventDefault() { h.prevented = true; }});
      assert.equal(h.prevented, true); assert.equal(h.ready.at(-1), false); assert.equal(h.running, false);
      h.resizeObservers[0].callback(); assert.equal(h.resizeCalls, resizes, 'no layout on a lost context');
      canvas.listeners.get('webglcontextrestored')(); canvas.listeners.get('webglcontextrestored')();
      assert.equal(h.recoverRequests, 1); assert.equal(h.clockRecoveries, 1);
      cleanup(); assertReleased(h); assert.equal(h.warm, true, 'a recovering mount keeps its clip warm for the remount');
      assert.equal(canvas.listeners.size, 0);
    });
    await t.checkAsync('A declined recovery still releases the clip cold on unmount', async () => {
      const h = scenario(), cleanup = start(h);
      await waitFor(() => h.plays === 1);
      h.canvases[0].listeners.get('webglcontextrestored')();
      assert.equal(h.recoverRequests, 1); assert.equal(h.clockRecoveries, 0);
      cleanup(); assertReleased(h); assert.equal(h.warm, false);
    });
    for (const [flag, message] of [['failStageDestroy', 'stage destroy failed'], ['failRendererDestroy', 'renderer destroy failed'], ['failPlayerDestroy', 'player destroy failed']]) {
      await t.checkAsync(`${message}: subsequent cleanup still runs and the error remains visible`, async () => {
        const h = scenario(), stop = start(h);
        await waitFor(() => h.plays === 1); h[flag] = true;
        assert.throws(stop, new RegExp(message)); assertReleased(h); assert.equal(h.clockDestroys, 1); assert.equal(h.playerDestroys, 1);
        if (flag === 'failRendererDestroy') assert.equal(h.lostContexts, 1);
      });
    }
    t.finish({scope: 'Production creature-animation lifecycle with injected GPU, pool and clock boundaries; actual GPU rendering is verified separately.'});
  });
} finally {
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
