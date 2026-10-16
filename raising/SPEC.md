# Seer Classic: Monster Raising Rules

Owner: the "Monster raising system" thread. Status: **v0.1**, implemented by
`raising/core/` (pure rules) and `raising/game/save.ts` (save file). Moves into
`packages/core` / `packages/game` when the repo exists (foundation.md section 2).

Confidence tags, same as `battle/RULES.md`:
**[sourced]** found in a Seer guide (links at the end), **[recalled]** from memory
of the game, **[chosen]** a remake decision where the original is unknown or
doesn't fit a single-player PvE game. Every number is a named constant, so a
wrong rule is a one-line change.

Scope is pre-2013 Seer: no 魂印, 特性, 套装 or 年费 bonuses. 刻印 bonuses are applied by the game adapter at battle time (`design/notes/engravings-2013.md`), not by these raising rules.

## 1. Stats (能力值)

```
体力 = floor((2*种族 + 个体 + floor(学习力/4)) * L / 100) + L + 10
其他 = floor((floor((2*种族 + 个体 + floor(学习力/4)) * L / 100) + 5) * 性格修正)
```

[sourced: 4399 2010 and 2011 guides; jiangshibiao PVE 百科 L100 form with HP offset
110 and 5 otherwise]. 性格修正 is 1.1 / 1.0 / 0.9 and never applies to HP [sourced].
Stats are always derived, never saved. Code: `core/stats.ts`
(`statValue`, `computeStatsFrom`, `computeStats`). The battle core imports this
same module, so raised stats and battle stats can't drift apart.

## 2. 学习力 (EVs)

- Max 255 per stat and 510 total [sourced]. 4 points = 1 stat point at L100
  [sourced], so 252 is the useful maximum for one stat.
- Gained by defeating a monster: its species' `ev_yield` [sourced]. Every
  participant that is still standing gets the full yield [chosen; Pokémon rule,
  Seer's own split is unknown].
- When the 510 cap cuts a gain short, stats fill in `hp, atk, def, spa, spd, spe`
  order [chosen].
- 学习力遗忘药剂 clears one or all stats [sourced item name]. Current HP shifts by
  the change in max HP, never fainting or healing the monster.

## 3. 个体值 and 潜力

### 3.1 个体值
One value per monster, 0–31, applied to every stat [sourced: guides solve a single
个体值 across all six stats; 31 is "满个体"]. New monsters (caught, hatched,
gifted) roll uniformly **1–31**; 0 only comes from a re-roll item [sourced: 4399
2016; uniform is chosen]. Bosses can fix it (`iv`).

Changing it:
- `iv_reroll` item: new random 0–31, level and 性格 kept [sourced: 天赋改造药剂].
- `iv_set` item: fixed value (for 满个体 boss rewards) [chosen].
- `restore` item (精灵还原药剂): back to level 1 with fresh 个体 and 性格 and no 学习力,
  same species and uid [sourced].

### 3.2 潜力 (display tier) [chosen]
The original's exact tier wording could not be confirmed, so these are remake
choices, stored in `data/potential.json` and easy to rename:

| 个体值 | 潜力 |
|---|---|
| 0–5 | 普通 |
| 6–12 | 一般 |
| 13–19 | 良好 |
| 20–25 | 优秀 |
| 26–30 | 卓越 |
| 31 | 完美 |

The UI may show the exact 个体值 next to the tier. Pre-2013 players needed a
calculator for it, which isn't worth recreating.

## 4. 性格 (natures)

25 natures, uniform 4% each [sourced], using Seer's names (保守, 固执, 胆小, 开朗 ...)
in `data/natures.json` (impish is 淘气, as in the 4399 2010 list). 20 change one stat ×1.1 and another ×0.9; 实干, 坦率, 认真,
害羞, 浮躁 are neutral (`plus` = `minus`).
Items: `nature_reroll` (random) and `nature_set` (a specific 性格转换剂) [chosen
item set; Seer had both kinds in some form].

## 5. EXP and levels

Level 1–100. `exp` in the save is EXP into the current level, like Seer's
"exp / 升级所需" bar.

### 5.1 Curves [sourced]
Seer used exactly four curves. Its published per-level tables (7k7k, 2010) are
exactly T(n+1) − T(n) of these cumulative curves; `tests/formulas.test.ts`
checks every level:

| id | Seer name (Lv100 row) | cumulative T(n) | total Lv1→100 |
|---|---|---|---|
| `medium` | 30301公式 | n³ | 999,999 |
| `slow` | 37876公式 | floor(5n³/4) | 1,249,999 |
| `medium_slow` | 33446公式 | floor(6n³/5 − 15n² + 100n − 140) | 1,059,914 |
| `fluctuating` | 59996公式 | n<15: n³(n+73)/150; n<36: n³(n+14)/50; else n³(n+64)/100, floored | 1,640,000 |

Catalog mapping from the client's `GrowthType` [inferred]: 0 → `medium`,
2 → `fluctuating`, 3 → `medium_slow`, 5 → `slow` (these line up with the
Pokémon index order the data copies), and **4 → `medium`**. GrowthType 4 is
Pokémon's "fast" slot (0.8n³) and covers ~70% of species including 雷伊, yet
the 2010 guide found only the four tables above. A curve that common would not
have been missed, so the game most likely ran type 4 on n³. If a Seer table with
a level-100 row of 24241 (0.8n³) ever turns up, add a `fast` curve and remap 4.

(The "公式" names are the table's level-100 row, which is not a real step since
level 100 is the cap.) `data/growth.json` carries the full `to_next` tables so no
consumer needs the formulas. `medium_slow` really does need *less* EXP for levels
2–4 than for level 1, as in the original.

### 5.2 Gaining EXP
- A defeated monster is worth `floor(exp_yield * level / 7)`, ×1.5 for a boss
  [chosen: Seer's exact formula is unknown; this is the Pokémon formula its data
  was modelled on].
- Split evenly among the participants still standing, floored, at least 1
  ["经验各分一半", sourced 2009 guide].
- Multi-level gains resolve in one call, emitting `level_up` per level.
- On level-up, current HP rises by the max HP gain [chosen].
- Optional `expMultiplier` for 双倍经验 style events [chosen].

### 5.3 积累经验 and the 经验分配器 [sourced concept, chosen details]
- EXP earned by a level-100 monster, and EXP past level 100, goes into the
  save's `exp_pool` instead of being lost.
- The 经验分配器 moves pool EXP into any monster. Only what the monster absorbs
  leaves the pool.
- Items: `exp {amount}` and `levels {amount}` (升级秘药). They refuse a level-100
  target. A negative `levels` is 降级秘药: never below level 1, keeps every learned
  skill and the species, resets the EXP bar.

### 5.4 Boosters and 能量珠 [chosen details]
- `boost {what: "exp"|"ev", multiplier, battles}` (双倍/三倍经验加速器, 学习力双倍仪):
  player-wide, multiplies battle EXP or 学习力 yields for the next `battles`
  battles. One of each kind at a time; using a second is refused, not wasted.
- `energy_bead {stats | crit_rate_add | damage_taken_and_dealt_multiplier, battles}`
  (能量珠): belongs to the monster it was used on, one per monster at a time.
  The raising core only stores and counts it (`activeBeads(save, uid)`); the
  battle engine applies the bonus.
- Both live in the save's `boosts` list and count down through `tickBoosts(save)`,
  which the game calls once after every battle, won, lost or fled.

## 6. Skills

- `learnset` entries fire on reaching their level. A new skill auto-equips if
  fewer than 4 are equipped; otherwise it goes to `learned` only [recalled].
- Outside battle the player can equip any 1–4 of `learned` at any time, like
  Seer's skill panel [recalled]. Nothing is ever forgotten.
- A new monster knows its learnset up to its level and equips the newest four
  [chosen].
- PP: equipped skills keep their PP across swaps; a newly equipped one starts
  full. `healAll` refills everything.

## 7. Evolution

- `level`: available once level ≥ `level`. After a battle, single-branch level
  evolutions without `automatic: false` happen **automatically**, chaining if several are due (a level-40
  种子 becomes 花) [recalled]. Branching species (several level entries) wait for
  the player's choice, even when only one branch has reached its required level.
  `applyBattleRewards(..., { autoEvolve: false })` turns
  this off. All 32 application special transitions use `automatic: false`;
  their level threshold enables explicit confirmation, never automatic conversion.
- `item`: available while the game passes that item; `special`: available when
  the game confirms the condition (by `script` id, else `condition` text).
- Evolving keeps uid, level, exp, 个体, 学习力, 性格, nickname, learned and equipped
  skills. The new form also learns its own learnset up to the current level
  (auto-equipping into free slots). HP shifts by the change in max HP [chosen].
- Optional `skinSpecies` is cosmetic. The application validates it against the
  current species and its directed ancestors; it never changes battle or raising
  identity. Evolution retains a still-valid ancestor skin, and same-species
  restoration retains it. Absent or invalid skins use the current appearance.
  Sibling branches and descendants are not valid ancestor skins.

## 8. Party, box and healing

- 背包 (party): 1–6 ordered monsters, the first is sent out first. 精灵仓库 (box):
  everything else, up to 1000 [chosen].
- A newly obtained monster joins the party if there is room, else the box.
- Deposit, withdraw, swap a party slot with a box monster, reorder, rename (≤12
  characters), 放生 (release). The last party monster can't be deposited or
  released.
- 精灵恢复舱: `healAll` restores HP, PP and status for free [chosen; Seer charged
  赛尔豆 without 超能NoNo, which has no meaning here].

## 8.1 Boss 精元
A boss reward is a 精元 item (`kind: "essence"`, `hatches: species`, see
foundation 7). `hatchEssence` consumes one and hatches the monster at level 1
with a fresh 1–31 个体 and random 性格, into the party or the box if full.

## 9. Save file

Shape: foundation.md 6.2. `raising/game/save.ts`:
`newSave(seed)`, `serialize`, `deserialize(text, dex)` (parse, migrate, then
validate), `validateSave`, `migrate` with a per-version migration table.
Validation checks ranges (level, 个体, 学习力 caps, exp within level), equipped
⊆ learned, 1–4 equipped, party ⊆ storage, unique uids, and with a Dex that every
species, nature and skill exists. `rng_state` is the sfc32 four-word state
shared with the battle core. The app only moves strings; the medium (file,
IndexedDB, Tauri fs) is the app's choice.

## 10. Raising items (`kind: "raising"`, `raising_effect`)

| op | fields | effect |
|---|---|---|
| `exp` | `amount` | add EXP (overflow past 100 → pool) |
| `levels` | `amount` | add levels (升级秘药) |
| `ev_add` | `evs` | add 学习力 within caps |
| `ev_reset` | `stats?` | 学习力遗忘药剂 |
| `iv_reroll` | | new random 个体 |
| `iv_set` | `iv` | fixed 个体 |
| `nature_reroll` | | random 性格 |
| `nature_set` | `nature` | chosen 性格 |
| `restore` | | 精灵还原药剂 |
| `boost` | `what`, `multiplier`, `battles` | 经验加速器 / 学习力双倍仪 (5.4) |
| `energy_bead` | `stats` or `crit_rate_add` or `damage_taken_and_dealt_multiplier`, `battles` | 能量珠 (5.4) |

`useRaisingItem(save, uid, item, dex, rng)` applies one and consumes it.

## 11. Code map

```
core/types.ts      shared shapes (Monster, Save, Species, events)
core/stats.ts      stat formula and caps (also used by battle core)
core/growth.ts     4 EXP curves
core/potential.ts  潜力 tiers
core/monster.ts    create, 学习力, 个体, 性格, EXP/levels, skills, evolution
core/rewards.ts    after-battle EXP/学习力 split, exp pool, 经验分配器
core/storage.ts    party/box, release, rename, heal, 精元 hatching
core/items.ts      raising items, boosters, 能量珠, tickBoosts
core/dex.ts        Dex from parsed data files
core/rng.ts        re-exports battle core's sfc32 Rng
game/save.ts       save create/validate/migrate/serialise
tools/build-data.ts  writes data/natures.json, growth.json, potential.json
tests/             node:test suites (npm test)
```

Every rule function is pure: it returns a new object plus an ordered list of
`RaisingEvent`s for the UI to animate.

## 12. Open questions

- 潜力 tier wording (3.2): if Johnny remembers the original wording, it's a data edit.
- GrowthType 4 → `medium` is inferred (5.1).
- Seer's own battle EXP formula and how 学习力 was shared (5.2, 2).
- Whether any pre-2013 evolutions could be declined; currently automatic.

## Sources

- 4399, 赛尔号努力值个体值种族值详解 (2010): news.4399.com/seer/jingyanxinde/201001-20-63697.html
- 4399, 个体值、种族值计算方法 (2011): news.4399.com/seer/jingyanxinde/201103-07-88480.html
- 4399, 精灵个体值是什么 (2016, items): news.4399.com/seer/xinshouzhinan/201601-12-592620.html
- 4399, 五大数值 (2015, 510 cap): news.4399.com/seer/xinshouzhinan/201511-12-572474.html
- 7k7k, 精灵满级要多少经验 (2010, EXP tables): news.7k7k.com/content/20101022/16574.html
- 4399, 刷经验升级秘籍 (2009, EXP split): news.4399.com/seer/jingyanxinde/200912-01-53419.html
- jiangshibiao, 赛尔号 PVE 百科全书: jiangshibiao.github.io/Summary-of-Game-Mechanism-in-Seer/
- BWIKI 培养机制 (255 cap, 性格 4%): wiki.biligame.com/seer/培养机制
