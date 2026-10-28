/**
 * The development launcher that ../test.command runs: serves the game with Vite at http://127.0.0.1:1426/ in the background,
 * opens it in the default browser and lets its Terminal window close, as the browser package's server.mjs does. The server
 * stops once no game page has been open for a minute: each page's Vite client holds a connection to it.
 *
 * Usage: node tools/dev/play.mjs
 */
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HOST, PORT, closeTerminalWindow, createPresence, openBrowser, startInBackground, waitForKey} from '../distribution/browser/server.mjs';

/** The argument that runs this file as the background server. */
const SERVE_FLAG = '--serve';
const file = fileURLToPath(import.meta.url), root = path.resolve(path.dirname(file), '../..'), url = `http://${HOST}:${PORT}/`;

/** Whether something already answers at the game's address, such as a development server started before. */
const answers = () => new Promise(resolve => http.get(url, response => { response.resume(); resolve(true); }).on('error', () => resolve(false)));

/** Vite in the background, counting the pages whose client is connected; tells the starting console whether it listens. */
async function serve() {
  try {
    const {createServer} = await import('vite'), presence = createPresence(() => process.exit(0));
    const server = await createServer({root, server: {host: HOST, port: PORT, strictPort: true}, plugins: [{
      name: 'page-presence',
      configureServer(vite) {
        vite.hot.on('vite:client:connect', presence.opened);
        vite.hot.on('vite:client:disconnect', presence.closed);
      },
    }]});
    await server.listen();
    process.send({listening: true});
  } catch (error) {
    process.send({error: error.message}, () => process.exit(1));
  }
}

async function main() {
  if (process.argv.includes(SERVE_FLAG)) return serve();
  if (await answers()) console.log('游戏已经在运行，正在打开浏览器…');
  else {
    console.log('正在后台启动游戏，浏览器会自动打开，这个窗口随后自动关闭。关闭所有游戏页面约 1 分钟后，游戏会自动停止。');
    const started = await startInBackground([file, SERVE_FLAG]);
    if (started.error) {
      console.error(`启动失败（${started.error}），端口 ${PORT} 可能被占用。`);
      await waitForKey();
      process.exit(1);
    }
  }
  await openBrowser([{command: 'open', args: [url]}]);
  closeTerminalWindow();
}

if (import.meta.main) await main();
