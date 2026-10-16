# Classic engraving integration and elite recovery policy

Revision 49 integrates Claude's completed engraving work from commit `dfd3ae0` into the current V48 source. The installed set has 546 old-style engravings (147 ability and 399 skill); original species, level and learned-move gates apply. The laboratory shop provides free individual copies with original ownership caps, and every monster has one ability slot and one skill slot. The retained source scope, twelve later reconstructions, three corrected move bindings and one date-boundary row remain explicit in [the engraving source note](engravings-2013.md). The third universal slot and fifth skills are not enabled.

## Elite builds and AI

The pool still contains the same 124 species. Direct self-recovery with no other positive tactical effect is excluded from elite automatic and authored loadouts, including full recovery with self-fatigue. Drain attacks, regeneration and recovery combined with other useful effects remain eligible. This is the requested build policy; it is not a claim that a 250-HP item strictly dominates percentage healing or priority recovery at every HP total.

| Species | Removed | Replacement |
| --- | --- | --- |
| 盖亚 (261) | 神经修复 (20309) | 日月皆伤 (10714) |
| 谱尼 (300) | 轮回 (20607) | 灵魂干涉 (20499) |
| 丽莎布布 (303) | 光合作用 (20009) | 花草护体 (20503) |
| 布莱卡恩 (573) | 暴食 (20590) | 暗影之怒 (20712) |
| 库洛卡 (579) | 暴食 (20590) | 暴走能量 (20721) |
| 哈尔克 (912) | 栖息 (20027) | 翱翔之翼 (21126) |
| 迪诺恩 (927) | 浴火重生 (20116) | 空烈闪 (10254) |
| 阿洛比斯 (1120) | 永恒之躯 (21373) | 黑暗祈祷 (21375) |
| 巨石灵王 (1121) | 永恒之躯 (21373) | 黑暗祈祷 (21375) |
| 哈德罗卡 (1428) | 能量吸收 (20034) | 绿色护盾 (20462) |

The 1,479 ordinary random builds, ten classic-team loadouts and original Boss definitions are unchanged. The three previously retained engraving-dependent candidate designs are not automatically added to the pool by this integration.

All own-team skill lookups in tactical planning now use the holder's overrides, including power bonuses, accuracy, priority, effects and PP costs. Public-opponent projections continue to use public information and observed catalog moves, without inspecting hidden opposing engravings. A trainer avoids redundant recovery only when a legal unlimited item covers the actual useful recovery; priority, larger healing, combined effects and item-interception exceptions remain.

## Persistent resources

The imported implementation clipped negative base-scale HP/PP during settlement. A surviving holder at 31 engraved HP could re-enter at 61; a skill with four remaining bonus PP could restart with five. `game.modules[uid].engravingDeficit` now retains the spent bonus that cannot fit in nonnegative base save fields. It belongs to the individual, with PP keyed by skill. Reloading, removing/replacing equipment, and temporarily losing eligibility preserve this state. An inactive bonus does not reduce base resources. Recovery clears the shortfall; real partial and full recovery with a smaller HP engraving survives settlement exactly. Fainted monsters stay fainted.

## Interface

The shop and PetBag reuse the recovered official mark symbol, empty-slot frame, tabs and panels. The ability page puts two compact equipment controls above the stat table and offers explicit unequip buttons. The table separates base values, active engraving additions and their sum; the displayed HP stat is a maximum. Outside-battle HP retains a clearly labeled base scale. Stock, equipped copies, caps and replacement effects remain visible in the shop. This adapts recovered official artwork and does not claim a pixel-exact reconstruction of a single historical engraving window.

## Verification

- Original engraving suite: 11 checks, including every installed row, all 399 structural skill transforms, representative live effects and stock/slot gates.
- Independent integration boundaries: 15 checks covering HP/PP across battles and reloads, equipment inactivity, smaller-mark recovery, holder isolation, fainting and unlimited medicine.
- Elite recovery and engraved AI: 15 checks, including all 124 builds, 399 own-override lookups and hidden-information guards.
- Elite roster: 29 checks; basic tactical AI: 39 checks and 120 trainer decisions; switching: 15 checks, with zero return switches in its twelve fixed battles.
- Supplies: 18 checks; potion AI: 19 checks and fourteen complete battles; holder ownership: 13 checks; Boss/support: 18 checks with no changed original Boss loadout.
- TypeScript and whitespace validation pass. Browser acceptance uses only the isolated port-1438 synthetic save; the user's port-1432 browser/save is not used.

Browser checks at 1280 x 720 and 640 x 480 verify buying, both equipment slots, unequip/return/re-equip, stock feedback, image loading and scroll access. The final two-slot block is 83 pixels high at normal size, with four stat rows initially visible; the learning-value save controls scroll with the form. No browser warnings or errors were recorded. The existing port-1432 server was read-only checked to serve the current engraving module, resource persistence and final CSS.

Generated evidence is under `artifacts/engraving-integration-v49/`, `artifacts/elite-recovery-v49/` and the existing focused suite directories. The structural check of 399 transforms is not an individual historical and live-battle certification of every effect. The generic transform extension retains opaque skill overrides; no current catalog skill or encounter invokes that operation. Synthesis (20009) currently runs its direct 50% recovery plus effect 201's one-third recovery; both effect entries occur in the archived 2013 client table, but their historical battle-mode conditions remain unresolved. This revision removes that move from elite builds without silently changing the global skill definition.

No production build, distribution package or remote push is part of this revision.
