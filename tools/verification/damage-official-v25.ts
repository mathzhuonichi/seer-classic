import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { effectiveness } from '../../battle/core/src/typechart.ts';
import { natureMultiplier, computeStatsFrom } from '../../raising/core/stats.ts';
import { computeStats as battleStats } from '../../battle/core/src/stats.ts';

// Run through Vite SSR, as documented in damage-official-v25.md.
// Source bodies are static, inspected ActionScript exports from the pinned SWF.
const cache = '.cache/damage-official-v25/';
const sourceRoot = '.cache/classic-robots/core-script/scripts/com/robot/core/';
const read = (path: string) => readFileSync(path, 'utf8');
const hash = (raw: Uint8Array | string) => createHash('sha256').update(raw).digest('hex');
const encoded = readFileSync(cache + 'core-live.swf');
assert.equal(hash(encoded), '2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f');
const decoded = inflateSync(encoded.subarray(7));
assert.equal(hash(decoded), 'ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40');
assert.deepEqual(decoded, readFileSync('.cache/classic-robots/RobotCoreDLL-decoded.swf'));
const payload = decoded.subarray(0, 3).toString() === 'CWS' ? inflateSync(decoded.subarray(8)) : decoded.subarray(8);
let offset = Math.ceil((5 + 4 * (payload[0] >> 3)) / 8) + 4;
const binary = new Map<number, Buffer>();
while (offset < payload.length) {
  const header = payload.readUInt16LE(offset); offset += 2;
  let length = header & 63;
  if (length === 63) { length = payload.readUInt32LE(offset); offset += 4; }
  const body = payload.subarray(offset, offset + length); offset += length;
  assert(offset <= payload.length, 'Truncated SWF tag');
  if ((header >> 6) === 87) binary.set(body.readUInt16LE(0), body.subarray(6));
}
const aliases: Record<string, string> = { steel: 'mechanical', fight: 'fighting', dark: 'shadow', myth: 'mystic', saint: 'holy', demon: 'evil' };
const name = (id: string) => aliases[id] ?? id;
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const official: Record<string, Record<string, number>> = {};
const typeXML = binary.get(246)!.toString();
for (const row of typeXML.matchAll(/<Relation\s+type="([^"]+)"[^>]*>([\s\S]*?)<\/Relation>/g)) {
  official[name(row[1])] = Object.fromEntries([...row[2].matchAll(/<Opponent\s+[^>]*\/>/g)].map(match => { const a = attrs(match[0]); return [name(a.type), Number(a.multiple)]; }));
}
const local = JSON.parse(read('data/types.json'));
const baseTypes: string[] = local.types.map((type: { id: string }) => type.id);
let singleCells = 0;
for (const attack of baseTypes) for (const defend of baseTypes) {
  assert.equal(local.chart[attack]?.[defend] ?? 1, official[attack][defend], `${attack}/${defend}`); singleCells++;
}
const source = read(sourceRoot + 'config/xml/TypeXMLInfo.as');
function method(id: string): string {
  const start = source.indexOf(`function ${id}(`);
  assert(start >= 0);
  const brace = source.indexOf('{', start); let depth = 1, end = brace + 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  return source.slice(start, end).replace(/:\s*(Array|Number|String|Boolean|int|uint)\b/g, '');
}
const sourceCalculation = new Function('getRelation', `${method('getDivisor')}\n${method('getRelationsPow')}\nreturn getRelationsPow;`)(
  (attack: string, defender: string) => official[attack][defender],
) as (attack: string[], defender: string[]) => number;
const inputs = baseTypes.map(type => [type]);
for (let i = 0; i < baseTypes.length; i++) for (let j = i + 1; j < baseTypes.length; j++) inputs.push([baseTypes[i], baseTypes[j]]);
let combinedCells = 0;
for (const attack of inputs) for (const defender of inputs) {
  assert.equal(effectiveness(local, attack, defender), sourceCalculation(attack, defender), `${attack}/${defender}`); combinedCells++;
}
const natureXML = binary.get(94)!.toString();
const natures = JSON.parse(read('data/natures.json'));
assert.equal(natures.length, 25);
assert.equal(new Set(natures.map((n: { name: { zh: string } }) => n.name.zh)).size, 25);
const statFields = { atk: 'm_attack', def: 'm_defence', spa: 'm_SA', spd: 'm_SD', spe: 'm_speed' } as const;
let natureCells = 0, statBridgeCases = 0;
const natureLabelDifferences: { id: string; local: string; official: string }[] = [];
const base = { hp: 101, atk: 93, def: 87, spa: 79, spd: 73, spe: 61 };
const evs = { hp: 1, atk: 255, def: 127, spa: 3, spd: 17, spe: 107 };
for (const match of natureXML.matchAll(/<item\s+[^>]*\/>/g)) {
  const row = attrs(match[0]);
  const nature = natures.find((n: { id: string; name: { zh: string } }) => n.name.zh === row.name);
  assert(nature, `Missing official nature ${row.name}`);
  if (nature.name.zh !== row.name) natureLabelDifferences.push({ id: nature.id, local: nature.name.zh, official: row.name });
  for (const [stat, field] of Object.entries(statFields)) { assert.equal(natureMultiplier(nature, stat as keyof typeof statFields), Number(row[field]), `${row.name}/${stat}`); natureCells++; }
  assert.equal(natureMultiplier(nature, 'hp'), 1); natureCells++;
  // This verifies integration, not the server's unavailable stat formula.
  for (const level of [1, 17, 50, 99, 100]) for (const iv of [0, 1, 31]) {
    assert.deepEqual(battleStats(base, level, iv, evs, nature), computeStatsFrom(base, iv, evs, level, nature)); statBridgeCases++;
  }
}
const attackPacket = read(sourceRoot + 'info/fightInfo/attack/AttackValue.as');
for (const field of ['_lostHP', '_realHurtHp', '_isCrit']) assert(attackPacket.includes(`this.${field} = param1.readUnsignedInt();`));
const statPacket = read(sourceRoot + 'info/pet/PetInfo.as');
for (const field of ['maxHp', 'attack', 'defence', 's_a', 's_d', 'speed']) assert(statPacket.includes(`this.${field} = param1.readUnsignedInt();`));
const result = {
  officialURL: 'https://seer.61.com/dll/RobotCoreDLL.swf', encodedSHA256: hash(encoded), decodedSHA256: hash(decoded),
  sourceHashes: { typeCalculation: hash(source), natureXML: hash(natureXML), typeXML: hash(typeXML), attackPacket: hash(attackPacket), statPacket: hash(statPacket) },
  singleCells, combinedCells, natureCells, natureLabelDifferences, statBridgeCases, packetFields: 9,
  conclusion: 'Official client type arithmetic and nature multipliers match. Stat integration matches. Server damage and stat rounding remain unverified.',
};
mkdirSync('artifacts/damage-official-v25', { recursive: true });
writeFileSync('artifacts/damage-official-v25/parity.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
