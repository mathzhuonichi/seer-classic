import {createRoot} from 'react-dom/client';
import type {Save} from '../../raising/core/types.ts';
import {BRAVE_TOWER_FLOORS,braveTowerBossId} from '../progression/brave-tower.ts';

function memoryStorage(): Storage {
  const values=new Map<string,string>();
  return {
    get length(){return values.size;},
    clear(){values.clear();},
    getItem(key){return values.get(String(key))??null;},
    key(index){return [...values.keys()][index]??null;},
    removeItem(key){values.delete(String(key));},
    setItem(key,value){values.set(String(key),String(value));},
  };
}

// Isolate this page before application modules read or write storage. Reloading
// resets the preview; the browser's player saves and preferences stay untouched.
for(const name of ['localStorage','sessionStorage'] as const) {
  Object.defineProperty(window,name,{value:memoryStorage(),configurable:true});
}
document.title='Seer Classic Preview';

const [{Game},{createGame,loadCatalog}]=await Promise.all([
  import('../App.tsx'),
  import('../game.ts'),
]);
const game=createGame(await loadCatalog(),'');
for(const species of [15,12,832])game.dispatch({type:'cheatAcquire',species,level:100});
const seed=JSON.parse(game.exportSave()) as Save;
seed.party=[seed.party[0],...seed.storage.slice(3).map(mon=>mon.uid),...seed.party.slice(1)].slice(0,6);
seed.items={};
// Optional fixture for reviewing checkpoint states; this remains memory-only.
const towerFloor=Number(new URLSearchParams(location.search).get('towerFloor'));
if(Number.isInteger(towerFloor)&&towerFloor>=1&&towerFloor<=BRAVE_TOWER_FLOORS){
  seed.progress.bosses_cleared=Array.from({length:towerFloor-1},(_,index)=>braveTowerBossId(index+1));
  (seed as Save&{game:{braveTower:{highestCleared:number;resumeFloor:number}}}).game.braveTower={highestCleared:towerFloor-1,resumeFloor:towerFloor};
}
game.importSave(JSON.stringify(seed));
createRoot(document.getElementById('root')!).render(<Game controller={game}/>);
