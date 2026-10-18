// Generates src/features/<name>/index.ts from what code outside each feature imports, and
// rewrites those importers to use the index. Usage: node feature-indexes.mjs <repo>
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
});
const rel = file => path.relative(repo, file).split(path.sep).join('/');
const featureOf = p => p.match(/^src\/features\/([^/]+)\//)?.[1];

// import [type] {a, b as c, type D} from 'spec' | import X from 'spec' | export {a} from 'spec'
const decl = /^(import|export)(\s+type)?\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(['"])(\.{1,2}\/[^'"]+)\5;?/gm;
const surface = new Map();   // feature -> Map(exportName -> {file, type, isDefault})
const edits = [];
for (const file of walk(path.join(repo, 'src'))) {
  const from = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(decl)) {
    const [whole, kind, typeAll, def, names, , spec] = m;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const feature = featureOf(target);
    if (!feature || featureOf(from) === feature || target === `src/features/${feature}/index.ts`) continue;
    if (/\.(json|css)$/.test(target)) throw new Error(`${from} imports feature data ${target}; move the data to domain/ or shared/`);
    const local = path.posix.relative(`src/features/${feature}`, target);
    const exports = surface.get(feature) ?? new Map();
    surface.set(feature, exports);
    const add = (name, type, isDefault) => {
      const prev = exports.get(name);
      if (prev && prev.file !== local) throw new Error(`features/${feature}: ${name} exported by ${prev.file} and ${local}`);
      exports.set(name, {file: local, type: (prev ? prev.type : true) && type, isDefault});
    };
    const parts = [];
    if (def) {
      const name = path.posix.basename(target).replace(/\.(tsx?|ts)$/, '');
      add(name, !!typeAll, true);
      parts.push(name === def ? name : `${name} as ${def}`);
    }
    for (const raw of (names ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
      const isType = !!typeAll || raw.startsWith('type ');
      const [name] = raw.replace(/^type\s+/, '').split(/\s+as\s+/);
      add(name, isType, false);
      parts.push(raw);
    }
    const index = path.posix.relative(path.posix.dirname(from), `src/features/${feature}/index.ts`);
    const spec2 = index.startsWith('.') ? index : `./${index}`;
    edits.push({file, whole, next: `${kind}${typeAll ?? ''} {${parts.join(', ')}} from '${spec2}';`});
  }
}
for (const [feature, exports] of surface) {
  const byFile = new Map();
  for (const [name, info] of exports) {
    const list = byFile.get(info.file) ?? [];
    byFile.set(info.file, list);
    list.push(info.isDefault ? `default as ${name}` : info.type ? `type ${name}` : name);
  }
  const lines = [...byFile].sort(([a], [b]) => a.localeCompare(b)).map(([file, names]) =>
    `export { ${names.sort((a, b) => a.replace(/^(type|default as) /, '').localeCompare(b.replace(/^(type|default as) /, ''))).join(', ')} } from './${file}';`);
  fs.writeFileSync(path.join(repo, `src/features/${feature}/index.ts`),
    `// The public surface of features/${feature}: everything other features, the kernel and the app may use.\n${lines.join('\n')}\n`);
  console.log(`features/${feature}: ${exports.size} exports from ${byFile.size} files`);
}
const byFile = new Map();
for (const edit of edits) byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit]);
for (const [file, list] of byFile) {
  let text = fs.readFileSync(file, 'utf8');
  for (const {whole, next} of list) text = text.replace(whole, next);
  fs.writeFileSync(file, text);
}
console.log(`rewrote ${edits.length} imports in ${byFile.size} files`);
