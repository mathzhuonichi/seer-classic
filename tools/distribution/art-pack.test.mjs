import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {install, lockFrom, verify} from './art-pack.mjs';

const FILES = {'portraits/1.png': 'portrait', 'audio/scene/101.mp3': 'music', 'maps/hd/2.svg': '<svg/>'};
let dir, from, to, pack;

const entry = text => [Buffer.byteLength(text), crypto.createHash('sha256').update(text).digest('hex')];
const write = (base, file, text) => {
  fs.mkdirSync(path.dirname(path.join(base, file)), {recursive: true});
  fs.writeFileSync(path.join(base, file), text);
};

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-pack-'));
  from = path.join(dir, 'game');
  to = path.join(dir, 'public');
  pack = {version: '0.0.1', entries: Object.fromEntries(Object.entries(FILES).map(([file, text]) => [file, entry(text)]))};
});
after(() => fs.rmSync(dir, {recursive: true, force: true}));

test('a pack is the payload without the files Git tracks and without the notices', () => {
  const payload = {version: '0.0.1', entries: {'b.png': [3, 'x'], 'a.json': [5, 'y'], 'a.png': [2, 'z'], 'THIRD-PARTY-NOTICES.txt': [9, 'n']}};
  assert.deepEqual(lockFrom(payload, new Set(['a.json'])), {version: '0.0.1', files: 2, bytes: 5, entries: {'a.png': [2, 'z'], 'b.png': [3, 'x']}});
});

test('install copies the intact files and reports what the source lacks or holds altered', () => {
  write(from, 'portraits/1.png', FILES['portraits/1.png']);
  write(from, 'audio/scene/101.mp3', 'altered');
  write(from, 'index.html', 'not art');
  assert.deepEqual(install(pack, from, to), {missing: ['maps/hd/2.svg'], differ: ['audio/scene/101.mp3']});
  assert.equal(fs.readFileSync(path.join(to, 'portraits/1.png'), 'utf8'), FILES['portraits/1.png']);
  assert.deepEqual(verify(pack, to), {missing: ['audio/scene/101.mp3', 'maps/hd/2.svg'], differ: []});
  assert.equal(fs.existsSync(path.join(to, 'index.html')), false);
});

test('a complete source makes public/ match the pack', () => {
  for (const [file, text] of Object.entries(FILES)) write(from, file, text);
  install(pack, from, to);
  assert.deepEqual(verify(pack, to), {missing: [], differ: []});
});

test('install refuses public/ as its own source', () => {
  assert.throws(() => install(pack, to, to), /another folder/);
});
