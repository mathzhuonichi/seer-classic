// Economy numbers: starting resources, battle rewards and raising costs.
import type { BossEncounter } from '../../battle/core/src/types.ts';

export const STARTING_COINS = 1000;
/** The three gift starters and their level. */
export const STARTER_SPECIES = [1, 4, 7] as const;
export const STARTER_LEVEL = 5;
/** A new journey holds this many of every ordinary battle, capsule and raising item. */
export const STARTING_ITEM_STOCK = 5;

/** The authored remake status cure; saves that predate it receive this stock once. */
export const CURE_ITEM_ID = 'item_status_cure';
export const CURE_ITEM_STOCK = 5;

/** Brave Tower seer beans are paid as coins instead of entering the inventory. */
export const SEER_BEANS_ITEM_ID = 'item_seer_beans';

/** Coins and pooled experience for a victory; Brave Tower floors pay seer beans instead of coins. */
export const VICTORY_REWARDS = {
  encounter: { coins: 500, exp: 1000 },
  wild: { coins: 100, exp: 250 },
} as const;
export const victoryReward = (encounter: BossEncounter | null) => encounter ? VICTORY_REWARDS.encounter : VICTORY_REWARDS.wild;

/** Coins per effort value bought in training. */
export const TRAINING_COST_PER_EV = 10;
/** Largest quantity one shop purchase may request. */
export const SHOP_MAX_QUANTITY = 999;
