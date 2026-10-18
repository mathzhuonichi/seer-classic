/** Render recovered static morph SVG candidates for atlas matching studies. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {Resvg} = require(path.join(root, '.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js'));
const options = {font: {loadSystemFonts: false}};
let ids = (process.argv[2] ?? '1249').split(',');
if (ids[0] === 'all-morph') {
  const summary = JSON.parse(fs.readFileSync(path.join(root, '.cache/battle-hd-v44/morph-study/summary.json'), 'utf8'));
  ids = Object.keys(summary.species).sort((a, b) => Number(a) - Number(b));
}
const digest = value => createHash('sha256').update(value).digest('hex');
const resizeRoot = (xml, pixels, box) => xml.replace(/<svg\b[^>]*>/, element => element
  .replace(/\b(?:width|height|viewBox|preserveAspectRatio)="[^"]*"/g, '')
  .replace(/>$/, ` width="${pixels}" height="${pixels}" viewBox="${box.join(' ')}" preserveAspectRatio="none">`));

for (const id of ids) {
  const directory = path.join(root, '.cache/battle-hd-v44/morph-study', id);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const output = path.join(directory, 'fingerprints');
  fs.mkdirSync(output, {recursive: true});
  const candidateDirectory = path.join(directory, 'candidates');
  fs.mkdirSync(candidateDirectory, {recursive: true});
  const rows = [], candidates = [], skipped = [];
  const save = (source, key, xml, kind) => {
    const box = new Resvg(xml, options).getBBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      skipped.push({key, reason: 'Empty visible geometry at the recorded morph ratio'});
      return;
    }
    const bounds = [box.x, box.y, box.width, box.height];
    const svg = resizeRoot(xml, 64, bounds);
    const svgPath = path.join(candidateDirectory, `${key}.svg`);
    const pngPath = path.join(candidateDirectory, `${key}.png`);
    fs.writeFileSync(svgPath, svg);
    fs.writeFileSync(pngPath, new Resvg(svg, options).render().asPng());
    candidates.push({key, character: source.character, ratio: source.ratio, kind, bounds,
      nativeSize: bounds.slice(2), hasBitmap: /<(?:image|feImage)\b/.test(svg),
      sourceSha256: manifest.sourceSha256, sourceSvgSha256: source.svgSha256,
      candidateSvgSha256: digest(svg), svgPath: path.relative(root, svgPath), pngPath: path.relative(root, pngPath)});
  };
  for (const candidate of manifest.candidates) {
    const original = fs.readFileSync(path.join(directory, candidate.svgPath), 'utf8');
    // FFDec emits invisible hairline paths; they must not inflate visible bounds.
    const xml = original.replace(/<path\b[^>]*\/>/g, element =>
      /\bfill="none"/.test(element) && /\bstroke-opacity="0(?:\.0*)?"/.test(element) ? '' : element);
    const bounds = new Resvg(xml, options).getBBox();
    if (!bounds) {
      rows.push({...candidate, empty: true});
      continue;
    }
    const box = [bounds.x, bounds.y, bounds.width, bounds.height];
    const fingerprint = resizeRoot(xml, 128, box);
    const file = path.join(output, `${candidate.key}.png`);
    fs.writeFileSync(file, new Resvg(fingerprint, options).render().asPng());
    fs.writeFileSync(path.join(output, `${candidate.key}.svg`), fingerprint);
    rows.push({...candidate, visibleBounds: box, nativeSize: box.slice(2),
      fingerprintPath: path.relative(directory, file)});
    const key = `morph-${candidate.character}-${candidate.ratio}`;
    save(candidate, key, xml, 'source-morph-ratio');
    const paths = [...xml.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]);
    if (paths.length > 1 && new Set(paths.map(p => p.match(/\bfill="([^"]+)"/)?.[1])).size === 1) {
      for (let index = 0; index < paths.length; index++) {
        let number = 0;
        const part = xml.replace(/<path\b[^>]*\/>/g, p => number++ === index ? p : '');
        save(candidate, `${key}-path${index}`, part, 'source-morph-ratio-same-color-path');
      }
    }
  }
  fs.writeFileSync(path.join(directory, 'fingerprints.json'), JSON.stringify(rows, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'candidates.json'), JSON.stringify({revision: 1,
    species: manifest.species, sourceSha256: manifest.sourceSha256, fingerprintPixels: 64,
    candidates, skipped}, null, 2) + '\n');
  console.log(`${id}: rendered ${rows.length} static source-ratio candidates`);
}

if (process.argv[2] === 'all-morph') {
  const directory = path.join(root, '.cache/battle-hd-v44/morph-study');
  const manifests = ids.map(id => {
    const manifestPath = path.join(directory, id, 'candidates.json');
    const raw = fs.readFileSync(manifestPath);
    const value = JSON.parse(raw);
    return {species: value.species, sourceSha256: value.sourceSha256, manifestPath,
      manifestSha256: digest(raw), candidates: value.candidates.length, skipped: value.skipped.length};
  });
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
  fs.writeFileSync(path.join(directory, 'candidate-manifest.json'), JSON.stringify({
    species: manifests.length,
    sourceRatios: Object.values(summary.species).reduce((sum, row) => sum + row.candidates, 0),
    candidates: manifests.reduce((sum, row) => sum + row.candidates, 0),
    skipped: manifests.reduce((sum, row) => sum + row.skipped, 0), fingerprintPixels: 64, manifests,
  }, null, 2) + '\n');
}
