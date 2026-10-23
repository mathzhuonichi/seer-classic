// The packaged smoke test's page driver, compiled only into `--features smoke` builds (src-tauri/src/smoke.rs) and run by
// tools/distribution/smoke_macos.py. It runs before the game's scripts on every page load: it silences the game, then plays
// the phase named in window.__seerSmoke and writes each result to the app's log as a `smoke {json}` line, then quits the app.
(() => {
  const smoke = window.__seerSmoke;
  if (!smoke || window.top !== window) return;
  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  const report = event => invoke('log_web', {level: 'info', message: `smoke ${JSON.stringify({...event, at: Date.now()})}`});
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const TIMEOUT_MS = 45_000, TURNS = 3, SETTLE_MS = 1500;
  /** Effect canvas read-back: one sample per this many pixels, and the alpha above which a sample counts as drawn. */
  const GRID = 8, DRAWN_ALPHA = 8;

  // Silent before anything can sound: the game's mute setting, WebAudio contexts that never run, muted media. The driver's
  // clicks are untrusted events, so the game never unlocks audio either.
  localStorage.setItem('seer-classic-audio-settings-v1', JSON.stringify({muted: true, musicVolume: 0, sfxVolume: 0}));
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Base = window[name];
    if (!Base) continue;
    const Silent = class extends Base {
      constructor(...args) { super(...args); super.suspend?.().catch?.(() => {}); }
      resume() { return Promise.resolve(); }
    };
    Object.defineProperty(window, name, {value: Silent, configurable: true, writable: true});
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) { this.muted = true; this.volume = 0; return play.apply(this, args); };
  // The effect canvas is read back, so WebGL keeps its drawing buffer.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /webgl/.test(type) ? {...attributes, preserveDrawingBuffer: true} : attributes);
  };
  // The first start's import: the 0.2 app's save in this origin's local storage, read once when no save file exists.
  if (smoke.seed) localStorage.setItem('seer-classic-save-v1', smoke.seed);

  async function until(test, what, ms = TIMEOUT_MS) {
    const end = performance.now() + ms;
    for (;;) {
      const value = test();
      if (value) return value;
      if (performance.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(30);
    }
  }
  const $ = selector => document.querySelector(selector);
  /** What the page shows, for a failure report. */
  const pageState = () => ({dialogue: !!$('.world-dialogue'), loading: $('.battle-loading')?.textContent?.slice(0, 120) ?? null,
    progress: $('.battle-loading .loading-progress')?.getAttribute('aria-valuenow') ?? null, battle: !!$('.battle-layer'),
    deck: $('.classic-command-deck')?.getAttribute('aria-busy') ?? null, toast: $('.game-toast')?.textContent ?? null});
  const commandsReady = () => !$('.battle-loading') && $('.classic-command-deck')?.getAttribute('aria-busy') === 'false';

  /** Whether the skill-effect player's canvas draws anything now. */
  function effectDrawn() {
    const canvas = $('.battle-skill-effects seer-skill-effect-player')?.shadowRoot?.querySelector('canvas');
    if (!canvas?.width) return false;
    const w = Math.max(1, Math.floor(canvas.width / GRID)), h = Math.max(1, Math.floor(canvas.height / GRID));
    const copy = new OffscreenCanvas(w, h).getContext('2d');
    copy.drawImage(canvas, 0, 0, w, h);
    const {data} = copy.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) if (data[i] > DRAWN_ALPHA) return true;
    return false;
  }

  /** The world map: when it showed, its broken images, and how the shell answers a missing and a present payload file. */
  async function world() {
    await until(() => $('.world-scene .world-player'), 'the world map');
    const shown = Date.now();
    await sleep(SETTLE_MS);
    const broken = [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.src);
    const probe = async path => { const response = await fetch(path); return [response.status, response.headers.get('content-type')]; };
    let evalBlocked = false;
    try { (0, eval)('1'); } catch { evalBlocked = true; }
    await report({event: 'world', shown, origin: location.origin, broken, evalBlocked,
      missing: await probe('/portraits/0.png'), present: await probe('/portraits/1.png'), atlas: await probe('/battle-animations/hd/1-v44.png')});
  }

  /** Plays one turn with the first damaging move; returns when the first effect frame drew (ms after the click), or null. */
  async function turn() {
    const skills = [...document.querySelectorAll('.classic-skill:not(:disabled)')];
    const skill = skills.find(button => button.querySelector('small')?.textContent !== '属性') ?? skills[0];
    if (!skill) return {played: false};
    const clicked = performance.now();
    skill.click();
    let effectMs = null;
    await until(() => {
      if (effectMs === null && effectDrawn()) effectMs = Math.round(performance.now() - clicked);
      return $('.classic-battle-result') || commandsReady() && performance.now() - clicked > SETTLE_MS;
    }, 'the turn to settle');
    return {played: true, skill: skill.querySelector('strong')?.textContent, effectMs};
  }

  /** A wild battle: from the fight button to its commands, its creatures' animations, and the first move's effect. */
  async function battle() {
    $('.world-roamer').click();
    await until(() => $('.world-dialogue button.primary'), 'the creature dialogue');
    const fight = performance.now();
    $('.world-dialogue button.primary').click();
    await until(commandsReady, 'the battle commands');
    const entryMs = Math.round(performance.now() - fight);
    await sleep(SETTLE_MS);
    const animated = document.querySelectorAll('.original-battle-creature.is-ready').length;
    const turns = [];
    while (!$('.classic-battle-result') && turns.length < TURNS && !turns.some(t => t.effectMs !== null)) {
      const played = await turn();
      turns.push(played);
      if (!played.played) break;
    }
    // Then the player leaves: 逃跑, 撤离战斗 (also possible when a fainted creature must be replaced).
    if (!$('.classic-battle-result')) {
      $('.classic-command-tabs button[aria-label="逃跑"]').click();
      (await until(() => $('.classic-escape-panel button:not(:disabled)'), 'the escape button')).click();
    }
    await until(() => !$('.battle-layer'), 'the battle to close');
    await report({event: 'battle', entryMs, animated, turns, firstEffectMs: turns.find(t => t.effectMs !== null)?.effectMs ?? null});
  }

  /** Exports the save from settings (the smoke build writes it to a fixed file instead of asking). */
  async function exportSave() {
    $('.game-toolbar button[aria-label="设置"]').click();
    await until(() => $('.scene-window[aria-label="航行设置"]'), 'the settings window');
    [...document.querySelectorAll('.settings-console button')].find(button => button.textContent === '导出存档').click();
    const toast = await until(() => /存档/.test($('.game-toast')?.textContent ?? '') && $('.game-toast').textContent, 'the export message');
    await report({event: 'export', toast, problem: $('.save-problem')?.textContent ?? null});
  }

  const phases = {
    import: world,
    battle: async () => { await world(); await battle(); await exportSave(); },
    relaunch: async () => { await world(); await exportSave(); },
    refuse: world,
    probe: async () => {
      await world();
      let frames = 0;
      const count = () => { frames++; requestAnimationFrame(count); };
      requestAnimationFrame(count);
      await sleep(2000);
      await report({event: 'probe', frames, visibility: document.visibilityState, focus: document.hasFocus(),
        size: [innerWidth, innerHeight, devicePixelRatio]});
    },
  };

  async function run() {
    try {
      await phases[smoke.phase]();
      await report({event: 'done'});
    } catch (error) {
      await report({event: 'error', message: `${error?.message ?? error}\n${error?.stack ?? ''}`, page: pageState()});
    }
    await sleep(SETTLE_MS);
    await invoke('smoke_quit');
  }
  window.addEventListener('error', event => report({event: 'page-error', message: event.message}));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
