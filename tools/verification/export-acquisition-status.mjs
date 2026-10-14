import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Run from any directory: node tools/verification/export-acquisition-status.mjs [output].
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(root, process.argv[2] ?? 'artifacts/acquisition-v24');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { buildAcquisitionIndex, buildAcquisitionFamilies, NPC_ONLY_SPECIES } = await server.ssrLoadModule('/src/progression/acquisition.ts');
  const { buildInitialFormAcquisitionIndex } = await server.ssrLoadModule('/src/progression/initial-acquisition.ts');
  const { FUSION_RECIPES } = await server.ssrLoadModule('/src/progression/fusion.ts');
  const { BREEDING_RECIPES, getBreedingGender } = await server.ssrLoadModule('/src/progression/breeding.ts');
  const { WORLD_PLANETS } = await server.ssrLoadModule('/src/world.ts');
  const catalog = JSON.parse(read('data/gamedata.json'));
  catalog.bosses = fs.readdirSync(path.join(root, 'data/bosses')).filter(file => file.endsWith('.json')).sort().map(file => JSON.parse(read(`data/bosses/${file}`)));
  const unchanged = JSON.stringify(catalog);
  const index = buildAcquisitionIndex(catalog);
  const initial = buildInitialFormAcquisitionIndex(catalog, index);
  const families = buildAcquisitionFamilies(catalog, index);
  const byId = new Map(catalog.species.map(species => [species.id, species]));
  const describe = ids => ids.map(id => ({ id, name: byId.get(id)?.name.zh }));
  const available = id => index.get(id)?.status === 'available';
  const predecessors = new Map(catalog.species.map(species => [species.id, new Set()]));
  for (const species of catalog.species) {
    if (byId.has(species.evolves_from)) predecessors.get(species.id).add(species.evolves_from);
    for (const edge of species.evolution) if (byId.has(edge.to)) predecessors.get(edge.to).add(species.id);
  }

  // Independently replay a directed closure. An ancestry relationship is never an edge here.
  const seedIndex = buildAcquisitionIndex(catalog, WORLD_PLANETS, [], undefined, []);
  const closure = new Set([...seedIndex].filter(([, entry]) => entry.routes.some(route => route.kind !== 'evolution')).map(([id]) => id));
  const firstGeneration = new Set(closure);
  const witnesses = [];
  let changed = true;
  while (changed) {
    changed = false;
    const add = (id, witness, generationZero = false) => {
      if (!byId.has(id) || NPC_ONLY_SPECIES.has(id)) return;
      if (generationZero && !firstGeneration.has(id)) { firstGeneration.add(id); changed = true; }
      if (closure.has(id)) return;
      closure.add(id); witnesses.push({ id, ...witness }); changed = true;
    };
    for (const species of catalog.species) if (closure.has(species.id)) for (const edge of species.evolution) {
      if (edge.method === 'level' && edge.level !== undefined && edge.level <= 100) add(edge.to, { kind: 'evolution', parent: species.id, level: edge.level }, firstGeneration.has(species.id));
    }
    for (const recipe of FUSION_RECIPES) {
      const primary = recipe.primary.find(id => closure.has(id)), secondary = recipe.secondary.find(id => closure.has(id));
      if (primary === undefined || secondary === undefined || recipe.minPrimaryLevel > 100 || recipe.minSecondaryLevel > 100) continue;
      for (const outcome of recipe.outcomes) if (outcome.weight > 0) add(outcome.species, { kind: 'fusion', recipeId: recipe.id, parents: [primary, secondary] }, true);
    }
    for (const recipe of BREEDING_RECIPES) {
      const male = recipe.maleSpecies.find(id => firstGeneration.has(id) && getBreedingGender(id) === 1);
      const female = recipe.femaleSpecies.find(id => closure.has(id) && getBreedingGender(id) === 2);
      if (recipe.minLevel > 100 || male === undefined || female === undefined) continue;
      for (const outcome of recipe.outcomes) if (outcome.weight > 0) add(outcome.species, { kind: 'breeding', recipeId: recipe.id, parents: [male, female] });
    }
  }
  assert.deepEqual([...closure].sort((a, b) => a - b), [...index].filter(([, entry]) => entry.status === 'available').map(([id]) => id).sort((a, b) => a - b));
  assert.deepEqual([...firstGeneration].sort((a, b) => a - b), [...index].filter(([, entry]) => entry.routes.some(route => !route.breedingRecipeId)).map(([id]) => id).sort((a, b) => a - b));
  assert.equal(JSON.stringify(catalog), unchanged, 'Reporting must not mutate the source catalog.');
  assert.equal(new Set(families.flatMap(family => family.memberIds)).size, catalog.species.length);
  assert.equal(families.flatMap(family => family.memberIds).length, catalog.species.length);

  const fusionDependencies = FUSION_RECIPES.map(recipe => ({
    id: recipe.id, name: recipe.name, sources: recipe.sources,
    ready: recipe.minPrimaryLevel <= 100 && recipe.minSecondaryLevel <= 100 && recipe.primary.some(available) && recipe.secondary.some(available),
    primary: describe(recipe.primary), secondary: describe(recipe.secondary),
    missingPrimary: describe(recipe.primary.filter(id => !available(id))), missingSecondary: describe(recipe.secondary.filter(id => !available(id))),
    outputs: recipe.outcomes.map(outcome => ({ ...outcome, name: byId.get(outcome.species)?.name.zh })),
  }));
  const breedingDependencies = BREEDING_RECIPES.map(recipe => ({
    id: recipe.id, name: recipe.name, originalEggId: recipe.originalEggId,
    male: describe(recipe.maleSpecies), female: describe(recipe.femaleSpecies), minLevel: recipe.minLevel,
    ready: recipe.minLevel <= 100 && recipe.maleSpecies.some(id => firstGeneration.has(id) && getBreedingGender(id) === 1) && recipe.femaleSpecies.some(id => closure.has(id) && getBreedingGender(id) === 2),
    missingFirstGenerationMales: describe(recipe.maleSpecies.filter(id => !firstGeneration.has(id))),
    missingFemales: describe(recipe.femaleSpecies.filter(id => !closure.has(id))),
    outcomes: recipe.outcomes.map(outcome => ({ ...outcome, name: byId.get(outcome.species)?.name.zh })),
  }));
  const familyBySpecies = new Map(families.flatMap(family => family.memberIds.map(id => [id, family])));
  const reasons = {
    missingBase: 'The directed initial form has no implemented acquisition entry.',
    unmappedWild: 'Wild metadata exists, but no usable mapped capsule encounter grants this form.',
    unsupportedTransform: 'A source predecessor is obtainable, but no executable forward transformation reaches this form.',
    unavailableParents: 'Required predecessor, fusion parents, or first-generation breeding parents lack an implemented normal route.',
  };
  const rows = catalog.species.map(species => {
    const entry = index.get(species.id), ancestry = initial.get(species.id), family = familyBySpecies.get(species.id);
    const parents = [...predecessors.get(species.id)], recipes = fusionDependencies.filter(recipe => recipe.outputs.some(outcome => outcome.species === species.id && outcome.weight > 0));
    const breeding = breedingDependencies.filter(recipe => recipe.outcomes.some(outcome => outcome.species === species.id && outcome.weight > 0));
    const category = entry.status !== 'unimplemented' ? null
      : parents.some(available) ? 'unsupportedTransform'
      : recipes.length || breeding.length ? 'unavailableParents'
      : species.obtain?.includes('wild') ? 'unmappedWild'
      : parents.length ? 'unavailableParents' : 'missingBase';
    return {
      id: species.id, name: species.name.zh, status: entry.status, familyId: family.id,
      initialForms: ancestry.initialForms.map(form => ({ id: form.species, name: form.name, directEntryAvailable: form.routes.length > 0, pathExecutable: form.evolutionPath.every(step => step.implemented), path: form.evolutionPath })),
      category, reason: category ? reasons[category] : null, obtainMetadata: species.obtain ?? [],
      predecessors: describe(parents), missingPredecessors: describe(parents.filter(id => !available(id))),
      blockedFusionRecipeIds: recipes.filter(recipe => !recipe.ready).map(recipe => recipe.id),
      blockedBreedingRecipeIds: breeding.filter(recipe => !recipe.ready).map(recipe => recipe.id),
      directRoutes: entry.routes.filter(route => route.kind !== 'evolution'),
    };
  }).sort((a, b) => a.id - b.id);
  const familyRows = families.map(family => ({
    ...family, initialForms: family.rootSpecies.map(id => ({ id, name: byId.get(id).name.zh, directEntryAvailable: rows.find(row => row.id === id).directRoutes.length > 0 })),
    members: family.memberIds.map(id => rows.find(row => row.id === id)),
  }));
  const eligible = rows.filter(row => row.status !== 'npc'), missing = eligible.filter(row => row.status === 'unimplemented');
  const summary = {
    catalogSpecies: rows.length, eligibleSpecies: eligible.length, availableSpecies: eligible.filter(row => row.status === 'available').length, missingSpecies: missing.length,
    excludedNpcSpecies: rows.filter(row => row.status === 'npc').map(row => ({ id: row.id, name: row.name })),
    directAcquisitionSpecies: eligible.filter(row => row.directRoutes.length).length,
    directRewardSpeciesWithoutInitialEntry: eligible.filter(row => row.directRoutes.some(route => ['boss', 'campaign', 'quest'].includes(route.kind)) && row.initialForms.every(form => !form.directEntryAvailable)).length,
    eligibleInitialForms: familyRows.filter(family => family.status !== 'npc').flatMap(family => family.initialForms).length,
    availableInitialEntries: familyRows.filter(family => family.status !== 'npc').flatMap(family => family.initialForms).filter(form => form.directEntryAvailable).length,
    familyCounts: Object.fromEntries(['complete', 'partial', 'missing', 'npc'].map(status => [status, familyRows.filter(family => family.status === status).length])),
    missingCategoryCounts: Object.fromEntries(Object.keys(reasons).map(category => [category, missing.filter(row => row.category === category).length])),
    readyFusionRecipes: fusionDependencies.filter(recipe => recipe.ready).length,
    blockedFusionRecipes: fusionDependencies.filter(recipe => !recipe.ready).length,
    readyBreedingRecipes: breedingDependencies.filter(recipe => recipe.ready).length,
    blockedBreedingRecipes: breedingDependencies.filter(recipe => !recipe.ready).length,
    checks: ['complete source partition', 'independent directed executable dependency closure', 'source catalog remained unchanged'],
  };
  assert.equal(summary.availableSpecies + summary.missingSpecies, summary.eligibleSpecies);
  assert.equal(Object.values(summary.missingCategoryCounts).reduce((sum, count) => sum + count, 0), missing.length);
  const sourceFiles = ['data/gamedata.json', 'data/breeding.json', 'src/progression/acquisition.ts', 'src/progression/initial-acquisition.ts', 'src/progression/fusion.ts', 'src/progression/breeding.ts', 'src/progression/spt-recruitment.ts', 'src/world.ts', 'src/world-expansion.ts', 'tools/verification/export-acquisition-status.mjs'];
  const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(read(file)).digest('hex')]));
  sourceHashes['data/bosses/*.json (sorted parsed records)'] = createHash('sha256').update(JSON.stringify(catalog.bosses)).digest('hex');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'status.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, sourceHashes, reasons, species: rows, families: familyRows, fusionDependencies, breedingDependencies, witnesses }, null, 2) + '\n');
  const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csvRows = selected => ['id,name,family_id,initial_forms,category,missing_predecessors,blocked_fusion_recipes,blocked_breeding_recipes', ...selected.map(row => [row.id, row.name, row.familyId, row.initialForms.map(form => `${form.id} ${form.name}`).join('; '), row.category, row.missingPredecessors.map(parent => `${parent.id} ${parent.name}`).join('; '), row.blockedFusionRecipeIds.join('; '), row.blockedBreedingRecipeIds.join('; ')].map(csv).join(','))].join('\n') + '\n';
  fs.writeFileSync(path.join(output, 'missing-species.csv'), csvRows(missing));
  fs.writeFileSync(path.join(output, 'excluded-npc.csv'), csvRows(rows.filter(row => row.status === 'npc')));
  const names = selected => selected.map(row => `${row.id} ${row.name}`).join('; ') || '—';
  const lines = ['# Missing acquisition by directed initial family', '', `Generated from current source: ${summary.availableSpecies} obtainable and ${summary.missingSpecies} missing eligible forms. ${summary.availableInitialEntries}/${summary.eligibleInitialForms} true initial forms have direct entries.`, '', 'Grouping follows source ancestry; executable status follows forward rules and reachable dependencies. Direct adult rewards do not supply an initial entry. NPC forms 122–125 are excluded and listed separately.', ''];
  for (const [category, reason] of Object.entries(reasons)) lines.push(`- ${category}: ${reason}`);
  lines.push('');
  for (const family of familyRows.filter(family => family.status !== 'npc' && (family.missingSpecies.length || family.initialForms.some(form => !form.directEntryAvailable)))) {
    lines.push(`## ${family.id}: ${names(family.initialForms)}`, '', `Initial entries: ${family.initialForms.map(form => `${form.id} ${form.name}: ${form.directEntryAvailable ? 'implemented' : 'missing'}`).join('; ') || 'no directed root'}. Obtainable forms: ${names(family.members.filter(row => row.status === 'available'))}.`, '', '| ID | Species | Blocking category | Immediate missing predecessors |', '| --- | --- | --- | --- |');
    for (const row of family.members.filter(row => row.status === 'unimplemented')) lines.push(`| ${row.id} | ${row.name} | ${row.category} | ${names(row.missingPredecessors)} |`);
    lines.push('');
  }
  lines.push('## Breeding dependencies', '', 'The exact mature male must have a first-generation route; female generation is unrestricted. Both parents must reach the source minimum level.', '', '| Recipe | Male parents | Female parents | Ready | Missing first-generation males | Missing females | Offspring probabilities |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const recipe of breedingDependencies) lines.push(`| ${recipe.id} ${recipe.name} | ${names(recipe.male)} | ${names(recipe.female)} | ${recipe.ready ? 'yes' : 'no'} | ${names(recipe.missingFirstGenerationMales)} | ${names(recipe.missingFemales)} | ${recipe.outcomes.map(outcome => `${outcome.species} ${outcome.name}: ${outcome.weight}%`).join('; ')} |`);
  lines.push('', '## Excluded NPC forms', '', names(rows.filter(row => row.status === 'npc')), '');
  fs.writeFileSync(path.join(output, 'missing-initial-families.md'), lines.join('\n'));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await server.close();
}
