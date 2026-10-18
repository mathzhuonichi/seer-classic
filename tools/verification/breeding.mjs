/** Focused replay of the original breeding allowlist and pure progression rules. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
const server = await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'});
try {
  const {BREEDING_RECIPES: recipes, getBreedingGender: gender, findBreedingRecipe: find, canBreedParents: can, chooseBreedingOutcome: choose, breedingEggItemId: egg} = await server.ssrLoadModule('/src/progression/breeding.ts');
  const source = JSON.parse(fs.readFileSync('data/breeding.json'));
  const xml = fs.readFileSync('.cache/breeding-v24/eggs-166.xml','utf8');
  const original = [...xml.matchAll(/<Egg\s+([^>]+)\/>/g)].map(match => Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1],m[2]])));
  const catalog = JSON.parse(fs.readFileSync('data/gamedata.json'));
  const species = new Map(catalog.species.map(s => [s.id,s]));
  const {EXCLUDED_RECRUITMENT_SPECIES: excluded} = await server.ssrLoadModule('/src/progression/spt-recruitment.ts');
  assert.equal(recipes.length,8);
  assert.equal(Object.keys(source.genderBySpecies).length,1483);
  const petsXml=fs.readFileSync('.cache/paid-spt-recruitment-v23/core-binary-23.xml','utf8');
  const originalPets=new Map([...petsXml.matchAll(/<Monster\s+([^>]+)>/g)].map(match=>{
    const attrs=Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    return [Number(attrs.ID),Number(attrs.Gender ?? 0)];
  }));
  for(const [id,value] of Object.entries(source.genderBySpecies))assert.equal(value,originalPets.get(Number(id)));

  const checked = [];
  for (const recipe of recipes) {
    const row = original.find(row => Number(row.Id) === recipe.originalEggId);
    assert.deepEqual(recipe.maleSpecies,[Number(row.MaleMon)]);
    assert.deepEqual(recipe.femaleSpecies,[Number(row.FemaleMon)]);
    assert.deepEqual(recipe.outcomes,row.OutputMons.split(' ').map((id,i)=>({species:Number(id),weight:Number(row.Probs.split(' ')[i])})));
    assert.equal(recipe.outcomes.reduce((sum,o)=>sum+o.weight,0),100);
    for (const id of [...recipe.maleSpecies,...recipe.femaleSpecies,...recipe.outcomes.map(o=>o.species)]) {
      assert.ok(species.has(id)); assert.ok(!excluded.has(id)); assert.ok(id<1489);
    }
    for (const outcome of recipe.outcomes) {
      assert.ok(!species.get(outcome.species).evolves_from);
      assert.ok(!catalog.species.some(s => s.evolution.some(e => e.to === outcome.species)));
      assert.equal(egg(outcome.species),`breeding_egg_${outcome.species}`);
    }
    const male={uid:'male',species:recipe.maleSpecies[0],level:50};
    const female={uid:'female',species:recipe.femaleSpecies[0],level:50};
    assert.equal(gender(male.species),1); assert.equal(gender(female.species),2);
    assert.equal(find(male.species,female.species).id,recipe.id);
    assert.equal(find(female.species,male.species).id,recipe.id);
    assert.ok(can(recipe,male,female)); assert.ok(can(recipe,female,male));
    assert.equal(can(recipe,male,{...female,uid:'male'}),false);
    assert.equal(can(recipe,{...male,level:49},female),false);
    assert.equal(can(recipe,male,{...female,level:49}),false);
    assert.equal(can(recipe,{...male,generation:1},female),false);
    assert.equal(can(recipe,male,{...female,generation:1}),true);
    assert.equal(can(recipe,{...male,species:recipe.maleInitialSpecies},female),false);
    assert.equal(can(recipe,male,{...female,species:recipe.femaleInitialSpecies}),false);
    assert.equal(can(recipe,{...male,species:123},female),false);
    assert.equal(can(recipe,{...male,species:500},female),false);
    let threshold=0;
    for (const outcome of recipe.outcomes) {
      assert.equal(choose(recipe,(threshold+outcome.weight/2)/100).species,outcome.species);
      threshold+=outcome.weight;
    }
    assert.throws(()=>choose(recipe,-1));assert.throws(()=>choose(recipe,1));assert.throws(()=>choose(recipe,NaN));
    checked.push(recipe);
  }
  assert.equal(find(3,6),undefined); assert.equal(find(450,450),undefined);
  fs.mkdirSync('artifacts/breeding-v24',{recursive:true});
  fs.writeFileSync('artifacts/breeding-v24/registry-verification.json',JSON.stringify({checkedRecipes:checked.length,recipes:checked},null,2)+'\n');
  console.log('Verified 8 exact original mature pairs, all 24 weighted initial offspring entries, 1,483 species genders, Lv50 gates, distinct identities, generation restriction, and NPC/divine exclusions.');
} finally { await server.close(); }
