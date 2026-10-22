/** Drive the production creature-animation lifecycle with controlled renderer, pool and clock failures. */
import assert from 'node:assert/strict';
import {suite, withSsr} from './_harness.mjs';

const browserGlobals = ['window', 'document', 'getComputedStyle', 'ResizeObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
const saved = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

/** One scenario: a host element, browser stubs and the injected dependencies, all counting their calls. */
function scenario(options = {}) {
  const h = {...options, players: [], renderers: [], canvases: [], resizeObservers: [], mutationObservers: [], queries: [], raf: new Map(), nextFrame: 0,
    windowListeners: new Set(), leases: 0, releases: 0, uploads: 0, initCalls: 0, mountCalls: 0, plays: 0, alphaReads: 0, draws: 0, resizeCalls: 0,
    clockAttaches: 0, clockDestroys: 0, clockRecoveries: 0, playerDestroys: 0, rendererDestroys: 0, stageDestroys: 0, lostContexts: 0,
    ready: [], recoverRequests: 0, remounts: 0};
  h.root = {parentElement: null, zoom: '1.5'};
  h.host = {parentElement: h.root, clientWidth: 170, clientHeight: 170, dataset: {}, appendChild(canvas) { canvas.parent = this; }};
  h.window = {devicePixelRatio: 2,
    matchMedia(media) {
      const query = {media, matches: false, listeners: new Set(),
        addEventListener(_type, fn) { this.listeners.add(fn); }, removeEventListener(_type, fn) { this.listeners.delete(fn); }};
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
          // One opaque square in the middle third.
          for (let y = Math.floor(height / 3); y < Math.floor(2 * height / 3); y++)
            for (let x = Math.floor(w / 3); x < Math.floor(2 * w / 3); x++) pixels[(y * w + x) * 4 + 3] = 255;
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
  // A frame draws one opaque quad [minX, maxX, minY, maxY] (clip units, y up) as two triangles, the whole atlas: the
  // creature's one sprite, which its standby draws too.
  const quad = ([minX, maxX, minY, maxY]) => ({labels: [], mesh: {positions: [minX, minY, maxX, minY, maxX, maxY, minX, maxY],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3], mulColors: Array(16).fill(1)}});
  const sequence = (name, quads) => ({name, frames: quads.map(quad)});
  // `attack` gives the clip an attack sequence of these frame quads; without it the attack falls back to the standby extent.
  const clip = {atlasWidth: 512, atlasHeight: 512, sequences: [sequence('standby', [[-1, 1, -1, 1]]), ...h.attack ? [sequence('attack', h.attack)] : []]};
  h.deps = {
    loadRenderer: async () => ({SwfPlayer, WebGLRenderer, Container}),
    retain() {
      let released = false; h.leases++;
      return {
        prepareForMount: async () => ({clip, releasePixelsAfterUpload: true}),
        uploaded() { h.uploads++; },
        release(options) { if (!released) { released = true; h.releases++; h.warm = !!options?.warm; } },
      };
    },
    clock: {
      attach(player) { h.clockAttaches++; return {running(value) { h.running = value; }, draw() { player.draw(); }, destroy() { h.clockDestroys++; }}; },
      recovered() { h.clockRecoveries++; },
    },
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
  const observer = list => class { constructor(callback) { this.callback = callback; list.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  globalThis.ResizeObserver = observer(h.resizeObservers);
  globalThis.MutationObserver = observer(h.mutationObservers);
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
    const {mountCreatureAnimation, RecoveryBudget} = await load('/src/features/battle/ui/creature-animation-mount.ts');
    const t = suite('battle-display-lifecycle');
    /** Mount species 6 mid-attack (or in `h.motion`) and return its dispose function; the mount is `h.animation`. */
    const start = h => {
      install(h);
      const animation = h.animation = mountCreatureAnimation(h.host, {
        species: 6, extent: .9, motion: () => h.motion ?? {kind: 'physical', resting: true}, onReady: ready => h.ready.push(ready),
        allowRecovery: () => { h.recoverRequests++; return !!h.grantRecovery; }, remount: () => { h.remounts++; },
        room: h.room && (() => h.room), mirrored: h.mirrored,
      }, h.deps);
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
      h.host.clientWidth = 200; h.host.clientHeight = 200; h.resizeObservers[0].callback();
      assert.equal(h.canvases[0].width, 400); assert.equal(h.players[0].frame, 11);
      assert.equal(h.players.length, 1); assert.equal(h.renderers.length, 1); assert.equal(h.mountCalls, 1); assert.equal(h.uploads, 1);
      assert.equal(h.alphaReads, 1); assert.equal(h.plays, 1); assert.equal(h.clockAttaches, 1);
      cleanup(); assertReleased(h); assert.equal(h.clockDestroys, 1); assert.equal(h.playerDestroys, 1); assert.equal(h.windowListeners.size, 0);
      assert.equal(h.resizeObservers[0].disconnected, true); assert.equal(h.mutationObservers[0].disconnected, true);
    });
    await t.checkAsync('An attack that travels past the host widens the canvas toward it, as far as the viewport, and standby restores it', async () => {
      // The host sits 100 px from the viewport's left edge and 730 px from its right one; the attack reaches 11 units forward.
      const h = scenario({attack: [[-1, 11, -1, 1]]});
      Object.assign(h.window, {innerWidth: 1000, innerHeight: 600});
      h.host.getBoundingClientRect = () => ({left: 100, right: 270, top: 300, bottom: 470, width: 170, height: 170});
      const cleanup = start(h);
      await waitFor(() => h.plays === 1);
      const canvas = h.canvases[0], renderer = h.renderers[0];
      assert.deepEqual([renderer.screen.width, renderer.screen.height], [170 + 730, 170], 'widened forward up to the viewport, not upward');
      assert.deepEqual([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height], ['0px', '0px', '900px', '170px']);
      const attacking = h.players[0].position;
      h.motion = {kind: 'idle', resting: true}; h.animation.play();
      assert.deepEqual([renderer.screen.width, renderer.screen.height, canvas.style.width], [170, 170, '170px'], 'standby fits the host again');
      assert.deepEqual(h.players[0].position, attacking, 'the creature keeps its place on screen');
      cleanup(); assertReleased(h);
    });
    await t.checkAsync('A move that would carry the creature out of the arena keeps every frame inside it, on either side', async () => {
      // Frames (clip units; standby -1..1): home, a climb far above, a lunge behind, a landing ahead, home again.
      const attack = [[-1, 1, -1, 1], [-1, 1, 3, 5], [-1, 1, 7, 9], [-6, -4, -1, 1], [5, 7, -1, 1], [-1, 1, -1, 1]];
      const room = {left: 0, right: 1000, top: 180, bottom: 560};
      for (const mirrored of [false, true]) {
        const host = mirrored ? {left: 730, right: 900} : {left: 100, right: 270};
        const h = scenario({attack, room, mirrored});
        Object.assign(h.window, {innerWidth: 1000, innerHeight: 600});
        h.host.getBoundingClientRect = () => ({...host, top: 300, bottom: 470, width: 170, height: 170});
        const cleanup = start(h);
        await waitFor(() => h.plays === 1);
        const player = h.players[0], canvas = h.canvases[0], side = mirrored ? 'mirrored' : 'facing right';
        // Each frame as drawn: its quad through the frame's transform, the canvas offset around the host and the host's place.
        const drawn = attack.map(([minX, maxX, minY, maxY], index) => {
          player.frame = index; player.draw();
          const {position, scale} = player, local = x => position.x + x * scale.x + parseFloat(canvas.style.left);
          const xs = [minX, maxX].map(x => mirrored ? host.right - local(x) : host.left + local(x));
          const ys = [minY, maxY].map(y => 300 + position.y + y * scale.y + parseFloat(canvas.style.top));
          return {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), position};
        });
        drawn.forEach((box, index) => {
          for (const [edge, inside] of [['left', box.left >= room.left - .5], ['right', box.right <= room.right + .5], ['top', box.top >= room.top - .5],
            ['bottom', box.bottom <= room.bottom + .5]]) assert(inside, `${side}: frame ${index} crosses the arena's ${edge} edge: ${JSON.stringify(box)}`);
        });
        assert(Math.abs(drawn[2].top - room.top) < 1, `${side}: the highest frame touches the top instead of stopping short`);
        assert(drawn[1].top < drawn[0].top && drawn[2].top < drawn[1].top, `${side}: the climb still rises`);
        for (const index of [4, 5]) assert.deepEqual(drawn[index].position, drawn[0].position, `${side}: frame ${index} is where the clip puts it`);
        cleanup(); assertReleased(h);
      }
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
      assert.equal(h.recoverRequests, 1); assert.equal(h.clockRecoveries, 1); assert.equal(h.remounts, 1);
      cleanup(); assertReleased(h); assert.equal(h.warm, true, 'a recovering mount keeps its clip warm for the remount');
      assert.equal(canvas.listeners.size, 0);
    });
    await t.checkAsync('A declined recovery still releases the clip cold on unmount', async () => {
      const h = scenario(), cleanup = start(h);
      await waitFor(() => h.plays === 1);
      h.canvases[0].listeners.get('webglcontextrestored')();
      assert.equal(h.recoverRequests, 1); assert.equal(h.clockRecoveries, 0); assert.equal(h.remounts, 0);
      cleanup(); assertReleased(h); assert.equal(h.warm, false);
    });
    t.check('The recovery budget allows two remounts per species and restarts for a new one', () => {
      const budget = new RecoveryBudget();
      budget.track(6);
      assert.deepEqual([budget.take(6), budget.take(6), budget.take(6)], [true, true, false]);
      budget.track(6); assert.equal(budget.take(6), false, 'the same species keeps its spent budget');
      budget.track(7); assert.equal(budget.take(6), false, 'a mount of the previous species gets nothing');
      assert.deepEqual([budget.take(7), budget.take(7), budget.take(7)], [true, true, false]);
    });
    const destroyFailures = [
      ['failStageDestroy', 'stage destroy failed'], ['failRendererDestroy', 'renderer destroy failed'], ['failPlayerDestroy', 'player destroy failed'],
    ];
    for (const [flag, message] of destroyFailures) {
      await t.checkAsync(`${message}: subsequent cleanup still runs and the error remains visible`, async () => {
        const h = scenario(), stop = start(h);
        await waitFor(() => h.plays === 1); h[flag] = true;
        assert.throws(stop, new RegExp(message)); assertReleased(h); assert.equal(h.clockDestroys, 1); assert.equal(h.playerDestroys, 1);
        if (flag === 'failRendererDestroy') assert.equal(h.lostContexts, 1);
      });
    }
    t.finish({scope: 'Production creature-animation lifecycle with injected GPU, pool and clock boundaries; GPU rendering is verified separately.'});
  });
} finally {
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
