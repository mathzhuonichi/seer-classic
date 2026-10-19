import type { ChallengeCategoryId } from '../../shared/views.ts';

/** The label of each challenge archive category: the archive tab and the encounter's category text. */
export const CHALLENGE_CATEGORY: Readonly<Record<ChallengeCategoryId, string>> = {
  spt: 'SPT首领', legendary: '传说挑战', tower: '勇者之塔', dark: '暗黑武斗场', quest: '任务挑战', trainer: '训练师对战',
};

/** Campaign order is distinct from the encounter's uninterrupted enemy team. */
export interface CampaignStage {
  id: string;
  name: string;
  bossIds: string[];
  description: string;
  kind: 'battle' | 'chain';
  requiredSpecies?: number;
  minLevel?: number;
  carry?: boolean;
}
/** A campaign contact's dialogue: the kicker above the name and the button that opens the stages. */
export interface CampaignContactWording { kicker: string; action: string }
export interface Campaign {
  id: string;
  name: string;
  species: number;
  location: string;
  /** `essence`: the last stage grants the campaign species' essence. `skills`: each stage teaches one skill instead. */
  reward: 'essence' | 'skills';
  stages: CampaignStage[];
  /** The wording of the world contact that a hosting region shows; `campaignContactWording` supplies neutral wording when omitted. */
  contact?: CampaignContactWording;
  continuity: 'continuous' | 'checkpoint';
  /** Omitted when historical campaign-wide failure persistence is unverified. */
  resetOnLoss?: boolean;
  sources: string[];
  limitations?: string[];
}

const stage = (id: string, name: string, bossId: string, description: string, extra: Partial<CampaignStage> = {}): CampaignStage =>
  ({ id, name, bossIds: [bossId], description, kind: 'battle', ...extra });
/** A chain is one uninterrupted battle against several opponents, carrying HP, PP and status between them. */
const chain = (id: string, name: string, bossId: string, description: string): CampaignStage =>
  stage(id, name, bossId, description, { kind: 'chain', carry: true });
const REI = 70;
const reiTraining = (id: string, name: string, bossId: string, description: string, minLevel?: number): CampaignStage =>
  stage(id, name, bossId, description, { requiredSpecies: REI, ...(minLevel ? { minLevel } : {}) });

export const CHALLENGE_CAMPAIGNS: Campaign[] = [
  {
    id: 'xuanwu', name: '玄武试炼', species: 501, location: '菲尼克斯禁地 · 玄武空间', reward: 'essence', continuity: 'checkpoint',
    sources: ['https://news.7k7k.com/content/20100807/12290.html'],
    limitations: ['Campaign-wide reset after a failed body attempt is not established by the recovered period sources.'],
    stages: [
      chain('guardians', '六大守护兽', 'boss_campaign_xuanwu_guardians', '依次击败蘑菇怪、钢牙鲨、里奥斯、提亚斯、纳多雷、雷纳多。守护兽在同一场战斗中连续出战。'),
      stage('body', '玄武真身 · 巴斯特', 'boss_campaign_xuanwu_body', '通过六大守护兽后，准备阵容挑战玄武真身。'),
    ],
  },
  {
    id: 'qinglong', name: '青龙试炼', species: 502, location: '菲尼克斯禁地 · 青龙空间', reward: 'essence', continuity: 'checkpoint',
    sources: ['https://news.7k7k.com/content/20110120/60932.html'],
    limitations: ['Campaign-wide reset after a failed body attempt is not established by the recovered period sources.'],
    stages: [
      chain('guardians', '四大守护兽', 'boss_campaign_qinglong_guardians', '依次挑战奈尼芬多、塔西亚、塔克林、厄尔塞拉。守护兽在同一场战斗中连续出战。'),
      stage('body', '青龙真身 · 朵拉格', 'boss_campaign_qinglong_body', '通过守护兽后，面对青龙朵拉格的挑战。'),
    ],
  },
  {
    id: 'baihu', name: '白虎试炼', species: 503, location: '菲尼克斯禁地 · 白虎空间', reward: 'essence', continuity: 'checkpoint',
    sources: ['https://news.7k7k.com/content/20110426/84954.html'],
    limitations: ['Permanent guardian-clear persistence and campaign-wide reset semantics remain unverified.'],
    stages: [
      chain('guardians', '五大守护兽', 'boss_campaign_baihu_guardians', '依次挑战劳克蒙德、克拉尼特、墨杜萨、肯佩德、亚伦斯。守护兽在同一场战斗中连续出战。'),
      chain('avatars', '战虎与电虎', 'boss_campaign_baihu_avatars', '依次击败战斗系与电系的白虎分身。'),
      stage('body', '白虎真身 · 泰格尔', 'boss_campaign_baihu_body', '通过分身考验后，挑战电战斗系的泰格尔。'),
    ],
  },
  {
    id: 'zhuque', name: '朱雀试炼', species: 504, location: '菲尼克斯禁地 · 朱雀空间', reward: 'essence', continuity: 'checkpoint', resetOnLoss: false,
    sources: ['https://news.7k7k.com/content/20110806/94759.html'],
    limitations: ['The period guide establishes persistent guardian clearance, but does not establish every avatar retry boundary.'],
    stages: [
      chain('guardians', '三大守护兽', 'boss_campaign_zhuque_guardians', '依次击败德拉萨、卡修斯、迪符特。守护兽在同一场战斗中连续出战。'),
      chain('avatars', '朱雀三重影', 'boss_campaign_zhuque_avatars', '依次挑战愤怒之影、光芒之影、重生之影。重生之影需要击败两次。'),
      stage('body', '朱雀真身 · 菲尼克斯', 'boss_campaign_zhuque_body', '通过三重影后，挑战朱雀菲尼克斯的本尊。'),
    ],
  },
  {
    id: 'qilin', name: '麒麟六道轮回', species: 505, location: '麒麟空间', reward: 'essence', continuity: 'checkpoint',
    sources: ['https://news.7k7k.com/51seer/20130304-566003.html', 'https://news.4399.com/gonglue/seer/jingyanxinde/305908.html'],
    limitations: ['The six wheels and final body are a 2013 extension; they must not be described as available before 2013.'],
    stages: [
      stage('wheel1', '炽天之轮', 'boss_campaign_qilin_wheel1', '挑战麒麟的第一重轮回：炽天。'),
      stage('wheel2', '日月之轮', 'boss_campaign_qilin_wheel2', '突破只接受指定伤害方式的日月之轮。'),
      stage('wheel3', '天地之轮', 'boss_campaign_qilin_wheel3', '继续挑战天地之轮，寻找有效的伤害方式。'),
      stage('wheel4', '麒火之轮', 'boss_campaign_qilin_wheel4', '通过致命一击突破麒火之轮。'),
      stage('wheel5', '幻化之轮', 'boss_campaign_qilin_wheel5', '挑战第五重轮回：幻化。'),
      chain('wheel6', '重生之轮', 'boss_campaign_qilin_wheel6', '击败重生之轮，并迎接它复苏后的第二条生命。'),
      chain('body', '麒麟真身 · 阿瑞斯', 'boss_campaign_qilin_body', '在一场连续战斗中突破麒麟真身的六重能力与最终重生。'),
    ],
  },
  {
    id: 'rei-training', name: '雷伊技能特训', species: REI, location: '赫尔卡星 · 雷伊特训湖边', reward: 'skills', continuity: 'checkpoint',
    contact: { kicker: '技能特训', action: '查看特训进度' },
    sources: ['https://news.7k7k.com/content/20111103/103132.html', 'https://news.7k7k.com/content/20120417/167700.html'],
    stages: [
      reiTraining('liaosi', '里奥斯 · 极光刃', 'boss_rei_training1', '只派自己的雷伊，用白光刃击败里奥斯，领悟极光刃。'),
      reiTraining('tiyasi', '提亚斯 · 闪电斗气', 'boss_rei_training2', '使用雷雨天后击败提亚斯，领悟闪电斗气。'),
      reiTraining('leinaduo', '雷纳多 · 元气电光球', 'boss_rei_training3', '用极电千鸟击败雷纳多，领悟元气电光球。'),
      reiTraining('akexiya', '阿克希亚 · 雷神觉醒', 'boss_rei_training4', '抵挡十回合攻击，并在阿克希亚麻痹时击败它，领悟雷神觉醒。', 80),
      reiTraining('shadow', '雷伊倒影 · 雷神天明闪', 'boss_rei_training5', '完成四项技能特训后，让满级雷伊挑战倒影，领悟雷神天明闪。', 100),
    ],
  },
  {
    id: 'puni', name: '谱尼封印与真身', species: 300, location: '精灵太空站 · 勇者之塔神秘领域', reward: 'essence', continuity: 'checkpoint',
    contact: { kicker: '封印挑战', action: '查看封印进度' },
    sources: ['https://news.4399.com/seer/zenmezhua/201103-16-89473.html', 'https://news.7k7k.com/content/20101028/18173.html'],
    stages: [
      ...['虚无', '元素', '能量', '生命', '轮回', '永恒', '圣洁'].map((name, index) =>
        stage(`seal${index + 1}`, `第${index + 1}封印 · ${name}`, `boss_puni_seal${index + 1}`, `破解谱尼的${name}封印。`)),
      chain('body', '谱尼真身', 'boss_puni_zhenshen', '七道封印全部破解后，在同一场战斗中击败谱尼真身的六条生命。'),
    ],
  },
];

/** A hosting region still offers the stages of a campaign that states no wording of its own. */
const NEUTRAL_CAMPAIGN_CONTACT: CampaignContactWording = { kicker: '挑战', action: '查看挑战进度' };
export const campaignContactWording = (id: string): CampaignContactWording =>
  CHALLENGE_CAMPAIGNS.find(campaign => campaign.id === id)?.contact ?? NEUTRAL_CAMPAIGN_CONTACT;
