import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import zlib from 'node:zlib';
import {readZipDirectory, writeZip} from './zip.mjs';

test('the ZIP keeps UTF-8 names, Unix modes and every byte, deflating only what shrinks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seer-zip-test-'));
  try {
    const files = {'启动游戏-macOS.command': ['#!/bin/sh\necho 你好\n'.repeat(20), 0o755], 'game/a.png': [Buffer.from([1, 2, 3, 4]), 0o644],
      'game/index.html': ['<!doctype html>'.repeat(50), 0o644], 'game/empty.json': ['', 0o644]};
    const entries = Object.entries(files).map(([name, [content, mode]]) => {
      const source = path.join(dir, `source-${Buffer.from(name).toString('hex')}`);
      fs.writeFileSync(source, content);
      return {name: `SeerClassic-1.0.0/${name}`, source, mode};
    });
    const target = path.join(dir, 'package.zip'), result = writeZip(target, entries, new Date(2026, 9, 23, 12, 30, 10));
    assert.deepEqual(result, {entries: 4, bytes: fs.statSync(target).size, stored: 2, deflated: 2});
    const listed = readZipDirectory(target), archive = fs.readFileSync(target);
    assert.deepEqual(listed.map(entry => entry.name), entries.map(entry => entry.name));
    for (const [index, entry] of listed.entries()) {
      const content = fs.readFileSync(entries[index].source), start = entry.offset + 30 + archive.readUInt16LE(entry.offset + 26);
      const body = archive.subarray(start, start + entry.compressed);
      assert.equal(entry.flags & 0x0800, 0x0800, 'UTF-8 names');
      assert.equal(entry.mode, entries[index].mode);
      assert.equal(entry.size, content.length);
      assert.equal(entry.crc, zlib.crc32(content));
      assert.deepEqual(entry.method === 8 ? zlib.inflateRawSync(body) : body, content);
    }
    assert.equal(listed.find(entry => entry.name.endsWith('a.png')).method, 0, 'compressed images are stored');
    // The system's own unzip agrees, where there is one.
    try { execFileSync('unzip', ['-tqq', target], {stdio: 'pipe'}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('more entries than a ZIP without ZIP64 holds are refused', () => {
  assert.throws(() => writeZip(path.join(os.tmpdir(), 'never-written.zip'), Array.from({length: 0x10000}, () => ({}))), /ZIP64/);
});
