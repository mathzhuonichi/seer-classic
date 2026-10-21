/**
 * HD battle animation density in the running game: which atlas a battle actually loads, whether the WebGL backing store follows
 * the device pixel ratio, how many atlas texels each cell of the lead's first standby pose has per device pixel, and whether the
 * lead is drawn at the battle extent of its native size (battle-creature-size.ts).
 * Status `needs-browser`. Each species in SPECIES leads a seeded save into a wild battle at DPR 2 in every viewport of VIEWPORTS.
 *
 * Measurement: the page keeps its WebGL drawing buffer (an init script of this suite only), so the canvas's visible alpha box
 * can be read after the reduced-motion standby pose is drawn. The same pose's alpha box in clip units, from the loaded metadata
 * and atlas, gives device pixels per clip unit; each quad's UV and vertex edges give its atlas texels per clip unit.
 * Writes artifacts/battle-hd-display/regression.json and a device-pixel crop of the lead per species and viewport.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';
import {BOOT_TIMEOUT_MS, buildApp, openGame, talkToCreature, wait, waitCommands, waitWorld, withBrowser} from './_browser.mjs';

const NAME = 'battle-hd-display';
const OUT = path.join(root, 'artifacts', NAME);
const DIST = path.join(OUT, 'dist');
/** 丽莎布布 and 闪光波克尔, reported blurry in the 2026-10-19 playtest; 哈莫雷特, drawn too small next to 303 before 2026-10-21. */
const SPECIES = (process.env.HD_DISPLAY_SPECIES ?? '303,166,216').split(',').map(Number);
const VIEWPORTS = [{width: 1000, height: 650}, {width: 1280, height: 800}, {width: 1440, height: 900}, {width: 1920, height: 1080}];
const DEVICE_SCALE = 2;
const LEVEL = 100;
/** Alpha the registration calibration also treats as visible. */
const VISIBLE_ALPHA = 16;
/** Backing pixels may differ from displayed device pixels by rounding only. */
const BACKING_TOLERANCE = 0.02;
const HD_INDEX = JSON.parse(fs.readFileSync(path.join(root, 'public/battle-animations/hd/runtime-index.json'), 'utf8')).species;
const NATIVE = JSON.parse(fs.readFileSync(path.join(root, 'public/battle-animations/runtime-index.json'), 'utf8')).species;
const SIZING = JSON.parse(fs.readFileSync(path.join(root, 'src/features/battle/battle-creature-size.json'), 'utf8'));
/** The share of its creature box that a species' first standby pose fills: its native size times one scale, capped. */
const battleExtent = species => Math.min(SIZING.maxExtent,
  NATIVE[species].standbySize * SIZING.calibrationExtent / NATIVE[SIZING.calibrationSpecies].standbySize);
/** The drawn pose may differ from its extent by the alpha box's pixel rounding and the HD atlas's own edge pixels. */
const EXTENT_TOLERANCE = 0.02;

/** The silent storage entries and, per species, a save whose only creature is that species at LEVEL. */
async function fixtures() {
  memoryStorage();
  return withSsr(NAME, async load => {
    const [{createGame}, {loadCatalog}, {newSave}, {writeLocalSave}, {gameAudio}]
      = await Promise.all(['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts', '/src/kernel/persistence.ts',
        '/src/shared/audio/game-audio.ts'].map(load));
    const catalog = await loadCatalog();
    const entries = fill => { const memory = memoryStorage(); fill(); return Object.fromEntries(memory); };
    const silent = entries(() => gameAudio.updateSettings({muted: true, musicVolume: 0, sfxVolume: 0}));
    const saves = Object.fromEntries(SPECIES.map(species => [species, entries(() => {
      const game = createGame(structuredClone(catalog), JSON.stringify(newSave(species)));
      assert(game.dispatch({type: 'cheatAcquire', species, level: LEVEL}).ok, `cheatAcquire ${species}`);
      assert.equal(game.snapshot().monsters[0]?.species, species);
      writeLocalSave(game.exportSave());
    })]));
    return {silent, saves};
  });
}

/** Init script: keep every WebGL drawing buffer so the drawn pose can be read back after compositing. */
function keepDrawingBuffers() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    return getContext.call(this, type, /webgl/.test(type) ? {...attributes, preserveDrawingBuffer: true} : attributes);
  };
}

/** Runs in the page: the lead's canvas, its displayed size and the visible alpha box of what it drew, in backing pixels. */
function leadCanvas(visibleAlpha) {
  const canvas = document.querySelector('.classic-combatant.side-0 .original-battle-creature.is-ready canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect(), copy = new OffscreenCanvas(canvas.width, canvas.height), context = copy.getContext('2d');
  context.drawImage(canvas, 0, 0);
  const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4 + 3] < visibleAlpha) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const box = canvas.closest('.classic-art-box').getBoundingClientRect();
  const portrait = document.querySelector('.classic-health-portrait img');
  const portraitRect = portrait?.getBoundingClientRect();
  return {dpr: devicePixelRatio, backing: [canvas.width, canvas.height], css: [canvas.clientWidth, canvas.clientHeight],
    displayed: [rect.width * devicePixelRatio, rect.height * devicePixelRatio], rect: [rect.left, rect.top, rect.width, rect.height],
    alpha: [minX, minY, maxX + 1, maxY + 1], registration: canvas.parentElement.dataset.registration, boxSide: box.width * devicePixelRatio,
    portrait: portrait && {src: portrait.getAttribute('src'), natural: [portrait.naturalWidth, portrait.naturalHeight],
      displayed: [portraitRect.width * devicePixelRatio, portraitRect.height * devicePixelRatio]}};
}

/**
 * Runs in the page: the first standby frame of a clip, as its visible alpha box in clip units and, per quad, the atlas cell
 * (UV rectangle) and its texels per clip unit along the quad's two edges.
 */
async function standbyPose({meta, atlas, visibleAlpha}) {
  const bytes = await (await fetch(meta)).arrayBuffer(), gzip = new Uint8Array(bytes, 0, 2);
  const stream = new Blob([bytes]).stream();
  const clip = await new Response(gzip[0] === 0x1f && gzip[1] === 0x8b ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).json();
  const bitmap = await createImageBitmap(await (await fetch(atlas)).blob(), {premultiplyAlpha: 'none'});
  const {width: W, height: H} = bitmap, canvas = new OffscreenCanvas(W, H), context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, W, H).data;
  const frame = (clip.sequences.find(s => s.name === 'standby') ?? clip.sequences[0]).frames[0];
  const box = [Infinity, Infinity, -Infinity, -Infinity], quads = [];
  for (let q = 0; q * 8 < frame.positions.length; q++) {
    const p = i => [frame.positions[q * 8 + i * 2], frame.positions[q * 8 + i * 2 + 1]];
    const t = i => [frame.uvs[q * 8 + i * 2] * W, frame.uvs[q * 8 + i * 2 + 1] * H];
    const edge = (a, b, f) => Math.hypot(f(b)[0] - f(a)[0], f(b)[1] - f(a)[1]);
    const alphaMul = frame.mulColors[q * 16 + 3];
    const us = [0, 1, 2, 3].map(i => t(i)[0]), vs = [0, 1, 2, 3].map(i => t(i)[1]);
    const cell = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)].map(v => Math.round(v));
    quads.push({cell, texelsPerUnit: [edge(0, 1, t) / edge(0, 1, p), edge(0, 3, t) / edge(0, 3, p)], alphaMul});
    if (alphaMul * 255 < visibleAlpha) continue;
    // Opaque texels of the cell, mapped to clip units through the quad's affine UV-to-position map.
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (let y = cell[1]; y < cell[3]; y++) for (let x = cell[0]; x < cell[2]; x++) {
      if (pixels[(y * W + x) * 4 + 3] < visibleAlpha) continue;
      u0 = Math.min(u0, x); v0 = Math.min(v0, y); u1 = Math.max(u1, x + 1); v1 = Math.max(v1, y + 1);
    }
    if (u1 < u0) continue;
    const [a, b, d] = [t(0), t(1), t(3)], [pa, pb, pd] = [p(0), p(1), p(3)];
    const det = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const toPos = (u, v) => {
      const s = ((u - a[0]) * (d[1] - a[1]) - (v - a[1]) * (d[0] - a[0])) / det, r = ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0])) / det;
      return [pa[0] + s * (pb[0] - pa[0]) + r * (pd[0] - pa[0]), pa[1] + s * (pb[1] - pa[1]) + r * (pd[1] - pa[1])];
    };
    for (const [x, y] of [toPos(u0, v0), toPos(u1, v0), toPos(u0, v1), toPos(u1, v1)]) {
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    }
  }
  bitmap.close();
  return {atlas: [W, H], box, quads};
}

/** Device pixels per clip unit, and the per-cell texel density of a pose (texels per device pixel, the lower edge). */
function density(lead, pose) {
  const backingPerDevice = lead.backing[0] / lead.displayed[0];
  const scale = [(lead.alpha[2] - lead.alpha[0]) / (pose.box[2] - pose.box[0]), (lead.alpha[3] - lead.alpha[1]) / (pose.box[3] - pose.box[1])]
    .map(value => value / backingPerDevice);
  const devicePerUnit = (scale[0] + scale[1]) / 2, cells = new Map();
  for (const quad of pose.quads) {
    const key = quad.cell.join(','), value = Math.min(...quad.texelsPerUnit) / devicePerUnit;
    cells.set(key, Math.min(cells.get(key) ?? Infinity, value));
  }
  return {devicePerUnit, scaleAgreement: scale[0] / scale[1], cells: [...cells].map(([cell, texelsPerDevicePixel]) => ({cell, texelsPerDevicePixel}))};
}

/** Wild battle with the seeded lead at DPR 2 in `viewport`; returns the measurements and writes a device-pixel crop. */
async function measure(browser, fixture, species, viewport) {
  const session = await openGame(browser, {dist: DIST, silent: fixture.silent, seed: fixture.saves[species], viewport});
  const {context, page} = session, requests = [];
  try {
    page.on('request', request => { const {pathname} = new URL(request.url()); if (pathname.startsWith('/battle-animations/')) requests.push(pathname); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor: DEVICE_SCALE, mobile: false});
    await page.addInitScript(keepDrawingBuffers);
    await page.reload({waitUntil: 'load', timeout: BOOT_TIMEOUT_MS});
    await waitWorld(page);
    await talkToCreature(page);
    await page.click('.world-dialogue button.primary');
    await waitCommands(page);
    await page.waitForSelector('.classic-combatant.side-0 .original-battle-creature.is-ready', {timeout: BOOT_TIMEOUT_MS});
    await wait(500);
    const lead = await page.evaluate(leadCanvas, VISIBLE_ALPHA);
    // A named override such as 910-ai-v44 sits between the species and its revision.
    const atlas = requests.find(url => /\/battle-animations\/(hd\/)?\d+(-[a-z]+)?(-v\d+)?\.(png|webp)$/.test(url) && url.includes(`/${species}`));
    const meta = atlas && requests.find(url => url.endsWith('.json.gz') && url.includes(`/${species}`) && url.includes('/hd/') === atlas.includes('/hd/'));
    const pose = await page.evaluate(standbyPose, {meta, atlas, visibleAlpha: VISIBLE_ALPHA});
    const crop = await cdp.send('Page.captureScreenshot', {format: 'png', clip: {x: lead.rect[0], y: lead.rect[1], width: lead.rect[2], height: lead.rect[3], scale: 1}});
    const file = path.join(OUT, `lead-${species}-${viewport.width}x${viewport.height}.png`);
    fs.writeFileSync(file, Buffer.from(crop.data, 'base64'));
    return {species, viewport, atlas, meta, requests, lead, pose: {atlas: pose.atlas, box: pose.box}, ...density(lead, pose), crop: file,
      errors: session.errors};
  } finally {
    await context.close();
  }
}

const t = suite(NAME);
fs.mkdirSync(OUT, {recursive: true});
await buildApp(DIST);
const fixture = await fixtures(), results = [];
await withBrowser('chrome', async browser => {
  for (const species of SPECIES) for (const viewport of VIEWPORTS) {
    const label = `${species} at ${viewport.width}x${viewport.height}@${DEVICE_SCALE}x`;
    await t.checkAsync(`${label}: loads the atlas the HD index selects, renders at device resolution`, async () => {
      const result = await measure(browser, fixture, species, viewport);
      results.push(result);
      assert.equal(result.atlas, HD_INDEX[species].atlas, `${label} loaded ${result.atlas}`);
      assert(!result.requests.some(url => url.startsWith(`/battle-animations/${species}.`)), `${label} also fetched the original clip`);
      assert.deepEqual(result.errors, [], `${label}: page or console errors`);
      const ratio = result.lead.backing[0] / result.lead.displayed[0];
      assert(Math.abs(ratio - 1) <= BACKING_TOLERANCE, `${label}: ${ratio.toFixed(3)} backing pixels per device pixel`);
      const [minX, minY, maxX, maxY] = result.lead.alpha, extent = Math.max(maxX - minX, maxY - minY) / ratio / result.lead.boxSide;
      result.extent = extent;
      assert(Math.abs(extent / battleExtent(species) - 1) <= EXTENT_TOLERANCE,
        `${label}: the first pose fills ${extent.toFixed(3)} of its creature box, not ${battleExtent(species).toFixed(3)}`);
    });
  }
});
const lowest = results.map(({species, viewport, cells, extent}) => ({species, viewport: `${viewport.width}x${viewport.height}`,
  lowest: Math.min(...cells.map(cell => cell.texelsPerDevicePixel)), extent}));
t.witness('lowestFirstPoseDensity', lowest);
fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(results, null, 1) + '\n');
t.finish();
