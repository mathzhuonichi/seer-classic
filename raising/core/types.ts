// Shared types for the raising core. Shapes follow /mnt/project-files/design/foundation.md
// (sections 3, 4 and 6). Keys are snake_case to match the JSON data files.

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export const STAT_KEYS: readonly StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export type StatBlock = Record<StatKey, number>;
export type PartialStats = Partial<Record<StatKey, number>>;

export type GrowthId = "medium" | "slow" | "medium_slow" | "fluctuating";

export interface Text { zh: string; en?: string }

export interface LearnsetEntry { level: number; skill: number }

export interface EvolutionEntry {
  /** False requires explicit confirmation even when the level gate is satisfied. */
  automatic?: boolean;
  to: number;
  method: "level" | "item" | "special";
  level?: number;
  item?: string;
  condition?: string;
  script?: string;
}

export interface Species {
  id: number;
  name: Text;
  types: string[];
  base: StatBlock;
  ev_yield: PartialStats;
  exp_yield: number;
  growth: GrowthId;
  catch_rate?: number;
  learnset: LearnsetEntry[];
  evolution: EvolutionEntry[];
  tags?: string[];
}

export interface Skill { id: number; name: Text; pp: number }

export interface Nature { id: string; name: Text; plus: StatKey; minus: StatKey }

// Static data the core needs. The game wires this to the data/ folder; tests use fixtures.
export interface Dex {
  species(id: number): Species;
  skill(id: number): Skill;
  nature(id: string): Nature;
  natures(): Nature[];
}

export interface Monster {
  uid: string;
  species: number;
  nickname: string | null;
  level: number;
  exp: number; // EXP into the current level (Seer shows "exp / 升级所需")
  iv: number; // 个体值 0-31, one value for every stat
  evs: StatBlock; // 学习力
  nature: string;
  skills: number[]; // equipped, 1-4
  learned: number[]; // everything it can re-equip
  hp: number;
  pp: Record<string, number>;
  status: string | null;
  obtained: { how: string; at: string };
  /** Original breeding generation; absent in legacy saves means an acquired first generation. */
  generation?: number;
  /** Cosmetic ancestor form; absent means the current species appearance. */
  skinSpecies?: number;
}

export interface Save {
  version: number;
  seed: number;
  rng_state?: [number, number, number, number] | null;
  party: string[]; // ordered uids, 1-6
  storage: Monster[]; // every owned monster; the box is storage minus party
  exp_pool: number; // 积累经验, spent through 经验分配器
  boosts?: Boost[]; // active 经验加速器 / 学习力双倍仪 / 能量珠, counted down per battle
  items: Record<string, number>;
  progress: { bosses_cleared: string[]; boss_attempts: Record<string, number> };
  dex: { seen: number[]; owned: number[] };
}

// A timed item effect. exp/ev boosts are player-wide; an energy bead belongs to the
// monster it was used on and the battle engine applies its bonus.
export type Boost =
  | { kind: "exp" | "ev"; item: string; multiplier: number; battles_left: number }
  | {
      kind: "energy_bead"; item: string; uid: string; battles_left: number;
      stats?: PartialStats; crit_rate_add?: number; damage_taken_and_dealt_multiplier?: number;
    };

// Everything that happens during a raising step, in order, so a UI can animate it.
export type RaisingEvent =
  | { kind: "exp_gained"; uid: string; amount: number }
  | { kind: "exp_to_pool"; uid: string; amount: number }
  | { kind: "level_up"; uid: string; level: number; stats: StatBlock }
  | { kind: "level_down"; uid: string; level: number; stats: StatBlock }
  | { kind: "skill_learned"; uid: string; skill: number; equipped: boolean }
  | { kind: "evolution_ready"; uid: string; options: number[] }
  | { kind: "evolved"; uid: string; from: number; to: number }
  | { kind: "evs_gained"; uid: string; gained: PartialStats }
  | { kind: "evs_reset"; uid: string; stats: StatKey[] }
  | { kind: "nature_changed"; uid: string; from: string; to: string }
  | { kind: "iv_changed"; uid: string; from: number; to: number };

export interface Rng { int(min: number, maxInclusive: number): number }
