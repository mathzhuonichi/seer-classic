// Moves files and rewrites every import and path string that refers to them.
// Usage: node move-files.mjs <repo> <from> <to> [<from> <to> ...]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const [repo, ...pairs] = process.argv.slice(2);
const git = (...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'});
const moves = new Map();
for (let i = 0; i < pairs.length; i += 2) moves.set(pairs[i], pairs[i + 1]);
const files = git('ls-files').trim().split('\n');
for (const from of moves.keys()) if (!files.includes(from)) throw new Error(`not tracked: ${from}`);

// Rewrite pass over every tracked text file, computed against old locations.
const mapPath = p => moves.get(p) ?? p;
const tracked = git('ls-files').trim().split('\n').filter(f => !f.startsWith('design/notes/') && f !== 'CHANGELOG.md' && /\.(ts|tsx|mjs|js|css|py|md|html)$/.test(f) && fs.existsSync(path.join(repo, f)));
const codeExt = /\.(ts|tsx|mjs|js|css|html)$/;
const exts = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts'];
const relSpec = /((?:from|import)\s*\(?\s*|import\.meta\.glob\(\s*|new URL\(\s*|@import\s+)(['"])(\.{1,2}\/[^'"]*)\2/g;
const rootStr = /(['"`])(\/?)((?:src|battle|raising\/game|tools)\/[A-Za-z0-9_./-]+)(\?[^'"`\s]*)?\1/g;
let rewritten = 0;
const relTo = (fromFile, target) => {
  let rel = path.posix.relative(path.posix.dirname(fromFile), target);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
};
const newContent = new Map();
for (const file of tracked) {
  const text = fs.readFileSync(path.join(repo, file), 'utf8');
  const newFile = mapPath(file);
  let next = text;
  if (codeExt.test(file)) {
    next = next.replace(relSpec, (match, head, quote, spec) => {
      // A glob or directory keeps its tail; only the fixed directory prefix is re-pointed.
      const glob = spec.search(/[*{]/);
      const fixed = glob >= 0 ? spec.slice(0, spec.lastIndexOf('/', glob) + 1) : spec;
      const tail = spec.slice(fixed.length);
      const abs = path.posix.normalize(path.posix.join(path.posix.dirname(file), fixed)).replace(/\/$/, '');
      const ext = exts.find(e => files.includes(abs + e) || fs.existsSync(path.join(repo, abs + e)));
      if (ext === undefined) return match;
      const resolved = mapPath(abs + ext);
      if (newFile === file && resolved === abs + ext) return match;
      let rel = relTo(newFile, resolved);
      if (ext) rel = rel.slice(0, -ext.length);
      if (fixed.endsWith('/') && !rel.endsWith('/')) rel += '/';
      return `${head}${quote}${rel}${tail}${quote}`;
    });
  }
  next = next.replace(rootStr, (match, quote, slash, p, query = '') => moves.has(p) ? `${quote}${slash}${moves.get(p)}${query}${quote}` : match);
  if (next !== text) { newContent.set(file, next); rewritten++; }
}
for (const [from, to] of moves) {
  fs.mkdirSync(path.join(repo, path.dirname(to)), {recursive: true});
  git('mv', from, to);
}
for (const [file, text] of newContent) fs.writeFileSync(path.join(repo, mapPath(file)), text);
console.log(`moved ${moves.size}, rewrote ${rewritten} files`);
