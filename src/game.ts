import { buildDataSet, createBattle, Rng, validateEncounter, type Battle, type Mon, type Action, type BattleEvent, type BossEncounter, type RawData, type Hook } from '../battle/core/src/index.ts';
import { traitScripts } from './mechanics/traits';
import { campaignScripts } from './mechanics/campaign-rules';
import { npcTrainingScripts } from './mechanics/npc-training';
import { normalizeNpcTrainingEncounter } from './progression/npc-training';
import { normalizeBossSkillPolicy } from './progression/boss-skill-policy';
import { CHALLENGE_CAMPAIGNS, type Campaign, type CampaignStage } from './progression/challenge-campaigns';
import { NPC_ONLY_SPECIES, resolveEncounterEssenceSpecies } from './progression/acquisition';
import {buildRecruitmentRewards,recruitmentProgress,isSpeciesRepeatable,type RecruitmentCatalog,type RecruitmentReward} from './progression/recruitment';
import {getEligibleRecruitmentSPTs} from './progression/spt-recruitment';
import {acquisitionAllowance,acquisitionLimitReason,SPECIES_COPY_LIMIT} from './progression/acquisition-limits';
import { BREEDING_RECIPES, canBreedParents, chooseBreedingOutcome, getBreedingGender } from './progression/breeding';
import {buildCollectionAncestry,type CollectionSpecies} from './progression/collection-ancestry';
import {buildSkinOptions,appearanceSpecies,sanitizeSkin} from './progression/skins';
import {createItemShopViews,isShopItemAvailable} from './progression/item-shop';
import {buildFacilityViews,createFacilityEncounter} from './progression/battle-facilities';
import {meetsWildCapturePrerequisite} from '../battle/core/src/capture';
import { FUSION_RECIPES, canFuseParents, chooseFusionOutcome, fusionBeadItemId } from './progression/fusion';
import { SEER_SCRIPTS } from '../battle/core/src/scripts/index.ts';
import { attackTypes } from '../battle/core/src/typechart.ts';
import { makeDex, createMonster, computeStats, expToNext, addMonster, deposit, withdraw, rename, healAll, findMon, putMon, equipSkills, addEvs, gainLevels, setIv, changeNature, levelEvolutions, evolutionOptions, requiresEvolutionChoice, evolve, applyBattleRewards, allocatePoolExp, useRaisingItem, activeBeads, tickBoosts, hatchEssence, type Monster, type Save, type Species, type Nature, type Skill, type RaisingItem } from '../raising/core/index.ts';
import { newSave, deserialize, serialize } from '../raising/game/save.ts';
import { BOX_MAX, PARTY_MAX } from '../raising/core/storage.ts';
import { loadCatalog, type CatalogData } from './mechanics/catalog';
import {WORLD_PLANETS} from './world';
import { traits, fifthSkills, soulMarks, engravings, type MonsterModules } from './mechanics/modules';
import { readLocalSave, writeLocalSave } from './mechanics/persistence';
import { battleEventText, displayedDamage, groupedBattleLog } from './presentation/battle-log';
import { createCatalogViews } from './presentation/catalog-views';
import type { CampaignView, GameController, GameSnapshot, GameAction, MonsterView, SkillView, BattleMonsterView, BattlePresentationFrame, QuestView } from './game-types';

export const loadGameData = loadCatalog;
interface GameExtras { coins: number; traits: Record<string,string>; quests: string[]; battlesWon: number; modules: Record<string,MonsterModules>; campaigns: Record<string,string[]>; shopUnlocked:string[]; recruitmentClaims:Record<string,number> }
type FullSave = Save & {game: GameExtras};
const typesZh: Record<string,string> = {grass:'草',water:'水',fire:'火',flying:'飞行',electric:'电',mechanical:'机械',ground:'地面',normal:'普通',ice:'冰',psychic:'超能',fighting:'战斗',light:'光',shadow:'暗影',mystic:'神秘',dragon:'龙',holy:'圣灵',dimension:'次元',evil:'邪灵'};
const statZh: Record<string,string> = {hp:'体力',atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度'};
const statusZh: Record<string,string> = {paralysis:'麻痹',poison:'中毒',burn:'烧伤',freeze:'冻伤',sleep:'睡眠',fear:'害怕',fatigue:'疲惫',petrify:'石化',confusion:'混乱',weaken:'衰弱',leech:'寄生',flammable:'易燃',frozen_solid:'冰封'};
const portrait = (species: number) => `/portraits/${species}.png`;
export interface BattlePresentationState { player: BattleMonsterView; enemy: BattleMonsterView; party: BattleMonsterView[]; enemyParty: BattleMonsterView[] }
const presentationEvents=new Set(['damage','heal','revive','faint','switch_in','transform','max_hp_changed','status_applied','condition_removed','stat_stage','stages_cleared','switch_out']);

/** Replay team changes using event data, never the already-resolved team HP. */
export function advanceBattlePresentation(state: BattlePresentationState, event: BattleEvent, species: RawData['species'] | ReadonlyMap<number,NonNullable<RawData['species']>[number]> = []): BattlePresentationState {
  if(!presentationEvents.has(event.type))return state;
  const side = event.side === 1 ? 1 : 0;
  const previousTeam = side === 1 ? state.enemyParty : state.party;
  const active = side === 1 ? state.enemy : state.player;
  const index = typeof event.slot === 'number'
    ? previousTeam.findIndex(mon => mon.slot === event.slot)
    : event.type !== 'transform' && event.name && event.name !== active.name ? previousTeam.findIndex(mon => mon.name === event.name) : previousTeam.findIndex(mon => mon.uid === active.uid);
  if(index<0)return state;
  // Each historical frame is immutable. Copy only the member and fields this event changes.
  const member={...previousTeam[index]},team=[...previousTeam];team[index]=member;
  const next={...state,...(side===1?{enemyParty:team}:{party:team})};
  const updateHp = () => {
    if (typeof event.hp === 'number') member.hp = event.hp;
    if (typeof event.maxHp === 'number') member.maxHp = event.maxHp;
  };
  switch (event.type) {
    case 'damage': case 'heal': updateHp(); break;
    case 'revive':
      updateHp(); member.fainted = false; member.statuses = [];
      if (event.reason === 'lives') member.stages = Object.fromEntries(Object.keys(member.stages).map(stat => [stat, 0]));
      break;
    case 'faint': member.hp = 0; member.fainted = true; break;
    case 'switch_in': case 'transform': {
      updateHp();
      const previousSpecies=member.species;
      if (event.species !== undefined) member.species = event.species;
      if(event.type==='transform'||member.species!==previousSpecies)member.appearanceSpecies=member.species;
      if (event.name) member.name = event.name;
      if (event.level !== undefined) member.level = event.level;
      member.portrait = portrait(member.appearanceSpecies??member.species);
      const definition = Array.isArray(species)?species.find(mon=>mon.id===member.species):species?.get(member.species);
      if (event.types) member.types = event.types.map((type:string) => typesZh[type] ?? type);
      else if (definition) member.types = definition.types.map(type => typesZh[type] ?? type);
      member.fainted = member.hp <= 0;
      if (side === 1) next.enemy = member; else next.player = member;
      break;
    }
    case 'max_hp_changed':
      updateHp(); member.hp = Math.min(member.hp, member.maxHp); break;
    case 'status_applied':
      member.statuses = [...new Set([...member.statuses, statusZh[event.status] ?? event.status])]; break;
    case 'condition_removed':
      member.statuses = member.statuses.filter(name => name !== (statusZh[event.condition] ?? event.condition)); break;
    case 'stat_stage': member.stages={...member.stages,[event.stat]:event.stage}; break;
    case 'stages_cleared':
      member.stages={...member.stages};
      for (const stat of Object.keys(member.stages)) {
        if (event.which === 'all' || event.which === 'up' && member.stages[stat] > 0 || event.which === 'down' && member.stages[stat] < 0) member.stages[stat] = 0;
      }
      break;
    case 'switch_out':
      member.stages = Object.fromEntries(Object.keys(member.stages).map(stat => [stat, 0])); member.statuses = []; break;
  }
  // Bench recovery must not replace the currently displayed combatant.
  if (member.uid === next.player.uid && side === 0) next.player = member;
  if (member.uid === next.enemy.uid && side === 1) next.enemy = member;
  return next;
}
const extras = ():GameExtras => ({coins:1000,traits:{},quests:[],battlesWon:0,modules:{},campaigns:{},shopUnlocked:[],recruitmentClaims:{}});
function itemDescription(item:Record<string,unknown>):string {
  const description=(item.desc as {zh?:string})?.zh;
  const beadPolicy='同一精灵同时只能使用一颗能量珠；每结束一场战斗减少一次，耗尽后失效，期间不能替换。';
  if(description)return description.replace(/当前精灵/g,'选中精灵')+((item.raising_effect as {op?:string}|undefined)?.op==='energy_bead'?` ${beadPolicy}`:'');
  if(item.kind==='essence')return '点击孵化，直接获得对应精灵。';
  const effect=(item.battle_effects as {op:string;amount?:number}[])?.[0];
  if(effect?.op==='heal')return `战斗中恢复选中精灵 ${effect.amount??'全部'} 点体力。`;
  if(effect?.op==='restore_pp')return `战斗中为每个技能补充 ${effect.amount??'全部'} 点 PP。`;
  const raising=item.raising_effect as {op:string;amount?:number;stats?:string[];what?:string;multiplier?:number;battles?:number}|undefined;
  switch(raising?.op) {
    case 'restore':return '恢复选中精灵的初始培养状态。';
    case 'levels':return `精灵等级 ${raising.amount!>0?'+':''}${raising.amount}。`;
    case 'iv_reroll':return '重新生成潜力数值。';
    case 'nature_reroll':return '重新生成精灵性格。';
    case 'nature_set':return '将精灵性格改为道具标注的性格。';
    case 'ev_reset':return `清除${raising.stats?.map(s=>statZh[s]).join('、')}学习力。`;
    case 'boost':return `${raising.what==='ev'?'学习力':'经验'}收益 ×${raising.multiplier}，持续 ${raising.battles} 场。`;
    case 'energy_bead':return `为选中的精灵附加战斗增益。${beadPolicy}`;
  }
  if(item.kind==='capsule')return item.capture_multiplier===null?'必定捕捉普通野生精灵。首领与招募挑战不可使用。':`捕捉普通野生精灵；体力越低、陷入异常状态时越容易成功。捕捉倍率 ×${item.capture_multiplier??1}。`;
  return '用于精灵培育。';
}

export function createGame(catalog: CatalogData, initialSave?: string): GameController {
  // Runtime rewards belong to this controller. Static definitions are shared read-only.
  catalog = {...catalog, items:[...catalog.items], bosses:structuredClone(catalog.bosses)};
  // A simple remake supply fills the recovered catalogue's missing cure-item category.
  const cureId='item_status_cure';
  if(!catalog.items.some(item=>item.id===cureId))catalog.items.push({id:cureId,name:{zh:'异常解除剂'},kind:'battle',desc:{zh:'解除选中精灵的全部异常状态，不清除能力变化。'},battle_effects:[{op:'cure_status',target:'self'}],source:'Authored remake supply; the recovered item catalogue contains no status-cure consumables.'});
  const dex = makeDex(catalog as unknown as {species:Species[];skills:Skill[];natures:Nature[]});
  const data = buildDataSet(catalog as unknown as RawData);
  const collectionAncestry=buildCollectionAncestry(catalog.species as unknown as CollectionSpecies[]);
  const skinOptions=buildSkinOptions(catalog.species as unknown as Species[]);
  const bosses = catalog.bosses as unknown as BossEncounter[];
  const trainers = structuredClone(catalog.trainers ?? []) as unknown as BossEncounter[];
  const encounters = [...bosses, ...trainers];
  const facilityViews=buildFacilityViews(catalog);
  const availableTraits=traits.filter(t=>t.implemented);
  const campaignForBoss=(id:string)=>CHALLENGE_CAMPAIGNS.find(c=>c.stages.some(stage=>stage.bossIds.includes(id)));
  for(const boss of bosses) {
    const species=resolveEncounterEssenceSpecies(boss);
    const reward=(boss as any).reward??{};
    const items=reward.items??{};
    const campaign=campaignForBoss(boss.id);
    const intermediate=campaign&&!campaign.stages.at(-1)!.bossIds.includes(boss.id);
    if(!intermediate&&!reward.learn_skill&&boss.id!=='boss_tower_brave_mystery'&&!Object.keys(items).some(id=>id.startsWith('essence_')))items[`essence_${boss.id}`]=1;
    (boss as any).reward={...reward,items};
    for(const id of Object.keys(items)) if(id.startsWith('essence_')&&!catalog.items.some(i=>i.id===id))catalog.items.push({id,name:{zh:`${dex.species(species).name.zh}精元`},kind:'essence',hatches:species});
  }
  const registeredItems=new Set(catalog.items.map(item=>String(item.id)));
  for(const sp of catalog.species) if(!(sp.obtain as string[])?.includes('wild')) {
    const id=`essence_recruit_${sp.id}`;
    if(!registeredItems.has(id)){catalog.items.push({id,name:{zh:`${(sp.name as any).zh}精元`},kind:'essence',hatches:Number(sp.id)});registeredItems.add(id);}
  }
  for(const recipe of FUSION_RECIPES) for(const outcome of recipe.outcomes) {
    const id=fusionBeadItemId(outcome.species),name=dex.species(outcome.species).name.zh;
    if(!catalog.items.some(item=>item.id===id))catalog.items.push({id,name:{zh:`${outcome.beadName} · ${name}`},kind:'essence',hatches:outcome.species,desc:{zh:`孵化获得 Lv.1 ${name}，背包已满时进入仓库。融合时已确定结果，孵化不会再次随机。`}});
  }
  const recruitments=buildRecruitmentRewards(catalog as unknown as RecruitmentCatalog);
  for(const reward of recruitments)if(!catalog.items.some(item=>item.id===reward.itemId))catalog.items.push({id:reward.itemId,name:{zh:`${reward.name}精元`},kind:'essence',hatches:reward.rewardSpecies,desc:{zh:'完成收集与首领条件后领取；孵化获得初始形态，所有精元与现有同种精灵合计最多六份。'}});
  const essenceDefinitions=catalog.items.map(item=>({id:String(item.id),kind:String(item.kind),hatches:typeof item.hatches==='number'?item.hatches:undefined}));
  const ordinarySPTs=new Set(getEligibleRecruitmentSPTs(catalog as unknown as RecruitmentCatalog).map(boss=>boss.id));
  const catalogViews=createCatalogViews(
    catalog.species.map(s=>({id:Number(s.id),name:(s.name as {zh:string}).zh,types:(s.types as string[]).map(t=>typesZh[t]??t),baseStats:{...dex.species(Number(s.id)).base},portrait:portrait(Number(s.id)),wildCapture:(s.obtain as string[]|undefined)?.includes('wild')&&!bosses.some(boss=>!boss.id.includes('tower')&&!boss.id.includes('dark_door')&&boss.team.some(mon=>mon.species===Number(s.id)))})),
    encounters.map(b=>({id:b.id,category:b.category==='trainer'?'训练师对战':b.name!.zh.includes('暗黑')?'暗黑武斗场':b.category==='tower'?'勇者之塔':b.category==='legendary'?'传说挑战':['story','event'].includes(String(b.category))?'任务挑战':'SPT首领',name:b.name?.zh??b.id,location:(b as any).location?.zh,description:String((b as any).strategy_notes?.zh??(b as any).strategy_notes??'').replace(/\[object Object\]/g,''),level:b.team[0].level,species:b.team[0].species,portrait:portrait(b.team[0].species),...(b.category==='trainer'?{opponents:b.team.map(mon=>({species:mon.species,name:dex.species(mon.species).name.zh,level:mon.level}))}:{})})),
  );
  const natureViews=catalog.natures.map(n=>({id:String(n.id),name:(n.name as {zh:string}).zh}));
  const traitViews=availableTraits.map(t=>({id:t.id,name:t.name,description:t.description}));
  const moduleCounts={fifthSkills:fifthSkills.length,soulMarks:soulMarks.length,engravings:engravings.length};
  const shopViews=createItemShopViews(catalog.items.map(item=>({id:String(item.id),name:(item.name as {zh?:string})?.zh??String(item.id),kind:String(item.kind),description:itemDescription(item),price:0 as const,...(typeof item.hatches==='number'?{hatches:item.hatches}:{})})));
  let save!: FullSave;
  let rng: Rng;
  let battle: Battle | null = null;
  let battleAppearances=new Map<number,{species:number;appearanceSpecies:number}>();
  const transformedSlots=new Set<string>();
  let battleName = '';
  let currentBoss: BossEncounter | null = null;
  let currentCampaign: {id:string;stageId:string} | null = null;
  let battleResultMessage = '';
  let encounterMonster: Monster | null = null;
  let battleSettled = false;
  let logs: string[] = [];
  let animationRevision = 0;
  let frameId = 0;
  let animationFrames: BattlePresentationFrame[] = [];
  let notices: string[] = [];
  let ownedLedger:number[]|undefined,seenLedger:number[]|undefined;
  let ownedLedgerLength=-1,seenLedgerLength=-1;
  let ownedSet=new Set<number>(),seenSet=new Set<number>();
  const listeners = new Set<()=>void>();
  let cached: GameSnapshot;
  const full = (base: Save):FullSave => {const result=Object.assign(base,{game:(base as FullSave).game ?? extras()});result.game.campaigns??={};result.game.shopUnlocked??=[];result.game.recruitmentClaims??={};return result;};
  function fresh() {
    save = full(newSave(Date.now() >>> 0)); rng = new Rng(save.seed);
    for (const id of [1,4,7]) {const mon=createMonster(dex,id,5,rng,{how:'gift',at:new Date().toISOString()});save=full(addMonster(save,mon));save.game.traits[mon.uid]=availableTraits[rng.int(0,availableTraits.length-1)].id;}
    for (const item of catalog.items) if (item.kind === 'battle' || item.kind === 'capsule' || item.kind === 'raising') save.items[String(item.id)] = 5;
    save.rng_state = [...rng.s];
  }
  function parse(text:string) { save=full(deserialize(text,dex)); for(const mon of save.storage)sanitizeSkin(mon,skinOptions); if(!(cureId in save.items))save.items[cureId]=5; rng=new Rng(save.rng_state ?? save.seed); }
  const previous = initialSave ?? readLocalSave();
  if (previous) { try {parse(previous);} catch {fresh();notices=['旧存档无法读取，已创建新存档。'];} } else fresh();
  // Grant the newly introduced supply once without replacing an existing player's stock.
  if(!(cureId in save.items))save.items[cureId]=5;
  function persist() {
    if(ownedLedger!==save.dex.owned||ownedLedgerLength!==save.dex.owned.length){ownedLedger=save.dex.owned;ownedSet=new Set(ownedLedger);}
    if(seenLedger!==save.dex.seen||seenLedgerLength!==save.dex.seen.length){seenLedger=save.dex.seen;seenSet=new Set(seenLedger);}
    for(const id of new Set([...ownedSet,...save.storage.map(mon=>mon.species)]))for(const species of [id,...(collectionAncestry.get(id)??[])]){
      if(!ownedSet.has(species)){save.dex.owned.push(species);ownedSet.add(species);}
      if(!seenSet.has(species)){save.dex.seen.push(species);seenSet.add(species);}
    }
    const unlocked=new Set(save.game.shopUnlocked);
    for(const[id,count]of Object.entries(save.items))if(count>0&&!unlocked.has(id)){save.game.shopUnlocked.push(id);unlocked.add(id)}
    // Legacy first-clear rewards are known even when their inventory has already been consumed.
    for(const boss of bosses)if(save.progress.bosses_cleared.includes(boss.id))for(const id of Object.keys((boss.reward as {items?:Record<string,number>}|undefined)?.items??{}))if(!unlocked.has(id)){save.game.shopUnlocked.push(id);unlocked.add(id)}
    // Preserve old direct-creature rewards and recover their repeat claim entitlement.
    for(const reward of recruitments)if(save.game.quests.includes(reward.questId)){
      save.game.recruitmentClaims[reward.questId]=Math.max(1,save.game.recruitmentClaims[reward.questId]??0);
      if(!unlocked.has(reward.itemId)){save.game.shopUnlocked.push(reward.itemId);unlocked.add(reward.itemId);}
    }
    ownedLedgerLength=save.dex.owned.length;seenLedgerLength=save.dex.seen.length;
    save.rng_state=[...rng.s];writeLocalSave(serialize(save));
  }
  function skillView(id:number,pp?:Record<string,number>):SkillView {
    const skill=data.skills.get(id)!;
    if (!skill) return {id,name:'挣扎',type:'无',category:'物理',power:50,pp:0,maxPp:0,description:'技能耗尽时使用。'};
    return {id,name:skill.name.zh,type:attackTypes(data.types,skill.type).map(type=>typesZh[type]??type).join('·'),category:skill.category==='physical'?'物理':skill.category==='special'?'特殊':'属性',power:skill.power,pp:pp?.[id] ?? skill.pp,maxPp:skill.pp,description:String((skill as any).desc?.zh ?? '')};
  }
  function monsterView(mon:Monster):MonsterView {
    const sp=dex.species(mon.species); const trait=traits.find(t=>t.id===save.game.traits[mon.uid]);
    const appearance=appearanceSpecies(mon,skinOptions);
    const evolutions=evolutionOptions(mon,dex);
    const evolutionChoices=sp.evolution.filter(edge=>edge.method==='level'&&edge.level!==undefined).map(edge=>{
      const level=edge.level!;
      const blockedReason=mon.level<level?`达到 Lv.${level} 后可进化。`:capacityReason(edge.to,mon.uid);
      return {species:edge.to,name:dex.species(edge.to).name.zh,level,ready:!blockedReason,blockedReason};
    });
    return {uid:mon.uid,species:sp.id,appearanceSpecies:appearance,skinOptions:(skinOptions.get(sp.id)??[sp.id]).map(species=>({species,name:dex.species(species).name.zh})),name:mon.nickname||sp.name.zh,speciesName:sp.name.zh,level:mon.level,exp:mon.exp,expToNext:expToNext(sp.growth,mon.level),iv:mon.iv,nature:dex.nature(mon.nature).name.zh,natureId:mon.nature,types:sp.types.map(t=>typesZh[t]??t),baseStats:{...sp.base},stats:computeStats(mon,dex),evs:mon.evs,hp:mon.hp,skills:mon.skills.map(id=>skillView(id,mon.pp)),learned:mon.learned.map(id=>skillView(id,mon.pp)),trait:trait?.name??'无',traitId:trait?.id??null,inParty:save.party.includes(mon.uid),portrait:portrait(appearance),evolution:evolutions.length?evolutions.map(id=>dex.species(id).name.zh).join(' / '):null,evolutionChoices,gender:getBreedingGender(sp.id),generation:mon.generation??0};
  }
  function battleMon(mon:Mon):BattleMonsterView {
    const original=mon.side===0?battleAppearances.get(mon.slot):undefined;
    const appearance=original?.species===mon.species.id&&!transformedSlots.has(`${mon.side}:${mon.slot}`)?original.appearanceSpecies:mon.species.id;
    return {uid:mon.uid??`foe-${mon.slot}`,slot:mon.slot,species:mon.species.id,appearanceSpecies:appearance,name:mon.name,level:mon.level,hp:mon.hp,maxHp:mon.maxHp,fainted:mon.fainted,types:mon.types.map(t=>typesZh[t]??t),portrait:portrait(appearance),skills:mon.skills.map(id=>skillView(id,mon.pp)),statuses:mon.conditions.filter(c=>c.def.kind==='status').map(c=>statusZh[c.id]??c.def.name?.zh??c.id),stages:{...mon.stages}};}
  const questData = [
    {id:'first-victory',name:'初次胜利',description:'赢得一次野外遭遇或首领挑战，领取皮皮。',species:10,ready:()=>save.game.battlesWon>=1,progress:()=>`${Math.min(1,save.game.battlesWon)}/1`},
    {id:'three-victories',name:'成长之路',description:'赢得三场战斗，领取比比鼠。',species:13,ready:()=>save.game.battlesWon>=3,progress:()=>`${Math.min(3,save.game.battlesWon)}/3`},
    {id:'first-spt',name:'SPT 挑战者',description:'完成任意一个 SPT 挑战，领取巴鲁斯。',species:6,ready:()=>save.progress.bosses_cleared.some(id=>ordinarySPTs.has(id)),progress:()=>`${Number(save.progress.bosses_cleared.some(id=>ordinarySPTs.has(id)))}/1`},
  ];
  function allowance(species:number,excludeUid?:string){return acquisitionAllowance(save,essenceDefinitions,species,excludeUid);}
  function capacityReason(species:number,excludeUid?:string):string|undefined {
    const stock=allowance(species,excludeUid);
    return stock.remaining<1?acquisitionLimitReason(dex.species(species).name.zh,stock):undefined;
  }
  function recruitmentView(reward:RecruitmentReward):QuestView {
    const progress=recruitmentProgress(reward,save.dex.owned,save.progress.bosses_cleared),claimCount=save.game.recruitmentClaims[reward.questId]??0;
    const claimed=!reward.repeatable&&claimCount>0,blockedReason=claimed?'此奖励已领取。':capacityReason(reward.rewardSpecies);
    return {id:reward.questId,name:`${reward.name} · 精灵招募`,description:`完成以下收集与挑战条件，领取${reward.name}精元。已收集记录永久有效，前置精灵不会被消耗。`,rewardSpecies:reward.rewardSpecies,rewardItemId:reward.itemId,group:'spt-recruitment',complete:progress.complete,claimed,progress:`${progress.completed}/${progress.total}`,repeatable:reward.repeatable,claimCount,claimable:progress.complete&&!claimed&&!blockedReason,blockedReason,allowance:allowance(reward.rewardSpecies),requiredBossIds:reward.prerequisites.filter(p=>p.kind==='boss').map(p=>p.bossId),prerequisites:reward.prerequisites.map((condition,index)=>condition.kind==='species'?{kind:'species',species:condition.species,name:dex.species(condition.species).name.zh,complete:progress.conditions[index]}:{kind:'boss',bossId:condition.bossId,name:bosses.find(b=>b.id===condition.bossId)?.name?.zh??condition.bossId,complete:progress.conditions[index]})};
  }
  function questViews():QuestView[]{return [...questData.map(q=>{const claimed=save.game.quests.includes(q.id),blockedReason=capacityReason(q.species);return {id:q.id,name:q.name,description:q.description,rewardSpecies:q.species,complete:q.ready(),claimed,claimable:q.ready()&&!claimed&&!blockedReason,blockedReason,progress:q.progress(),group:'journey' as const}}),...recruitments.map(recruitmentView)];}
  function itemShopViews(inventory:Record<string,number>){return shopViews(inventory,save.game.shopUnlocked).map(item=>{
    if(item.kind!=='essence'||item.hatches===undefined)return {...item,maxQuantity:999};
    const stock=allowance(item.hatches),blockedReason=!isSpeciesRepeatable(item.hatches)?'此精灵的来源只允许领取一次。':capacityReason(item.hatches);
    return {...item,allowance:stock,maxQuantity:blockedReason?0:stock.remaining,blockedReason};
  });}
  function campaignProgress(campaign:Campaign):string[] {
    if(!save.game.campaigns[campaign.id]) {
      const cleared:string[]=[];
      for(const stage of campaign.stages) {if(!stage.bossIds.every(id=>save.progress.bosses_cleared.includes(id)))break;cleared.push(stage.id);}
      save.game.campaigns[campaign.id]=cleared;
    }
    return save.game.campaigns[campaign.id];
  }
  function stageRequirement(stage:CampaignStage):string|undefined {
    if(stage.requiredSpecies) {
      const candidates=save.party.map(uid=>findMon(save,uid)).filter(mon=>mon.species===stage.requiredSpecies);
      const name=dex.species(stage.requiredSpecies).name.zh;
      if(!candidates.length)return `请将自己的${name}放入精灵背包。`;
      if(!candidates.some(mon=>mon.level>=(stage.minLevel??1)))return `本关需要 Lv.${stage.minLevel} 的${name}。`;
      if(!candidates.some(mon=>mon.hp>0&&mon.level>=(stage.minLevel??1)))return `请先恢复${name}的体力。`;
    }
    return undefined;
  }
  function campaignViews():CampaignView[] {
    return CHALLENGE_CAMPAIGNS.map(campaign=>{
      const cleared=campaignProgress(campaign),completed=cleared.length;
      return {id:campaign.id,name:campaign.name,species:campaign.species,location:campaign.location,description:campaign.stages[0].description,completed,nextStageId:campaign.stages[completed]?.id??null,finished:completed===campaign.stages.length,resetOnLoss:!!campaign.resetOnLoss,stages:campaign.stages.map((stage,index)=>{
        const encounters=stage.bossIds.map(id=>bosses.find(boss=>boss.id===id)!);
        const blockedReason=index>completed?`请先完成「${campaign.stages[index-1].name}」。`:stageRequirement(stage);
        const reward=encounters[0]?.reward as {learn_skill?:{species:number;skill:number};items?:Record<string,number>}|undefined;
        const rewardText=reward?.learn_skill?`领悟技能：${data.skills.get(reward.learn_skill.skill)?.name.zh}`:index===campaign.stages.length-1&&campaign.id!=='rei-training'?`获得${dex.species(campaign.species).name.zh}精元`:'完成本阶段，开启下一项挑战';
        return {...stage,requiredSpeciesName:stage.requiredSpecies?dex.species(stage.requiredSpecies).name.zh:undefined,cleared:cleared.includes(stage.id),available:index<=completed&&!blockedReason,blockedReason,rewardText,opponents:encounters.flatMap(encounter=>encounter?.team.map(mon=>({species:mon.species,name:dex.species(mon.species).name.zh,level:mon.level}))??[])};
      })};
    });
  }
  function refresh() {
    const inventory=battle&&!battleSettled?battle.sides[0].items:save.items;
    const legalItems=battle?.legalActions(0).filter(action=>action.kind==='item');
    const captureBlockedReason=!battle?undefined:currentBoss?(currentBoss.category==='trainer'?'训练师的精灵不可捕捉。':'首领与招募挑战不可捕捉，胜利后通过精元或任务获取。'):!meetsWildCapturePrerequisite(battle.active(1).species.id,battle.active(0).species.id)?'捕捉尼奥需要派出尼尔、菲斯利、艾斯菲亚或其闪光形态。':save.party.length>=PARTY_MAX&&save.storage.length-save.party.length>=BOX_MAX?'仓库已满':capacityReason(battle.active(1).species.id);
    cached={monsters:save.storage.map(monsterView),party:[...save.party],campaigns:campaignViews(),facilities:facilityViews,bosses:catalogViews.bosses(save.progress.bosses_cleared,save.progress.boss_attempts),species:catalogViews.species(save.dex.owned),quests:questViews(),battle:battle?{name:battleName,turn:battle.turn,player:battleMon(battle.active(0)),enemy:battleMon(battle.active(1)),party:battle.sides[0].team.map(battleMon),enemyParty:battle.sides[1].team.map(battleMon),log:[...logs],finished:!!battle.result,won:!!battle.result?.success,resultReason:battle.result?.reason,result:battle.result?(battle.result.reason==='capture'?`捕捉成功！${battle.active(1).name}已加入${save.party.includes(encounterMonster?.uid??'')?'背包':'仓库'}。`:battleResultMessage?battleResultMessage:battle.result.success?'挑战成功，奖励已入账。':battle.result.reason==='flee'?'已离开战斗。':battle.result.reason==='turn_cap'?'已达到 200 回合上限，本场平局。可恢复后再次挑战。':'挑战失败，可恢复后再试。'):'',canCapture:!captureBlockedReason,captureBlockedReason,captured:battle.result?.reason==='capture',needsSwitch:battle.sides[0].needsReplacement,animation:{revision:animationRevision,frames:animationFrames}}:null,expPool:save.exp_pool,coins:save.game.coins,notices:[...notices],natures:natureViews,traits:traitViews,items:catalog.items.filter(i=>(inventory[String(i.id)]??0)>0).map(i=>({id:String(i.id),name:(i.name as any)?.zh??String(i.id),kind:String(i.kind),count:inventory[String(i.id)],description:itemDescription(i),battleUsable:i.kind==='capsule'||Array.isArray(i.battle_effects)&&i.battle_effects.length>0,battleCategory:i.kind==='capsule'?'capsule':(i.battle_effects as {op:string}[]|undefined)?.some(fx=>fx.op==='cure_status')?'status':Array.isArray(i.battle_effects)&&i.battle_effects.length>0?'recovery':undefined,usableTargetUids:legalItems?.filter(action=>action.item===String(i.id)).map(action=>battle!.sides[0].team[action.target??battle!.sides[0].active].uid!).filter(Boolean),targetMode:(i.battle_effects as {op:string}[]|undefined)?.some(fx=>fx.op==='revive')?'fainted':'living'})),shopItems:itemShopViews(inventory),modules:moduleCounts};
  }
  function emit() {persist();refresh();listeners.forEach(l=>l());}
  function notice(text:string) {notices=[text,...notices].slice(0,5);}
  function replace(mon:Monster) {sanitizeSkin(mon,skinOptions);putMon(save,mon);}
  function ensureAcquisitionCapacity() {
    // Reject before generating a monster, so a full box does not consume reward RNG.
    if(save.party.length>=PARTY_MAX&&save.storage.length-save.party.length>=BOX_MAX)throw new Error('仓库已满');
  }
  function ensureSpeciesCapacity(species:number,excludeUid?:string){const reason=capacityReason(species,excludeUid);if(reason)throw new Error(reason);}
  function boundedAutoEvolve(mon:Monster):Monster {
    let current=mon;
    for(const visited=new Set<number>();!visited.has(current.species);){
      visited.add(current.species);if(requiresEvolutionChoice(current,dex))break;
      const options=levelEvolutions(current,dex);if(options.length!==1)break;
      const reason=capacityReason(options[0],mon.uid);if(reason){notice(`${reason}本次保留当前形态与已获得的经验，腾出额度后可手动进化。`);break;}
      current=evolve(current,options[0],dex).mon;
    }
    return current;
  }
  function acquire(species:number,level=1,how='quest',generation?:number) {
    ensureAcquisitionCapacity();ensureSpeciesCapacity(species);
    const mon=createMonster(dex,species,level,rng,{how,at:new Date().toISOString()});save=full(addMonster(save,mon));save.game.traits[mon.uid]=availableTraits[rng.int(0,availableTraits.length-1)].id;notice(`获得精灵：${dex.species(species).name.zh}！`);
    if(generation!==undefined)findMon(save,mon.uid).generation=generation;
    return mon;
  }
  function eventText(e:BattleEvent, shown?:[BattleMonsterView,BattleMonsterView]):string {
    return battleEventText(e,{data,initialPlayer:shown?.[0]??battleMon(battle!.active(0)),initialEnemy:shown?.[1]??battleMon(battle!.active(1))});
  }
  function eventsText(events:BattleEvent[], before?:[BattleMonsterView,BattleMonsterView]) {
    const initial=before??[battleMon(battle!.active(0)),battleMon(battle!.active(1))];
    logs.push(...groupedBattleLog(events,{data,initialPlayer:initial[0],initialEnemy:initial[1]}));
    logs=logs.slice(-160);
  }
  // Presentation follows the engine's event order; it does not resolve combat a second time.
  function recordAnimation(events:BattleEvent[], before:BattlePresentationState) {
    let shown=before;
    animationFrames=[];
    animationRevision++;
    for(const e of events) {
      const side:0|1=e.type==='capture_attempt'||e.side===1?1:0;
      let kind:BattlePresentationFrame['kind']='message';
      const activeBefore=side===1?shown.enemy:shown.player;
      if(e.type==='transform')transformedSlots.add(`${e.side===1?1:0}:${e.slot??(e.side===1?shown.enemy.slot:shown.player.slot)??0}`);
      shown=advanceBattlePresentation(shown,e,data.species);
      const text=eventText(e,[shown.player,shown.enemy]);
      let skillType:string|undefined;
      let skillId:number|undefined;
      let targetSide:0|1|undefined;
      if(e.type==='switch_in'||e.type==='transform') {
        kind='switch';
      } else if(e.type==='capture_attempt') {
        kind='capture';
      } else if(e.type==='move_used') {
        const skill=data.skills.get(e.skill)!;
        kind=skill.category==='physical'?'physical':skill.category==='special'?'special':'status';
        skillType=skill.type;
        skillId=Number(skill.id);
        targetSide=skill.target==='self'?side:side===0?1:0;
      } else if(e.type==='damage') {
        if(e.slot===undefined||e.slot===activeBefore.slot)kind='hit';
      } else if(e.type==='heal'||e.type==='revive') {
        if(e.slot===undefined||e.slot===activeBefore.slot)kind='heal';
      }
      if(!text&&kind==='message')continue;
      const {player,enemy,party,enemyParty}=shown;
      animationFrames.push({id:++frameId,side,kind,text,amount:e.type==='damage'?displayedDamage(e):e.amount,critical:!!e.crit,captureSuccess:e.type==='capture_attempt'?!!e.success:undefined,capsuleName:e.type==='capture_attempt'?data.items.get(e.item)?.name?.zh:undefined,skillType,skillId,targetSide,playerHp:player.hp,enemyHp:enemy.hp,player,enemy,party,enemyParty});
    }
    const player=battleMon(battle!.active(0)),enemy=battleMon(battle!.active(1));
    animationFrames.push({id:++frameId,side:0,kind:'message',text:battle!.result?(battle!.result.reason==='capture'?'捕捉成功！':battle!.result.success?'挑战胜利！':battle!.result.reason==='turn_cap'?'达到回合上限，本场平局。':'战斗结束。'):'请选择下一步行动。',playerHp:player.hp,enemyHp:enemy.hp,player,enemy,party:battle!.sides[0].team.map(battleMon),enemyParty:battle!.sides[1].team.map(battleMon)});
  }
  function settle() {
    if (!battle?.result || battleSettled) return; battleSettled=true;
    for(const entry of battle.exportTeam(0)) {const mon=findMon(save,entry.uid!);replace({...mon,hp:entry.hp,pp:entry.pp,status:null});}
    save.items={...battle.sides[0].items};
    rng.s=[...battle.rng.s];
    save=full(applyBattleRewards(save,battle.result.defeated,dex,{autoEvolve:false}).save);
    for(const uid of new Set(battle.result.defeated.flatMap(entry=>entry.participants)))replace(boundedAutoEvolve(findMon(save,uid)));
    if(battle.result.reason==='capture'&&battle.capturedMon&&encounterMonster) {
      const captured={...encounterMonster,hp:Math.min(battle.capturedMon.hp,computeStats(encounterMonster,dex).hp),pp:{...battle.capturedMon.pp},status:null,obtained:{how:'capture',at:new Date().toISOString()}};
      save=full(addMonster(save,captured));save.game.traits[captured.uid]=availableTraits[rng.int(0,availableTraits.length-1)].id;
      notice(`捕捉成功：${dex.species(captured.species).name.zh}已加入${save.party.includes(captured.uid)?'背包':'仓库'}！`);
    } else if(battle.result.success) {
      save.game.battlesWon++;save.game.coins+=currentBoss?500:100;save.exp_pool+=currentBoss?1000:250;
      if(currentBoss&&!currentBoss.facility) {
        const firstClear=!save.progress.bosses_cleared.includes(currentBoss.id);
        if(firstClear)save.progress.bosses_cleared.push(currentBoss.id);
        const reward=(currentBoss as any).reward;
        let essenceGranted=false,essenceBlocked=false;
        for(const [id,count] of Object.entries(reward?.items??{})) {
          const item=essenceDefinitions.find(item=>item.id===id);
          if(item?.kind==='essence'&&item.hatches!==undefined){
            if(!firstClear&&!isSpeciesRepeatable(item.hatches))continue;
            const granted=Math.min(Number(count),allowance(item.hatches).remaining);
            if(granted>0){save.items[id]=(save.items[id]??0)+granted;essenceGranted=true;}else essenceBlocked=true;
          }else save.items[id]=(save.items[id]??0)+Number(count);
        }
        if(reward?.learn_skill) {
          const learned=reward.learn_skill as {species:number;skill:number};
          const participant=battle.sides[0].team.find(mon=>mon.species.id===learned.species)!;
          const mon=findMon(save,participant.uid!);
          if(!mon.learned.includes(learned.skill))replace({...mon,learned:[...mon.learned,learned.skill]});
          battleResultMessage=`${dex.species(learned.species).name.zh}领悟了「${data.skills.get(learned.skill)!.name.zh}」，可在技能管理中装备。`;
        } else if(essenceGranted)battleResultMessage='首领精元已入库，到道具背包的精元页即可孵化。';
        else if(essenceBlocked)battleResultMessage='挑战已完成；同种精灵与待孵化精元已达六份。腾出额度后可再次挑战或到商城领取。';
      }
      if(currentCampaign) {
        const campaign=CHALLENGE_CAMPAIGNS.find(entry=>entry.id===currentCampaign!.id)!;
        const cleared=campaignProgress(campaign),index=campaign.stages.findIndex(stage=>stage.id===currentCampaign!.stageId);
        if(index===cleared.length)cleared.push(currentCampaign.stageId);
        battleResultMessage ||= cleared.length===campaign.stages.length?`${campaign.name}已全部完成。`:`本阶段完成，下一阶段已开启。`;
      }
      notice(battleResultMessage||`获得 ${currentBoss?500:100} 赛尔豆及 ${currentBoss?1000:250} 积累经验。`);
    } else if(currentCampaign) {
      const campaign=CHALLENGE_CAMPAIGNS.find(entry=>entry.id===currentCampaign!.id)!;
      if(campaign.resetOnLoss)save.game.campaigns[campaign.id]=[];
      if(battle.result.winner===0)battleResultMessage='对手已倒下，但本关的特训条件尚未满足，请按场景中的要求重试。';
    }
    save=full(tickBoosts(save));
  }
  function start(boss:BossEncounter|null,species=10,level?:number,campaignContext?:{id:string;stageId:string}) {
    if(battle&&!battle.result) throw new Error('请先完成当前战斗。');
    if(boss)boss=normalizeNpcTrainingEncounter(catalog,normalizeBossSkillPolicy(catalog,boss));
    const stage=campaignContext?CHALLENGE_CAMPAIGNS.find(entry=>entry.id===campaignContext.id)!.stages.find(entry=>entry.id===campaignContext.stageId):undefined;
    let roster=save.party.map(uid=>findMon(save,uid));
    if(stage?.requiredSpecies)roster=roster.filter(mon=>mon.species===stage.requiredSpecies&&mon.level>=(stage.minLevel??1)&&mon.hp>0).slice(0,1);
    const player={kind:'player' as const,name:'赛尔',team:roster.map(m=>({...m,stats:computeStats(m,dex),beads:activeBeads(save,m.uid)})),items:save.items};
    if(!player.team.some(m=>m.hp>0)) throw new Error('精灵体力耗尽，请使用恢复舱。');
    if(boss) {const errors=validateEncounter(boss,player);if(errors.length)throw new Error(errors.join('；'));}
    const wild=boss?null:createMonster(dex,species,level??Math.max(3,Math.round(player.team[0].level*0.85)),rng);
    encounterMonster=wild;
    battleAppearances=new Map(roster.map((mon,slot)=>[slot,{species:mon.species,appearanceSpecies:appearanceSpecies(mon,skinOptions)}]));
    transformedSlots.clear();
    battle=createBattle({data,scripts:{...SEER_SCRIPTS,...traitScripts,...campaignScripts,...npcTrainingScripts},seed:rng.nextU32(),sides:wild?[player,{kind:'wild',team:[wild]}]:[player],encounter:boss??undefined});
    for(const event of battle.initialEvents)if(event.type==='transform')transformedSlots.add(`${event.side===1?1:0}:${event.slot??battle.sides[event.side===1?1:0].active}`);
    for(const mon of battle.sides[0].team) {
      const trait=traits.find(t=>t.id===save.game.traits[mon.uid!]);
      if(trait) mon.conditions.push({id:`trait-${trait.id}`,def:{id:`trait-${trait.id}`,name:{zh:trait.name},kind:'buff',removed_on_switch:false,hooks:trait.hooks as Hook[]},turns:Infinity,appliedTurn:0});
    }
    currentBoss=boss;currentCampaign=campaignContext??null;battleResultMessage='';battleName=boss?.name?.zh??`野外遭遇 · ${dex.species(species).name.zh}`;battleSettled=false;animationRevision++;animationFrames=[];logs=[`挑战${battleName}。`];eventsText(battle.initialEvents);
    if(boss&&!boss.facility)save.progress.boss_attempts[boss.id]=(save.progress.boss_attempts[boss.id]??0)+1;
  }
  function turn(action:Action) {if(!battle)throw new Error('尚未开始战斗。');const before:BattlePresentationState={player:battleMon(battle.active(0)),enemy:battleMon(battle.active(1)),party:battle.sides[0].team.map(battleMon),enemyParty:battle.sides[1].team.map(battleMon)};battle.submit(0,action);const events=battle.resolveTurn();eventsText(events,[before.player,before.enemy]);recordAnimation(events,before);save.items={...battle.sides[0].items};settle();}
  function dispatch(action:GameAction) {
    try {
      const outside=!['move','switch','battleItem','capture','flee','closeBattle','dismissNotice'].includes(action.type);
      if(outside&&battle&&!battle.result)throw new Error('战斗结束后才能进行培养或编辑。');
      switch(action.type) {
      case 'startBattle': {const boss=encounters.find(b=>b.id===action.bossId);if(!boss)throw new Error('挑战不存在。');const campaign=campaignForBoss(boss.id);if(campaign)throw new Error(`请从「${campaign.name}」的阶段场景开始挑战。`);start(boss);break;}
      case 'startFacility': {
        if(!save.party.some(uid=>findMon(save,uid).hp>0))throw new Error('精灵体力耗尽，请使用恢复舱。');
        // Prepare with a draft RNG so invalid input never advances the saved stream.
        const previousRng=rng,draft=new Rng(rng.s);
        const encounter=createFacilityEncounter(catalog,action.facilityId,draft,action.teamId);
        try {rng=draft;start(encounter);} catch(error) {rng=previousRng;throw error;}
        break;
      }
      case 'startCampaignStage': {
        const campaign=CHALLENGE_CAMPAIGNS.find(entry=>entry.id===action.campaignId);
        const index=campaign?.stages.findIndex(entry=>entry.id===action.stageId)??-1;
        if(!campaign||index<0)throw new Error('挑战阶段不存在。');
        if(index>campaignProgress(campaign).length)throw new Error('请先完成前一阶段挑战。');
        const stage=campaign.stages[index],reason=stageRequirement(stage);if(reason)throw new Error(reason);
        const boss=bosses.find(entry=>entry.id===stage.bossIds[0]);if(!boss)throw new Error('挑战不存在。');
        start(boss,10,undefined,{id:campaign.id,stageId:stage.id});break;
      }
      case 'resetCampaign':save.game.campaigns[action.campaignId]=[];notice('本次阶段进度已重置，可以从第一阶段重新挑战。');break;
      case 'startTraining': {
        const species=action.species??10;
        const location=action.planetId||action.regionId?WORLD_PLANETS.find(planet=>planet.id===action.planetId)?.regions.find(region=>region.id===action.regionId):undefined;
        if((action.planetId||action.regionId)&&(!location||!location.creatures.includes(species)))throw new Error('这个地点没有该精灵的遭遇入口。');
        const collectionEntry=location?location.recruitmentSpecies?.includes(species):WORLD_PLANETS.some(planet=>planet.regions.some(region=>region.recruitmentSpecies?.includes(species)));
        if(collectionEntry)throw new Error(`请通过「${dex.species(species).name.zh} · 精灵招募」完成收集与挑战条件，领取精元。`);
        if(NPC_ONLY_SPECIES.has(species))throw new Error('本作将这个剧情伙伴家族列为展示精灵，没有常规招募或捕捉路线。');
        const sp=dex.species(species);
        const encounters=bosses.filter(b=>b.team.some(m=>m.species===species)&&!b.id.includes('tower')&&!b.id.includes('dark_door'));
        if(encounters.length) {const encounter=encounters.find(b=>b.id.startsWith('boss_spt_'))??encounters[0];const campaign=campaignForBoss(encounter.id);if(campaign)throw new Error(`请从「${campaign.name}」的阶段场景开始挑战。`);start(encounter);}
        else if((sp as any).obtain?.includes('wild'))start(null,species,action.level);
        else {
          const wild=createMonster(dex,species,action.level??Math.max(5,findMon(save,save.party[0]).level),rng);
          const id=`recruit-${species}`;const essence=`essence_recruit_${species}`;
          if(!catalog.items.some(i=>i.id===essence))catalog.items.push({id:essence,name:{zh:`${sp.name.zh}精元`},kind:'essence',hatches:species});
          start({id,name:{zh:`野外挑战：${sp.name.zh}`},team:[wild],rules:[{rule:'no_capture'}],win:[{kind:'ko_all'}],reward:{items:{[essence]:1}}});
        }
        break;}
      case 'move':turn({kind:'move',skill:action.skillId});break;
      case 'switch': {if(!battle)throw new Error('尚未开始战斗。');const slot=battle.sides[0].team.findIndex(m=>m.uid===action.uid);turn({kind:'switch',slot});break;}
      case 'battleItem': {if(!battle)throw new Error('尚未开始战斗。');const target=action.targetUid?battle.sides[0].team.findIndex(m=>m.uid===action.targetUid):battle.sides[0].active;turn({kind:'item',item:action.itemId,target});break;}
      case 'capture': {if(!battle)throw new Error('尚未开始战斗。');if(currentBoss)throw new Error(currentBoss.category==='trainer'?'训练师的精灵不可捕捉。':'首领与招募挑战不可捕捉，请使用精元或任务获取。');ensureAcquisitionCapacity();ensureSpeciesCapacity(battle.active(1).species.id);turn({kind:'capture',item:action.itemId});break;}
      case 'flee':turn({kind:'flee'});break;
      case 'closeBattle':if(battle&&!battle.result)throw new Error('请先结束战斗。');battle=null;break;
      case 'heal':save=full(healAll(save,dex));notice('恢复舱已恢复全部精灵的体力与技能 PP。');break;
      case 'party':save=full(action.add?withdraw(save,action.uid):deposit(save,action.uid));break;
      case 'reorderParty': {
        if(action.uids.length!==save.party.length||new Set(action.uids).size!==save.party.length||action.uids.some(uid=>!save.party.includes(uid)))throw new Error('请选择当前出战背包中的精灵调整顺序。');
        save.party=[...action.uids];notice('出战顺序已调整。');break;
      }
      case 'setEvs': {
        const keys=['hp','atk','def','spa','spd','spe'] as const;
        if(keys.some(k=>!Number.isInteger(action.evs[k])||action.evs[k]<0||action.evs[k]>255))throw new Error('学习力每项须为 0–255 的整数。');
        const total=keys.reduce((sum,k)=>sum+action.evs[k],0);
        if(total>510)throw new Error(`学习力总和 ${total} 超过 510，请调整后再应用。`);
        const mon={...findMon(save,action.uid),evs:{...action.evs}};
        mon.hp=Math.min(mon.hp,computeStats(mon,dex).hp);replace(mon);notice('学习力已保存，能力值已更新。');break;
      }
      case 'rename':save=full(rename(save,action.uid,action.name||null));break;
      case 'equip':replace(equipSkills(findMon(save,action.uid),action.skills,dex));break;
      case 'train': {const amount=Math.max(1,Math.floor(action.amount));if(save.game.coins<amount*10)throw new Error('赛尔豆不足。');const old=findMon(save,action.uid);const next=addEvs(old,{[action.stat]:amount}).mon;const gain=next.evs[action.stat]-old.evs[action.stat];if(!gain)throw new Error('学习力已达到上限。');replace(next);save.game.coins-=gain*10;notice(`${statZh[action.stat]}学习力增加 ${gain}。`);break;}
      case 'allocateExp':save=full(allocatePoolExp(save,action.uid,action.amount,dex).save);replace(boundedAutoEvolve(findMon(save,action.uid)));break;
      case 'setSkin': {
        const mon=findMon(save,action.uid),target=action.species===null?mon.species:action.species;
        if(!Number.isInteger(target)||!skinOptions.get(mon.species)?.includes(target))throw new Error('只能选择当前形态或其进化前形态作为皮肤。');
        const next={...mon};if(target===mon.species)delete next.skinSpecies;else next.skinSpecies=target;
        replace(next);notice(`外观已设为${dex.species(target).name.zh}，能力与技能保持不变。`);break;
      }
      case 'evolve': {
        const mon=findMon(save,action.uid),options=evolutionOptions(mon,dex);
        if(action.toSpecies===undefined&&requiresEvolutionChoice(mon,dex))throw new Error('请选择要进化的分支。');
        const target=action.toSpecies??options[0];
        if(target===undefined||!options.includes(target))throw new Error('尚未满足所选形态的进化条件。');
        ensureSpeciesCapacity(target,mon.uid);replace(evolve(mon,target,dex).mon);
        notice(`${dex.species(mon.species).name.zh}已进化为${dex.species(target).name.zh}！`);break;
      }
      case 'fuse': {
        const recipe=FUSION_RECIPES.find(entry=>entry.id===action.recipeId);
        if(!recipe)throw new Error('融合配方不存在。');
        if(action.primaryUid===action.secondaryUid)throw new Error('请选择两只不同的精灵作为双亲。');
        const primary=findMon(save,action.primaryUid),secondary=findMon(save,action.secondaryUid);
        if(!canFuseParents(recipe,primary,secondary))throw new Error('双亲不符合这份融合配方，请检查精灵形态。');
        if(recipe.outcomes.filter(outcome=>outcome.weight>0).every(outcome=>allowance(outcome.species).remaining<1))throw new Error('本配方所有结果均已达到六份上限。');
        const outcome=chooseFusionOutcome(recipe,rng.next()),id=fusionBeadItemId(outcome.species);
        const reason=capacityReason(outcome.species);if(reason){notice(`本次融合结果为${dex.species(outcome.species).name.zh}，${reason}双亲保留，可腾出额度或再次尝试。`);break;}
        save.items[id]=(save.items[id]??0)+1;
        notice(`融合成功：获得${outcome.beadName}（${dex.species(outcome.species).name.zh}）。双亲已保留，可前往道具背包孵化。`);
        break;
      }
      case 'breed': {
        if(battle&&!battle.result)throw new Error('战斗中无法繁殖精灵。');
        const recipe=BREEDING_RECIPES.find(entry=>entry.id===action.recipeId);
        if(!recipe)throw new Error('繁殖配方不存在。');
        const first=findMon(save,action.firstUid),second=findMon(save,action.secondUid);
        if(!canBreedParents(recipe,first,second))throw new Error('双亲不符合配对条件：请选择两只指定成熟形态、至少50级的精灵，雄性必须为第一代。');
        // Validate capacity and every catalog outcome before consuming the selection RNG.
        ensureAcquisitionCapacity();for(const outcome of recipe.outcomes)dex.species(outcome.species);
        if(recipe.outcomes.filter(outcome=>outcome.weight>0).every(outcome=>allowance(outcome.species).remaining<1))throw new Error('本配方所有结果均已达到六份上限。');
        const outcome=chooseBreedingOutcome(recipe,rng.next());
        const reason=capacityReason(outcome.species);if(reason){notice(`本次繁殖结果为${dex.species(outcome.species).name.zh}，${reason}双亲保留，可腾出额度或再次尝试。`);break;}
        const infant=acquire(outcome.species,1,'breeding',1);
        notice(`繁殖孵化成功：${dex.species(outcome.species).name.zh} Lv.1 已加入${save.party.includes(infant.uid)?'背包':'仓库'}。双亲已保留。`);
        break;
      }
      case 'buyItem': {
        if(battle&&!battle.result)throw new Error('请先结束战斗，再前往商城。');
        const item=catalog.items.find(entry=>String(entry.id)===action.itemId);
        if(!item||!isShopItemAvailable({id:action.itemId,kind:String(item.kind)},new Set(save.game.shopUnlocked)))throw new Error('这件道具尚未进入商城。');
        if(!Number.isSafeInteger(action.quantity)||action.quantity<1||action.quantity>999)throw new Error('购买数量须为1至999的整数。');
        if(item.kind==='essence'&&typeof item.hatches==='number'){
          if(!isSpeciesRepeatable(item.hatches))throw new Error('此精灵的来源只允许领取一次。');
          const stock=allowance(item.hatches);if(action.quantity>stock.remaining)throw new Error(acquisitionLimitReason(dex.species(item.hatches).name.zh,stock));
        }
        const count=(save.items[action.itemId]??0)+action.quantity;
        if(!Number.isSafeInteger(count))throw new Error('道具库存已达到上限。');
        save.items[action.itemId]=count;notice(`免费购买：${(item.name as {zh:string}).zh} ×${action.quantity}，已加入道具背包。`);break;
      }
      case 'useItem': {
        const item=catalog.items.find(i=>i.id===action.itemId);
        if(!item)throw new Error('道具不存在。');
        if(item.kind==='essence') {
          if((save.items[action.itemId]??0)<1)throw new Error('没有可孵化的精元。');
          ensureAcquisitionCapacity();
          const species=Number(item.hatches),stock=allowance(species);
          if(stock.owned>=SPECIES_COPY_LIMIT)throw new Error(acquisitionLimitReason(dex.species(species).name.zh,stock));
          const hatched=hatchEssence(save,item as any,dex,rng,new Date().toISOString());
          save=full(hatched.save);save.game.traits[hatched.mon.uid]=availableTraits[rng.int(0,availableTraits.length-1)].id;
          notice(`${action.itemId.startsWith('fusion_bead_')?'元神珠':'精元'}孵化成功：${dex.species(hatched.mon.species).name.zh}！`);
        } else if(item.kind==='raising') {
          const bead=(item.raising_effect as {op?:string}|undefined)?.op==='energy_bead'?activeBeads(save,action.uid)[0]:undefined;
          if(bead) {
            const name=(catalog.items.find(entry=>entry.id===bead.item)?.name as {zh?:string}|undefined)?.zh??'能量珠';
            throw new Error(`${dex.species(findMon(save,action.uid).species).name.zh}已使用${name}，剩余 ${bead.battles_left} 场战斗；失效前不能替换，未消耗新道具。`);
          }
          save=full(useRaisingItem(save,action.uid,item as unknown as RaisingItem,dex,rng).save);
          const effect=(item as unknown as RaisingItem).raising_effect;
          if(effect.op==='exp'||effect.op==='levels'&&effect.amount>0)replace(boundedAutoEvolve(findMon(save,action.uid)));
        } else throw new Error('该道具请在战斗中使用。');
        break;
      }
      case 'claimQuest': {
        const reward=recruitments.find(q=>q.questId===action.questId);
        if(reward){
          const view=recruitmentView(reward);if(!view.claimable)throw new Error(view.blockedReason??'任务奖励尚不可领取。');
          save.items[reward.itemId]=(save.items[reward.itemId]??0)+1;
          save.game.recruitmentClaims[reward.questId]=(save.game.recruitmentClaims[reward.questId]??0)+1;
          if(!save.game.quests.includes(reward.questId))save.game.quests.push(reward.questId);
          notice(`已领取${reward.name}精元，可到道具背包孵化。`);
        }else{
          const q=questData.find(q=>q.id===action.questId);if(!q||!q.ready()||save.game.quests.includes(q.id))throw new Error('任务奖励尚不可领取。');
          acquire(q.species);save.game.quests.push(q.id);
        }
        break;
      }
      case 'cheatMonster': {let mon=findMon(save,action.uid);if(action.level!==undefined)mon=boundedAutoEvolve(gainLevels(mon,Math.max(1,Math.min(100,Math.floor(action.level)))-mon.level,dex).mon);if(action.iv!==undefined)mon=setIv(mon,Math.max(0,Math.min(31,Math.floor(action.iv))),dex).mon;if(action.nature)mon=changeNature(mon,action.nature,dex).mon;if(action.evs) {const next={...mon.evs,...action.evs};let left=510;for(const key of ['hp','atk','def','spa','spd','spe'] as const){next[key]=Math.min(left,Math.max(0,Math.min(255,Math.floor(next[key]))));left-=next[key];}mon={...mon,evs:next};}mon={...mon,hp:computeStats(mon,dex).hp};replace(mon);if(action.traitId!==undefined){if(action.traitId&&!traits.some(t=>t.id===action.traitId))throw new Error('特性不存在。');if(action.traitId)save.game.traits[mon.uid]=action.traitId;else delete save.game.traits[mon.uid];}notice('精灵数值已修改。');break;}
      case 'cheatAcquire':acquire(action.species,action.level??5,'editor');break;
      case 'cheatResources':if(action.coins!==undefined)save.game.coins=Math.max(0,Math.floor(action.coins));if(action.expPool!==undefined)save.exp_pool=Math.max(0,Math.floor(action.expPool));break;
      case 'dismissNotice':notices=[];break;
      }
    } catch(error) {const text=error instanceof Error?error.message:String(error);notice(text.startsWith('illegal action')?'当前指令不可用，请选择可用的技能、道具或精灵。':text==='battle has ended'?'本场战斗已结束，请返回场景。':text);}
    emit();
  }
  persist();refresh();
  return {snapshot:()=>cached,subscribe:(listener)=>{listeners.add(listener);return()=>listeners.delete(listener);},dispatch,exportSave:()=>serialize(save),importSave:(text)=>{parse(text);battle=null;notice('存档已导入。');emit();},reset:()=>{fresh();battle=null;notices=['新旅程已开始。'];emit();}};
}
