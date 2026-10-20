// The one source of Chinese display labels for rule keys. Pure data: imported by the
// controller, presentation builders and components, and never imports any of them.
import type { StatKey } from '../../raising/core/stats.ts';

export type StageKey = Exclude<StatKey, 'hp'> | 'acc' | 'eva';

export const STAT_LABELS: Record<StatKey, string> = {hp:'体力',atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度'};
export const STAGE_LABELS: Record<StageKey, string> = {atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度',acc:'命中',eva:'闪避'};

/** Status and common condition ids; `flinch` shares 害怕 with `fear`. */
export const STATUS_LABELS: Record<string, string> = {
  paralysis:'麻痹',poison:'中毒',burn:'烧伤',freeze:'冻伤',sleep:'睡眠',fear:'害怕',flinch:'害怕',fatigue:'疲惫',petrify:'石化',
  confusion:'混乱',weaken:'衰弱',leech:'寄生',flammable:'易燃',frozen_solid:'冰封',protect:'保护',
};

/** Element type ids, including the alternative ids found in source data, to their Chinese names. */
export const TYPE_LABELS: Record<string, string> = {
  grass:'草',water:'水',fire:'火',flying:'飞行',electric:'电',mechanical:'机械',steel:'机械',
  ground:'地面',normal:'普通',ice:'冰',psychic:'超能',fighting:'战斗',fight:'战斗',
  light:'光',shadow:'暗影',dark:'暗影',mystic:'神秘',myth:'神秘',dragon:'龙',holy:'圣灵',saint:'圣灵',
  dimension:'次元',ancient:'远古',nature:'自然',evil:'邪灵',demon:'邪灵',prop:'属性',
};

export const SKILL_CATEGORY_LABELS: Record<'physical' | 'special' | 'status', string> = {physical:'物理',special:'特殊',status:'属性'};
/** How an attack's type multiplier rates: ×0, below 1, exactly 1, above 1. */
export type MatchupRelation = 'immune' | 'weak' | 'neutral' | 'strong';
export const MATCHUP_LABELS: Record<MatchupRelation, string> = {immune:'无效',weak:'微弱',neutral:'均衡',strong:'克制'};
export const ENGRAVING_SLOT_LABELS = {ability:'能力刻印',skill:'技能刻印'} as const;
