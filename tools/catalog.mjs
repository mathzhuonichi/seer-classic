/**
 * Node loader for the game catalog: reads `data/` from disk and assembles it exactly like the bundled
 * loader (`src/domain/catalog/catalog.ts`). For plain Node scripts; code that already runs inside Vite
 * (SSR suites, `ssrLoadModule`) calls `loadCatalog()` from that module instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleCatalog} from '../src/domain/catalog/catalog.ts';

const defaultDataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

/** Every catalog record and table under `dataDir`, as `CatalogData`. */
export function loadCatalogNode(dataDir = defaultDataDir) {
  const json = file => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  // Mirrors Vite's `*.json` glob: dot files are not matched.
  const records = dir => Object.fromEntries(fs.readdirSync(path.join(dataDir, dir)).filter(name => name.endsWith('.json') && !name.startsWith('.'))
    .map(name => [name, json(`${dir}/${name}`)]));
  return assembleCatalog({
    monsters: records('monsters'), bosses: records('bosses'), trainers: records('trainers'),
    skills: json('skills.json'), natures: json('natures.json'), types: json('types.json'), conditions: json('conditions.json'), items: json('items.json'),
  });
}
