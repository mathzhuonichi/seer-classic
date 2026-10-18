/**
 * Architecture gate: import direction between layers and features, and file/line size limits.
 * Rules: design/notes/architecture-v2.md §4. Existing offenders are listed in
 * architecture-baseline.json and may only shrink.
 *
 * Usage: node tools/verification/architecture.mjs [--write-baseline]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselineFile = path.join(root, 'tools/verification/architecture-baseline.json');
const MAX_LINES = 400, MAX_LINE = 160;

/** Features and the features each may import (through their index.ts). Must stay acyclic. */
const FEATURE_DEPS = {
  battle: ['engravings'],
  collection: [],
  engravings: [],
  raising: ['engravings'],
  items: ['engravings'],
  challenges: ['battle'],
  world: ['battle', 'challenges'],
};

const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
});

/** Zone of a repository-relative path: {zone, feature?, ui?}. */
function zoneOf(rel) {
  let m;
  if ((m = rel.match(/^src\/features\/([^/]+)\/(.*)$/))) return {zone: 'feature', feature: m[1], ui: m[2].startsWith('ui/') || m[2] === 'ui.ts', entry: m[2] === 'index.ts' || m[2] === 'ui.ts'};
  if (rel.startsWith('src/shared/ui/')) return {zone: 'shared-ui'};
  for (const zone of ['src/shared', 'src/domain', 'src/kernel', 'src/app', 'battle/core', 'battle/ai', 'raising/core', 'data']) {
    if (rel === zone || rel.startsWith(zone + '/')) return {zone};
  }
  if (rel === 'src/main.tsx') return {zone: 'main'};
  return {zone: 'other'};
}

const LOWER = {
  'battle/core': ['battle/core', 'raising/core', 'data'],
  'battle/ai': ['battle/ai', 'battle/core', 'data'],
  'raising/core': ['raising/core', 'battle/core', 'data'],
  'src/shared': ['src/shared', 'battle/core', 'raising/core', 'data'],
  'src/domain': ['src/domain', 'src/shared', 'battle/core', 'raising/core', 'data'],
  'shared-ui': ['shared-ui', 'src/shared', 'battle/core', 'raising/core', 'data'],
};

/** Returns a reason string when `from` may not import `to`. */
function violation(from, to, toRel) {
  if (from.zone === 'raising/core' && to.zone === 'battle/core' && toRel !== 'battle/core/src/rng.ts') return 'raising/core may only use the battle RNG';
  if (from.zone === 'battle/core' && to.zone === 'raising/core' && toRel !== 'raising/core/stats.ts') return 'battle/core may only use raising stats';
  if (LOWER[from.zone]) return LOWER[from.zone].includes(to.zone) ? null : `${from.zone} must not import ${to.zone}`;
  if (from.zone === 'feature') {
    if (to.zone === 'feature' && to.feature === from.feature) return from.ui || from.entry || !to.ui ? null : 'feature rules must not import their ui';
    if (from.ui && to.zone === 'src/kernel' && toRel !== 'src/kernel/contract.ts') return 'feature ui imports only the kernel contract';
    if (to.zone === 'feature') {
      if (!to.entry) return `import features/${to.feature} through its index.ts or ui.ts`;
      if (to.ui && !from.ui) return `only UI may import features/${to.feature}/ui.ts`;
      return FEATURE_DEPS[from.feature]?.includes(to.feature) ? null : `features/${from.feature} may not depend on features/${to.feature}`;
    }
    if (to.zone === 'src/kernel') return ['src/kernel/contract.ts', 'src/kernel/api.ts', 'src/kernel/acquire.ts'].includes(toRel) ? null : 'features import the kernel only through contract.ts, api.ts and acquire.ts';
    return ['src/app', 'main', 'battle/ai', 'other'].includes(to.zone) ? `features must not import ${to.zone}` : null;
  }
  if (from.zone === 'src/kernel') {
    if (to.zone === 'feature' && !to.entry) return `kernel imports features/${to.feature} through its index.ts`;
    if (to.zone === 'feature' && to.ui) return 'kernel must not import feature UI';
    return ['src/app', 'main', 'shared-ui', 'other'].includes(to.zone) ? `kernel must not import ${to.zone}` : null;
  }
  if (from.zone === 'src/app') {
    if (to.zone === 'feature' && !to.entry) return `app imports features/${to.feature} through its index.ts or ui.ts`;
    return ['main', 'other'].includes(to.zone) ? `app must not import ${to.zone}` : null;
  }
  return null;
}

const importSpec = /(?:^|[^.\w])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm;
const found = {imports: [], size: {}};
for (const file of ['src', 'battle', 'raising'].flatMap(dir => walk(path.join(root, dir)))) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const long = lines.filter(line => line.length > MAX_LINE).length;
  if (lines.length > MAX_LINES || long) found.size[rel] = {lines: lines.length > MAX_LINES ? lines.length : 0, long};
  const from = zoneOf(rel);
  for (const match of text.matchAll(importSpec)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (/\.(css|json)$/.test(spec)) continue;
    const toRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const reason = violation(from, zoneOf(toRel), toRel);
    if (reason) found.imports.push(`${rel} -> ${toRel}: ${reason}`);
  }
}
found.imports.sort();

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselineFile, JSON.stringify(found, null, 2) + '\n');
  console.log(`baseline: ${found.imports.length} import violations, ${Object.keys(found.size).length} oversized files`);
  process.exit(0);
}
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const allowed = new Set(baseline.imports);
const errors = found.imports.filter(entry => !allowed.has(entry));
for (const [file, size] of Object.entries(found.size)) {
  const limit = baseline.size[file] ?? {lines: 0, long: 0};
  if (size.lines > Math.max(limit.lines, 0) && size.lines > MAX_LINES) errors.push(`${file}: ${size.lines} lines (limit ${limit.lines || MAX_LINES})`);
  if (size.long > limit.long) errors.push(`${file}: ${size.long} lines over ${MAX_LINE} characters (baseline ${limit.long})`);
}
const stale = baseline.imports.filter(entry => !found.imports.includes(entry));
const shrunk = Object.keys(baseline.size).filter(file => (found.size[file]?.long ?? 0) < baseline.size[file].long || (found.size[file]?.lines ?? 0) < baseline.size[file].lines);
console.log(`architecture: ${found.imports.length} import violations (baseline ${baseline.imports.length}), ${Object.keys(found.size).length} oversized files`);
if (stale.length || shrunk.length) console.log(`baseline can shrink: ${stale.length} imports, ${shrunk.length} files (run with --write-baseline)`);
if (errors.length) {
  console.error('FAIL new architecture violations:\n  ' + errors.join('\n  '));
  process.exit(1);
}
