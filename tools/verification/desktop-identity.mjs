/**
 * The desktop app's identity: one version, and the identifier and page origin that hold the players' data.
 * - package.json carries the version; tauri.conf.json reads it from there, and Cargo.toml, Cargo.lock and package-lock.json
 *   must state the same.
 * - The identifier names the folders of the save files and of the web view's storage (the 0.2 app's save is under it), and the
 *   page origin (tauri://localhost, http://tauri.localhost on Windows) holds that storage: changing either, or turning on
 *   useHttpsScheme, would strand every player's earlier data (design/notes/desktop-package-2026-10-23.md).
 * - The asset notice (src/app/asset-notice.txt), shown in 关于, is also in the player README of the package.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root, suite} from './_harness.mjs';

const IDENTIFIER = 'local.chizhuoni.seer-classic';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
/** The `version = "…"` line of a TOML table whose `name` line comes first. */
const tomlVersion = (text, name) => text.match(new RegExp(`name = "${name}"\\nversion = "([^"]+)"`))?.[1];

const {check, finish} = suite('desktop-identity');
const version = json('package.json').version, lock = json('package-lock.json'), tauri = json('src-tauri/tauri.conf.json');
check('one version', () => {
  assert.equal(tauri.version, '../package.json', 'tauri.conf.json reads the version from package.json');
  assert.equal(lock.version, version, 'package-lock.json');
  assert.equal(lock.packages[''].version, version, 'package-lock.json root package');
  assert.equal(tomlVersion(read('src-tauri/Cargo.toml'), 'seer-classic'), version, 'src-tauri/Cargo.toml');
  assert.equal(tomlVersion(read('src-tauri/Cargo.lock'), 'seer-classic'), version, 'src-tauri/Cargo.lock');
});
check('the identifier and origin stay', () => {
  assert.equal(tauri.identifier, IDENTIFIER);
  for (const window of tauri.app.windows) assert.notEqual(window.useHttpsScheme, true, `window ${window.label}: useHttpsScheme`);
  for (const file of ['src-tauri/tauri.bundle.conf.json']) assert.equal(json(file).identifier, undefined, `${file} keeps the identifier`);
  assert.doesNotMatch(read('src-tauri/src/main.rs') + read('src-tauri/src/shell.rs'), /register_(asynchronous_)?uri_scheme_protocol/,
    'the page is served by Tauri\'s own protocol');
});
check('the player README and the notices carry the asset notice', () => {
  const notice = read('src/app/asset-notice.txt').trim();
  assert(read('tools/distribution/player-readme.txt').includes(notice), 'tools/distribution/player-readme.txt');
  assert.match(read('tools/distribution/third-party-notices.mjs'), /asset-notice\.txt/, 'THIRD-PARTY-NOTICES.txt starts with it');
});
finish({version});
