import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {createBattle} from '../../battle/core/src/battle.ts';
import {buildDataSet} from '../../battle/core/src/data.ts';
import {effectiveness} from '../../battle/core/src/typechart.ts';
import type {TypeData} from '../../battle/core/src/types.ts';

// Replay the downloaded calculators' own code and published HTML output.
// Snapshots and full replay output stay ignored; see calculator-parity-audit.md.
const cache = '.cache/calculator-parity';
mkdirSync(cache, {recursive: true});
const hashes: Record<string, string> = {};
function source(name: string, encoding: BufferEncoding = 'utf8') {
  const bytes = readFileSync(`${cache}/${name}`);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  return bytes.toString(encoding);
}
const localTypes = JSON.parse(readFileSync('data/types.json', 'utf8')) as TypeData & {types: {id: string; name: {zh: string}}[]};
const byName = new Map(localTypes.types.map(type => [type.name.zh, type.id]));
function components(name: string): string[] | undefined {
  if (byName.has(name)) return [byName.get(name)!];
  for (const [a, aId] of byName) for (const [b, bId] of byName) {
    if (a !== b && (a + b === name || (name === '飞龙' && a === '飞行' && b === '龙'))) return [aId, bId];
  }
}
const page4399 = source('4399-types.decoded.html');
const names4399 = Object.fromEntries([...page4399.matchAll(/<span id="tt(\d+)"[^>]*>([^<]+)<\/span>/g)].map(match => [match[1], match[2]]));
const outputs4399: Record<string, Record<string, number>> = {};
for (const block of page4399.matchAll(/<ul[^>]*id="1rt(\d+)"[^>]*>([\s\S]*?)<\/ul>/g)) {
  outputs4399[block[1]] = Object.fromEntries([...block[2].matchAll(/<li><a onclick="return sh\((\d+)\);">[\s\S]*?\/>?([^<]+)<\/a><span[^>]*>([^<]+)<\/span><\/li>/g)].map(match => [match[1], Number(match[3])]));
}
assert.equal(Object.keys(names4399).length, 138);
const singles = Object.entries(names4399).filter(([, name]) => byName.has(name));
let singleComparisons = 0;
let explicitSingleComparisons = 0;
const officialOverrides: {attacker: string; defender: string; published: number; official: number; explicitlyPublished: boolean}[] = [];
for (const [a, attacker] of singles) for (const [d, defender] of singles) {
  // The page lists non-neutral coefficients; omitted single cells are neutral.
  const actual = effectiveness(localTypes, byName.get(attacker)!, [byName.get(defender)!]);
  const published = outputs4399[a][d] ?? 1;
  if (attacker === '战斗' && defender === '邪灵') {
    // Direct official typesRelation supersedes the calculator's omitted cell.
    assert.equal(actual, .5);
    assert.equal(published, 1);
    assert.equal(d in outputs4399[a], false);
    officialOverrides.push({attacker, defender, published, official: actual, explicitlyPublished: false});
  } else {
    assert.equal(actual, published, `${attacker} -> ${defender}`);
  }
  singleComparisons++;
  if (d in outputs4399[a]) explicitSingleComparisons++;
}
assert.equal(singleComparisons, 324);
assert.equal(officialOverrides.length, 1);
const cases = [
  ['火', '草', 2], ['火', '水', .5], ['电', '地面', 0],
  ['火', '草超能', 1.5], ['地面', '飞行超能', .125],
  ['电', '战斗地面', .25], ['光', '草超能', .5],
  ['机械', '冰龙', 1.5], ['水暗影', '火', 1.5],
  ['火', '冰火', 1.25], ['机械地面', '电', 1.25],
  ['水暗影', '战斗火', 1.25],
] as const;
const representative = cases.map(([attacker, defender, expected]) => {
  const a = Object.keys(names4399).find(id => names4399[id] === attacker)!;
  const d = Object.keys(names4399).find(id => names4399[id] === defender)!;
  assert(d in outputs4399[a], `Explicit output missing: ${attacker} -> ${defender}`);
  const external = outputs4399[a][d];
  const engine = effectiveness(localTypes, components(attacker)!, components(defender)!);
  assert.equal(external, expected); assert.equal(engine, external);
  return {attacker, defender, external, engine, element: `#1rt${a}`};
});
const discrepancies = [['地面', '火飞行', .25, .5], ['战斗火', '冰超能', .375, 2.375], ['机械超能', '战斗地面', 1.5, 2.5]] as const;
const retainedDiscrepancies = discrepancies.map(([attacker, defender, published, engine]) => {
  const a = Object.keys(names4399).find(id => names4399[id] === attacker)!;
  const d = Object.keys(names4399).find(id => names4399[id] === defender)!;
  assert.equal(outputs4399[a][d], published);
  assert.equal(effectiveness(localTypes, components(attacker)!, components(defender)!), engine);
  return {attacker, defender, published, engine, decision: 'Retain supported grouping; do not copy the inconsistent table cell.'};
});

// Execute the widget with only DOM output sinks. Arithmetic stays verbatim.
const widgetRaw = source('bwiki-widget-raw.txt');
const widgetScript = widgetRaw.match(/<script>([\s\S]*?)<\/script>/)![1];
const widgetOutput: Record<string, string[]> = {};
let selected = '地面';
const widgetContext = vm.createContext({window: {RLQ: []}, document: {getElementById: () => ({value: selected})}, $: (selector: string) => ({append: (html: string) => (widgetOutput[selector] ??= []).push(html)})});
vm.runInContext(widgetScript, widgetContext);
const callback = (widgetContext.window as {RLQ: [string, () => void][]}).RLQ[0][1].toString();
// Expose the already declared function from its registration closure.
vm.runInContext(`(${callback.slice(0, -1)};globalThis.runCalculator = jis;})()`, widgetContext);
vm.runInContext('runCalculator()', widgetContext);
const groundFireFlying = widgetOutput['.kezhi'].find(html => html.includes('火飞行系'))!;
assert(groundFireFlying.includes('>0.5</font>'));
selected = '火';
widgetOutput['.kezhi'] = []; widgetOutput['.beikezhi'] = [];
vm.runInContext('runCalculator()', widgetContext);
const holyNatureFire = widgetOutput['.beikezhi'].find(html => html.includes('圣灵自然系'))!;
assert(holyNatureFire.includes('>4</font>'));

// SeerHelp explicitly targets the mobile game. Replay, but do not calibrate
// classic browser damage to its omitted +2 term or its 236.5 average roll.
const mobileHtml = source('seerhelp.html');
const mobileScript = mobileHtml.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)![1];
let options: {data: () => any; methods: Record<string, Function>};
const nodes = new Map<string, {style: Record<string, unknown>; innerHTML: string}>();
function node(id: string) {if (!nodes.has(id)) nodes.set(id, {style: {}, innerHTML: ''}); return nodes.get(id)!;}
const mobileContext = vm.createContext({window: {}, console: {log() {}}, document: {getElementById: node, getElementsByClassName: (id: string) => [node(`${id}0`), node(`${id}1`)]}, Vue: function (value: typeof options) {options = value; return {$mount() {}};}});
vm.runInContext(mobileScript, mobileContext);
const stats = {hp: 10000, atk: 300, def: 200, spa: 300, spd: 200, spe: 100};
function engineRange(attacker: string[], defender: string[], owner: string[], power = 100, panels = stats) {
  const data = buildDataSet({types: localTypes, species: [{id: 1, name: {zh: 'User'}, types: owner, base: panels}, {id: 2, name: {zh: 'Target'}, types: defender, base: panels}], skills: [{id: 1, name: {zh: 'Attack'}, type: attacker.length === 1 ? attacker[0] : Object.keys(localTypes.composites!).find(id => localTypes.composites![id].length === attacker.length && localTypes.composites![id].every(type => attacker.includes(type)))!, category: 'physical', power, accuracy: null, pp: 20, crit_rate: 0}]});
  const battle = createBattle({data, seed: 1, sides: [{kind: 'player', team: [{species: 1, level: 100, stats: panels, skills: [1]}]}, {kind: 'wild', team: [{species: 2, level: 100, stats: panels, skills: [1]}]}]});
  const values = [];
  for (let roll = 217; roll <= 255; roll++) {
    battle.rng.int = (min: number) => min === 217 ? roll : 16;
    values.push(Math.floor(battle.calcAttack(battle.active(0), battle.active(1), data.skills.get(1)!).damage));
  }
  return {min: Math.min(...values), mean: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values), rolls: values};
}
const damageCases = [
  {a: '火', d: '草', owner: ['fire'], stab: 1.5},
  {a: '火', d: '草-超能', owner: ['fire'], stab: 1.5},
  {a: '火', d: '草-超能', owner: ['water'], stab: 1},
  {a: '电', d: '地面', owner: ['electric'], stab: 1.5},
  {a: '草', d: '水-地面', owner: ['grass'], stab: 1.5},
  {a: '水-暗影', d: '战斗-火', owner: ['water', 'shadow'], stab: 1.5},
  {a: '地面', d: '火-飞行', owner: ['ground'], stab: 1.5},
];
const damageComparisons = damageCases.map(input => {
  const mobile = Object.assign(options!.data(), options!.methods);
  mobile.chooseAttr(input.a); mobile.chooseAttr(input.d);
  Object.assign(mobile, {local_attack: 300, opposing_defense: 200, skill_power: 100, dr_default: String(input.stab)});
  mobile.startSimulation();
  const attacker = input.a.split('-').map(name => byName.get(name)!);
  const defender = input.d.split('-').map(name => byName.get(name)!);
  assert.equal(mobile.restraint_coefficient, effectiveness(localTypes, attacker, defender));
  const engine = engineRange(attacker, defender, input.owner);
  return {input: {...input, level: 100, power: 100, attack: 300, defense: 200, stages: 0, critical: false}, coefficient: mobile.restraint_coefficient, calculator: {min: mobile.min_damage, averageLabel: mobile.avg_damage, max: mobile.max_damage}, engine, decision: 'Mobile damage differs in formula and average convention; excluded from classic calibration.'};
});
const periodGuide = source('4399-formula.txt');
assert(periodGuide.includes('326') && periodGuide.includes('383'));
const periodExample = {source: 'https://news.4399.com/seer/jingyanxinde/201209-05-194310.html', input: {level: 100, power: 85, attack: 366, defense: 208, stab: 1.5, coefficient: 2}, publishedApproximateRange: [326, 383], engine: engineRange(['shadow'], ['psychic'], ['shadow'], 85, {...stats, atk: 366, def: 208}), decision: 'Published approximate range differs from retained inner-floor reconstruction; exact server rounding remains unresolved.'};
assert.equal(periodExample.engine.min, 324); assert.equal(periodExample.engine.max, 381);
const officialDamage = engineRange(['fighting'], ['evil'], ['fighting']);
const neutralDamage = engineRange(['fighting'], ['normal'], ['fighting']);
for (let index = 0; index < officialDamage.rolls.length; index++) {
  assert.equal(officialDamage.rolls[index], Math.floor(neutralDamage.rolls[index] * .5));
}
const fightingEvilDamage = {officialDamage, neutralDamage, checkedRolls: officialDamage.rolls.length};
const report = {sources: {officialTypes: 'https://newseer.61.com/Assets/StandaloneWindows64/ConfigPackage/808b915e773503fada2c1840033834d8', types4399: 'https://news.4399.com/seer/ssxxk/', stats4399: 'https://news.4399.com/seer/jsq/', widget: 'https://wiki.biligame.com/seer/index.php?title=Widget:%E5%B1%9E%E6%80%A7%E5%85%8B%E5%88%B6&action=raw', mobile: 'https://raw.githubusercontent.com/tanglaoji/seer-help/a96655eb02073dba894f4026a96e3350a84a01fc/%E8%B5%9B%E5%B0%94%E4%B8%8D%E6%B1%82%E4%BA%BAv21.8.4.html'}, hashes, singleComparisons, explicitSingleComparisons, officialOverrides, representative, retainedDiscrepancies, widgetOutput: {groundFireFlying, holyNatureFire}, damageComparisons, periodExample, fightingEvilDamage, engineChanges: 'Fighting against evil is 0.5 according to the direct official Unity table; all other retained single cells are unchanged.'};
writeFileSync(`${cache}/parity-results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({...report, widgetOutput: 'Original generated HTML saved in parity-results.json', damageComparisons: damageComparisons.map(({engine, ...row}) => ({...row, engine: {min: engine.min, mean: engine.mean, max: engine.max}}))}, null, 2));
