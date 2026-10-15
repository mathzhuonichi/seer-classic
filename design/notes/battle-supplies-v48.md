# V48 battle supplies: catalog evidence and implementation boundary

The approved rule gives both sides unlimited battle supplies in trainer and battle-facility encounters: the period-attested 250-HP `极限体力药剂` (original ID 300072), 20-PP `高级活力药剂` (300018), and the authored status cure. The imported 3000-HP and 40-PP entries lack verified classic-period public-use evidence and are excluded from runtime use while their source rows and legacy inventory counts remain preserved. Original bosses and wild encounters do not receive unlimited supplies. Unlimited quantities and availability across the authorized trainer facilities are remake rules.

The catalog audit starts from V47 commit `889c3238100ffd2363cd30eb1bce7e62e5e6e844`; the implementation interface below was inspected in the V48 working tree on 2026-10-15. The source choice and evidence boundary are frozen at 250 HP, 20 PP, and the authored status cure. This document's author changed no production code, historical data, save, or running game. Runtime and AI test results belong to the implementation owner's verification report and are not inferred from source inspection. Neither selected amount is asserted to be the absolute maximum across every item, event, or game period.

## Exact supplies and retained tiers

At the audit baseline, `data/items.json` and the `items` member of `data/gamedata.json` are deeply identical: 51 entries comprising 12 battle recovery items, 7 capsules, and 32 raising items. This imported selection contains 300020 but omits the period-attested 300072; selecting the largest imported number was therefore the wrong eligibility test. Preserve those source bytes and the old save's finite counts while correcting the runtime catalog boundary. Do not claim that 250 is the absolute maximum of every item, event, or game period.

| Purpose | Runtime ID | Retained original ID | Original name | Existing effect and limit |
| --- | --- | ---: | --- | --- |
| HP recovery | `item_potion_hp_250` | 300072 | `极限体力药剂` | Restore 250 HP, capped at the target's maximum HP. This is a fixed amount, not percentage healing or revival. Period evidence establishes actual use; the source configuration specifies `Max: 5`. Unlimited supply deliberately replaces that quantity restriction for eligible encounters. |
| PP recovery | `item_potion_pp_20` | 300018 | `高级活力药剂` | Add 20 PP to each equipped skill, capped independently at that skill's `maxPp`. The retained item has `each_skill: true`; the current engine selects every equipped skill when no explicit `skill` is supplied. Period reports establish actual acquisition and use of this named tier. |
| Status cure | `item_status_cure` | None | `异常解除剂` | Remove all conditions whose definition has `kind: 'status'`. Preserve stat stages and non-status conditions. This is an existing authored remake item. |

The complete imported recovery ladder is listed for auditability below. It is not an approval list; the 3000-HP and 40-PP rows are rejected for runtime use.

| Family | Runtime ID | Original ID | Original name | Recovery amount |
| --- | --- | ---: | --- | ---: |
| HP | `item_potion_hp_20` | 300011 | `初级体力药剂` | 20 HP |
| HP | `item_potion_hp_50` | 300012 | `中级体力药剂` | 50 HP |
| HP | `item_potion_hp_100` | 300013 | `高级体力药剂` | 100 HP |
| HP | `item_potion_hp_150` | 300014 | `超级体力药剂` | 150 HP |
| HP | `item_potion_hp_200` | 300015 | `特级体力药剂` | 200 HP |
| HP, excluded | `item_potion_hp_3000` | 300020 | `万能体力药剂` | 3000 HP in configuration only; classic playable availability unverified |
| HP | `item_potion_hp_hertz_150` | 300022 | `赫星体力药剂` | 150 HP |
| PP | `item_potion_pp_5` | 300016 | `初级活力药剂` | 5 PP per skill |
| PP | `item_potion_pp_10` | 300017 | `中级活力药剂` | 10 PP per skill |
| PP | `item_potion_pp_20` | 300018 | `高级活力药剂` | 20 PP per skill |
| PP, excluded | `item_potion_pp_40` | 300019 | `超级活力药剂` | 40 PP in configuration; classic playable availability unverified |
| PP | `item_potion_pp_hertz_10` | 300023 | `赫星活力药剂` | 10 PP per skill |

## Source boundaries

`data/README.md` attributes the recovered items to the client's item configuration and references `_build/build_items.py`, which is absent from the restored checkout. All 12 imported recovery entries carry `era: 'pre-2013'`, but this metadata alone does not prove their exact release dates, public availability, or historic PvP eligibility. Each PP item also retains an explicit note that its every-skill interpretation was recalled and needed confirmation. Keep that uncertainty in the historical data.

A [2010-10-02 first-person Puni battle report](https://news.4399.com/seer/jingyanxinde/201010-02-78409.html) names both peak and extreme HP potions in its preparation, describes using 250 HP recovery after taking 170 damage, and credits the extreme potion for completing the fight. This is direct period evidence of actual 250-HP use, including against Puni; do not describe the potion as usable exclusively in PvP. A [2011-02-14 guide](https://news.4399.com/seer/jingyanxinde/201102-14-86389.html) explicitly distinguishes ordinary 20/50/100/150/200 HP potions from peak-battle 200/250 HP potions. Consequently, 200 cannot be described as the classic maximum. A [same-day special HP potion guide](https://news.7k7k.com/content/20110214/62413.html) separately documents the 200-HP special potion and its original peak-battle restriction.

The retained source dump under `.cache/seer-data-a00bcdd/items.json` identifies 300072 as `极限体力药剂`, `HP: 250`, `Max: 5`. The independently located `/Users/zhuonismacbookair/code/scratch/codex/2026-10-14-seer-classic/analysis/seer-data-a00bcdd/itemsTip.json` explicitly associates 300072 with 250 HP and permission to use it in peak battles. These are current-client table snapshots retained at the project's source pin; their identities/effects corroborate the period prose but cannot supply a historical release date on their own.

| Record requiring a distinct boundary | Source finding | Decision |
| --- | --- | --- |
| 300020, `万能体力药剂` | The raw item row has `HP: 3000`, `Price: 999999999`, `Tradability: 0`, `VipTradability: 0`. Its tooltip says only that it restores 3000 HP. Neither file labels it unreleased or dates it. | Exclude from runtime use and unlimited supply. Public classic-period availability is unverified. The evidence does not establish whether it was unreleased, introduced later, or erroneously imported. Preserve the source row and legacy count without enabling it. |
| 300019, `超级活力药剂` | The raw row and tooltips specify 40 PP. The bounded 2010-2013 search found no actual acquisition or use evidence; a [2019-11-15 update table](https://news.7k7k.com/51seer/20191115-931542.html) lists this ID among later rewards. | Exclude from runtime use and unlimited supply; preserve its source row and legacy count. Do not claim it never existed or infer a release date from the earliest result found in this limited search. |
| 300078, `比巴卜高级体力药剂` | The raw row has `HP: 300`, `Max: 5`; its tooltip explicitly disallows peak-battle use. The [2012-08-03 Bibabu event guide](https://news.4399.com/gonglue/seer/saiergonglue/201208-01-183181.html) describes an event exchange, but its exchange screenshot could not be fetched in this audit. The prose does not identify the advanced potion or 300 HP. | Do not adopt it as the universal trainer supply or assert that its complete classic acquisition/use scope is verified. Its configured 300 HP is a reason to avoid an absolute all-item maximum claim for 250. |

The bounded search found no first-hand classic-period public-use evidence for 300020. A modern encyclopedia's unreleased annotation is not promoted to original-source proof. The corrected default remains the directly attested 250-HP potion, without a claim that every higher event-specific item has been disproved.

For PP, a [2010-06-02 first-person Puni report](https://news.7k7k.com/content/20100602/8151.html) describes the author's team exhausting 20 uses of Space Jump, using `高级活力药剂`, continuing the battle, and obtaining the seal fragment. A [2012-02-10 weekly Super NONO gift walkthrough](https://news.4399.com/gonglue/seer/saiergonglue/201202-08-141965_2.html) documents receiving five of that named potion. Use the displayed February 10 date, not February 8 embedded in the URL. A [2012-03-03 first-person Puni guide](https://news.4399.com/seer/jingyanxinde/201203-03-146357.html) separately prepares 99 advanced vitality potions and describes PP replenishment. These establish actual availability and use of the advanced tier before 2013, rather than merely its presence in a data table. The gift page's embedded image was inaccessible in this audit; the evidence used here is its dated walkthrough text, not a claimed visual inspection.

The exact 20-PP identity is corroborated by source item 300018 (`PP: 20`) and both corresponding tooltips, which specify 20 restored uses. The 2010 and 2012 reports establish named-tier availability but do not independently state the numeric recovery amount. A [2013-12-18 capture guide](https://jingyan.baidu.com/article/b907e627dfc2d946e7891cea.html) additionally instructs using one advanced vitality potion to refill the 20-use Soul Interference skill after exhaustion; this is supporting 2013 evidence, not a pre-2013 publication. A [2010-05-06 PP help entry](https://www.7k7k.com/content/20100506/52595.html) describes ordinary battle potions adding five uses to every skill, corroborating the general every-skill mechanism. The selected 20-PP supply has a substantially stronger classic availability basis than 40 PP, without claiming an exhaustive maximum over every event or later version.

The static catalog contains no status-cure consumable. At this audit point, `createGame` in `src/game.ts` adds `item_status_cure` to a controller-local item array with an explicit authored-remake source description. It has no `seer_id`. Moving that definition into a shared runtime module would not make it historical data. The existing cure removes status conditions, not arbitrary debuffs, stat changes, fainting, or every negative effect.

## Baseline item flow and required UI behavior

At the audit point, `src/game.ts` builds `ItemView` rows only from positive numeric inventory counts. During a battle, the source is `battle.sides[0].items`; otherwise it is `save.items`. `usableTargetUids` comes from the engine's legal item actions. `Battle.tsx` then filters by positive count and battle category, selects a living target, and enables confirmation only when that target is legal. The engine checks whether HP, PP, or status recovery can help; preserving that legality prevents wasting a turn on a fully restored target.

The baseline battle item card and inventory list/detail render numeric counts. Both surfaces need `∞` for the three supplied items only during eligible ongoing encounters, with a plain-language unlimited-supply explanation. The snapshot needs an explicit supply property or equivalent context; a display-only string replacement cannot grant a legal action when the saved count is zero.

At baseline, `Inventory.tsx` treats an item action as successful only when its numeric count decreases. Unlimited use therefore needs success evidence from an actual accepted battle action, such as an item-used event or an advanced action/animation revision. The unlimited flag alone must not declare a rejected action successful. `Battle.tsx` already compares animation revision to detect rejected commands and should keep that behavior.

At the audit point, both `turn()` and `settle()` copy the battle's item map into `save.items`. The shop also receives the current inventory map. Keep unlimited supply outside finite inventory accounting: do not persist JavaScript `Infinity`, a very large replacement count, or a synthetic grant as a player's owned stock. Entering, using supplies in, and leaving a trainer encounter must not increase or consume the saved count of its three supplied items. After the battle, the UI returns to actual inventory quantities. Shop stock and purchases continue to use finite owned quantities.

| Item group | Quantity policy |
| --- | --- |
| The three named supplies in eligible trainer/facility battles | Unlimited for both sides, available even at zero owned stock; ordinary target and item-effect rules still apply. |
| Lower-tier HP and PP potions | Retain their real inventory counts and existing consumption. Do not silently turn all battle items unlimited. |
| All seven capsule types | Retain real counts, capture legality, and capture consumption. Trainer creatures remain uncapturable. |
| All 32 raising items, including stat/level/nature tools, boosters, and energy beads | Retain real counts and existing outside-battle usage rules. |
| Runtime boss essences and fusion spirit beads | Retain real counts, hatching consumption, and existing ownership/reservation limits. |
| Any original boss or wild encounter | Retain existing owned-stock consumption and authored encounter restrictions; no unlimited supply. The global rejection of the unverified 3000-HP and 40-PP runtime definitions still applies. |

## Frozen implementation interface and validation boundary

The frozen interface in `src/progression/battle-supplies.ts` exports `TRAINER_UNLIMITED_ITEMS` with exactly `item_potion_hp_250`, `item_potion_pp_20`, and `item_status_cure`. `trainerBattleSupplies` requires the explicit encounter category `trainer`; it never infers eligibility from species. `normalizeBattleSupplyItems` removes the imported 3000-HP and 40-PP runtime definitions and creates the 250-HP definition with `trainer_supply_only: true`. The controller excludes that borrowed HP definition from new-save grants and shop listings, and rejects direct purchase requests. It does not clear legacy 3000-HP or 40-PP inventory counts or rewrite the source JSON.

The controller passes the same `unlimited_items` list to both sides of eligible encounters. The engine stores it as a `Set` separately from `items`, includes its entries in legal-action generation and snapshots, and skips count subtraction only for an entry in that set. `ItemView.unlimited` exposes the distinction to the UI without replacing finite `count` values. The battle card and inventory list/detail display `∞`; both use the flag when allowing zero-stock selection. Inventory success feedback additionally requires battle-turn advancement for an unlimited use. The controller removes the unlimited presentation after settlement, and the shop continues to read finite stock.

These are observed code paths, not a claim that all runtime/UI/AI checks have passed. The following remain the implementation report's acceptance conditions:

1. The three exact IDs are available to both sides in eligible trainer/facility battles even when finite inventory counts are zero; repeated uses do not decrement those counts.
2. Original bosses and wild encounters receive no unlimited supplies; capsules, lower-tier potions, raising items, and essence inventory keep their existing behavior. Historical item and boss JSON files remain unchanged.
3. HP restoration is fixed at 250 and capped, PP restoration adds 20 to each skill up to its own maximum, and status cure preserves stat stages and non-status conditions. None revives a fainted target. The 3000-HP and 40-PP imported entries are unavailable at runtime, including when a legacy save retains their numeric counts.
4. The battle UI and in-battle inventory display `∞`, permit legal zero-owned-stock use, report accepted use successfully, and reject unnecessary/invalid use. The shop and post-battle inventory show actual finite stock.
5. The opponent uses legal supplies in useful situations under the same supply rule. Specific decision witnesses, conservation/state checks, and regression results must come from the AI implementation review.

The source snapshot hashes are `80d8662b19119f37b7ea46a919f00b4d598315a615c5538ab745bbcefe3d1d3c` for `data/items.json` and `9bfeeaeab685a30d6f6c337f2d691942bec698e6018cf563541985301ec40865` for `data/gamedata.json`.

The full source dump `items.json` is 14,396,486 bytes with SHA-256 `c763efd129eff36f7a518c776c41b666475a0cb429352003299dfa87704a3198`; `itemsTip.json` is 1,130,150 bytes with SHA-256 `26b8c6f51fc3d99617f7113e34010a5589450e68c8fb8466208dd397c040636b`. The relevant source paths are `/Items/Cat/3/Item/17` for 300018, `/Items/Cat/3/Item/18` for 300019, `/Items/Cat/3/Item/19` for 300020, `/Items/Cat/3/Item/76` for 300072, and `/Items/Cat/3/Item/73` for 300078. Their tooltip paths are `/root/item/397` and `/root/item/398`, `/root/item/399` and `/root/item/400`, `/root/item/401` and `/root/item/402`, `/root/item/465`, and `/root/item/469`, respectively.
