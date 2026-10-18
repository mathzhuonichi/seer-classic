// features/items's registration: buying and using items, and the inventory, shop and coin slices.
import type { ItemView, ShopItemView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { itemActions } from './actions.ts';
import { createInventoryViews, createShopViews } from './views.ts';

export type ItemsAction =
  | {type: 'useItem'; uid: string; itemId: string}
  | {type: 'buyItem'; itemId: string; quantity: number};
export interface ItemsSlice { items: ItemView[]; shopItems: ShopItemView[]; coins: number }

export const itemsFeature: Feature<ItemsAction, ItemsSlice> = {
  actions: itemActions,
  slice: ctx => {
    const inventory = createInventoryViews(ctx), shop = createShopViews(ctx);
    return ({ save, session }) => {
      // An unsettled battle shows the battle's own inventory and supply access.
      const live = session && !session.settled ? session.battle.sides[0] : undefined;
      const items = live?.items ?? save.items, unlimited = live?.unlimitedItems ?? ctx.unlimitedItemIds;
      return { items: inventory(items, unlimited, session?.battle ?? null), shopItems: shop(save, items), coins: save.game.coins };
    };
  },
};
