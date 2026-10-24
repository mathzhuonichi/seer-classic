import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {duplexPair} from 'node:stream';
import {after, before, test} from 'node:test';
import zlib from 'node:zlib';
import {
  APP, MIME, browserCommands, checkFiles, contentType, createGameServer, listen, openBrowser, parseRange, probe, refusedPortLines, resolvePath,
  stopSignals,
} from './server.mjs';

const VERSION = '9.9.9';
const BYTES = Buffer.from('0123456789abcdef');
const GZIP = zlib.gzipSync(Buffer.from('{"hello":"world"}'));
let root, server;

/**
 * A request through Node's HTTP client and the game server over an in-memory connection (this machine's sandbox refuses local
 * TCP connections), with the path exactly as written: fetch would normalize `..`.
 */
function request(pathname, {method = 'GET', headers = {}} = {}) {
  const createConnection = () => {
    const [client, socket] = duplexPair();
    server.emit('connection', socket);
    return client;
  };
  return new Promise((resolve, reject) => {
    const outgoing = http.request({path: pathname, method, headers, createConnection}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'seer-server-test-'));
  const write = (relative, content) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
    fs.writeFileSync(path.join(root, relative), content);
  };
  write('index.html', '<!doctype html><title>t</title>');
  write('assets/index-abc.js', 'export {};');
  write('ruffle/core.wasm', BYTES);
  write('battle-animations/1.json.gz', GZIP);
  write('audio/bgm.m4a', BYTES);
  write('portraits/中文 名.png', BYTES);
  write('empty.json', '');
  fs.writeFileSync(path.join(path.dirname(root), `${path.basename(root)}-secret.txt`), 'outside');
  server = createGameServer(root, VERSION);
});
after(() => {
  fs.rmSync(root, {recursive: true, force: true});
  fs.rmSync(path.join(path.dirname(root), `${path.basename(root)}-secret.txt`), {force: true});
});

test('the resolver maps request paths into the root and refuses every way out', () => {
  const base = path.resolve('/srv/game');
  assert.equal(resolvePath(base, '/'), path.join(base, 'index.html'));
  assert.equal(resolvePath(base, '/maps/hd/2.webp'), path.join(base, 'maps', 'hd', '2.webp'));
  assert.equal(resolvePath(base, '/portraits/%E4%B8%AD%E6%96%87%20%E5%90%8D.png'), path.join(base, 'portraits', '中文 名.png'));
  for (const refused of ['', 'index.html', '/..', '/../x', '/a/../../x', '/%2e%2e/x', '/%2E%2E%2Fx', '/..%2fx', '/..%5cx', '/a\\b',
    '/C:/Windows/win.ini', '/C%3A/x', '/a:stream', '//server/share/x', '/%2F%2Fserver/x', '/a//b', '/./x', '/a/.', '/%00',
    '/x%00.png', '/%E0%A4%A', '/a%2fb/../..']) {
    assert.equal(resolvePath(base, refused), null, refused);
  }
});

test('on Windows the resolver gives a path below the drive folder and refuses drive, UNC and backslash forms', () => {
  const base = 'C:\\Games\\SeerClassic 0.9\\game';
  assert.equal(resolvePath(base, '/maps/hd/2.webp', path.win32), 'C:\\Games\\SeerClassic 0.9\\game\\maps\\hd\\2.webp');
  assert.equal(resolvePath(base, '/', path.win32), 'C:\\Games\\SeerClassic 0.9\\game\\index.html');
  for (const refused of ['/C:/Windows/win.ini', '/C:%5CWindows', '/%5C%5Cserver%5Cshare', '/..%5C..%5Cwin.ini', '/a\\..\\..', '/D%3A', '/x::$DATA']) {
    assert.equal(resolvePath(base, refused, path.win32), null, refused);
  }
});

test('content types cover what the game requests', () => {
  for (const [file, type] of [['a.wasm', 'application/wasm'], ['a.json', 'application/json; charset=utf-8'], ['a.json.gz', 'application/gzip'],
    ['a.swf', 'application/x-shockwave-flash'], ['a.webp', 'image/webp'], ['A.PNG', 'image/png'], ['a.svg', 'image/svg+xml'],
    ['a.m4a', 'audio/mp4'], ['a.mp3', 'audio/mpeg'], ['a.jpg', 'image/jpeg'], ['index.html', 'text/html; charset=utf-8'],
    ['a.js', 'text/javascript; charset=utf-8'], ['a.css', 'text/css; charset=utf-8'], ['LICENSE_MIT', 'application/octet-stream']]) {
    assert.equal(contentType(file), type, file);
  }
  assert(Object.values(MIME).every(type => !/gzip.*encoding/i.test(type)));
});

test('Range headers', () => {
  const size = 16;
  for (const [header, expected] of [[undefined, null], ['', null], ['bytes=0-3', {start: 0, end: 3}], ['bytes=4-', {start: 4, end: 15}],
    ['bytes=-5', {start: 11, end: 15}], ['bytes=-99', {start: 0, end: 15}], ['bytes=10-99', {start: 10, end: 15}],
    ['bytes=16-', 'unsatisfiable'], ['bytes=-0', 'unsatisfiable'], ['bytes=5-2', null], ['bytes=0-1,4-5', null], ['items=0-1', null],
    ['bytes=-', null], ['bytes= 0-1', null]]) {
    assert.deepEqual(parseRange(header, size), expected, String(header));
  }
  assert.equal(parseRange('bytes=0-', 0), 'unsatisfiable');
});

test('GET serves the page, WebAssembly and gzip files as their own bytes', async () => {
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-cache');
  const wasm = await request('/ruffle/core.wasm');
  assert.equal(wasm.headers['content-type'], 'application/wasm');
  assert.deepEqual(wasm.body, BYTES);
  const gz = await request('/battle-animations/1.json.gz', {headers: {'accept-encoding': 'gzip'}});
  assert.equal(gz.headers['content-type'], 'application/gzip');
  assert.equal(gz.headers['content-encoding'], undefined);
  assert.deepEqual(gz.body, GZIP);
  const script = await request('/assets/index-abc.js?v=1');
  assert.equal(script.headers['cache-control'], 'public, max-age=31536000, immutable');
  const named = await request('/portraits/%E4%B8%AD%E6%96%87%20%E5%90%8D.png');
  assert.equal(named.status, 200);
  assert.equal(named.headers['x-content-type-options'], 'nosniff');
  const empty = await request('/empty.json');
  assert.equal(empty.status, 200);
  assert.equal(empty.headers['content-length'], '0');
});

test('Range and HEAD for media', async () => {
  const part = await request('/audio/bgm.m4a', {headers: {range: 'bytes=2-5'}});
  assert.equal(part.status, 206);
  assert.equal(part.headers['content-range'], 'bytes 2-5/16');
  assert.equal(part.headers['content-length'], '4');
  assert.deepEqual(part.body, BYTES.subarray(2, 6));
  const tail = await request('/audio/bgm.m4a', {headers: {range: 'bytes=-3'}});
  assert.deepEqual(tail.body, BYTES.subarray(13));
  const beyond = await request('/audio/bgm.m4a', {headers: {range: 'bytes=99-'}});
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers['content-range'], 'bytes */16');
  const stale = await request('/audio/bgm.m4a', {headers: {range: 'bytes=2-5', 'if-range': '"other"'}});
  assert.equal(stale.status, 200);
  assert.equal(stale.body.length, 16);
  const head = await request('/audio/bgm.m4a', {method: 'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], '16');
  assert.equal(head.headers['accept-ranges'], 'bytes');
  assert.equal(head.body.length, 0);
});

test('ETag and Last-Modified answer 304', async () => {
  const first = await request('/ruffle/core.wasm');
  assert.match(first.headers.etag, /^"[0-9a-f]+-[0-9a-f]+"$/);
  assert.equal((await request('/ruffle/core.wasm', {headers: {'if-none-match': first.headers.etag}})).status, 304);
  assert.equal((await request('/ruffle/core.wasm', {headers: {'if-none-match': `"x", W/${first.headers.etag}`}})).status, 304);
  assert.equal((await request('/ruffle/core.wasm', {headers: {'if-none-match': '"x"'}})).status, 200);
  assert.equal((await request('/ruffle/core.wasm', {headers: {'if-modified-since': first.headers['last-modified']}})).status, 304);
  assert.equal((await request('/ruffle/core.wasm', {headers: {'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT'}})).status, 200);
});

test('missing files, folders, paths out of the root and other methods are refused', async () => {
  for (const pathname of ['/missing.png', '/portraits', '/assets/', `/../${path.basename(root)}-secret.txt`,
    `/%2e%2e/${path.basename(root)}-secret.txt`, `/..%2f${path.basename(root)}-secret.txt`, '/%00', '/C:/Windows/win.ini']) {
    const answer = await request(pathname);
    assert.equal(answer.status, 404, pathname);
    assert.doesNotMatch(answer.body.toString(), /outside/);
  }
  const post = await request('/', {method: 'POST'});
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});

test('the probe path answers with the game and its version', async () => {
  const answer = await request('/__seer-classic');
  assert.equal(answer.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(answer.body), {app: APP, version: VERSION});
});

/** Whether this process may open local TCP connections: the sandbox of the development machine refuses them. */
async function canConnect() {
  const probeServer = http.createServer((_, response) => response.end());
  await new Promise(resolve => probeServer.listen(0, '127.0.0.1', resolve));
  try {
    return await new Promise(resolve => http.get({host: '127.0.0.1', port: probeServer.address().port}, response => {
      response.resume();
      resolve(true);
    }).on('error', () => resolve(false)));
  } finally {
    probeServer.close();
  }
}
const blocked = !await canConnect() && 'local TCP connections are refused here (the sandbox)';

test('a taken port is told apart: this game already running, or another program', {skip: blocked}, async () => {
  const game = (await listen(createGameServer(root, VERSION), 0)).server, other = http.createServer((_, response) => response.end('<!doctype html>'));
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  try {
    assert.deepEqual(await probe(game.address().port), {app: APP, version: VERSION});
    assert.equal(await probe(other.address().port), null);
    assert.deepEqual(await listen(createGameServer(root, VERSION), other.address().port), {taken: true});
    assert.deepEqual(await listen(createGameServer(root, VERSION), game.address().port), {running: VERSION});
  } finally {
    other.close();
    game.close();
  }
});

/** A server whose listen fails with `code`, as the system's own refusals of a port do. */
const failingServer = code => Object.assign(new EventEmitter(), {
  listen() { process.nextTick(() => this.emit('error', Object.assign(new Error(`listen ${code}: permission denied`), {code}))); },
});

test('a port the system refuses (on Windows a reserved range) is told apart from a taken one, and Windows says how to free it', async () => {
  // The probe of the refused port meets another program (or, in the sandbox, no connection): no game server answers there.
  const other = http.createServer((_, response) => response.end('<!doctype html>'));
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  try {
    for (const code of ['EACCES', 'EADDRNOTAVAIL']) assert.deepEqual(await listen(failingServer(code), other.address().port), {refused: code});
    await assert.rejects(listen(failingServer('EINVAL'), other.address().port), {code: 'EINVAL'});
  } finally {
    other.close();
  }
  const windows = refusedPortLines('win32', 'EACCES').join('\n');
  for (const part of ['1426', 'EACCES', 'Hyper-V', '重启电脑', '以管理员身份运行', 'net stop winnat', 'net start winnat']) assert(windows.includes(part), part);
  assert.doesNotMatch(refusedPortLines('darwin', 'EACCES').join('\n'), /winnat/);
});

test('the startup check finds missing and changed files', async () => {
  const entries = {'ruffle/core.wasm': [16, 'x'], 'audio/bgm.m4a': [15, 'x'], 'maps/gone.webp': [3, 'x']};
  assert.deepEqual(await checkFiles(root, entries), ['audio/bgm.m4a', 'maps/gone.webp']);
});

test('on Windows the game opens in Edge as an app window, else in the default browser', () => {
  const url = 'http://127.0.0.1:1426/';
  const env = {'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\玩家\\AppData\\Local'};
  const edge = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.deepEqual(browserCommands(url, {platform: 'win32', env, exists: file => file === edge}),
    [{command: edge, args: [`--app=${url}`]}, {command: 'explorer.exe', args: [url]}]);
  const local = 'C:\\Users\\玩家\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.equal(browserCommands(url, {platform: 'win32', env, exists: file => file === local})[0].command, local);
  assert.deepEqual(browserCommands(url, {platform: 'win32', env: {}, exists: () => true}), [{command: 'explorer.exe', args: [url]}]);
  assert.deepEqual(browserCommands(url, {platform: 'darwin', env, exists: () => false}), [{command: 'open', args: [url]}]);
  assert.deepEqual(browserCommands(url, {platform: 'linux', env, exists: () => true}), []);
});

test('a browser that cannot start hands over to the next command', async () => {
  const tried = [];
  const run = (command, onError) => { tried.push(command.command); if (command.command === 'msedge.exe') process.nextTick(onError); };
  assert.deepEqual(await openBrowser([{command: 'msedge.exe', args: []}, {command: 'explorer.exe', args: []}], run), {command: 'explorer.exe', args: []});
  assert.deepEqual(tried, ['msedge.exe', 'explorer.exe']);
  assert.equal(await openBrowser([{command: 'msedge.exe', args: []}], run), null);
});

test('closing the console window stops the server on both systems', () => {
  assert.deepEqual(stopSignals('win32'), ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']);
  assert.deepEqual(stopSignals('darwin'), ['SIGINT', 'SIGTERM', 'SIGHUP']);
});
