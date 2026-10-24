// Creating, loading and writing the game save.
import { Rng } from '../../battle/core/src/index.ts';
import { addMonster, createMonster, type Save } from '../../raising/core/index.ts';
import { deserialize, newSave, SAVE_VERSION, serialize, storedVersion, type GameExtras, type GameSave, type MigrationContext } from './save.ts';
import { backupUnreadableSave, readLocalSave, saveWriteSettled, writeLocalSave } from './persistence.ts';
import { normalizeBraveTowerProgress } from '../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS } from '../domain/challenges/challenge-campaigns.ts';
import { sanitizeSkin } from '../domain/acquisition/skins.ts';
import { rollTrait } from './acquire.ts';
import type { GameContext } from './context.ts';
import { CURE_ITEM_ID, CURE_ITEM_STOCK, STARTER_LEVEL, STARTER_SPECIES, STARTING_COINS, STARTING_ITEM_STOCK } from '../domain/economy.ts';
import {campaignProgress} from '../features/challenges/index.ts';

export interface Journey { save: GameSave; rng: Rng }

const STARTING_STOCK_KINDS = ['battle', 'capsule', 'raising'];

const newGameExtras = (): GameExtras => ({
  coins: STARTING_COINS, traits: {}, quests: [], battlesWon: 0, modules: {}, engravingStock: {}, campaigns: {}, shopUnlocked: [],
  recruitmentClaims: {}, braveTower: { highestCleared: 0, resumeFloor: 1 }, bossVariants: {},
});

/** Defaults for absent game extras, legacy Brave Tower clears, valid skins and campaign records. */
function normalize(ctx: GameContext, save: Save): GameSave {
  const stored = (save as Partial<GameSave>).game, storedTower = stored?.braveTower, defaults = newGameExtras();
  const game = (save as GameSave).game = stored ?? defaults;
  for (const key of Object.keys(defaults) as (keyof GameExtras)[]) (game as unknown as Record<string, unknown>)[key] ??= defaults[key];
  game.braveTower = normalizeBraveTowerProgress(storedTower, save.progress.bosses_cleared);
  for (const mon of save.storage) sanitizeSkin(mon, ctx.skinOptions);
  for (const campaign of CHALLENGE_CAMPAIGNS) campaignProgress(save as GameSave, campaign);
  return save as GameSave;
}

/** A new journey: the three gift starters and the starting item stock. */
export function startJourney(ctx: GameContext): Journey {
  let save = normalize(ctx, newSave(Date.now() >>> 0));
  const rng = new Rng(save.seed);
  for (const species of STARTER_SPECIES) {
    const mon = createMonster(ctx.dex, species, STARTER_LEVEL, rng, { how: 'gift', at: new Date().toISOString() });
    save = addMonster(save, mon) as GameSave;
    rollTrait(ctx, save, rng, mon.uid);
  }
  for (const item of ctx.catalog.items) {
    if (!item.trainer_supply_only && STARTING_STOCK_KINDS.includes(String(item.kind))) save.items[String(item.id)] = STARTING_ITEM_STOCK;
  }
  save.rng_state = [...rng.s];
  return { save, rng };
}

/**
 * Items version 3 retired, with their replacements. 卡特斯's essence now hatches 黑刺球, as the original's 暗黑武斗场 task paid
 * it, so 黑刺球 has a native route and its collection recruitment and essence were retired.
 */
const VERSION_3_REPLACED_ITEMS: Readonly<Record<string, string>> = { essence_collection_167: 'essence_boss_dark_trial_katesi' };

const migrationContext = (ctx: GameContext): MigrationContext => ({
  recruitments: ctx.recruitments, introducedItems: { [CURE_ITEM_ID]: CURE_ITEM_STOCK }, replacedItems: VERSION_3_REPLACED_ITEMS,
  firstClearItems: Object.fromEntries(ctx.encounters.flatMap(encounter => {
    const items = (encounter.reward as { first_clear_items?: Record<string, number> } | undefined)?.first_clear_items;
    return items ? [[encounter.id, items]] : [];
  })),
  allVariantTitles: Object.fromEntries(ctx.encounters.flatMap(encounter => {
    const titled = (encounter.reward as { title_on_all_variants?: unknown } | undefined)?.title_on_all_variants;
    return titled && encounter.variants?.length ? [[encounter.id, encounter.variants.map(variant => variant.id)]] : [];
  })),
});

/** Parses, migrates and validates a save; throws when it cannot be read. */
export function loadJourney(ctx: GameContext, text: string): Journey {
  const save = normalize(ctx, deserialize(text, ctx.dex, migrationContext(ctx)));
  return { save, rng: new Rng(save.rng_state ?? save.seed) };
}

export interface OpenedJourney extends Journey {
  notices: string[];
  /** False when an unreadable save could not be backed up: progress then stays in memory so that save is never overwritten. */
  durable: boolean;
}

/** Why a stored save could not be opened, in the player's words: a newer game's save names its format version. */
function unreadableNotice(text: string, kept: boolean) {
  const version = storedVersion(text);
  const which = version !== null && version > SAVE_VERSION ? `存档来自更新版本的游戏（存档格式 ${version}，本游戏为 ${SAVE_VERSION}）` : '旧存档无法读取';
  return kept ? `${which}，已另存原存档并创建新存档；可在设置中导出原存档。` : `${which}且无法备份；为保留原存档，本次进度暂不保存。`;
}

/**
 * The given or stored save; an unreadable one is kept under its own name before a new journey replaces it. An empty given save
 * asks for a new journey (the preview does); an empty stored save is unreadable, not absent, so that a save file emptied outside
 * the game is kept and the player is told.
 */
export function openJourney(ctx: GameContext, initialSave?: string): OpenedJourney {
  const previous = initialSave ?? readLocalSave();
  if (previous === null || initialSave === '') return { ...startJourney(ctx), notices: [], durable: true };
  try {
    return { ...loadJourney(ctx, previous), notices: [], durable: true };
  } catch {
    let durable = true;
    try { backupUnreadableSave(previous); } catch { durable = false; }
    return { ...startJourney(ctx), notices: [unreadableNotice(previous, durable)], durable };
  }
}

/** Live save rules applied before every write: collection credit and earned shop listings. */
function applyLedgers(ctx: GameContext, save: GameSave) {
  // Owning a form credits every directed ancestor; owning is also having seen.
  const owned = new Set(save.dex.owned), seen = new Set(save.dex.seen);
  for (const id of new Set([...owned, ...save.storage.map(mon => mon.species)])) for (const species of [id, ...(ctx.collectionAncestry.get(id) ?? [])]) {
    if (!owned.has(species)) { save.dex.owned.push(species); owned.add(species); }
    if (!seen.has(species)) { save.dex.seen.push(species); seen.add(species); }
  }
  // Held items, and the rewards of cleared Bosses even once consumed, stay listed in the shop.
  const unlocked = new Set(save.game.shopUnlocked), cleared = new Set(save.progress.bosses_cleared);
  const unlock = (id: string) => {
    if (unlocked.has(id)) return;
    save.game.shopUnlocked.push(id);
    unlocked.add(id);
  };
  for (const [id, count] of Object.entries(save.items)) if (count > 0) unlock(id);
  for (const [bossId, ids] of ctx.bossRewardItemIds) if (cleared.has(bossId)) ids.forEach(unlock);
}

/** Applies the live save rules and records the RNG, so that the snapshot and every write see them. */
function settle(ctx: GameContext, { save, rng }: Journey) {
  applyLedgers(ctx, save);
  save.rng_state = [...rng.s];
}

/** Keeps the stored save in step with the live journey. */
export interface JourneyWriter {
  /** After an action: settles the journey and queues its write, which the actions dispatched before it runs share. */
  changed(): void;
  /** After an import or a new journey, the player's choice to replace the stored save: settles and writes it at once. */
  replaced(): void;
  /** Writes a pending change now and returns the save's text (an export). */
  flush(): string;
}

/**
 * The stored save's slot: the last text written and the save whose write is queued. It is built apart from the writer so that
 * a queued write holds only this slot and that save, not the runtime with its catalog: a controller dropped before its
 * microtask runs is not kept alive by it.
 */
function createSaveSlot(durable: boolean) {
  let queued: GameSave | null = null, written: string | null = null;
  // A refused write keeps the last text written, so the next action tries again; the shell shows the failure until then.
  const write = (text: string) => {
    queued = null;
    if (!durable || text === written) return;
    try {
      writeLocalSave(text);
      written = text;
    } catch (error) {
      saveWriteSettled(error);
    }
  };
  const writeQueued = () => { if (queued) write(serialize(queued)); };
  return {
    write,
    /** Queues the write of `save`, the latest one, in a microtask unless one is queued already. */
    queue: (save: GameSave) => {
      if (!durable) return;
      if (!queued) queueMicrotask(writeQueued);
      queued = save;
    },
    pending: () => queued !== null,
    makeDurable: () => { durable = true; },
  };
}

/**
 * Writes `journey`, the live runtime whose save actions replace, to the save store (persistence.ts): at once when it is opened
 * or replaced, and after actions in a microtask, which runs before control returns to the event loop: the actions dispatched
 * before it runs (one synchronous run, such as one event handler) share a write, and each is handed to the store before the page
 * can paint, run another task or be closed. An export writes a pending change at once. A text equal to the last one written is
 * not written again; a refused write is reported and tried again by the next action. While `durable` is false (an unreadable
 * stored save that could not be backed up) nothing is written until the journey is replaced.
 */
export function createJourneyWriter(ctx: GameContext, journey: Journey, durable: boolean): JourneyWriter {
  const slot = createSaveSlot(durable);
  settle(ctx, journey);
  slot.write(serialize(journey.save));
  return {
    changed: () => { settle(ctx, journey); slot.queue(journey.save); },
    replaced: () => { slot.makeDurable(); settle(ctx, journey); slot.write(serialize(journey.save)); },
    flush: () => {
      // An export carries the progress even when storage refuses it.
      const text = serialize(journey.save);
      if (slot.pending()) slot.write(text);
      return text;
    },
  };
}
