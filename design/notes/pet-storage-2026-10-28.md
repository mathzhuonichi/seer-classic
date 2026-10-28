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
- The box itself was a separate module, `module/com/robot/module/app/PetStorage.swf`. The Wayback Machine has no copy, so the
  original box's layout, page size and labels are unknown. Every route into the box loads that module: the bag's 743 button,
  the base's NoNo bar, the VIP chip 700011 and base furniture.
- Taking a monster out of the box with a full bag left it in the box and showed an alert. Nothing in the client swaps a stored
  monster with a bag monster. The one-step swap below is a remake convenience.

The remake had the side-button icons crossed: 仓库 used 748 (设为首发), and 交换 used 743 (精灵仓库). Now 首发 uses 748, 仓库 uses
743, 存入 keeps 765, and 交换 takes 759, which 首发 used before. The tooltip of 存入 is the original's 放回仓库.

## The new box

- The box covers the window body above the party strip, side buttons included. It has a list on the left and the picked
  monster on the right: name, level, gender and types, its art, and the 信息 summary (编号, 性格, 个体值, 特性, base stats, EXP,
  skills), the same component as the 信息 tab.
- The list:
  - cards in the party strip's style, twelve per page;
  - search, element filter and an order: 最近获得 (the default, the reverse of the save's storage order), 精灵编号 or 等级.
- Picking a card shows that monster and keeps the box open. Its buttons:
  - 放入背包 when the bag has room: the monster takes the next free slot.
  - 替换背包精灵 when the bag is full: the party cards glow, and the party card picked next goes to the box while the stored
    monster takes its slot (`swapWithBox` in `raising/core/storage.ts`, the `swapWithBox` action). 取消替换 leaves this mode.
  - 查看详情 closes the box and shows the monster in the PetBag's tabs (skills, learning values, experience).
- The box's status line is visible, for example 「电击兔已换入背包第 2 位，伊优已放回仓库。」.
- An empty party slot opens the box.
- In the PetBag, a stored monster's side button reads 替换 when the bag is full. It opens the box with that monster waiting to
  be swapped in.
- During a battle the box can be browsed, but its moves are disabled. The dispatcher refuses party changes in battle as before.

## Checks

- `raising/core/storage.test.mjs` tests the swap: it keeps the slot, also in a full party, and rejects a monster outside the
  party or already in it.
- `browser-regressions` has a new check on the box save (three starters plus five monsters): a picked card shows beside the
  list and the box stays open; 替换背包精灵 then a party slot swaps them; the status line names both. It runs in Chrome and
  WebKit.
- The screenshots of the old and new flows were taken at 1280×800 with a six-plus-twenty save in a scratch harness, not in the
  repository.

## Not done

- The original box's own layout is unknown (see above). This box follows the PetBag's frame and colors and uses only art
  from the frozen pack (ART.md).
- The PetBag's own status line stays visually hidden. Only the box shows its messages. A disabled side button names its reason
  in its tooltip.
- There is no drag and drop, and there is no 放生 (raising/SPEC.md §8).
