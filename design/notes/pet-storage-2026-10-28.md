# Pet storage (2026-10-28)

Players reported that taking a monster out of the 精灵仓库 was awkward. This note covers the old flow, what the 2013 client shows,
and the new box.

## The old flow

- Picking a card in the box selected the monster and closed the box. The player then pressed 入队 among the PetBag's side
  buttons, so every monster taken out cost three clicks and a reopened box.
- With a full bag (the usual state, since new monsters fill the bag first), 入队 was disabled without a reason. Taking a monster
  in took 选中 → 存入 → 仓库 → find it again → 入队: five clicks. The newcomer then sat in slot 6, and putting it back in place
  cost three more (交换 → pick → 确认).
- The box covered the portrait and the details but not the side buttons. Those still acted on the monster picked before the
  box opened.
- Eight cards per page, sorted by species number, so a newly caught monster was buried. The PetBag's status line is visually
  hidden, so its messages ("背包已满" among them) never showed.

## The 2013 client

Source: RobotAppDLL of 2013-07-06 from the Wayback Machine (`web.archive.org/web/20130706235646id_/http://seer.61.com/dll/RobotAppDLL.swf?hir254o8`,
1,754,597 bytes; skip 7 bytes, then zlib), class `com.robot.app.petbag.ui.PetBagPanelNew`, built on symbol 812, which is the
PetBag frame this remake uses.

- The PetBag's buttons and tooltips (`setButton`):
  - `defaultBtn` (748) 设为首发
  - `cureBtn` (745) 精灵恢复
  - `storageBtn` (765) 放回仓库, which deposits the selected monster at once
  - `cmBtn` 精灵刻印
  - `skillStoneBtn` 技能石背包
  - `petStorageBtn` (743) 精灵仓库, which opens the box
  - `pictureBookBtn` (752) 精灵图鉴
- The box itself was a separate module, `module/com/robot/module/app/PetStorage.swf`. Every route into the box loads that
  module: the bag's 743 button, the base's NoNo bar, the VIP chip 700011 and base furniture. The Wayback Machine has no copy
  of it (CDX over seer.61.com and fourteen other hosts).
- The official server still serves the box from before the 2015 redesign as
  `https://seer.61.com/module/com/robot/module/app/PetStorageOld.swf` (155,558 bytes, compiled 2015-01-26; the redesign
  behind `PetStorage.swf` has a hidden button that opens it). Decompiled (classes `PetStorageOld`, `petStorage.TypeBtnPanel`,
  `PetListItem`, `InfoTxtPanel`) and compared with dated screenshots from 2009-08 and 2010-07 (Baidu Zhidao):
  - On the left, a grid of element tiles (5 × 6 in 2015, 4 × 5 in 2010) with 单属性 and 双属性 buttons under it; 双属性
    turns the grid to the dual pairs' tiles, over two pages. A tile lists the monsters of exactly that element id, so a
    dual-element monster is only under its pair. There is no 全部; the box opens on 草. The picked tile glows yellow.
  - Tabs 精灵仓库, 放生仓库 and 精英收藏 (the last by 2011-12); a 精英收藏 / 取消收藏 button beside 放入背包.
  - Sort buttons ID, 等级 and 时间, and a search box (neither shows in the 2009 and 2010 screenshots).
  - A 3 × 3 grid of 50 px cards (art, level, a NEW badge) with no name or element icon; beside it the picked monster's art,
    序号, 名字, 等级, 升级所需经验, 性格, 获取时间 and the six stats.
  - With a full bag, 放入背包 opens a chooser of the monster to swap out in 2015, and a 2009 answer also tells of being
    asked to swap one out. RobotCoreDLL of 2013-07-06 already has `PetManager.getStorageTypeList`, the exact-element filter.
  The exact 2013 layout lies between the 2010 and 2015 ones; the downloads, decompiled code and renders stayed in the
  session's scratch directory.

The remake had the side-button icons crossed: 仓库 used 748 (设为首发), and 交换 used 743 (精灵仓库). Now 首发 uses 748, 仓库 uses
743, 存入 keeps 765, and 交换 takes 759, which 首发 used before. The tooltip of 存入 is the original's 放回仓库.

## The new box

The first version (commit f226507) kept the party strip below the box and swapped through it. The player found the filter
cluttered, the first page useless once the box holds many monsters, the strip a waste of the box's room, the corners
untidy and the details clipped. The second version, the same day, after two more rounds of the player's review:

- **Shelves on the left.** 收藏 (the default), 全部, and two tabs with their own buttons:
  - 单属性: the official button of every element in the dex, so only the 17 of 2013 (`singleElements` in
    `src/shared/element-types.ts`; 远古, 邪灵 and 自然 have art but no monster). An element lists the single-element monsters
    of it; the 包含双属性 box adds the dual-element monsters that have it.
  - 双属性: the official button of every dual pair in the dex (28, `dualElements`); a pair lists its monsters.
  - In both grids the buttons the box has monsters for come first and the others follow, dimmed; each part keeps source
    order (the art's: 草, 水, 火, 飞行, …, and the pairs' type ids).
  - A tab without a button lists all of its kind; picking the picked button again returns to that.
  A first version listed only the elements present, one per row; a second put 全部 / 单属性 / 双属性 over a fixed grid of
  every element with art, so 双属性 still showed single elements and the dimmed elements sat among the others. The dropdown with 仅单属性, 仅双属性 and the dual pairs is gone from the box (the dex
  keeps it).
- **收藏.** A ☆ beside the name marks a monster, in the box's details and in the PetBag's portrait, so a party monster can
  be marked before it is stored (`favorite` on the monster record, `setFavorite` in `raising/core/storage.ts`, the `favorite`
  action; raising/SPEC.md §8). The box opens on its 收藏, so the first page shows the
  monsters the player keeps coming back to; an empty 收藏 says how to fill it and offers 全部. A marked card shows a ★ beside
  its number. 精灵还原 keeps the mark.
- **Search** looks through the whole box, whatever the shelf; picking a shelf ends it. The order stays: 最近获得 (default),
  精灵编号, 等级. Twelve cards per page. A new list shows its first monster beside it.
- **No party strip in the box.** The box now covers the whole window body. With room in the bag, 放入背包 adds the monster at
  once (it joins the bag's end). With the bag full the button reads 换入背包 and opens a dialog of the six party monsters: the
  one picked goes to the box and the stored monster takes its slot (`swapWithBox`). Escape or a click outside closes the
  dialog only. The PetBag's 入队 side button does the same for a stored monster. A first try opened the dialog with room too,
  which the player found redundant.
- **The details fit.** A box-only summary (`petbag/StoredSummary.tsx`), top to bottom: a small art beside 编号, 性格, 个体值
  and 特性; the six stats, an ability engraving's bonus in green beside its stat; the EXP bar (已满级 at the top level); the
  two engravings (能力刻印 and 技能刻印, art and name, the effect in the tooltip); and the four skills, one row each with its
  element icon, name, 威力 (or category) and PP, 22-34 px tall as the panel allows. The details panel is a size container: when
  it is under 360 px tall the EXP bar goes and the facts tighten, and under 200 px wide a skill's 威力 and a stat's bonus go.
  Nothing scrolls at 1000×585 and up; the 信息 tab keeps its own summary. Earlier tries: an art that took the leftover height
  was too large, and two skills per row were too flat and clipped their PP.
- **The window's corners.** The PetBag's frame art is transparent inside and rounded at its corners, while its blue fill
  and the window's shadow were square, so blue and shadow showed behind the white frame at all four corners. Both now follow
  the frame's corners (31 of its 1470 × 1070 px).
- **Card corners.** The party and box cards draw the original slot (`petbag-slot.svg`) as a nine-slice. Its slices cut through
  the inner box's rounded corners and squeezed them to 3-5 px, so square dark corners and the transparent gap showed behind the
  frame's rounded corners, and a selected card's glow filled the gap. The slices now lie past those corners at one scale (0.2 px
  per source unit), and a dark fill clipped to the frame's outline (cut top-left and bottom-right corners, rounded others)
  closes the gap.
- **The PetBag opens on its lead** (in battle, the monster out). The toolbar and the manage buttons of campaigns and battle
  facilities clear the last pick; breeding and the dex's locate route still open on the monster they name.
- **皮肤 in the portrait.** The skin picker left the 信息 tab (a dropdown and a sentence) for a 皮肤 button at the top left of
  the PetBag's portrait. It drops a column of the forms the monster may look like, from its first form to its own, each with
  its art and name; the pressed one is its look (`petbag/SkinButtons.tsx`). A pick, a click elsewhere or Escape closes the
  column. A monster with one form has none. A first try put a row of buttons along the art's foot.
- **Engravings under the portrait.** The PetBag's portrait shows the monster's two engravings under its art, side by side, as
  the original 精灵刻印 window draws them (`petbag/PortraitEngravings.tsx`, `EngravingMark.tsx`): no frame and no label, the
  equipped mark, or, when a slot is empty, the outline of its kind of mark (the ability marks' comet, the skill marks' star)
  sunk into the panel, navy #09396C with a dark rim at the top left and a light bevel below. The outline is the alpha of an
  existing mark icon (10001, 20001) used as a CSS mask, so no art is added. Either opens 能力 at its engraving slots, without
  the 学习力 editor. The box's summary uses the same marks. Source: the live official
  `module/com/robot/module/app/SpriteCountermarkPanel.swf` (compiled 2014-01-09, before the 2014-01-17 overhaul; every API it
  calls is in the 2013-07-05 client) and a 2013-06-21 screenshot (Baidu Zhidao Q560930801), which match. That window stacks
  three slots beside the monster; the third, 通用刻印, is greyed until unlocked, and the remake does not offer it.
- A type icon's tooltip shows on hover and keyboard focus only, so a clicked card's tooltip no longer stays over its
  neighbours.
- During a battle the box can be browsed and marked, but 放入背包 is disabled; the dispatcher refuses party changes in battle.

## Checks

- `raising/core/storage.test.mjs` tests the swap: it keeps the slot, also in a full party, and rejects a monster outside the
  party or already in it.
- `raising/core/storage.test.mjs` also tests the 收藏 mark: set and cleared on a copied record, the others shared.
- `browser-regressions` checks the box save (three starters plus five monsters): the PetBag opens on its lead; the box hides the
  strip and opens on its empty 收藏; a monster picked on 全部 shows beside the list, and its ☆ puts it on 收藏; Escape closes
  the place dialog only; with the bag full the dialog swaps it into slot 2, and the status line names both. A second check
  (罗特, 火·超能, added to the box): 龙 and 圣灵 lead the single grid and the rest are dimmed, with no 远古, 邪灵 or 自然; 火
  alone lists nothing, with 包含双属性 罗特; 圣灵 lists 谱尼; 双属性 puts 火·超能 first and the dex's other pairs dimmed after it,
  and lists 罗特. Chrome and WebKit.
- Screenshots at 1000×585, 1140×665, 1280×800 and 1600×900 (device scale 2) came from a scratch harness, not the repository.

## Not done

- This box follows the original's shape (element tiles with 单属性 and 双属性, a 收藏 like its 精英收藏, 放入背包 with a swap
  chooser) but not its art: it uses only art from the frozen pack (ART.md), the slot frame, the element buttons and the
  PetBag's own symbols. It adds 全部, 包含双属性 (the player's request; the original listed a dual monster only under its
  pair), names and element icons on the cards, and orders its four-column grids by what the box holds rather than the
  original's fixed five columns.
- The PetBag's own status line stays visually hidden. Only the box shows its messages. A disabled side button names its reason
  in its tooltip.
- There is no drag and drop, and there is no 放生 (raising/SPEC.md §8).
