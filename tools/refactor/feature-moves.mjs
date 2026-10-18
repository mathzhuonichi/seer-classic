// Move-only restructure into src/{app,kernel,shared,features/*}. Usage:
//   node feature-moves.mjs <repo> [--apply]
// Without --apply it prints the move table and unmatched files.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const [repo, flag] = process.argv.slice(2);
const apply = flag === '--apply';
const git = (...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8'});

// Ordered rules: first match wins. `$1` etc. refer to regex groups.
const F = 'src/features';
const D = 'src/domain';
const rules = [
  // kernel: composition, runtime, save, contracts
  [/^src\/game\.ts$/, 'src/kernel/game.ts'],
  [/^src\/game-types\.ts$/, 'src/kernel/contract.ts'],
  [/^src\/controller\/runtime\.ts$/, 'src/kernel/api.ts'],
  [/^src\/controller\/(context|dispatch|snapshot|save-state)\.ts$/, 'src/kernel/$1.ts'],
  [/^src\/controller\/acquisition\.ts$/, 'src/kernel/acquire.ts'],
  [/^src\/mechanics\/persistence(\.test\.mjs|\.ts)$/, 'src/kernel/persistence$1'],
  [/^raising\/game\/save(\.test\.mjs|\.ts)$/, 'src/kernel/save$1'],
  // domain: pure game content and rules shared by features
  [/^src\/mechanics\/catalog\.ts$/, `${D}/catalog/catalog.ts`],
  [/^src\/controller\/catalog-enrichment\.ts$/, `${D}/catalog/enrichment.ts`],
  [/^src\/controller\/economy\.ts$/, `${D}/economy.ts`],
  [/^src\/progression\/(acquisition|acquisition-model|acquisition-limits|initial-acquisition|native-acquisition|recruitment|spt-recruitment|skins|collection-ancestry|conventional-moves|species-graph)(\.test\.mjs|\.ts)$/, `${D}/acquisition/$1$2`],
  [/^src\/progression\/(fusion|breeding)(\.test\.mjs|\.ts)$/, `${D}/recipes/$1$2`],
  [/^src\/progression\/(battle-facilities|brave-tower|challenge-campaigns|npc-training|trainer-skills)(\.test\.mjs|\.ts)$/, `${D}/challenges/$1$2`],
  [/^src\/mechanics\/(campaign-rules|boss-encounter)\.ts$/, `${D}/challenges/$1.ts`],
  [/^src\/mechanics\/npc-training\.ts$/, `${D}/challenges/npc-training-scripts.ts`],
  [/^src\/mechanics\/(engravings|engraving-access)\.ts$/, `${D}/engravings/$1.ts`],
  [/^src\/mechanics\/traits\.ts$/, `${D}/traits.ts`],
  [/^src\/progression\/battle-supplies\.ts$/, `${D}/battle-supplies.ts`],
  [/^src\/progression\/item-shop(\.test\.mjs|\.ts)$/, `${D}/item-shop$1`],
  [/^src\/world\.ts$/, `${D}/world/world.ts`],
  [/^src\/world-(expansion|habitat-regions)\.ts$/, `${D}/world/$1.ts`],
  [/^src\/world\/(.+)$/, `${D}/world/$1`],
  // app shell
  [/^src\/App\.tsx$/, 'src/app/App.tsx'],
  [/^src\/dev\/preview\.tsx$/, 'src/app/preview.tsx'],
  [/^src\/components\/shell\/(.+)$/, 'src/app/$1'],
  [/^src\/presentation\/shell-navigation\.ts$/, 'src/app/shell-navigation.ts'],
  [/^src\/components\/(ClassicRobot\.tsx|classic-robot\.css|AudioSettings\.tsx|AudioSettings\.css)$/, 'src/app/$1'],
  [/^src\/audio\/(.+)$/, 'src/app/audio/$1'],
  [/^src\/(app|game-shell)\.css$/, 'src/app/$1.css'],
  [/^src\/presentation\/classic-font\.css$/, 'src/app/classic-font.css'],
  // shared: feature-agnostic view helpers and UI kit
  [/^src\/controller\/view-common\.ts$/, 'src/shared/view-common.ts'],
  [/^src\/presentation\/(labels|view-helpers|monster-views|party-order|creature-art|element-types|item-icons|display-resolution|game-display|encounter-level)(\.test\.mjs|\.ts)$/, 'src/shared/$1$2'],
  [/^src\/presentation\/(creature-art-data|type-icon-assets|item-icon-assets)\.json$/, 'src/shared/$1.json'],
  [/^src\/components\/(use-pager\.ts|TypeIcon\.tsx|type-icon\.css|TypeFilter\.(tsx|css)|CreatureArt\.tsx|creature-art\.css|ItemIcon\.(tsx|css)|ItemTile\.(tsx|css)|ItemTooltip\.tsx|ItemCategoryTabs\.(tsx|css)|MonsterCard\.tsx|petbag-party-card\.css|GameWindow\.tsx)$/, 'src/shared/ui/$1'],
  [/^src\/management\.css$/, 'src/shared/ui/management.css'],
  // features: behaviour, slice views, presentation runtime and UI
  [/^src\/controller\/(battle-actions|battle-presentation|battle-session|battle-setup|battle-view|settlement)\.ts$/, `${F}/battle/$1.ts`],
  [/^src\/presentation\/(battle-[a-z-]+|skill-frame-buffer)(\.test\.mjs|\.ts)$/, `${F}/battle/$1$2`],
  [/^src\/components\/battle\/(.+)$/, `${F}/battle/ui/$1`],
  [/^src\/components\/(Battle|BattleLoading)\.tsx$/, `${F}/battle/ui/$1.tsx`],
  [/^src\/battle\.css$/, `${F}/battle/ui/battle.css`],
  [/^src\/controller\/raising-actions\.ts$/, `${F}/raising/actions.ts`],
  [/^src\/controller\/monster-views\.ts$/, `${F}/raising/view.ts`],
  [/^src\/presentation\/ev-draft(\.test\.mjs|\.ts)$/, `${F}/raising/ev-draft$1`],
  [/^src\/components\/(raising|petbag)\/(.+)$/, `${F}/raising/ui/$1/$2`],
  [/^src\/components\/(Raising|Modifier|MonsterManager)\.(tsx|css)$/, `${F}/raising/ui/$1.$2`],
  [/^src\/presentation\/(dex-view|fusion-view|breeding-view|catalog-views)(\.test\.mjs|\.ts)$/, `${F}/collection/$1$2`],
  [/^src\/controller\/encounter-views\.ts$/, `${F}/collection/encounter-views.ts`],
  [/^src\/components\/(Dex|Fusion|Breeding|RecipeWorkbench)\.(tsx|css)$/, `${F}/collection/ui/$1.$2`],
  [/^src\/fusion\.css$/, `${F}/collection/ui/fusion.css`],
  [/^src\/controller\/item-(actions|views)\.ts$/, `${F}/items/$1.ts`],
  [/^src\/presentation\/(item-categories|inventory-views|shop-views)(\.test\.mjs|\.ts)$/, `${F}/items/$1$2`],
  [/^src\/components\/(Inventory|InventoryDetail|ItemShop)\.(tsx|css)$/, `${F}/items/ui/$1.$2`],
  [/^src\/components\/use-item-content\.ts$/, `${F}/items/ui/use-item-content.ts`],
  [/^src\/controller\/engravings\.ts$/, `${F}/engravings/loadout.ts`],
  [/^src\/controller\/engraving-actions\.ts$/, `${F}/engravings/actions.ts`],
  [/^src\/presentation\/engraving-views(\.test\.mjs|\.ts)$/, `${F}/engravings/view$1`],
  [/^src\/components\/(EngravingShop|EngravingSlots|EngravingTransferSource)\.tsx$/, `${F}/engravings/ui/$1.tsx`],
  [/^src\/controller\/(progress-views|quests)\.ts$/, `${F}/challenges/$1.ts`],
  [/^src\/presentation\/(boss-evidence|challenge-center)\.ts$/, `${F}/challenges/$1.ts`],
  [/^src\/components\/(ChallengeCenter|ChallengeCampaignScene|BattleFacilities|BraveTower|QuestPanel|BossEvidence)\.(tsx|css)$/, `${F}/challenges/ui/$1.$2`],
  [/^src\/components\/(challenge-campaign-scene|boss-evidence)\.css$/, `${F}/challenges/ui/$1.css`],
  [/^src\/presentation\/(map-[a-z-]+|scene-[a-z-]+|world-[a-z-]+|atlas|atlas-graph-assets)(\.test\.mjs|\.ts|\.json)$/, `${F}/world/$1$2`],
  [/^src\/components\/world\/(.+)$/, `${F}/world/ui/$1`],
  [/^src\/components\/(WorldMap|WorldAtlas)\.tsx$/, `${F}/world/ui/$1.tsx`],
  [/^src\/(world|atlas)\.css$/, `${F}/world/ui/$1.css`],
];

const files = git('ls-files', 'src', 'raising/game').trim().split('\n');
const moves = new Map();
const unmatched = [];
for (const file of files) {
  const rule = rules.find(([re]) => re.test(file));
  if (rule) moves.set(file, file.replace(rule[0], rule[1]));
  else if (!/^src\/main\.tsx$/.test(file)) unmatched.push(file);
}
const targets = new Map();
for (const [from, to] of moves) {
  if (targets.has(to)) throw new Error(`collision: ${from} and ${targets.get(to)} -> ${to}`);
  targets.set(to, from);
}
console.log(`${moves.size} moves, ${unmatched.length} unmatched`);
if (unmatched.length) console.log('UNMATCHED:\n  ' + unmatched.join('\n  '));
if (!apply) {
  for (const [from, to] of moves) console.log(`${from} -> ${to}`);
  process.exit(0);
}

// Rewrite pass over every tracked text file, computed against old locations.
const mapPath = p => moves.get(p) ?? p;
const tracked = git('ls-files').trim().split('\n').filter(f => /\.(ts|tsx|mjs|js|css|py|md|html)$/.test(f) && fs.existsSync(path.join(repo, f)));
const codeExt = /\.(ts|tsx|mjs|js|css|html)$/;
const exts = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts'];
const relSpec = /((?:from|import)\s*\(?\s*|import\.meta\.glob\(\s*|new URL\(\s*|@import\s+)(['"])(\.{1,2}\/[^'"]*)\2/g;
const rootStr = /(['"`])(\/?)((?:src|raising\/game)\/[A-Za-z0-9_./-]+)\1/g;
let rewritten = 0;
const relTo = (fromFile, target) => {
  let rel = path.posix.relative(path.posix.dirname(fromFile), target);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
};
const newContent = new Map();
for (const file of tracked) {
  const text = fs.readFileSync(path.join(repo, file), 'utf8');
  const newFile = mapPath(file);
  let next = text;
  if (codeExt.test(file)) {
    next = next.replace(relSpec, (match, head, quote, spec) => {
      // A glob or directory keeps its tail; only the fixed directory prefix is re-pointed.
      const glob = spec.search(/[*{]/);
      const fixed = glob >= 0 ? spec.slice(0, spec.lastIndexOf('/', glob) + 1) : spec;
      const tail = spec.slice(fixed.length);
      const abs = path.posix.normalize(path.posix.join(path.posix.dirname(file), fixed)).replace(/\/$/, '');
      const ext = exts.find(e => files.includes(abs + e) || fs.existsSync(path.join(repo, abs + e)));
      if (ext === undefined) return match;
      const resolved = mapPath(abs + ext);
      if (newFile === file && resolved === abs + ext) return match;
      let rel = relTo(newFile, resolved);
      if (ext) rel = rel.slice(0, -ext.length);
      if (fixed.endsWith('/') && !rel.endsWith('/')) rel += '/';
      return `${head}${quote}${rel}${tail}${quote}`;
    });
  }
  next = next.replace(rootStr, (match, quote, slash, p) => moves.has(p) ? `${quote}${slash}${moves.get(p)}${quote}` : match);
  if (next !== text) { newContent.set(file, next); rewritten++; }
}
for (const [from, to] of moves) {
  fs.mkdirSync(path.join(repo, path.dirname(to)), {recursive: true});
  git('mv', from, to);
}
for (const [file, text] of newContent) fs.writeFileSync(path.join(repo, mapPath(file)), text);
console.log(`moved ${moves.size}, rewrote ${rewritten} files`);
