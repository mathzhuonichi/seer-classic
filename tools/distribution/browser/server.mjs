/**
 * Seer Classic's local game server: the launchers of the browser package run it with the Node.js of runtime/. It serves the
 * game/ folder beside it at http://127.0.0.1:1426/ and opens the game in the player's browser, whose storage for that origin
 * holds the save. It uses Node's own modules only (design/notes/browser-package-2026-10-23.md).
 *
 * Usage: node server.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream';
import {fileURLToPath} from 'node:url';

export const HOST = '127.0.0.1';
/** Fixed: the browser keeps the save under this origin, the one the development launcher (test.command) has always used. */
export const PORT = 1426;
/** Answers with this game's name and version, so a second start can tell a running game server from another program. */
export const PROBE_PATH = '/__seer-classic';
export const APP = 'seer-classic';
/** game/payload.json: the version and every staged file's size and SHA-256 (tools/distribution/stage_payload.py). */
const PAYLOAD = 'payload.json';
/** How long a probe of a busy port waits for an answer. */
const PROBE_TIMEOUT_MS = 2000;
/** Files whose sizes are checked at once at startup. */
const CHECK_BATCH = 64;
/** The exit code after a failure the console has explained and the player has acknowledged (the Windows launcher reads it). */
export const EXIT_EXPLAINED = 3;
/** Shown files of a failed startup check. */
const LISTED_PROBLEMS = 5;
/** Content-hashed build files never change under their name; every other answer is revalidated through its ETag. */
const IMMUTABLE = '/assets/';
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable', CACHE_REVALIDATE = 'no-cache';
/** Host names answered: a page under another name that resolves to 127.0.0.1 (DNS rebinding) gets 403. */
const LOCAL_NAMES = new Set([HOST, 'localhost']);
/**
 * listen() errors that mean the system refuses this program the port. On Windows WSAEACCES, reported as EACCES: a range that
 * Hyper-V, WSL 2 or Docker reserved (netsh int ipv4 show excludedportrange protocol=tcp), or a program holding it exclusively.
 */
const PORT_REFUSED = new Set(['EACCES', 'EADDRNOTAVAIL']);
/** Read errors that mean the system denies access: on macOS, Terminal not allowed into Downloads, Documents or Desktop. */
const READ_DENIED = new Set(['EPERM', 'EACCES']);

/** Content types by extension. `.gz` files are served as their own bytes, with no Content-Encoding: the game inflates them. */
export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.gz': 'application/gzip', '.swf': 'application/x-shockwave-flash', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
export const contentType = file => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * The file below `root` that a request path names, or null. The path is percent-decoded once; a NUL, a backslash, a colon
 * (drive letters, NTFS streams), an empty, `.` or `..` segment refuses it, so neither a POSIX nor a Windows form (`C:\…`,
 * `\\server\share`, `//server/share`, `..%5c`) can leave `root`. `pathApi` is node:path's own form for the platform.
 */
export function resolvePath(root, pathname, pathApi = path) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (/[\0\\:]/.test(decoded)) return null;
  const segments = (decoded === '/' ? 'index.html' : decoded.slice(1)).split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return null;
  const base = pathApi.resolve(root), file = pathApi.join(base, ...segments);
  return file.startsWith(base + pathApi.sep) ? file : null;
}

/**
 * The bytes a `Range` header asks of a file of `size` bytes: `{start, end}` (inclusive), 'unsatisfiable', or null to send the
 * whole file (no header, a malformed one, or several ranges).
 */
export function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix === 0 || size === 0 ? 'unsatisfiable' : {start: Math.max(0, size - suffix), end: size - 1};
  }
  const start = Number(match[1]), last = match[2] ? Number(match[2]) : Infinity;
  if (last < start) return null;
  return start >= size ? 'unsatisfiable' : {start, end: Math.min(last, size - 1)};
}

const etagOf = stat => `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

/** Whether the request's validators match the file, so a 304 answers it. If-None-Match wins over If-Modified-Since. */
function notModified(headers, etag, stat) {
  const tags = headers['if-none-match'];
  if (tags) return tags.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag);
  const since = Date.parse(headers['if-modified-since'] ?? '');
  return Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since;
}

/** A Range applies unless If-Range names another version of the file. */
function rangeApplies(headers, etag, stat) {
  const condition = headers['if-range'];
  return !condition || condition === etag || condition === stat.mtime.toUTCString();
}

function sendText(response, status, text, headers = {}) {
  response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...headers});
  response.end(text);
}

/** Answers one GET or HEAD for a file: 200, 206, 304 or 416, streamed from disk. */
function sendFile(request, response, file, stat) {
  const etag = etagOf(stat), head = request.method === 'HEAD';
  const headers = {
    'Content-Type': contentType(file), 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': request.url.startsWith(IMMUTABLE) ? CACHE_IMMUTABLE : CACHE_REVALIDATE, 'X-Content-Type-Options': 'nosniff',
  };
  if (notModified(request.headers, etag, stat)) {
    response.writeHead(304, headers);
    return response.end();
  }
  const range = rangeApplies(request.headers, etag, stat) ? parseRange(request.headers.range, stat.size) : null;
  if (range === 'unsatisfiable') return sendText(response, 416, 'range not satisfiable', {'Content-Range': `bytes */${stat.size}`});
  const {start, end} = range ?? {start: 0, end: stat.size - 1};
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  response.writeHead(range ? 206 : 200, {...headers, 'Content-Length': end - start + 1});
  if (head || stat.size === 0) return response.end();
  pipeline(fs.createReadStream(file, {start, end}), response, () => {});
}

/** The game server for `root` (the game/ folder). It never reads a file into memory and answers only GET and HEAD. */
export function createGameServer(root, version) {
  return http.createServer((request, response) => {
    const name = (request.headers.host ?? '').toLowerCase().replace(/:\d*$/, '');
    if (!LOCAL_NAMES.has(name)) return sendText(response, 403, 'forbidden');
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendText(response, 405, 'method not allowed', {Allow: 'GET, HEAD'});
    const pathname = request.url.split(/[?#]/)[0];
    if (pathname === PROBE_PATH) {
      const body = JSON.stringify({app: APP, version});
      response.writeHead(200, {'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store'});
      return response.end(request.method === 'HEAD' ? undefined : body);
    }
    const file = resolvePath(root, pathname);
    if (!file) return sendText(response, 404, 'not found');
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return sendText(response, 404, 'not found');
      sendFile(request, response, file, stat);
    });
  });
}

/** What answers on `port`: the version of a running game server, or null for another program (or none). */
export function probe(port, host = HOST) {
  return new Promise(resolve => {
    const request = http.get({host, port, path: PROBE_PATH, timeout: PROBE_TIMEOUT_MS}, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { const answer = JSON.parse(body); resolve(answer?.app === APP ? answer : null); } catch { resolve(null); }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

/** game/payload.json as {payload}; {denied: code} when the system denies reading it; {} when it is missing or unreadable. */
export function readPayload(root) {
  try {
    return {payload: JSON.parse(fs.readFileSync(path.join(root, PAYLOAD), 'utf8'))};
  } catch (error) {
    return READ_DENIED.has(error.code) ? {denied: error.code} : {};
  }
}

/** The listed files that are missing or of another size than payload.json says, and the page itself when it is missing. */
export async function checkFiles(root, entries) {
  const listed = Object.entries(entries), problems = fs.existsSync(path.join(root, 'index.html')) ? [] : ['index.html'];
  for (let at = 0; at < listed.length; at += CHECK_BATCH) {
    const sizes = await Promise.all(listed.slice(at, at + CHECK_BATCH).map(([relative]) =>
      fs.promises.stat(path.join(root, ...relative.split('/'))).then(stat => stat.size, () => -1)));
    sizes.forEach((size, index) => { if (size !== listed[at + index][1][0]) problems.push(listed[at + index][0]); });
  }
  return problems;
}

/** Microsoft Edge's usual places on Windows. */
export function edgeCandidates(env) {
  return ['ProgramFiles(x86)', 'ProgramFiles', 'LOCALAPPDATA'].filter(name => env[name])
    .map(name => path.win32.join(env[name], 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
}

/**
 * Google Chrome's and Microsoft Edge's usual places on macOS. Safari deletes a site's script-writable storage, the save
 * included, after 7 days of Safari use without a visit to the site (WebKit's tracking prevention).
 */
export function macBrowserCandidates(env) {
  const folders = ['/Applications', ...(env.HOME ? [path.posix.join(env.HOME, 'Applications')] : [])];
  return ['Google Chrome.app', 'Microsoft Edge.app'].flatMap(app => folders.map(folder => path.posix.join(folder, app)));
}

/**
 * The commands that open `url`, tried in order until one starts: on Windows Microsoft Edge as an app window, then the default
 * browser (explorer.exe hands a URL to it); on macOS Google Chrome, else Microsoft Edge, else the default browser. Elsewhere
 * none: the console shows the address.
 */
export function browserCommands(url, {platform = process.platform, env = process.env, exists = fs.existsSync} = {}) {
  if (platform === 'win32') {
    const edge = edgeCandidates(env).find(candidate => exists(candidate));
    return [...(edge ? [{command: edge, args: [`--app=${url}`]}] : []), {command: 'explorer.exe', args: [url]}];
  }
  if (platform !== 'darwin') return [];
  const app = macBrowserCandidates(env).find(candidate => exists(candidate));
  return [{command: 'open', args: app ? ['-a', app, url] : [url]}];
}

/** Starts a command on its own; `onError` runs when it cannot start. */
function launch({command, args}, onError) {
  const child = spawn(command, args, {detached: true, stdio: 'ignore'});
  child.once('error', onError);
  child.unref();
}

/** Opens `url` with the first of `commands` that starts; resolves to the one that did, or null. */
export function openBrowser(commands, run = launch) {
  return new Promise(resolve => {
    const next = index => {
      if (index >= commands.length) return resolve(null);
      let failed = false;
      run(commands[index], () => { failed = true; next(index + 1); });
      setImmediate(() => { if (!failed) resolve(commands[index]); });
    };
    next(0);
  });
}

/** Signals that stop the server: Ctrl+C, a closed Terminal or console window (Node raises SIGHUP on Windows), Ctrl+Break. */
export const stopSignals = platform => ['SIGINT', 'SIGTERM', 'SIGHUP', ...(platform === 'win32' ? ['SIGBREAK'] : [])];

/**
 * Listens on `port`, or finds it taken: resolves to {server}, {running: version} when a game server already answers there,
 * {taken: true} when another program holds it, or {refused: code} when the system refuses the port (PORT_REFUSED).
 */
export function listen(server, port, host = HOST) {
  return new Promise((resolve, reject) => {
    server.once('error', error => {
      if (error.code !== 'EADDRINUSE' && !PORT_REFUSED.has(error.code)) return reject(error);
      probe(port, host).then(answer => resolve(answer ? {running: answer.version}
        : error.code === 'EADDRINUSE' ? {taken: true} : {refused: error.code}));
    });
    server.listen(port, host, () => resolve({server}));
  });
}

/** Waits for one key when a person can press one (the console stays open to show a message), then exits. */
function exitAfterKey(code) {
  if (!process.stdin.isTTY) process.exit(code);
  console.log('按任意键关闭这个窗口…');
  process.stdin.setRawMode(true);
  process.stdin.once('data', () => process.exit(code));
  process.stdin.resume();
}

function fail(lines) {
  console.error(['', ...lines, ''].join('\n'));
  exitAfterKey(EXIT_EXPLAINED);
}

const SAVE_ORIGIN_LINE = `存档保存在浏览器的 http://${HOST}:${PORT} 网站数据中，必须使用这个端口。`;

/** What the console says when the system refuses port PORT (listen's {refused: code}). */
export function refusedPortLines(platform, code) {
  if (platform !== 'win32') return [`无法启动：系统不允许游戏使用端口 ${PORT}（${code}）。请重启电脑后再试。`, SAVE_ORIGIN_LINE];
  return [`无法启动：Windows 不允许游戏使用端口 ${PORT}（${code}）。Hyper-V、WSL 或 Docker 有时会保留这个端口，另一个程序也可能独占了它。`,
    SAVE_ORIGIN_LINE, '重启电脑通常就能解决。如果重启后仍然这样：在开始菜单中搜索“cmd”，右键点“以管理员身份运行”，',
    '依次输入 net stop winnat 和 net start winnat（每行输完按回车），然后关闭那个窗口，再启动游戏。'];
}

/** What the console says once the game runs. Ctrl+C makes cmd ask whether to end the batch job, so Windows names the window only. */
export function runningLines(version, url, platform) {
  const browsers = platform === 'darwin' ? 'Chrome 或 Edge（Safari 可能在一周不玩后删除存档）' : 'Edge 或 Chrome';
  return [`赛尔经典 · Seer Classic ${version}`, '', `游戏正在运行：${url}`,
    `正在浏览器中打开游戏。如果浏览器没有自动打开，请把上面的地址复制到 ${browsers} 的地址栏。`,
    `存档保存在这个浏览器的 ${url} 网站数据中，请一直用同一个浏览器玩。`, '',
    `关闭这个窗口${platform === 'win32' ? '' : '（或按 Ctrl+C）'}即可停止游戏。玩游戏时请不要关闭它。`];
}

/** What the console says when the system denies reading the game files (readPayload's {denied: code}). */
export function deniedLines(platform, code) {
  if (platform !== 'darwin') return [`系统拒绝读取游戏文件（${code}）。`, '请把整个游戏文件夹移到本地文件夹（例如 C:\\Games）后再启动。'];
  return [`macOS 不允许“终端”读取游戏文件（${code}）：可能是之前询问是否允许访问这个文件夹时点了“不允许”。`,
    '请打开“系统设置 > 隐私与安全性 > 文件和文件夹 > 终端”，打开游戏文件夹所在位置（例如“下载”或“文稿”）的开关，再启动游戏。'];
}

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'game'), url = `http://${HOST}:${PORT}/`;
  process.title = '赛尔经典 · 游戏服务（关闭这个窗口即停止游戏）';
  const {payload, denied} = readPayload(root);
  if (denied) return fail(deniedLines(process.platform, denied));
  if (!payload) return fail(['找不到游戏文件（game 文件夹不完整）。', '请删除这个文件夹，把下载的 ZIP 完整解压后再启动。']);
  const problems = await checkFiles(root, payload.entries);
  if (problems.length) {
    return fail([`游戏文件不完整：有 ${problems.length} 个文件缺失或已损坏，例如 ${problems.slice(0, LISTED_PROBLEMS).join('、')}。`,
      '请删除这个文件夹，把下载的 ZIP 完整解压后再启动（解压时需要约 7 GB 可用磁盘空间）。']);
  }
  const result = await listen(createGameServer(root, payload.version), PORT);
  if (result.refused) return fail(refusedPortLines(process.platform, result.refused));
  if (result.taken) {
    return fail([`无法启动：端口 ${PORT} 已被其他程序占用（例如开发版的 test.command 或另一个程序）。`,
      `请关闭占用端口 ${PORT} 的程序后再启动。`, SAVE_ORIGIN_LINE]);
  }
  if (result.running) {
    const other = result.running === payload.version ? '' : `（不是这个文件夹的 ${payload.version} 版：要玩这一版，请先关闭那个窗口再启动）`;
    console.log(`赛尔经典 ${result.running} 已经在另一个窗口中运行，正在打开浏览器…${other}`);
    await openBrowser(browserCommands(url));
    return;
  }
  for (const signal of stopSignals(process.platform)) process.on(signal, () => { result.server.closeAllConnections(); process.exit(0); });
  console.log(runningLines(payload.version, url, process.platform).join('\n'));
  if (!await openBrowser(browserCommands(url))) console.log('没能自动打开浏览器，请手动打开上面的地址。');
}

if (import.meta.main) await main();
