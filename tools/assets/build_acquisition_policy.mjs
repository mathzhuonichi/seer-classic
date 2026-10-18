import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_ONLY_SPECIES as NPC } from '../../src/domain/acquisition/acquisition-model.ts';
import { ancestorsOf, buildPredecessors } from '../../src/domain/acquisition/species-graph.ts';
import { loadCatalogNode } from '../catalog.mjs';

// Classify source-backed acquisition offers; do not invent historical repeat limits.
// node tools/assets/build_acquisition_policy.mjs [--source-dir DIRECTORY] [--check]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMMIT = 'a00bcdd5800e3bae5df881b4994a170a87541115';
const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source-dir');
const cache = sourceArg < 0 ? path.join(root, '.cache', 'seer-data-a00bcdd') : path.resolve(args[sourceArg + 1]);
const out = path.join(root, 'data/acquisition-policy.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const list = x => x == null ? [] : Array.isArray(x) ? x : [x];
const ids = x => String(x ?? '').split(/[|;,\s]+/).filter(Boolean).map(Number).filter(Number.isSafeInteger);
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sources = [], coverage = [], omitted = [];
const files = {
  product_diamond: 'xml', product_money: 'xml', items: 'xml', maps: 'xml',
  vip_pet_shop: 'xml', vip_item_shop: 'xml', vip_month_monster: 'xml',
  Wishpet: 'xml', Monsterpool: 'xml', petbook: 'xml', tasks_config: 'xml',
  free_monster_list: 'xml', gainWay: 'json', exchange_clt: 'json', exchange_act: 'xml',
};
// These bytes were verified against the pinned commit Git blob IDs.
const EXPECTED_SHA256 = {
  "product_diamond": "d64bb57599ec632c2d5f05f47ea6052b328cc8abbcbb5f929293ebe992b85408",
  "product_money": "38ad7d30929de0112e94a9c09a5b6030c78f2c9c1b54eaa1d9830b10f995e964",
  "items": "c763efd129eff36f7a518c776c41b666475a0cb429352003299dfa87704a3198",
  "maps": "a913f0085b9a3908749dcbe88b0d6f488825af6804039289d76a655e11faf7e3",
  "vip_pet_shop": "acc57c82345e583871c375e661e202dae7a9ce7c946d388fa66c82e15da7c926",
  "vip_item_shop": "835f4461db3402a1439f68fe61e716549c301a18fb8f8a143a32e14466d17b13",
  "vip_month_monster": "2a3aa66795c389d20562eb469779a3cfc768e7f7c818779121f98de2aa772b88",
  "Wishpet": "c6e3fbbd0080169556b8e98622a8b8b709545e008fb3414fbc5de37d2022a8f2",
  "Monsterpool": "e77ca78aa87f8aba8a0cafe9d082eb067a67b29af2d43bee9cb56315ccf3d515",
  "petbook": "a6fa0f49b192725298c6e447e37a10edcba3631864796715fca74983e2c7b2ba",
  "tasks_config": "476d12685db6d8a0c18e8a55ae29a9f55268b39900df8c8c67d6ca407446e6c3",
  "free_monster_list": "4a4847ffffa6243ac4947e43060027683a0213cdb98d3cbe4bdbf15a55231ce2",
  "gainWay": "64e005ecd8328c92853c938ddddee1a42691bf95b0487fdc1046d89f5a0f92f9",
  "exchange_clt": "03cf9d866311293c608ceeaeaaec52ab3f4d2cc3c6ff40fefddb0972bd067ec0",
  "exchange_act": "26f1a987b2d6bed347971d880aaddfcc55f43f382ebef2d60ce87913e22ca8dd"
};
const raw = {};
for (const [id, kind] of Object.entries(files)) {
  const url = `https://raw.githubusercontent.com/Nattsu39/seer_data/${COMMIT}/resource/config/${kind}/${id}.json`;
  const file = path.join(cache, `${id}.json`);
  if (!fs.existsSync(file)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), EXPECTED_SHA256[id], `${id}: cached bytes differ from the pinned source`);
  raw[id] = JSON.parse(bytes.toString('utf8'));
  sources.push({ id, url, sha256: hash(bytes), representation: 'retained-client-json',
    scope: 'Retained official-client configuration mirrored at a pinned repository commit; not a dated 2009-2012 availability assertion.' });
}
function localSource(id, file, upstream) {
  sources.push({ id, file, sha256: hash(fs.readFileSync(path.join(root, file))), representation: 'audited-project-extraction', upstream });
}
const catalog = loadCatalogNode();
// The recorded provenance is still the aggregate bundle; it must hold exactly the per-file species read here.
assert.equal(JSON.stringify(read('data/gamedata.json').species), JSON.stringify(catalog.species), 'data/gamedata.json species differ from data/monsters');
localSource('classic-catalog', 'data/gamedata.json');
const byId = new Map(catalog.species.map(s => [s.id, s]));
const byName = new Map(catalog.species.map(s => [s.name.zh, s.id]));
const parents = buildPredecessors(catalog.species);
const roots = new Map();
for (const s of catalog.species) if (!parents.get(s.id).size && !NPC.has(s.id)) {
  roots.set(s.id, { species: s.id, name: s.name.zh, categories: [], repeatability: 'unknown', evidence: [] });
}
const ancestry = new Map();
function initialRoots(id) {
  if (!byId.has(id)) return [];
  if (!ancestry.has(id)) ancestry.set(id, [id, ...ancestorsOf(id, parents)].filter(current => roots.has(current)).sort((a, b) => a - b));
  return ancestry.get(id);
}
function add(id, categories, evidence) {
  id = Number(id);
  if (!byId.has(id) || NPC.has(id)) return;
  const initial = initialRoots(id);
  if (initial.length !== 1) {
    omitted.push({ sourceSpecies: id, roots: initial, source: evidence.source, record: evidence.record, reason: 'Ambiguous or missing directed initial ancestor.' });
    return;
  }
  const row = roots.get(initial[0]);
  for (const category of categories) if (!row.categories.includes(category)) row.categories.push(category);
  row.evidence.push({ sourceSpecies: id, categories, sourceEra: 'retained-client', repeatability: 'unknown', ...evidence });
}
const items = new Map(list(raw.items.Items.Cat).flatMap(c => list(c.Item)).map(i => [Number(i.ID), i]));
const itemHatches = itemId => Number(items.get(Number(itemId))?.BreedMonID);

// Keep all 42 reviewed premium families, including client exchange bindings that
// cannot safely be rediscovered by matching a modern product name alone.
const paid = read('data/paid-spt-recruitment.json');
const repeat = read('data/repeatable-paid-acquisition.json');
const breeding = read('data/breeding.json');
localSource('paid-audit', 'data/paid-spt-recruitment.json', [{ url: paid.sourceUrl, decodedSha256: paid.sourceDecodedSha256, productSymbol: paid.productSymbol, itemSymbol: paid.itemSymbol }]);
localSource('repeat-audit', 'data/repeatable-paid-acquisition.json', [{ url: repeat.sourceUrl, decodedSha256: repeat.sourceDecodedSha256 }]);
localSource('breeding-audit', 'data/breeding.json', [{ url: breeding.source.coreUrl, sha256: breeding.source.encodedCoreSha256, decodedSha256: breeding.source.decodedCoreSha256, symbol: breeding.source.eggSymbol }, { url: breeding.source.panelUrl, sha256: breeding.source.panelSha256 }]);
for (const row of paid.species) {
  assert(roots.has(row.rewardSpecies), `Reviewed paid reward ${row.rewardSpecies} must be an initial root`);
  for (const e of row.evidence) add(row.rewardSpecies, ['paid'], {
    source: 'paid-audit', record: `species[rewardSpecies=${row.rewardSpecies}].evidence[productId=${e.productId}]`,
    offeredSpecies: e.sourceSpecies,
    detail: `Reviewed ${e.kind}; product ${e.productId}, item IDs ${e.itemIds}, price ${e.price} ${e.currency}. Offer evidence does not establish repeat purchase or historical exclusivity.`,
  });
  const audit = repeat.species.find(s => s.initialSpecies === row.rewardSpecies);
  if (audit) add(row.rewardSpecies, [], {
    source: 'repeat-audit', record: `species[initialSpecies=${row.rewardSpecies}]`,
    detail: `Prior repeat audit: ${audit.status}; ${audit.basis}`,
  });
}
// Product binding is exact: a known hatch item, or a whole species name after a
// short list of acquisition-only wrappers. Substring matches are forbidden.
function namedOffer(name) {
  const value = String(name)
    .replace(/^(?:(?:一键至尊|至尊|一键|直接|快速|全价|优惠|钻石|特惠|商城|保卫战|新兵直接)?(?:购买|获得)(?:精灵[:：]?|前置形态)?|[0-9]+钻(?:石)?(?:购买|获得)|补领|提前领|VIP限时返场)/u, '')
    .replace(/^(?:100级(?:极品)?|极品|精灵[:：]?)/u, '')
    .replace(/(?:的精元|精元|礼包|M)$/u, '');
  return byName.get(value);
}
assert.equal(namedOffer('快速购买查尔顿'), byName.get('查尔顿'));
assert.equal(namedOffer('100级艾蒂森M'), byName.get('艾蒂森'));
assert.equal(namedOffer('一键击败皮皮'), undefined);
assert.equal(namedOffer('一键超进化提亚斯'), undefined);
assert.equal(namedOffer('购买经典皮肤：杰洛恩'), undefined);
assert.equal(namedOffer('一键购买神·鱼龙王'), undefined);
assert.equal(namedOffer('第二次召唤萨里奥'), undefined);
for (const source of ['product_diamond', 'product_money']) {
  const products = list(raw[source].root.item);
  let matched = 0;
  for (const p of products) {
    if (!(Number(p.price) > 0)) continue;
    const direct = namedOffer(p.name);
    if (direct) {
      matched++;
      add(direct, ['paid', ...(/VIP/iu.test(String(p.name)) ? ['vip'] : [])], { source, record: `root.item[productID=${p.productID}]`,
        detail: `Exact named creature offer: ${p.name}; price ${p.price}; items ${p.itemID}. Quantity and lifetime limits are not established.` });
    }
    for (const itemId of ids(p.itemID)) {
      const hatch = itemHatches(itemId);
      if (!byId.has(hatch)) continue;
      matched++;
      add(hatch, ['paid'], { source, record: `root.item[productID=${p.productID}]`,
        relatedRecords: [{ source: 'items', record: `Items.Cat.Item[ID=${itemId}].BreedMonID` }],
        detail: `Product ${p.name} costs ${p.price}; item ${itemId} has explicit BreedMonID=${hatch}. Item Max/UseMax does not establish repeat acquisition.` });
    }
  }
  coverage.push({ source, records: products.length, matchedOffers: matched });
}
for (const row of list(raw.vip_pet_shop.root.Pet)) add(row.PetId, ['vip', ...(row.Price > 0 ? ['paid'] : [])], {
  source: 'vip_pet_shop', record: `root.Pet[PetId=${row.PetId}]`, detail: `Explicit VIP pet shop offer; LimitLv=${row.LimitLv}, productID=${row.productID}, Price=${row.Price}.` });
for (const row of list(raw.vip_month_monster.Root.Item)) for (const id of new Set([Number(row.MonsterID), ...ids(row.MonstersID)])) add(id, ['vip'], {
  source: 'vip_month_monster', record: `Root.Item[ID=${row.ID}]`, detail: `VIP month reward table ${row.CurYear}-${row.CurMonth}; no classic-period date or repeat restriction is inferred.` });
// VIP item-shop entries can only be linked through actual hatch-item bindings.
for (const row of list(raw.vip_item_shop.root.Item)) {
  for (const tuple of String(row.Rewards ?? '').split(';')) {
    const [kind, itemId] = tuple.split('_').map(Number);
    if (kind !== 1) continue;
    add(itemHatches(itemId), ['vip', ...(row.Price > 0 ? ['paid'] : [])], {
      source: 'vip_item_shop', record: `root.Item[Type=${row.Type},Id=${row.Id}]`,
      relatedRecords: [{ source: 'items', record: `Items.Cat.Item[ID=${itemId}].BreedMonID` }],
      detail: `VIP shop reward hatch item ${itemId}; LimitLv=${row.LimitLv}. Monthly LimitNum=${row.LimitNum} is not a lifetime species limit.` });
  }
}
for (const map of list(raw.maps.Maps.Map)) {
  for (const [index, mon] of list(map.Monsters?.Monster).entries()) for (const id of ids(mon.ID)) add(id, ['wild'], {
    source: 'maps', record: `Maps.Map[ID=${map.ID}].Monsters.Monster[${index}]`,
    detail: `Named wild spawn on ${map.Name}; ID=${mon.ID}, Lv=${mon.Lv}. This is a spawn record, not proof of unlimited historical captures.` });
  for (const [index, boss] of list(map.Bosses?.Boss).entries()) for (const id of ids(boss.BossMon?.MonID)) {
    // A fight without capture or a named reward does not prove acquisition.
    if (Number(boss.BossCatchable) !== 1) continue;
    add(id, ['map-capture', ...(Number(boss.VipOnly) === 1 ? ['vip'] : [])], {
      source: 'maps', record: `Maps.Map[ID=${map.ID}].Bosses.Boss[${index}]`,
      repeatability: Number(boss.BossFinOnce) === 1 ? 'once' : 'unknown',
      detail: `Capture-enabled encounter on ${map.Name}; BossCatchable=1, VipOnly=${boss.VipOnly ?? 'unspecified'}, BossFinOnce=${boss.BossFinOnce ?? 'unspecified'}, TaskID=${boss.TaskID ?? 'unspecified'}. A once flag limits this encounter only.` });
  }
}
// Membership can be explicit in either a task gate or its name. Ordinary
// psychic-type wording, non-VIP labels and product discounts are not gates.
function isVipTask(task) {
  return Number(task.vip_limit) > 0 || /(?:超(?:能)?NO(?:NO)?|至尊nono|年费会员|VIP)/iu.test(String(task.name ?? '').replace(/非VIP/giu, ''));
}
assert(isVipTask({ name: '年费会员六月任务' }));
assert(isVipTask({ name: '黑白森林的神秘来客', vip_limit: 1 }));
assert(!isVipTask({ name: '训练师之门超能系精元' }));
assert(!isVipTask({ name: '金豆锻造非vip第一次开面板奖励' }));
for (const task of list(raw.tasks_config.Tasks.Task)) {
  const name = String(task.name ?? '');
  const vip = isVipTask(task);
  for (const output of list(task.OutItem)) for (const [index, item] of list(output.Item).entries()) {
    const id = Number(item.give_type) === 1 ? Number(item.give_id) : Number(item.give_type) === 3 ? itemHatches(item.give_id) : NaN;
    const date = /(?:^|\D)(20\d{6})(?:\D|$)/u.exec(name)?.[1];
    add(id, ['task-event', ...(vip ? ['vip'] : [])], {
      source: 'tasks_config', record: `Tasks.Task[id=${task.id}].OutItem[id=${output.id}].Item[${index}]`,
      ...(date && date <= '20121231' ? { sourceEra: 'classic-period' } : {}),
      ...(Number(item.give_type) === 3 ? { relatedRecords: [{ source: 'items', record: `Items.Cat.Item[ID=${item.give_id}].BreedMonID` }] } : {}),
      detail: `Task ${name}; reward give_type=${item.give_type}, give_id=${item.give_id}, cnt=${item.cnt}.${Number(task.vip_limit) > 0 ? ` Explicit vip_limit=${task.vip_limit} membership gate.` : ''} A one-item reward does not prove a one-time lifetime claim.` });
  }
}
// Retained annual-member hatch-item bindings and non-obvious named VIP tasks.
// These records were previously omitted when only NO/VIP name tokens were used.
for (const [taskId, expectedRoots] of [
  [528, [515]], [533, [53, 62, 77, 240, 406, 422, 430, 471]],
  ...[635, 637, 688, 718, 749, 789, 818, 866, 913, 934, 984].map((id, i) => [589 + i, [id]]),
]) for (const id of expectedRoots) {
  assert(roots.get(id)?.evidence.some(e => e.source === 'tasks_config'
    && e.record.startsWith(`Tasks.Task[id=${taskId}].`) && e.categories.includes('vip')),
  `Task ${taskId} must retain its explicit membership-gated acquisition of initial species ${id}`);
}
for (const pool of list(raw.Monsterpool.Root.Pool)) for (const row of list(pool.item)) add(row.monsterid, ['lottery'], {
  source: 'Monsterpool', record: `Root.Pool[id=${pool.id}].item[id=${row.id}]`,
  detail: `Explicit monster draw-pool entry ${row.monstername}; kind=${row.kind}, isjustone=${row.isjustone}. Retained later-client pool; server repeatability and 2009-2012 availability are not established.` });
// The anniversary wish list offers a selected creature with progress. It is not
// evidence that every listed family was a classic random gacha prize.
for (const row of list(raw.Wishpet.Wishpets.Wishpet)) add(row.MonsterID, ['wish-event'], {
  source: 'Wishpet', record: `Wishpets.Wishpet[WishpetID=${row.WishpetID}]`,
  detail: `Retained anniversary wish-list entry ${row.MonsterName}; progress ${row.WishProgress}, star ${row.MonsterStar}. Neither classic lottery membership nor repeatability is inferred.` });
for (const row of list(raw.free_monster_list.Monsters.Monster)) add(row.petId, ['free-event'], {
  source: 'free_monster_list', record: `Monsters.Monster[petId=${row.petId}]`,
  detail: `Explicit free-creature list membership ${row.name}; claim prerequisites and lifetime limits are not present.` });
for (const recipe of breeding.recipes) for (const outcome of recipe.outcomes) add(outcome.species, ['breeding'], {
  source: 'breeding-audit', record: `recipes[id=${recipe.id}].outcomes[species=${outcome.species}]`, repeatability: 'repeatable',
  detail: `Official Egg ${recipe.originalEggId} outcome weight ${outcome.weight}. The audited PetBreedPanel restart-after-cooldown flow establishes repeated breeding cycles; not repeated premium purchases.` });

for (const source of ['vip_pet_shop', 'vip_item_shop', 'vip_month_monster', 'Wishpet', 'Monsterpool', 'maps', 'tasks_config', 'free_monster_list']) {
  coverage.push({ source, matchedRoots: [...roots.values()].filter(r => r.evidence.some(e => e.source === source)).length });
}
coverage.push({ source: 'petbook', decision: 'Foundin/Go are retained for habitat research; module names alone do not establish payment, VIP, or lottery.' });
coverage.push({ source: 'gainWay', decision: 'Item navigation labels do not bind a creature reward; no speculative species match.' });
coverage.push({ source: 'exchange_clt', decision: 'Exchange type codes and token IDs require client semantics; raw numeric ID equality is not creature evidence.' });
coverage.push({ source: 'exchange_act', decision: 'No direct in-catalog creature reward binding in this retained table.' });
const species = [...roots.values()].sort((a, b) => a.species - b.species);
for (const row of species) {
  row.categories.sort();
  row.evidence = [...new Map(row.evidence.map(e => [JSON.stringify(e), e])).values()];
  row.evidence.sort((a, b) => a.source.localeCompare(b.source, 'en') || a.record.localeCompare(b.record, 'en') || a.sourceSpecies - b.sourceSpecies);
  // One explicitly repeatable route proves repeat availability. A finite set of
  // once-only encounter records cannot prove that no other historical route exists.
  if (row.evidence.some(e => e.repeatability === 'repeatable')) row.repeatability = 'repeatable';
}
for (const row of paid.species) assert(species.find(s => s.species === row.rewardSpecies)?.categories.includes('paid'));
for (const row of species) {
  assert(!NPC.has(row.species));
  assert(!parents.get(row.species).size);
  for (const e of row.evidence) assert(sources.some(s => s.id === e.source));
}
const result = {
  note: 'Generated by tools/assets/build_acquisition_policy.mjs; source classification is separate from remake claim policy.',
  schemaVersion: 1,
  scope: 'All eligible directed initial roots in the classic catalog. Retained later-client offers are labeled separately from dated classic-period evidence. Not a complete history of every acquisition event.',
  repeatabilityMeaning: { repeatable: 'At least one affirmative source-backed repeat acquisition mechanism.', once: 'Reserved for affirmative whole-species lifetime evidence; encounter-only flags remain on individual evidence rows.', unknown: 'Historical repeatability not established. The remake may explicitly allow bounded repeat claims without changing this source status.' },
  excludedSpecies: [...NPC], sources, coverage, omitted, species,
};
const text = JSON.stringify(result, null, 1) + '\n';
if (args.includes('--check')) assert.equal(fs.readFileSync(out, 'utf8'), text, 'Acquisition policy output is stale');
else fs.writeFileSync(out, text);
console.log(JSON.stringify({ roots: species.length, categories: Object.fromEntries([...new Set(species.flatMap(s => s.categories))].sort().map(c => [c, species.filter(s => s.categories.includes(c)).length])), repeatable: species.filter(s => s.repeatability === 'repeatable').length, once: species.filter(s => s.repeatability === 'once').length, unknown: species.filter(s => s.repeatability === 'unknown').length, omitted: omitted.length, outputSha256: hash(text) }, null, 2));
