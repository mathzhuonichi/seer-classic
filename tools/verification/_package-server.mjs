/**
 * Runs inside an unzipped browser package's own Node.js, started by _browser.mjs for SEER_PACKAGE: answers the requests the
 * parent sends over the IPC channel with that package's server.mjs. Each request goes through Node's HTTP client and the
 * package's HTTP server over an in-memory connection, so every answer passes the server's own HTTP handling; this machine's
 * sandbox refuses local TCP connections, so the browser cannot reach a listening port.
 *
 * Usage: <package>/runtime/darwin-arm64/node _package-server.mjs <package>   (with an IPC channel)
 */
import http from 'node:http';
import path from 'node:path';
import {duplexPair} from 'node:stream';
import {pathToFileURL} from 'node:url';

const [packageDir] = process.argv.slice(2);
const {createGameServer, readPayload} = await import(pathToFileURL(path.join(packageDir, 'server.mjs')).href);
const root = path.join(packageDir, 'game'), {version} = readPayload(root).payload, server = createGameServer(root, version);
/** Bad Gateway: the request did not get through the HTTP client. */
const FAILED = 502;

const createConnection = () => {
  const [client, socket] = duplexPair();
  server.emit('connection', socket);
  return client;
};

process.on('message', ({id, method, path: target, headers}) => {
  const request = http.request({method, path: target, headers, createConnection}, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => process.send({id, status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
  });
  request.on('error', error => process.send({id, status: FAILED, headers: {}, body: Buffer.from(String(error))}));
  request.end();
});
process.on('disconnect', () => process.exit(0));
process.send({ready: version});
