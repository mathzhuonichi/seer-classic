// The immutable snapshot the components render.
import type { GameSnapshot } from '../game-types.ts';
import { battleView } from './battle-view.ts';
import type { GameContext } from './context.ts';
import { catalogViews } from './encounter-views.ts';
import { createInventoryViews, createShopViews } from './item-views.ts';
import { monsterView } from './monster-views.ts';
import { campaignViews, towerView } from './progress-views.ts';
import { questViews } from './quests.ts';
import type { Runtime } from './runtime.ts';

/** Builds a snapshot function whose catalogue rows are created once and reused while unchanged. */
export function createSnapshotBuilder(ctx: GameContext): (rt: Runtime) => GameSnapshot {
  const catalog = catalogViews(ctx), inventory = createInventoryViews(ctx), shop = createShopViews(ctx);
  const natures = ctx.catalog.natures.map(nature => ({ id: String(nature.id), name: (nature.name as { zh: string }).zh }));
  const traits = ctx.availableTraits.map(trait => ({ id: trait.id, name: trait.name, description: trait.description }));
  return rt => {
    const { save, session } = rt;
    // An unsettled battle shows the battle's own inventory and supply access.
    const live = session && !session.settled ? session.battle.sides[0] : undefined;
    const items = live?.items ?? save.items, unlimited = live?.unlimitedItems ?? ctx.unlimitedItemIds;
    return {
      monsters: save.storage.map(mon => monsterView(ctx, save, mon)), party: [...save.party], campaigns: campaignViews(ctx, save),
      braveTower: towerView(ctx, save), facilities: ctx.facilityViews,
      bosses: catalog.bosses(save.progress.bosses_cleared, save.progress.boss_attempts), species: catalog.species(save.dex.owned),
      quests: questViews(ctx, save), battle: session ? battleView(rt, session) : null, expPool: save.exp_pool, coins: save.game.coins,
      notices: [...rt.notices], natures, traits, items: inventory(items, unlimited, session?.battle ?? null), shopItems: shop(save, items),
    };
  };
}
