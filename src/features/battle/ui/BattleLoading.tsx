import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
export interface BattlePreparation {name:string;species:number;location?:string;progress:number;step:string;error?:string}
export default function BattleLoading({state,onLeave}:{state:BattlePreparation;onLeave:()=>void}) {
  return <section className="battle-loading" aria-label="战斗加载" aria-live="polite"><div className="loading-orbits" aria-hidden="true"/><div className="loading-kicker">{state.location ? `${state.location} · ` : ''}战斗准备</div><h2>{state.name}</h2><CreatureArt species={state.species} name={state.name} size={200}/><div className="loading-progress" role="progressbar" aria-label="资源加载进度" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${state.progress}%`}}/></div><div className="loading-caption"><span>{state.error??state.step}</span><b>{state.progress}%</b></div><button onClick={onLeave}>返回场景</button></section>;
}
