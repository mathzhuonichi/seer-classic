/**
 * The bundled (Vite) and Node catalog loaders assemble the same catalog from the per-file data.
 */
import assert from 'node:assert/strict';
import {loadCatalogNode} from '../catalog.mjs';
import {suite, withSsr} from './_harness.mjs';

const TABLES = ['species', 'skills', 'natures', 'types', 'conditions', 'items'];
await withSsr('catalog-loaders', async load => {
  const t = suite('catalog-loaders');
  const {loadCatalog} = await load('/src/domain/catalog/catalog.ts');
  const bundled = await loadCatalog(), node = loadCatalogNode();
  t.check('bundled and Node loaders assemble byte-identical catalogs', () => {
    assert.deepEqual(Object.keys(node), [...TABLES, 'bosses', 'trainers']);
    assert.equal(JSON.stringify(node), JSON.stringify(bundled));
  });
  await t.checkAsync('records are ordered by file name and every call returns fresh record arrays', async () => {
    assert.deepEqual(node.species.map(row => row.id), [...node.species.map(row => row.id)].sort((a, b) => a - b));
    const again = await loadCatalog();
    for (const records of ['species', 'bosses', 'trainers']) assert.notEqual(again[records], bundled[records], `${records} array is shared between calls`);
  });
  t.finish({species: node.species.length, bosses: node.bosses.length, trainers: node.trainers.length});
});
