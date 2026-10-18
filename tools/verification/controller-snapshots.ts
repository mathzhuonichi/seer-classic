import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame,loadCatalog} from '../../src/game';
import type {CatalogData} from '../../src/mechanics/catalog';

/** Collection caches must follow evolution/import/reset without changing earlier snapshots. */
export async function verifyControllerSnapshots(){
  const catalog=await loadCatalog(),original=JSON.stringify(catalog);
  const game=createGame(catalog,'');
  createGame(catalog,'');
  assert.equal(JSON.stringify(catalog),original,'Controllers must not mutate the shared source catalog.');
  const initial=game.snapshot(),initialSave=game.exportSave(),species=initial.species;
  game.dispatch({type:'heal'});game.dispatch({type:'dismissNotice'});
  assert.equal(game.snapshot().species,species,'Unchanged collection reuses its catalog view.');
  game.dispatch({type:'cheatAcquire',species:19,level:100});
  const infant=game.snapshot(),uid=infant.monsters.find(mon=>mon.species===19)!.uid;
  assert(infant.species.find(row=>row.id===19)!.owned);
  assert(!initial.species.find(row=>row.id===19)!.owned,'Earlier snapshot remains unowned.');
  game.dispatch({type:'evolve',uid});
  const middle=game.snapshot();assert(middle.species.find(row=>row.id===20)!.owned);
  assert(!infant.species.find(row=>row.id===20)!.owned);
  game.dispatch({type:'evolve',uid});assert(game.snapshot().species.find(row=>row.id===21)!.owned);
  game.importSave(initialSave);
  assert(!game.snapshot().species.find(row=>row.id===19)!.owned,'Import can remove collection entries.');
  game.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'});
  if(game.snapshot().battle){game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});}
  game.reset();
  assert(!game.snapshot().species.find(row=>row.id===20)!.owned,'Reset invalidates collection and challenge caches.');
  assert.equal(new Set(catalog.items.map(item=>item.id)).size,catalog.items.length,'Source item IDs remain unique.');
  const output={checks:['catalog ownership across controllers','unchanged catalog identity','explicit acquisition ownership','two forward evolutions and immutable earlier views','save import removes owned forms','reset invalidates derived views'],catalogSpecies:catalog.species.length,sourceItems:catalog.items.length};
  fs.mkdirSync('artifacts/battle-media-v22',{recursive:true});
  fs.writeFileSync('artifacts/battle-media-v22/controller-snapshots.json',JSON.stringify(output,null,2)+'\n');
  return output;
}
