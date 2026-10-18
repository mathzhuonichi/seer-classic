// The public surface of features/items: everything other features, the kernel and the app may use.
export { itemActions } from './actions.ts';
export { default as Inventory } from './ui/Inventory.tsx';
export { default as ItemShop } from './ui/ItemShop.tsx';
export { createInventoryViews, createShopViews } from './views.ts';
