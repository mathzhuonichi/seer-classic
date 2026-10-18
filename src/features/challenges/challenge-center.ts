// Rows and texts of the challenge archive (星际挑战档案), built from the snapshot.
import type { GameSnapshot } from '../../kernel/contract.ts';
import type { BossView, BraveTowerView, CampaignView } from '../../shared/views.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {braveTowerFloor} from '../../domain/challenges/brave-tower.ts';
import {CHALLENGE_CATEGORY} from '../../domain/challenges/challenge-campaigns.ts';
import {mergeBossEvidence} from '../../domain/challenges/boss-evidence.ts';
import {opponentLevelText} from '../../shared/encounter-level.ts';

/** The tab that lists every category. */
export const ALL_CHALLENGES='全部挑战';
export const CHALLENGE_TABS:readonly string[]=[ALL_CHALLENGES,...Object.values(CHALLENGE_CATEGORY)];
export const CHALLENGE_PAGE_SIZE=10;

/** An archive row: a standalone encounter, a whole campaign, or the whole Brave Tower. */
export type ChallengeEntry=BossView&{campaign?:CampaignView;tower?:boolean};
export type ChallengeKind='tower'|'campaign'|'trainer'|'boss';
type ArchiveSnapshot=Pick<GameSnapshot,'bosses'|'campaigns'|'braveTower'>;

/** Tabs whose rows are ordered by the floor or door number in the encounter id. */
const NUMBERED_TABS=new Set<string>([CHALLENGE_CATEGORY.tower,CHALLENGE_CATEGORY.dark]);
const encounterNumber=(entry:ChallengeEntry)=>Number(entry.id.match(/(?:_f|_door)(\d+)/)?.[1]??Number.MAX_SAFE_INTEGER);
const dexNumber=(species:number)=>`#${String(species).padStart(4,'0')}`;
const isTowerFloor=(boss:BossView)=>braveTowerFloor(boss.id)!==undefined;

function campaignEntry(s:ArchiveSnapshot,campaign:CampaignView):ChallengeEntry {
  return {
    id:`campaign-${campaign.id}`,name:campaign.name,species:campaign.species,
    category:campaign.reward==='skills'?CHALLENGE_CATEGORY.quest:CHALLENGE_CATEGORY.legendary,
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
export function challengeRows(entries:readonly ChallengeEntry[],tab:string,search:string):ChallengeEntry[] {
  const numbered=NUMBERED_TABS.has(tab);
  return entries.filter(entry=>(tab===ALL_CHALLENGES||tab===entry.category)&&`${entry.name} ${entry.description}`.includes(search))
    .sort((a,b)=>(numbered?encounterNumber(a)-encounterNumber(b):0)||a.species-b.species||a.name.localeCompare(b.name,'zh'));
}

export const challengeKind=(entry:ChallengeEntry):ChallengeKind=>
  entry.tower?'tower':entry.campaign?'campaign':entry.category===CHALLENGE_CATEGORY.trainer?'trainer':'boss';

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
  reward:string;
  action:string;
}

const INSTRUCTIONS:Record<ChallengeKind,string>={
  tower:'进入勇者之塔，选择已解锁的十层起点，或继续上次挑战。',campaign:'先进入挑战场景，按顺序推进各阶段。',
  trainer:'前往太空站，与训练师互动开启对战。',boss:'先传送到挑战地点，再与场景中的首领互动开启战斗。',
};
const STAGING_INSTRUCTION='先前往飞船传送舱，再与对手互动开启战斗。';
const ACTIONS:Record<ChallengeKind,string>={tower:'进入勇者之塔 →',campaign:'进入挑战场景 →',trainer:'开始挑战 →',boss:'开始挑战 →'};

function rewardNote(entry:ChallengeEntry,kind:ChallengeKind,s:ArchiveSnapshot):string {
  if(kind==='tower')return `逐层领取挑战奖励，通过第 ${s.braveTower.totalFloors} 层后可重选起点。`;
  if(kind==='trainer')return '赛尔豆与经验。';
  if(kind==='boss')return '获得首领精元 → 道具背包 → 确认孵化';
  const campaign=entry.campaign!;
  if(campaign.reward==='essence')return '完成全部阶段后获得精元，途中阶段不会重复发放精灵';
  return `通过每项特训，领悟对应的${campaign.speciesName}技能`;
}

/** The detail pane texts; `staging` means the challenge is reached through the ship's transfer dock. */
export function challengeDetail(entry:ChallengeEntry,s:ArchiveSnapshot,staging:boolean):ChallengeDetail {
  const kind=challengeKind(entry),campaign=entry.campaign;
  return {
    subtitle:entry.tower?'十层起点 · 进度保存':`${dexNumber(entry.species)} · ${entry.category}${campaign?'':` · ${opponentLevelText(entry)}`}`,
    status:entry.tower?towerRecord(s.braveTower):entry.cleared?'✓ 已完成':campaign?`${campaign.completed} / ${campaign.stages.length} 阶段`:'可挑战',
    instruction:kind==='boss'&&staging?STAGING_INSTRUCTION:INSTRUCTIONS[kind],
    reward:rewardNote(entry,kind,s),action:ACTIONS[kind],
  };
}
