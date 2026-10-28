/**
 * The art pack: the art the game ships, which is every file of the browser payload that Git does not track (images, audio,
 * animation atlases, skill-effect SWFs). It is frozen at the 0.0.1 release and listed with each file's size and SHA-256 in
 * art-pack.json. The source keeps changing on GitHub and the art does not, so a checkout plus this pack is the whole game
 * (ART.md at the repository root).
 *
 *   node tools/distribution/art-pack.mjs install --from <folder>   copy the pack into public/ from a folder laid out like it,
 *                                                                  such as the game/ folder of the unzipped 0.0.1 package
 *   node tools/distribution/art-pack.mjs check                     confirm that public/ holds every file of the pack unchanged
 *   node tools/distribution/art-pack.mjs lock --payload <file>     list a new pack from a staged payload.json (a new art version)
 */
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LOCK = path.join(root, 'tools/distribution/art-pack.json');
const PUBLIC = path.join(root, 'public');
/** The generated notices at the payload root: shipped, but not art. */
const NOTICES = 'THIRD-PARTY-NOTICES.txt';
/** Problem files named in a report; the rest are counted. */
const LISTED = 10;
const USAGE = 'usage: art-pack.mjs install --from <folder> | check | lock --payload <payload.json>';

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const gib = bytes => (bytes / 2 ** 30).toFixed(2);

/** The files of public/ that Git tracks, relative to public/. */
export const trackedPublic = () => new Set(execFileSync('git', ['ls-files', '-z', 'public'], {cwd: root, encoding: 'utf8'})
  .split('\0').filter(Boolean).map(file => file.slice('public/'.length)));

/** The art of a staged payload.json as a pack: its entries that Git does not track, without the notices. */
export function lockFrom(payload, tracked) {
  const entries = Object.fromEntries(Object.entries(payload.entries).filter(([file]) => !tracked.has(file) && file !== NOTICES).sort());
  const bytes = Object.values(entries).reduce((sum, [size]) => sum + size, 0);
  return {version: payload.version, files: Object.keys(entries).length, bytes, entries};
}

/** The pack's files that `dir` lacks (`missing`) or holds with another size or SHA-256 (`differ`). */
export function verify(pack, dir) {
  const missing = [], differ = [];
  for (const [file, [size, digest]] of Object.entries(pack.entries)) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) missing.push(file);
    else if (fs.statSync(full).size !== size || sha256(full) !== digest) differ.push(file);
  }
  return {missing, differ};
}

/** Copies every intact pack file of `from` into `to` (an APFS clone where possible); returns the files `from` could not supply. */
export function install(pack, from, to) {
  if (path.resolve(from) === path.resolve(to)) throw new Error('--from must be another folder than public/');
  const result = verify(pack, from), skip = new Set([...result.missing, ...result.differ]);
  for (const file of Object.keys(pack.entries).filter(file => !skip.has(file))) {
    const target = path.join(to, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(from, file), target, fs.constants.COPYFILE_FICLONE);
  }
  return result;
}

/** One entry per line, so a new pack's diff names the files that changed. */
const serialize = pack => `${JSON.stringify({...pack, entries: {}}).slice(0, -3)}{\n${Object.entries(pack.entries)
  .map(([file, entry]) => `${JSON.stringify(file)}:${JSON.stringify(entry)}`).join(',\n')}\n}}\n`;

function report(pack, where, {missing, differ}) {
  const lines = [[missing, 'missing'], [differ, 'with another size or SHA-256']].filter(([files]) => files.length)
    .map(([files, what]) => `${files.length} files ${what} in ${where}, e.g. ${files.slice(0, LISTED).join(', ')}`);
  if (!lines.length) return console.log(`art pack ${pack.version}: ${pack.files} files, ${gib(pack.bytes)} GiB, all present and unchanged in public/`);
  console.error(lines.join('\n'));
  process.exitCode = 1;
}

function main() {
  const {positionals: [command], values: args} = parseArgs({allowPositionals: true, options: {from: {type: 'string'}, payload: {type: 'string'}}});
  if (command === 'lock' && args.payload) {
    const pack = lockFrom(JSON.parse(fs.readFileSync(args.payload, 'utf8')), trackedPublic());
    fs.writeFileSync(LOCK, serialize(pack));
    return console.log(`art pack ${pack.version}: ${pack.files} files, ${gib(pack.bytes)} GiB, listed in ${path.relative(root, LOCK)}`);
  }
  const pack = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  if (command === 'install' && args.from) {
    const from = path.resolve(args.from), lacking = install(pack, from, PUBLIC);
    if (lacking.missing.length || lacking.differ.length) report(pack, `${from} (not copied)`, lacking);
    report(pack, 'public/', verify(pack, PUBLIC));
  } else if (command === 'check') report(pack, 'public/', verify(pack, PUBLIC));
  else {
    console.error(USAGE);
    process.exitCode = 2;
  }
}

if (import.meta.main) main();
