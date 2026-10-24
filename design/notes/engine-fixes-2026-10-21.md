# Engine fixes: 先手权 after a switch or item, fire and ice status immunity (2026-10-21)

Status: current. Code: `battle/core/src/engine/turn.ts` (`resolveFullTurn`, `doAction`),
`battle/core/src/builtin-conditions.ts` (`STATUS_IMMUNE_TYPE`), `battle/core/src/engine/conditions.ts` (`typeImmune`,
`applyStatus`), `battle/ai/src/idle-moves.ts` (`statusLands`); rules: `battle/RULES.md` 3 (先手权) and 7 (type immunity);
checks: `battle/core/src/engine/engine.test.mjs`, `battle-ai`, `battle-observe-v58`.

These are engine fixes 1 (first half) and 2 of the user's decisions of 2026-10-21, taken after the two 赛学机制论 audits
(Bilibili readlist rl826604). The rule for both: install only mechanics of the 2009–2013 mainland era, and let period sources
beat modern articles. The other half of fix 1 (effects 40/30 double the damage, not the power) and fix 3 (evasion shields do
not stop 必中 moves) are separate changes.

## 1. 先手权: a move after the foe's switch, item or capsule is 先出手

**Decision** (user, 2026-10-21): "when the other side switches or uses an item that turn, our move counts as the FIRST
mover". Coordinator: if exactly one side chose a move, that side holds 先手权; if both did, the side whose move resolves first
(priority, then speed, then the coin flip).

**Before.** `orderActions` puts every non-move action (flee, capture, item, switch) ahead of the moves, player side first, and
`resolveFullTurn` passed `first = (k === 0)`, so `first` meant "resolved first". A move made after the foe's switch, item or
failed capsule therefore counted as 后出手: 冲撞-type moves (effect 30, 「后出手的话威力为2倍」) doubled and 疾风追击-type moves
(effect 40, 「先出手时威力为2倍」) did not.

**After.** `resolveFullTurn` computes `firstMover = order.find((i) => actions[i].kind === 'move') ?? order[0]` and passes
`i === firstMover`. The execution order is unchanged: non-move actions still resolve first and `b.turnOrder` stays the
execution order. No random number is added or removed.

**Sources.**
- 赛学机制论 必修9 先手权 (Bilibili cv34358166, 2024): 「通过切换，嗑药等操作放弃获得先手权时，会默认为后手方」.
- 必修2 判定流程表 (cv34338437): a switch or item gives up 先手权, then 必先 → 先制 → speed → a 50% tie, which is the order
  `orderActions` already uses.
- The modern BWIKI 对战机制: 「切换登场的精灵本回合无法出手且默认对手先出手」.
- No period (2009–2013) source either way. The templates 30 and 40 themselves are 2009 effects. RULES.md tags the rule as
  sourced with no period counter-evidence, by user decision.

**What reads the flag** (`MoveCtx.actedFirst`, counted in `data/skills.json`): 137 skills.
- 102 skills with `power_if` on the flag: 69 with effect 40 (×2 when 先出手) and 33 with effect 30 (×2 when 后出手).
- 28 skills with 29 `when: {acted_first}` effect ops (stat_stage 17, status 7, fixed_damage 5): templates 122, 173 and 405
  (先出手) and 147, 148, 186 and 402 (后出手).
- 7 skills with the scripts 73 (思维干涉), 116, 117, 138 (光之盾), 170 (圣光门), 172 and 196 (`battle/core/src/scripts/seer-tail.ts`).
- The journal's hit entries carry the same flag, and `battle/ai/src/observe.ts` passes it to the damage probe.

**Unchanged on purpose.** Whether a monster has acted yet this turn still follows the resolution order: status durations
(`appliedTurnFor`), 急速闪避 (effect 52, 28 skills, `lastActedTurn`), `seer_eff_39`, the streak counter. The `when.ts` fallback
`b.turnOrder[0] === c.self.side` is untouched: it feeds only read-only AI estimates made outside a move (for example
`estimateDamage` when a turn opens, where `turnOrder` is the previous turn's execution order); a real move always passes its
own flag. Studied and deferred on 2026-10-24: [boss-ai-engine-2026-10-24](boss-ai-engine-2026-10-24.md) section 4.

**Blast radius.**
- All 10 NPC trainers have `allow_switch`: on a turn where one switches, the player's lone move now holds 先手权.
  1 trainer (trainer_fusion_specialists) carries a 先手权 skill itself, for turns where the player switches or uses an item.
- 4 Boss encounters carry a 先手权 skill (洛拉斯克 and Brave Tower floors 57, 58 and 67); their move after the player's item
  or switch is now 先出手.
- Wild battles: after a failed capsule, the wild monster's move is now 先出手. A flee always succeeds and ends the battle, so no
  move follows it.
- 468 species can learn at least one of the 137 skills.

## 2. 火系免烧伤、冰系免冻伤 (with 草系免寄生)

**Decision** (user, 2026-10-21): fire types are immune to 烧伤 and ice types to 冻伤, by the same 2009 type-immunity logic
as 草系 immune to 寄生. Coordinator: a dual-type monster is immune when either of its types matches (as the 寄生 rule already
did), and one table serves the engine and the AI.

**Before.** `applyStatus` blocked only 寄生 on a grass type (reason `grass_immunity`, which nothing read), and
`idle-moves.ts` `statusLands` repeated the same grass/leech test for the Boss policy.

**After.** `STATUS_IMMUNE_TYPE = { leech: 'grass', burn: 'fire', freeze: 'ice' }` in `builtin-conditions.ts`;
`typeImmune(target, status)` in `conditions.ts` is the one test, used by `applyStatus` (reason `type_immunity`, at the same
place as before: ahead of `on_status_incoming`, the Boss immunity rules and `block_status` hooks, for every source, the
holder's own effects included) and by `statusLands`. The search planner sees the block through its simulation.

**Sources.**
- Period: the catalog text of 寄生种子 (20007): 「5回合吸取对方最大体力的1/8(对草系无效)」.
- 赛学扩展1 免控和远古异常 (Bilibili cv39757579, 2024): effect templates 10–16, 22, 94, 99, 103 and 114 (n%令对方m异常)
  「可以追溯到09年」, and 寄生、烧伤、冻伤 「多了一个额外条件：对方精灵属性为草系（对应寄生）、火系（对应烧伤）、冰系（对应冻伤）的时候，必定不会触发异常」.
- The 4399 status article of 2011-01-17 says nothing about type immunity, and the previous audit's searches found nothing
  dated 2009–2013. The audit rated the rule about 70% likely; the user approved it.

**Dual types (chosen).** No period source shows how the server matched dual types: the 2009 templates predate them
(2010-08, 拉诺 and 迪克). We follow the 寄生 rule, which `playtest-v18` BUG-001 already asserts for a water/grass monster, and
STAB, which also treats a dual monster as having each type. The counter-argument (the client's composite type ids would fail
an id-equality check, which is why 单属性 traits skip dual-type skills) concerns a skill's type, not a defender's, and is not
adopted.

**Covered and not covered.** 冰封 and 易燃 themselves are not type-blocked (no source). The 烧伤 that 易燃 inflicts on a fire
attack and the 冻伤 that replaces 冰封 when it ends go through `applyStatus` and are blocked; 冰封's speed −1 still applies.
Random-status scripts that roll 烧伤 or 冻伤 are blocked the same way. A blocked status draws no duration, so seeded battles
shift where a status is now refused.

**Blast radius.**
- 148 fire species (105 single, 43 dual: 火超 13, 电火 12, 战火 11, 火龙 6, 火飞 1) and 138 ice species (101 single,
  37 dual: 冰暗 12, 电冰 8, 超冰 6, 冰龙 6, 冰光 5).
- 129 skills inflict 烧伤 and 138 inflict 冻伤 through a `status` op; 醉酒燃烧 (21052) inflicts 易燃.
- 42 Boss encounters have a fire or ice member (Brave Tower 17, SPT 13, campaign 5, 暗黑武斗场 4, others 3), and 40 carry a
  move that inflicts 烧伤, 冻伤 or 易燃, which now misses fire or ice player monsters. Of the 10 NPC trainers, 8 have a fire or
  ice member and 6 carry such a move.
- Boss notes checked: none relies on burning a fire Boss or freezing an ice Boss. 劳克蒙德's 「烧伤/冻伤/中毒 work」 is on a
  fighting type; 亚伦斯 (psychic/ice) 「sleep and burn work」 stays true, and 冻伤 on it is now blocked by the dual-type rule.
  纳特's `status_on_attacker` burn no longer lands on a fire attacker.

## 3. battle-observe-v58: a neutrality check that survives rule changes

The suite's "journal is behaviour-neutral" check replayed 32 facility battles on the pre-journal engine loaded from Git
(1d7d3ce) and compared every turn. Any legitimate rule change since then makes those replays diverge (fix 1 on every switch
turn followed by a 先/后出手 skill, fix 2 wherever a fire or ice monster is burned or frozen), although the journal is still
neutral.

There is no real seam to run the current engine without its journal: it is always written, and a switch to turn it off would
be a test hook in production (AGENTS.md rule 5). The check now runs the current engine three times per battle:
- two ordinary runs must agree turn by turn (events, state, RNG draws) and journal the same entries;
- a run whose `journal` is a write-only stand-in (reading it throws) must agree with them and receive the same entries, so no
  rule reads the journal;
- in that run, no RNG draw and no event may come from inside a `journal.ts` function (stack test), with a positive control
  that the stack test sees those functions when they read hooks.

What it does not prove is that a journal function writes no other battle state; `journal.ts` reads only, by its contract.

The probe check of the same suite also changed: it compared every real hit with `probeDamage` called without `actedFirst`,
so the probe fell back to `b.turnOrder[0]`. That equalled the old flag but not 先手权 after a switch, and random/5801 failed.
It now probes both values and compares the one the journal entry records, as `observe.ts` does.
