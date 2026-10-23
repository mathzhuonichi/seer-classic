import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Ruffle's self-hosted build, served in development and emitted into the build under ruffle/ as published: ruffle.js loads
 * its core chunk and WebAssembly by their own names, so they cannot go through the bundler. Nothing is fetched from a CDN.
 */
function ruffleFiles(): Plugin {
  const directory = path.dirname(createRequire(import.meta.url).resolve('@ruffle-rs/ruffle/package.json'));
  const files = fs.readdirSync(directory).filter(name => /\.(js|wasm)$/.test(name) || name.startsWith('LICENSE'));
  const types: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm' };
  return {
    name: 'ruffle-files',
    configureServer(server) {
      server.middlewares.use('/ruffle', (request, response, next) => {
        const name = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname).slice(1);
        if (!files.includes(name)) return next();
        response.setHeader('Content-Type', types[path.extname(name)] ?? 'text/plain');
        fs.createReadStream(path.join(directory, name)).pipe(response);
      });
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: 'asset', fileName: `ruffle/${name}`, source: fs.readFileSync(path.join(directory, name)) });
    },
  };
}

/**
 * `--mode desktop` builds the Tauri app's code only, into dist-desktop/: public/ ships beside the executable as the staged payload
 * (tools/distribution/stage_desktop_payload.py) and is never compiled into it. The web build copies public/ into dist/ as before.
 */
export default defineConfig(({ mode }) => ({
  plugins: [ruffleFiles()],
  server: { port: 1420, strictPort: true, watch: {ignored:['**/artifacts/**','**/.cache/**','**/releases/**']} },
  build: mode === 'desktop' ? { outDir: 'dist-desktop', copyPublicDir: false } : {},
  clearScreen: false,
}));
