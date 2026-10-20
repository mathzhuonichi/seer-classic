/** Render V61 redraw layers with the pipeline's resvg (battle_hd_redraw.py).
 * Usage: node render_battle_redraw_svgs.mjs jobs.json
 * jobs.json: {"jobs": [{"svg": "<svg text>", "out": "<png path>"}]}. Each SVG carries its own width, height and viewBox; the
 * PNG is resvg's straight-alpha output. Prints {"renderer": ..., "rendered": n}. No other drawing, filtering or resizing.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const modulePath = path.join(root, '.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js');
const {Resvg} = require(modulePath);
const version = JSON.parse(fs.readFileSync(path.join(modulePath, 'package.json'), 'utf8')).version;
const [jobsPath] = process.argv.slice(2);
if (!jobsPath) throw Error('Usage: render_battle_redraw_svgs.mjs jobs.json');
const {jobs} = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const options = {font: {loadSystemFonts: false}};
for (const job of jobs) {
  fs.mkdirSync(path.dirname(job.out), {recursive: true});
  fs.writeFileSync(job.out, new Resvg(job.svg, options).render().asPng());
}
console.log(JSON.stringify({renderer: `@resvg/resvg-js ${version}`, rendered: jobs.length}));
