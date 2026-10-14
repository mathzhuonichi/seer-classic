#!/usr/bin/env node
/** Export original UI vector icons and calibrate their actual browser alpha. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const java = value('--java', path.join(root, '.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'));
const ffdec = value('--ffdec', path.join(root, '.cache/vector-export/ffdec/ffdec.jar'));
const cache = path.join(root, '.cache/classic-ui-v27');
const selected = { spt: 3019, 'new-spt': 5585, mission: 1648, profile: 5969, map: 5931, bag: 3139, creatures: 3520, dex: 752, restore: 745, close: 4965 };
await fs.mkdir(cache, { recursive: true });
if (!args.includes('--reuse-exports')) {
  const ids = [...Object.values(selected), 5584];
  const result = spawnSync(java, ['-Xmx2g', '-Djava.awt.headless=true', '-jar', ffdec,
    '-selectid', ids.join(','), '-select', ids.map(id => `${id}:1`).join(','), '-zoom', '2',
    '-format', 'sprite:svg,button:svg', '-export', 'sprite,button', path.join(cache, 'svg'),
    path.join(root, '.cache/classic-robots/UI.swf')], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('FFDec icon export failed');
}
const { chromium } = await import(value('--playwright', '/Users/chizhuoni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: value('--browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') });
const page = await browser.newPage();
await page.setContent('<canvas></canvas>');
const manifestPath = path.join(root, 'public/ui/classic/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
try {
  for (const [name, id] of Object.entries(selected)) {
    let sourceFile;
    for (const kind of ['sprites', 'buttons']) {
      const directory = path.join(cache, 'svg', kind);
      const entries = await fs.readdir(directory);
      const folder = entries.find(entry => entry.startsWith(`DefineSprite_${id}_`) || entry === `DefineSprite_${id}` || entry.startsWith(`DefineButton2_${id}_`) || entry === `DefineButton2_${id}`);
      if (folder) sourceFile = path.join(directory, folder, kind === 'buttons' ? '1_up.svg' : '1.svg');
    }
    const source = await fs.readFile(sourceFile, 'utf8');
    if (/<(?:script|foreignObject)\b/.test(source)) throw new Error(`Active content in ${name}`);
    const imageCount = (source.match(/<image\b/g) || []).length;
    const textCount = (source.match(/<text\b/g) || []).length;
    if (textCount) throw new Error(`Unoutlined glyphs in ${name}`);
    const bounds = await page.evaluate(async svg => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.querySelector('canvas'); canvas.width = Math.ceil(img.naturalWidth); canvas.height = Math.ceil(img.naturalHeight);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x = canvas.width, y = canvas.height, right = 0, bottom = 0;
      for (let row = 0; row < canvas.height; row++) for (let col = 0; col < canvas.width; col++) if (data[(row * canvas.width + col) * 4 + 3]) {
        x = Math.min(x, col); y = Math.min(y, row); right = Math.max(right, col + 1); bottom = Math.max(bottom, row + 1);
      }
      URL.revokeObjectURL(url);
      if (right <= x || bottom <= y) throw new Error('Empty source SVG');
      return { x, y, width: right - x, height: bottom - y };
    }, source);
    const original = manifest.assets[name];
    // PNGs include source filter overflow that FFDec SVG may omit. Retain their
    // exact logical box and center the SVG's own actual alpha in that box.
    const viewBox = { x: bounds.x - (original.width - bounds.width) / 2,
      y: bounds.y - (original.height - bounds.height) / 2, width: original.width, height: original.height };
    let svg = source.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, `$1width="${original.logicalWidth}"`)
      .replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, `$1height="${original.logicalHeight}"`);
    svg = svg.replace(/<svg\b/, `<svg viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"`);
    const target = path.join(root, 'public/ui/classic', `${name}.svg`);
    await fs.writeFile(target, svg);
    original.vectorPath = `/ui/classic/${name}.svg`;
    original.vectorSha256 = createHash('sha256').update(svg).digest('hex');
    original.vectorSourceExport = path.relative(root, sourceFile);
    original.vectorAlphaBounds2x = bounds;
    original.vectorViewBox2x = viewBox;
    original.vectorContent = imageCount === 0;
    original.embeddedBitmapCount = imageCount;
    original.vectorViewportMethod = 'Browser-rendered SVG alpha centered inside the exact original PNG logical viewport; original curves retain 2x coordinate scale.';
    console.log(`${name}: ${original.logicalWidth}x${original.logicalHeight}, alpha=${JSON.stringify(bounds)}, embedded images=${imageCount}`);
  }
  for (const [state, filename] of [['over', '2_over.svg'], ['down', '3_down.svg'], ['vector', '2_over.svg']]) {
    const sourceFile = path.join(cache, 'svg/buttons/DefineButton2_5584', filename);
    let source = await fs.readFile(sourceFile, 'utf8');
    if (state === 'vector') {
      // Keep the original badge 5580 and caption 5582, with their exact place
      // matrices; exclude only the original over-state new-creature banner.
      const matches = source.match(/<use\b[^>]*ffdec:characterId="5581"[^>]*\/>/g) || [];
      if (matches.length !== 1) throw new Error('Expected exactly one source new-creature banner placement');
      source = source.replace(matches[0], '');
    }
    if (/<(?:image|text|script|foreignObject)\b/.test(source)) throw new Error(`Non-vector content in new-spt ${state}`);
    const bounds = await page.evaluate(async svg => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.querySelector('canvas'); canvas.width = Math.ceil(img.naturalWidth); canvas.height = Math.ceil(img.naturalHeight);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x = canvas.width, y = canvas.height, right = 0, bottom = 0;
      for (let row = 0; row < canvas.height; row++) for (let col = 0; col < canvas.width; col++) if (data[(row * canvas.width + col) * 4 + 3]) {
        x = Math.min(x, col); y = Math.min(y, row); right = Math.max(right, col + 1); bottom = Math.max(bottom, row + 1);
      }
      URL.revokeObjectURL(url);
      if (right <= x || bottom <= y) throw new Error('Empty source SVG');
      return { x, y, width: right - x, height: bottom - y };
    }, source);
    const original = manifest.assets['new-spt'];
    const ratio = original.width / original.height;
    let width = bounds.width + 4, height = bounds.height + 4;
    if (width / height > ratio) height = width / ratio; else width = height * ratio;
    const viewBox = { x: bounds.x - (width - bounds.width) / 2, y: bounds.y - (height - bounds.height) / 2, width, height };
    let svg = source.replace(/(<svg\b[^>]*?)\bwidth="[^"]*"/, `$1width="${original.logicalWidth}"`)
      .replace(/(<svg\b[^>]*?)\bheight="[^"]*"/, `$1height="${original.logicalHeight}"`);
    svg = svg.replace(/<svg\b/, `<svg viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"`);
    const target = path.join(root, 'public/ui/classic', `new-spt-${state}.svg`);
    await fs.writeFile(target, svg);
    original.vectorStates ??= {};
    original.vectorStates[state] = { ...original.vectorStates[state], path: `/ui/classic/new-spt-${state}.svg`, sourceExport: path.relative(root, sourceFile), buttonSymbolId: 5584,
      sha256: createHash('sha256').update(svg).digest('hex'), vectorContent: true, embeddedBitmapCount: 0, alphaBounds2x: bounds, viewBox2x: viewBox,
      logicalWidth: original.logicalWidth, logicalHeight: original.logicalHeight,
      method: state === 'vector'
        ? 'Original vector badge 5580 plus caption 5582 with unchanged over-state place matrices; only banner placement 5581 excluded; complete alpha fitted uniformly in original up-state logical box.'
        : 'Original interaction-state vector artwork including its original new-creature banner; complete alpha fitted uniformly inside exact original up-state logical box.' };
    console.log(`new-spt ${state}: true vector, original ${original.logicalWidth}x${original.logicalHeight} box, no clipped glyphs`);
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
} finally { await browser.close(); }
