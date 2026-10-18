import './classic-robot.css';
import robotManifest from '../../../../public/robots/classic/manifest.json';
import walkingManifest from '../../../../public/robots/classic/walking-manifest.json';
import type {RobotDirection} from '../world-walk.ts';
export default function ClassicRobot({direction='front',walking=false,role='player'}:{direction?:RobotDirection;walking?:boolean;role?:'player'|'captain'|'scientist'}) {
 const player=role==='player';
 const asset=player?walkingManifest.poses[direction]:robotManifest[role];
 const label=player?'经典赛尔机器人':role==='captain'?'罗杰船长':'派特博士';
 return <span className={`classic-robot role-${role} ${player&&walking?'walking':''}`} data-direction={player?direction:'front-left'} data-gait={player?(walking?'walking':'idle'):undefined}>
  {player?<span className="classic-robot-viewport" style={{aspectRatio:`${walkingManifest.commonViewport[2]} / ${walkingManifest.commonViewport[3]}`}}>
   <img className="classic-robot-frames" src={`${asset.path}?v=${asset.sha256.slice(0,12)}`} alt={label} draggable={false}/>
  </span>:<img src={`${asset.path}?v=${asset.sha256.slice(0,12)}`} alt={label} draggable={false}/>}
 </span>;
}
