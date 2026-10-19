// Rows and texts of the challenge archive (星际挑战档案), built from the snapshot.
import type { GameSnapshot } from '../../kernel/contract.ts';
import type { BossView, BraveTowerView, CampaignView, ChallengeCategoryId, EncounterVariantView } from '../../shared/views.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {braveTowerFloor} from '../../domain/challenges/brave-tower.ts';
import {CHALLENGE_CATEGORY} from '../../domain/challenges/challenge-campaigns.ts';
import {mergeBossEvidence} from '../../domain/challenges/boss-evidence.ts';
import {opponentLevelText} from '../../shared/encounter-level.ts';

/** An archive tab: one category, or `all`. */
export type ChallengeTab=ChallengeCategoryId|'all';
export const CHALLENGE_TABS=Object.entries({all:'全部挑战',...CHALLENGE_CATEGORY}) as [ChallengeTab,string][];
export const CHALLENGE_PAGE_SIZE=10;

/** An archive row: a standalone encounter, a whole campaign, or the whole Brave Tower. */
export type ChallengeEntry=BossView&{campaign?:CampaignView;tower?:boolean};
export type ChallengeKind='tower'|'campaign'|'trainer'|'boss';
type ArchiveSnapshot=Pick<GameSnapshot,'bosses'|'campaigns'|'braveTower'>;

/** Tabs whose rows are ordered by the floor or door number in the encounter id. */
const NUMBERED_TABS=new Set<ChallengeTab>(['tower','dark']);
const encounterNumber=(entry:ChallengeEntry)=>Number(entry.id.match(/(?:_f|_door)(\d+)/)?.[1]??Number.MAX_SAFE_INTEGER);
const dexNumber=(species:number)=>`#${String(species).padStart(4,'0')}`;
const isTowerFloor=(boss:BossView)=>braveTowerFloor(boss.id)!==undefined;

function campaignEntry(s:ArchiveSnapshot,campaign:CampaignView):ChallengeEntry {
  return {
    id:`campaign-${campaign.id}`,name:campaign.name,species:campaign.species,
    category:campaign.reward==='skills'?'quest':'legendary',
    description:campaign.stages.map(stage=>`${stage.name} ${stage.description}`).join(' '),location:campaign.location,
    level:s.bosses.find(boss=>boss.id===campaign.stages.at(-1)!.bossIds[0])?.level??MAX_LEVEL,portrait:`/portraits/${campaign.species}.png`,
    cleared:campaign.finished,attempts:0,evidence:mergeBossEvidence(campaign.stages.map(stage=>stage.evidence)),campaign,
  };
}

/** The numbered floors share one row; the first floor supplies its art and category. */
function towerEntry(s:ArchiveSnapshot,floors:BossView[]):ChallengeEntry|undefined {
  if(!floors.length)return undefined;
  return {
    ...floors[0],id:'brave-tower',name:CHALLENGE_CATEGORY.tower,description:'每通过十层解锁新的起点；保存当前挑战楼层，可继续上次进度。',
    cleared:s.braveTower.position.conquered,attempts:floors.reduce((sum,boss)=>sum+boss.attempts,0),tower:true,
  };
}

/** Campaign stages and tower floors appear only through their campaign or tower row. */
export function challengeEntries(s:ArchiveSnapshot):ChallengeEntry[] {
  const stageBossIds=new Set(s.campaigns.flatMap(campaign=>campaign.stages.flatMap(stage=>stage.bossIds)));
  const tower=towerEntry(s,s.bosses.filter(isTowerFloor));
  return [
    ...s.bosses.filter(boss=>!stageBossIds.has(boss.id)&&!isTowerFloor(boss)),
    ...s.campaigns.map(campaign=>campaignEntry(s,campaign)),
    ...(tower?[tower]:[]),
  ];
}

/** The rows of one tab whose name or hint contains `search`. */
export function challengeRows(entries:readonly ChallengeEntry[],tab:ChallengeTab,search:string):ChallengeEntry[] {
  const numbered=NUMBERED_TABS.has(tab);
  return entries.filter(entry=>(tab==='all'||tab===entry.category)&&`${entry.name} ${entry.description}`.includes(search))
    .sort((a,b)=>(numbered?encounterNumber(a)-encounterNumber(b):0)||a.species-b.species||a.name.localeCompare(b.name,'zh'));
}

export const challengeKind=(entry:ChallengeEntry):ChallengeKind=>
  entry.tower?'tower':entry.campaign?'campaign':entry.category==='trainer'?'trainer':'boss';

const towerRecord=(tower:BraveTowerView)=>`最高通过 ${tower.highestCleared} / ${tower.totalFloors} 层`;

/** The caption under a row's name. */
export function challengeCaption(entry:ChallengeEntry,tower:BraveTowerView):string {
  if(entry.tower)return towerRecord(tower);
  const progress=entry.campaign?`${entry.campaign.completed}/${entry.campaign.stages.length} 阶段`:opponentLevelText(entry);
  return `${dexNumber(entry.species)} · ${progress}`;
}

export interface ChallengeDetail {
  /** Above the name: dex number and category, or the tower's checkpoint rule. */
  subtitle:string;
  /** The progress tag beside the name. */
  status:string;
  /** How the challenge begins. */
  instruction:string;
  /** The rules on the player's team, stated before the start; empty when the challenge has none. */
  rules:string[];
  reward:string;
  action:string;
  /** The titles and achievements a clear earns, or the tower's earned ones; undefined when there are none. */
  honors?:string;
}

const INSTRUCTIONS:Record<ChallengeKind,string>={
  tower:'进入勇者之塔，选择已解锁的十层起点，或继续上次挑战。',campaign:'先进入挑战场景，按顺序推进各阶段。',
  trainer:'前往太空站，与训练师互动开启对战。',boss:'先传送到挑战地点，再与场景中的首领互动开启战斗。',
};
const STAGING_INSTRUCTION='先前往飞船传送舱，再与对手互动开启战斗。';
const TOWER_SIDE_INSTRUCTION='进入勇者之塔，在选择起点面板开始挑战。';
const ACTIONS:Record<ChallengeKind,string>={tower:'进入勇者之塔 →',campaign:'进入挑战场景 →',trainer:'开始挑战 →',boss:'开始挑战 →'};

function rewardNote(entry:ChallengeEntry,kind:ChallengeKind,s:ArchiveSnapshot):string {
  if(kind==='tower')return `逐层领取挑战奖励，通过第 ${s.braveTower.totalFloors} 层后可重选起点。`;
  if(kind==='trainer')return '赛尔豆与经验。';
  if(kind==='boss')return entry.rewardText??'';
  const campaign=entry.campaign!;
  if(campaign.reward==='essence')return '完成全部阶段后获得精元，途中阶段不会重复发放精灵';
  return `通过每项特训，领悟对应的${campaign.speciesName}技能`;
}

const allCleared=(variants:readonly EncounterVariantView[])=>variants.every(variant=>variant.cleared);
/** How many of the variants are cleared: 已通过 3/7, marked once all are. */
function variantProgress(variants:readonly EncounterVariantView[]):string {
  return `${allCleared(variants)?'✓ ':''}已通过 ${variants.filter(variant=>variant.cleared).length}/${variants.length}`;
}

/** The progress tag; an encounter with variants counts its cleared variants. */
function challengeStatus(entry:ChallengeEntry,s:ArchiveSnapshot):string {
  if(entry.tower)return towerRecord(s.braveTower);
  if(entry.variants)return variantProgress(entry.variants);
  if(entry.cleared)return '✓ 已完成';
  if(entry.campaign)return `${entry.campaign.completed} / ${entry.campaign.stages.length} 阶段`;
  return '可挑战';
}

/** The detail pane texts; `staging` means the challenge is reached through the ship's transfer dock. */
export function challengeDetail(entry:ChallengeEntry,s:ArchiveSnapshot,staging:boolean):ChallengeDetail {
  const kind=challengeKind(entry),campaign=entry.campaign;
  return {
    subtitle:entry.tower?'十层起点 · 进度保存':`${dexNumber(entry.species)} · ${CHALLENGE_CATEGORY[entry.category]}${campaign?'':` · ${opponentLevelText(entry)}`}`,
    status:challengeStatus(entry,s),
    instruction:entry.towerSideFloor!==undefined?TOWER_SIDE_INSTRUCTION:kind==='boss'&&staging?STAGING_INSTRUCTION:INSTRUCTIONS[kind],
    rules:entry.partyRuleTexts??[],reward:rewardNote(entry,kind,s),action:ACTIONS[kind],honors:honorNote(entry,s),
  };
}

/** What a clear earns, then what clearing every variant earns. */
function honorNote(entry:ChallengeEntry,s:ArchiveSnapshot):string|undefined {
  const honors=entry.tower?s.braveTower.honors:entry.honors??[],variants=entry.variants??[],variantHonors=entry.variantHonors??[];
  const notes=honors.length?[`${entry.tower||entry.cleared?'已获得':'通关后获得'}：${honors.join(' · ')}`]:[];
  if(variantHonors.length)notes.push(`${allCleared(variants)?'已获得':`通过全部 ${variants.length} 种规则后获得`}：${variantHonors.join(' · ')}`);
  return notes.length?notes.join('；'):undefined;
}

/** An earned honour and the challenge that gave it. */
export interface HonorRow {label:string;source:string}

/** Every honour earned so far, once each, in catalogue order: derived from the cleared encounters and variants. */
export function challengeHonors(s:ArchiveSnapshot):HonorRow[] {
  const rows=new Map<string,string>();
  for(const boss of s.bosses){
    const earned=[...boss.cleared?boss.honors??[]:[],...boss.variants&&allCleared(boss.variants)?boss.variantHonors??[]:[]];
    for(const label of earned)if(!rows.has(label))rows.set(label,isTowerFloor(boss)?CHALLENGE_CATEGORY.tower:boss.name);
  }
  return [...rows].map(([label,source])=>({label,source}));
}
