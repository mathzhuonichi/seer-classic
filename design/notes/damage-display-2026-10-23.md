# Damage display: one number per move and creature (2026-10-23)

Status: current. It replaces the one-number-per-hit display of [handoff-2026-10-20](handoff-2026-10-20.md) item 2; the stacking rows and the number's style stay.

## Decision

The timing study for the original skill effects ([skill-effects-seamless-2026-10-22](skill-effects-seamless-2026-10-22.md)) found that the original fight module drew the damage number and moved the HP bar only when the effect ended, while the remake shows them with the target's hurt. The user's decision on 2026-10-23, verbatim:

> 就现在这样，但可以延长伤害显示时间，并且把多段伤害、额外伤害显示在一起，只有其他特殊的状态伤害是单独结算

- Keep the current timing: the number and the HP bar come with the target's hurt.
- The number may stay on screen longer.
- A move's multi-hit damage and its extra damage are one display for that move on that target.
- Only the other special status damage (statuses and similar effects that settle on their own, such as poison or burn at the turn's end) is still shown separately.

## The original

Read from the decompiled PetFightDLL_201308 (`UseSkillController`, `AttackValue`, `RemainHpManager`, `BaseFighterPropView`) and the pre-2013 module, which follows the same rules:

- **One number per move.** The server sends one `lostHP` per move (with `atkTimes`, 0 for a miss, and one crit flag). Each hit frame of the effect (`hit=1`) only plays the target's hurt; the number and the one HP-bar update come when the effect ends (`isEnd`). There is no per-hit or per-rider field: fixed and percentage extra damage of the move is inside `lostHP`.
- **Look.** 方正综艺 43 bold, dark red with a yellow glow, `-N` with a 克制/微弱/无效 prefix; `MISS` for a miss, no text for a status move that does 0. A crit draws a flaming digit picture instead.
- **Lifetime.** It rises 15 px in 0.5 s, holds, and is removed at 1.5 s with no fade; the next move waits for that timer.
- **Status and turn-end damage** got no number per status. After both moves, `RemainHpManager` showed each pet's net HP change of the round as one magenta number at its usual damage spot, without holding up the next round.
- **Separate attacks.** Only 追击 follow-ups and the 合体 second strike had numbers of their own, each after its own animation.

## The rule

**Tallies** (`src/features/battle/battle-damage-tally.ts`). Within one dispatch's events, a move runs from its `move_used` until the next action, entry, tick or turn end (`turn_start`, `turn_end`, `item_used`, `capture_attempt`, `switch_out`, `switch_in`, `condition_tick`, `cant_act`, `no_target`, `flee`, `battle_end`). Inside a move, every `damage` event without a `status` joins the open tally of its creature (side and slot):

- on the target: every hit of a multi-hit move and the move's riders (`fixed_damage`, `pct_damage`, `ohko`, script riders through `hitFoe`, the `cond_bonus_fixed_*` buffs that deal their rider through an `on_hit` hook with skill 0, a forced execution);
- on the user, as its own tally: recoil, self costs and the counters the move draws (Boss `reflect_damage`, `cond_counter_1_k` such as 反击风暴, 思维干涉, 光之盾, 反射).

A `heal`, `revive`, `faint`, `transform` or `max_hp_changed` of the creature closes its tally, so a Boss's full heal, a life or a phase between two hits starts a new number. Status damage, damage after `turn_end`, at a turn's start, at an entry or from an item is a tally of one event.

**Engine marker.** A Boss's turn-end drain (`drain_each_turn`) or a 黑水吸附 tick comes straight after that Boss's own move damage, with the same source and nothing between; the `cond_bonus_fixed_*` riders carry skill 0. So neither the source nor the skill can tell a rider from turn-end damage. The engine now emits a textless `turn_end { turn }` at the top of `endOfTurn` (battle/RULES.md section 8). It changes no rule, draw or result.

**Frames.** Every hit keeps its frame, its hurt clip and its HP-bar step, so the turn is exactly as long as before. A hit frame's `amount` is its tally's running total of `amount + overkill`, and a later frame of the tally names the first in `numberId`. `critical` stays the hit's own (its impact, the 致命一击 popup and the 800 ms hold). The tally's last frame carries the line of the total (`布布花受到 93 点伤害。剩余体力 7/100。`, with 致命一击 when any hit was critical); earlier frames carry none, so the move's line stays on screen while the hits land.

**The number.** It appears with the first hurt and counts up in place with each later one: it keeps its row, turns critical when any hit was, and is drawn again with a short swell. `DAMAGE_NUMBER_MS` (src/features/battle/battle-playback.ts) is 4000 ms from the number's last change, up from 3000 ms: the user asked for longer numbers and then chose 4 s over the first version's 4.5 s (2026-10-23); the original's 1.5 s is shorter than what the user asked for, so it does not set the value. Numbers never hold a frame. Other numbers on the same creature (a status tick, the next move) take the next free row, up to `DAMAGE_NUMBER_ROWS`. A hit that changes neither the amount nor the critical style (a 0-damage hit into an HP floor or a damage cap of 0) leaves the number as it is: it does not swell, and its time does not start again.

**A number stays on its creature.** Each number records the creature it is on (`FloatingNumber.uid`, src/features/battle/battle-player.ts). When another creature of its side enters (a switch frame), the numbers of the one it replaced leave with it, so the creature that comes in never shows the other's number and its own first number takes row 0. A transform is the same creature and keeps its numbers. Without this, the longer time kept a departed creature's number over its replacement for up to 2.6 s instead of 0.5–0.9 s (a 巴鲁斯 that switched out at once after taking −7, a 布布花 that fainted on recoil).

**The HP bar** keeps stepping down with each hurt. At every frame the number is the damage shown so far and the bar the HP left after it, so they never disagree; the lethal hit's overkill is in the number, and the bar stops at 0. Drain, leech, recoil, rewards and the journal keep the engine's real HP loss.

**The log** writes one line per tally, where its first damage came, with the total and the HP left after the last (`巴鲁斯使用了三连击。　布布花受到 93 点伤害。剩余体力 7/100。`). So the move's consequences, such as 致命一击破防 or a drain, read after its damage. `turn_end` opens no log entry: the turn end's lines before any tick (a condition running out, a Boss's drain or regeneration, stage changes) join the last move's entry, as they did before the marker, and a condition tick opens its own as before. The first version of this change let `turn_end` open an entry; since the dialogue's recent log shows the last two entries, that left a move of the turn out of it in 140 of 1047 swept turns (13.4%, against 75 or 7.2% before), often the player's own damage total, so it was taken back. The tallies close at `turn_end` on their own and do not need the log entry.

## Kept apart from the original on purpose

- Status and turn-end damage show one number and one line per event, as before, not one net number per pet per round.
- The number comes with the first hurt and counts up, instead of appearing once at the effect's end (the user kept the current timing).
- A life, a full heal or a phase between two hits of one move splits its damage on that target into several numbers and lines (a 3-hit move into a Boss with two lives shows −41, −42 and −45), so that the number never runs past what the HP bar shows. This is the one exception to one number per move and target; the user kept it when asked (2026-10-23).

## Checks

- Unit tests: `battle-damage-tally.test.mjs` (a multi-hit, a rider with a crit and a line between, recoil, counters interleaved with the hits, a status tick and a Boss drain after its own move, turn-end damage before any tick joining the last move's log entry as its own number, a lethal multi-hit with overkill, a missed multi-hit and a blocked hit, a life and a heal between hits); `battle-player.test.mjs` (one number counting 30, 61, 93 in one row, timed from the last hit, critical kept, a replayed tally changes nothing, 0-damage hits leave the number and its time alone, a creature entering takes the place of the numbers on the one it replaced while a transform keeps them); `engine.test.mjs` (`turn_end` after both moves, before the status damage).
- Suites: `damage-presentation` adds a lethal multi-hit capped at 3 per hit (3, 6, 9 against 7 HP, one line, the drain heals 7); `trainer-hp-visibility-v58` reads only the hits that carry a line. These gates pass with the change: architecture, battle-commands, battle-display-lifecycle, battle-turn-latency, battle-v3, boss-rules-v56, classic-damage, damage-presentation, game-v3, npc-training-v45, skill-atknum-v45, trainer-hp-visibility-v58, trainer-ko-priority-v57, battle-prepare-replay and battle-clone-fidelity-v58. The `needs-browser` suites battle-skill-effects (9 checks) and browser-regressions (56 checks) pass in Chrome and WebKit.
- In the built app, silent, in Chrome and Playwright WebKit (巨镰鸟 against the first wild 皮皮, 20 HP), with the same results in both: at Lv 8, 乱突's two hits counted one number from −5 to −10 while the bar went to 10/20, with the one line 皮皮受到 10 点伤害。剩余体力 10/20。; at Lv 2, 空气切裂's hit and its 60-point rider counted one number from −7 to −67 while the bar went to 0/20, with the one line 皮皮受到 67 点伤害。剩余体力 0/20。. No page or console errors.
- After the independent check (numbers leave with their creature, 0-damage hits leave the number alone, `turn_end` opens no log entry): typecheck, `npm test` (230 tests), the gates listed above and the `needs-browser` suites battle-skill-effects (9 checks) and browser-regressions (56 checks) pass. In the built app in headless, muted Chrome against Boss 肯佩德 (巴鲁斯 with 乱突, then 布布花), the −7 on 巴鲁斯 is gone the moment 布布花 enters and her own −153 takes row 0; the −32 on the fainted 布布花 is gone when 巴鲁斯 comes back. Against 阿克希亚, 巴洛卡's −172 no longer shows over 魔花仙子. Before, those numbers stayed 2.1 s, 2.6 s and 1.4 s. No page or console errors.

## Open points

- With a reflecting Boss or a counter buff, a multi-hit move's hits alternate with the counters on the attacker, so no hit is followed by a hit on the same creature: each hit holds `FRAME_MS.hit` and hits 2..n land after the attacker's clip has gone home. This timing predates the change; the tallies could let `planBattleFrame` treat them as follow-up hits, but that shortens those turns.
- A blocked or protected hit inside a multi-hit move still has its own 抵挡了这次伤害。 line.
- A line that comes between a tally's hits (卡布尔获得每回合附加50点固定伤害效果 between 刺身撞击's hit and its 50 rider) reads before the total in the dialogue, since the total is on the tally's last frame, and after it in the log, which writes the total where the first damage came. Moving the log's total to the last damage would match them but put 致命一击破防 before the total; it is left as it is.
- A turn with a condition tick at its end (poison, burn) still shows the second move and the tick in the dialogue's two recent entries, as before this change.
