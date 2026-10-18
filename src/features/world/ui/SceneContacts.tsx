import type { CSSProperties, MouseEvent } from 'react';
import type { BossView } from '../../../shared/views.ts';
import { CHALLENGE_CATEGORY } from '../../../domain/challenges/challenge-campaigns.ts';
import { opponentLevelText } from '../../../shared/encounter-level.ts';
import { getSceneBossActor, getSceneBossHome, type SceneBossActor, type SceneLayout } from '../map-presentation.ts';
import type { ScenePoint } from '../scene-geometry.ts';
import type { SceneExit } from '../scene-exits.ts';
import { contactName, type FacilityKind, type SceneEquipment, type WorldSceneView, type WorldSelection } from '../world-scene.ts';
import type { WorldCreatureInstance } from '../world-population.ts';
import ClassicRobot from './ClassicRobot.tsx';
import { CreatureArt } from '../../../shared/ui/CreatureArt.tsx';
import { RoamingCreature } from './RoamingCreature.tsx';

type Click = (event: MouseEvent<HTMLButtonElement>) => void;
type Approach = (event: MouseEvent<HTMLButtonElement>, home: ScenePoint) => void;
export const at = (position: ScenePoint): CSSProperties => ({ left: `${position.x}%`, top: `${position.y}%` });
const box = (position: ScenePoint, size: { width: number; height: number }): CSSProperties =>
  ({ ...at(position), width: `${size.width}%`, height: `${size.height}%` });
const GATE_ARROWS = { left: '←', right: '→', up: '↑', down: '↓' } as const;

export function FacilityNpc({ kind }: { kind: FacilityKind | undefined }) {
  const role = kind === 'missions' ? 'captain' : kind === 'recovery' ? 'scientist' : 'player';
  return <div className="world-facility-art world-original-npc"><ClassicRobot direction="front" walking={false} role={role}/></div>;
}

/** A recovered map actor at its native crop size, or the creature art on a shadow. */
function ContactArt({ actor, species, name }: { actor?: SceneBossActor; species: number; name: string }) {
  return actor ? <img className="world-native-actor-art" src={actor.src} alt="" draggable={false}/>
    : <><span className="world-creature-shadow"/><div className="world-sprite-art"><CreatureArt species={species} name={name}/></div></>;
}

export function SceneGate({ exit, onClick }: { exit: SceneExit; onClick: Click }) {
  return <button className={`world-gate world-gate-${exit.facing}${exit.anchor.y > 78 ? ' world-gate-caption-above' : ''}`} style={at(exit.anchor)}
    aria-label={exit.ariaLabel} onClick={onClick}>
    <span className="world-gate-arrow" aria-hidden="true">{GATE_ARROWS[exit.facing]}</span>
    <span className="world-gate-caption"><small>前往</small><strong>{exit.caption}</strong></span>
  </button>;
}

/** The Tower contact stands at the center of map 500; other contacts use their source position. */
const bossHome = (scene: WorldSceneView, layout: SceneLayout, boss: BossView, index: number) =>
  scene.tower ? { x: 50, y: 58 } : getSceneBossHome(layout, boss.id, index, scene.bosses.length);

export function BossContact({ scene, layout, boss, index, onApproach }: {
  scene: WorldSceneView; layout: SceneLayout; boss: BossView; index: number; onApproach: Approach;
}) {
  const { tower } = scene, actor = tower ? undefined : getSceneBossActor(layout, boss.id), home = bossHome(scene, layout, boss, index), name = contactName(scene, boss);
  const badge = tower ? (tower.complete ? '已通关' : `第 ${tower.floor} 层`) : boss.category === CHALLENGE_CATEGORY.spt ? 'SPT' : '挑战';
  const team = tower && tower.opponents.length > 1 ? ` · 队伍 ${tower.opponents.length} 只` : '';
  return <button className={`world-creature world-boss${actor ? ' world-native-actor' : ''}`} data-boss={boss.id} data-species={boss.species}
    style={actor ? box(home, actor) : at(home)} aria-label={`与${name}互动`} onClick={event => onApproach(event, home)}>
    <ContactArt actor={actor} species={boss.species} name={name}/>
    <span className="world-character-name"><b>{badge}</b> {name}<small>{opponentLevelText(boss)}{team}</small></span>
  </button>;
}

/** One neutral contact opens the saved campaign rather than a specific stage. */
export function CampaignContactButton({ scene, layout, onApproach }: { scene: WorldSceneView; layout: SceneLayout; onApproach: Approach }) {
  const { campaign, name, progress } = scene.campaign!;
  const actor = getSceneBossActor(layout, `campaign:${campaign.id}`), home = actor?.anchor ?? layout.boss;
  return <button className={`world-creature world-boss world-campaign-contact${actor ? ' world-native-actor' : ''}`} data-campaign={campaign.id}
    style={actor ? box(home, actor) : at(home)} aria-label={`与${name}互动，查看挑战进度`} onClick={event => onApproach(event, home)}>
    <ContactArt actor={actor} species={campaign.species} name={name}/>
    <span className="world-character-name">{name}<small>{progress}</small></span>
  </button>;
}

export function FacilityContact({ scene, layout, onClick }: { scene: WorldSceneView; layout: SceneLayout; onClick: Click }) {
  const { region, facilityName, laboratory } = scene;
  return <button className="world-npc" style={at(layout.npc)} aria-label={`与${facilityName}互动`} onClick={onClick}>
    <FacilityNpc kind={region.facility}/>
    {!laboratory && <span className="npc-interaction-mark">{region.facility === 'missions' ? '!' : '✦'}</span>}
    <span className="world-character-name">{facilityName}</span>
  </button>;
}

export function EquipmentButton({ equipment, onClick }: { equipment: SceneEquipment; onClick: Click }) {
  const style = box(equipment, equipment), label = `使用${equipment.name}`;
  if (equipment.kind === 'lab') return <button className={`world-lab-facility world-lab-${equipment.page}`} style={style} aria-label={label} onClick={onClick}>
    <span className="world-lab-equipment-outline" aria-hidden="true"/>
    <span className="world-character-name">{equipment.name}</span>
  </button>;
  return <button className={`world-station-terminal${equipment.captionAbove ? ' world-station-terminal-caption-above' : ''}`} style={style}
    aria-label={label} data-station-action={equipment.page} onClick={onClick}>
    <span className="world-station-terminal-outline" aria-hidden="true"/>
    <span className="world-station-terminal-caption"><strong>{equipment.name}</strong><small>{equipment.hint}</small></span>
  </button>;
}

/** Everything the player can walk up to in a scene, in drawing order. */
export function SceneContacts({ scene, layout, exits, creatures, battle, frozen, onGate, onApproach, onOperate }: {
  scene: WorldSceneView; layout: SceneLayout; exits: SceneExit[]; creatures: WorldCreatureInstance[]; battle: boolean;
  frozen: (instanceId: string) => boolean;
  onGate: (event: MouseEvent<HTMLButtonElement>, exit: SceneExit) => void;
  onApproach: (event: MouseEvent<HTMLButtonElement>, selection: WorldSelection, contact: ScenePoint) => void;
  onOperate: (event: MouseEvent<HTMLButtonElement>, equipment: SceneEquipment) => void;
}) {
  const { campaign } = scene;
  return <>
    {exits.map(exit => <SceneGate key={exit.id} exit={exit} onClick={event => onGate(event, exit)}/>)}
    {creatures.map(({ species, instanceId, level }, index) => <RoamingCreature key={instanceId} species={species} instanceId={instanceId} level={level}
      index={index} count={creatures.length} layout={layout} frozen={frozen(instanceId)} battle={battle}
      onApproach={(event, foot) => onApproach(event, { kind: 'creature', id: species.id, instanceId, level }, foot)}/>)}
    {scene.bosses.map((boss, index) => <BossContact key={boss.id} scene={scene} layout={layout} boss={boss} index={index}
      onApproach={(event, home) => onApproach(event, { kind: 'boss', id: boss.id }, home)}/>)}
    {campaign && <CampaignContactButton scene={scene} layout={layout}
      onApproach={(event, home) => onApproach(event, { kind: 'campaign', id: campaign.campaign.id }, home)}/>}
    {scene.region.facility && <FacilityContact scene={scene} layout={layout} onClick={event => onApproach(event, { kind: 'facility' }, layout.npc)}/>}
    {scene.equipment.map(equipment => <EquipmentButton key={equipment.page} equipment={equipment} onClick={event => onOperate(event, equipment)}/>)}
  </>;
}
