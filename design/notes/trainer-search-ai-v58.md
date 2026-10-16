# V58 trainer AI: engine-simulated search (design)

**Status:** design agreed in principle on 2026-10-16; implementation not started. Section 10 lists the remaining open details. This note supersedes `BATTLE-AI-REDESIGN-HANDOFF.md` and replaces the approach of `trainer-ko-priority-v57.md`.

## 1. Decisions

The user decided the following on 2026-10-16.

1. **Architecture: engine-simulated search.** Candidate actions are evaluated by running the real battle engine on isolated copies of the battle. The hand-written damage approximation, the V57 knockout tier, the flat per-stage scores and the 0.35 "foe acts first" multiplier in `battle/core/src/tactics.ts` are retired rather than patched.
2. **Opponent model: mixed-strategy Nash equilibrium.** Both sides choose simultaneously, so each decision is a small zero-sum matrix game. The AI plays the equilibrium mix of its actions against the player's modeled responses.
3. **Revealed information supplements the reference model.**
   - Observed moves are certain.
   - Announced passives and conditions are applied as visible state.
   - Stats observed in battle override the reference estimate (section 2.2).
4. **Evaluation: one function with small per-style adjustments.** The existing `offense`, `control` and `attrition` styles tune a few coefficients only.
5. **Opposing HP: bar visible, numbers hidden until computable.** In simulated-player (trainer) battles both sides see the opposing HP bar but not its HP numbers. Damage and heal numbers are always visible to both sides. One hit, its damage number together with the bar's change, determines the exact HP. The AI therefore uses the bar ratio × baseline maximum HP until the opposing individual has been damaged once, and its exact HP from then on (2.3). Boss and wild battles keep showing HP numbers.
6. **Player switches and items are not modeled as responses.** When the AI sets up, the player healing or switching normally favors the side that set up, so modeling them is not worth the cost.
7. **Elite builds model every player monster**, in all three facilities (section 3).
8. **Medicine limit.** The AI may not use HP-restoring medicine on six consecutive turns (section 5.1). Otherwise medicine is an ordinary candidate: repeated healing without progress earns nothing in the search, so no separate progress rule is kept.
9. **Sacrifice skills get their own valuation**, because they are often very strong (section 7). This covers inheritance (`传承` family) and self-KO bursts.
10. **No difficulty tiers.** All trainers use full strength.
11. **Rollout horizon `H = 2`.**

**Scope is unchanged.** The redesign covers trainer encounters, which today means the three battle facilities (`random`, `elite`, `classic`). Bosses keep `legacy-ai.ts`, and wild encounters are not touched.

**Feasibility was measured before the decision:**
- Corpus: 40 random-facility battles on real game data.
- Probe: deep-clone the battle, then resolve one turn on the clone. The clone shares `data`, `scripts`, condition `def`, `species` and `encounter` with the original.
- Result: 9,452 probes averaging 0.09 ms each, with no errors and no change to the original battle state.

## 2. Information contract

### 2.1 What the AI knows

- **The AI's own side is fully known:** exact stats, skills, PP, passives, conditions, reserves and items. This includes the exact damage its own monsters take.
- **The player's active monster is modeled** as follows:

| Aspect | Source |
| --- | --- |
| Species, types, level | Visible actual values. |
| Baseline stats | Neutral nature, no trait, IV 31, EV 85 in every stat (the 510 budget split evenly; `floor(85/4) = 21` is kept): `computeStats(base, level, 31, {hp:85,atk:85,def:85,spa:85,spd:85,spe:85})`. |
| Effective stats | The baseline, refined by observation (2.2). |
| Maximum and current HP | Bar ratio × baseline maximum HP before the first hit; exact afterwards (2.3). |
| Stages | Visible stages. |
| Conditions | Status icons, plus conditions announced by `condition_added`, `condition_refreshed` or `status_applied` events while this individual was active. Unannounced traits, beads and engravings are absent. |
| Moves | Section 3. |
| PP | Each modeled move starts at its catalog maximum, minus observed uses × PP cost. |

- **Player reserves:** only individuals that have already appeared are known, and they use the same model. Unrevealed reserves do not exist in the planning world.
- **Never read:**
  - the player's actual IVs, EVs, nature, trait, equipped skills, remaining PP, inventory, unrevealed reserves or pending command;
  - the exact HP or maximum HP of a player individual that has not yet taken visible damage.

### 2.2 Observation filter and stat refinement

The engine's events are not a public record. For example, `damage` events carry `hp`, `maxHp` and `amount` for both sides. The planner therefore reads the battle only through `publicObservations(battle, viewerSide)`.

For each player-side event, the filter keeps what the battle screen shows:
- the displayed damage (`amount + overkill`, as `displayedDamage` in `src/presentation/battle-log.ts`);
- the heal amount;
- the HP bar ratio;
- crit, effectiveness, skill and move order;
- faint.

Absolute `hp` and `maxHp` pass through only for an individual that has already taken visible damage (2.3).

Observations refine the baseline. **Observed evidence outranks the baseline estimate.** Each player individual carries an interval `[lo, hi]` for each refined quantity. The interval starts unbounded and is intersected with every usable observation.

| Quantity | Evidence | How it is used |
| --- | --- | --- |
| **Speed** | A turn where both sides used moves with equal known priority. | Foe first ⇒ its effective speed ≥ ours; a tie is possible only at equality, so bound with `≥`. Foe second ⇒ effective speed ≤ ours. Divide by the visible stage multiplier to bound the raw stat. Turns with differing priority, item use or switching give no evidence. |
| **Attack / special attack** | A foe attack hits one of the AI's monsters. The AI knows the exact damage taken. | The known inputs are the AI monster's exact defense, stages and passives, plus the skill's power, effectiveness, STAB and crit flag. The 217–255 roll leaves a range, which yields an interval for the foe's effective attacking stat. |
| **Defense / special defense** | An AI attack hits the foe, and its displayed damage is visible. | The known inputs are the AI's exact attack, the power, STAB, effectiveness, crit flag and roll range. Together with the displayed damage, they yield an interval for the foe's effective `def` or `spd`. |

Rules for using evidence:

- **Effective, not raw.** Inferred values are effective. A hidden damage-boosting trait or damage-reducing engraving is absorbed into the inferred attack or bulk. That is the intended outcome: the AI adapts to what the monster actually does without learning why.
- **Inversion uses the engine.** Intervals are found by binary search over a candidate stat. Each probe calls the engine's own damage routine with a fixed roll, so the second formula that the handoff ruled out never appears.
- **Usable observations only.** These are skipped:
  - hits whose damage depends on scripts the planner cannot reproduce (`power`, `modifyDamage`, `finalDamage` or `defense` entries);
  - fixed and percentage components, which carry their own `kind`, so only `kind: 'attack'` hits count;
  - turns where unannounced hooks on the AI's own side could have altered the hit.
  Multi-hit moves give one observation per hit.
- **Combination.** The effective value is the baseline clamped into the interval. If observations conflict (an empty intersection), keep the interval from the most recent observations and record the conflict in the explanation.
- **Scope.** Refinement belongs to the individual, keyed by side and slot. It survives switching out and back in, and resets on a `transform` event.
- **Stages are visible**, so evidence is always normalized to stage 0 before it is stored.

### 2.3 Remaining HP

HP knowledge is per individual and has two states:

- **Before the first visible damage:** current HP = the HP bar ratio × the baseline maximum HP. This covers an individual that entered injured.
- **After any visible damage** (a `damage` event with displayed amount > 0, of any kind): a damage number and the bar change together determine HP, as they do for a human player. The planner uses the individual's exact `hp` and `maxHp` from then on, including after it switches out and back in.

Exact maximum HP does not reveal a stat build to the stat refinement in 2.2. Refinement continues to use only the evidence listed there.

## 3. Conventional moveset resolution

Every player monster is modeled with the **elite build** in every facility. This applies to the model only; how the random arena generates its own NPC teams does not change.

```text
conventionalMoves(species) -> ordered list of 4 skill ids
    elite-roster build if present
    else ordinaryMember(species, eliteSkillEligible)
```

`ordinaryMember` and `eliteMember` in `src/progression/battle-facilities.ts` are already deterministic. Extract them so the planner can call them without constructing an encounter. Fixed trainer teams under `data/trainers/` are builds of those NPC teams; they are not species conventions and are not used.

The list order is the selection order: best attack, coverage attack, priority attack, support, then fill.

**Merging with observation:**
- The modeled moves are the observed moves, then conventional moves not yet observed (in list order), until there are four.
- A `transform` event clears the observation set for that slot.
- A species with fewer than four legal moves uses what exists. A species with none uses one typed power-80 attack per type, and the case is logged.

## 4. Planning world

For each decision, build one planning world:

1. Deep-clone the battle, sharing the immutable references (`data`, `scripts`, condition `def`, `species`, `encounter`).
2. Replace side 0's team with model monsters (section 2): the active monster and revealed reserves only. Empty `side.items`, because the player's inventory is unknown.
3. Remove `pending` actions, clear the planning log, and mark both sides as AI-driven inside the world so that the engine never asks for input.

Hidden-information safety is structural: nothing from the real side-0 objects is copied except fields that pass the observation filter.

## 5. One decision

### 5.1 Candidates

**AI actions** are all legal actions from `battle.legalActions(1)`: moves, items and voluntary switches. These legality filters apply:

- forced skill and support fallback, as now;
- **medicine limit:** if the AI used an HP-restoring item on each of its previous five turns, HP-restoring items are not candidates this turn. Any other action resets the count. PP and status-cure items are not counted.

**Player responses** are the modeled moves with PP > 0.

### 5.2 Payoff matrix

For each pair (AI action `a`, player response `r`), take `K` samples:

1. Clone the planning world and give it a sample seed.
2. Submit `a` and `r`, and call `resolveTurn()`.
3. **Rollout.** Continue for `H` more turns with the rollout policy (5.3). Stop early if the player's active monster faints; its replacement is unknown.
4. Score the final state with `evaluate` (section 6).

`M[a][r]` is the mean score over the samples.

**Seeds.** Sample seeds are derived by hashing `battle.rng.s`, the turn number, `a`, `r` and the sample index. Planning never draws from the real `battle.rng`.

### 5.3 Rollout policy

Both sides use the same cheap policy; it runs no search of its own.

- **Attack choice.** If an attack's minimum non-critical damage from `estimateDamage` knocks out the opposing active monster and the user acts first, use it. Otherwise use the move with the highest expected damage × accuracy.
- **AI-side replacement.** Pick the reserve with the best one-turn damage race against the opposing active monster. Sacrifice successors are the exception and follow section 7.

### 5.4 Choosing the action

Solve the zero-sum game `max_x min_r Σ_a x_a M[a][r]` with a small deterministic LP or a fixed-iteration regret-matching loop. Matrices are at most about 15 × 4.

- Drop actions whose equilibrium weight is below `ε = 0.05`, then renormalize. This removes mixing that sampling noise alone causes.
- Draw the action with **one** `battle.rng.next()`, so replays stay deterministic.
- If one action weakly dominates all others within noise, play it directly.

### 5.5 Explanation record

Each decision records:
- the modeled opponent: stats with their evidence intervals, moves and PP;
- the payoff matrix and the equilibrium;
- the drawn action and the budget used.

The record serves debugging and verification and is not shown to the player.

## 6. Evaluation

Scores are from the AI's perspective, measured roughly in "monsters" (one healthy monster = 1.0).

```text
evaluate(state) =
    Σ own living members   (A + (1 − A) · hpFrac)
  − Σ modeled foe members  (A + (1 − A) · hpFrac)   [foe active + revealed reserves]
  + R · race(state)                                   [both actives alive only]
  + sacrifice residuals                               [section 7.3]
```

- **`A`, the alive weight** (default 0.35), makes a knockout worth more than its HP alone.
- **`race(state) ∈ [−1, 1]`** estimates how the one-on-one exchange continues from the horizon.
  - Each side's turns-to-KO come from `estimateDamage` at the current stages, statuses and refined stats, ordered by priority and speed.
  - The value is +1 if the AI wins outright and −1 if it loses, graded in between.
  - It credits stages, speed control and status the short horizon has not yet cashed in, without per-stage constants.
- **Unrevealed player reserves** are absent from the sum, so removing the active monster scores fully.

Style adjustments are the only per-style constants:

| Style | Adjustment |
| --- | --- |
| balanced | Defaults. |
| offense | `R` × 1.3, own HP weight × 0.85. |
| control | A control status on the foe at the horizon is worth `+0.15 × remaining turns`, capped at 0.3. |
| attrition | Own HP weight × 1.2. |

These constants are starting values to be tuned against section 9.4, not requirements.

## 7. Sacrifice skills

These skills deliberately trade the user. Their value lies mostly with the successor and beyond the normal horizon, so ordinary search would undervalue them.

### 7.1 Coverage

Detection is generic. **An action is a sacrifice when its simulated resolution makes the user faint through its own effect,** regardless of skill ID. Current members:

| Effect | Skills | Payoff |
| --- | --- | --- |
| `seer_eff_59` inheritance | 传承 [spe, acc], 绝处逢生 [atk, def], 献身大海 [atk, spa], 能量灌注 [def, spa], 灵魂附体 [spa, spd], 眼球的掌控 / 机械之魂 / 掩护 [def, spd] | +1 to two stats of the next monster to enter |
| `seer_eff_71` shared critical | 电闪光华阵, 灵魂寄托 | The team's next two attacking hits are guaranteed criticals |
| `seer_eff_112` self-destruct | 暗影自爆 | 250–300 fixed damage, leaving the foe at least 1 HP |

`seer_eff_137` 灵魂牺牲 (half of current HP for attack and speed +2) is not a self-KO. Ordinary search and the race term already value it.

### 7.2 Successor-aware simulation

A self-KO grants a **free entry**: the successor arrives without being hit on entry, which is a tempo gain on top of any gift. To capture it, each sacrifice candidate is expanded once per living reserve:

1. Simulate the sacrifice turn against each player response, as in 5.2.
2. For each reserve `s`, force `s` as the replacement. The engine applies the real gift: inheritance stages on switch-in, crit charges through the shared pool.
3. Roll out with `H + 2` turns, extending the normal horizon so that the gift is actually spent within the simulation.
4. The candidate's row is the best reserve's row. That reserve is also recorded and used when the real replacement happens: `tacticalReplacement` honors the plan.

Cost: at most 5 reserves × 4 responses × `K` × (`H` + 3) turns per sacrifice candidate. This fits the budget in section 8.

### 7.3 Residual value at the horizon

Gift value that the extended rollout has not used up remains on the board. It is counted explicitly.

- **Unused shared crit charges.** For each remaining charge: the expected extra damage a crit adds to the holder's best attack against the current foe model, as a fraction of foe HP, × `(1 − A)`. Capped at the foe's remaining HP fraction.
- **Inheritance stages** are already visible stages on the successor, so the race term values them. No extra term is added; counting them again would double-count.
- **Self-destruct** leaves the foe at 1 HP. Any priority or first-acting attack from the successor finishes it, and the race term sees this.

The sacrifice also loses the user's own value: the term `A + (1 − A) · hpFrac` disappears from the sum. A sacrifice wins only when the successor's gain exceeds what the user could still have achieved, and the other rows of the matrix represent that alternative. In particular, sacrificing a monster that is about to be knocked out anyway costs little, and the search finds that on its own.

### 7.4 Guards

- **No successor, no sacrifice.** If no living reserve exists, the action is a pure loss, and the evaluation already says so.
- **`seer_eff_71` and a pending gift.** Do not lay a new shared-crit pool while one is already pending, and do not lay an inheritance while one is pending. This is the existing `pendingGift` rule, retained.

## 8. Budget

Defaults: `K = 8`, `H = 2`.

- **Typical decision:** ≈ 10 AI actions × 4 responses × 8 samples × 3 turns ≈ 1,000 simulated turns. Sacrifice expansions add up to about 1,000 more.
- **Hard cap:** 6,000 simulated turns per decision. Over the cap, reduce `K` first, then `H`. Sacrifice candidates are not reduced below `K = 4`.
- **Deterministic-cell shortcut:** if the first two samples of a cell agree exactly and consumed no randomness beyond the speed tie, use one sample.

The expected cost is well under 0.5 s per decision on the development machine. It is to be measured on the target build.

## 9. Verification

1. **Clone fidelity.** In many real-data battles, at every turn, resolve the same actions with the same seed on the original (through a saved copy) and on a clone. The resulting `battle.state` and event logs must be identical. Audit any script that mutates a shared `def` or keeps module-level state; `seer-tail.ts` holds only a synchronous re-entrancy guard.
2. **Hidden-information invariance.** Randomize the player's hidden attributes: IVs, EVs, nature, unrevealed skills, PP, trait, inventory, unrevealed reserves and HP. Whenever two battles produce the same filtered observation stream and the same AI-side state, the AI's matrix and decision must be byte-identical.
3. **Observation filter.** A player individual's exact `hp` and `maxHp` reach the planner only after it has taken visible damage. Before that, only its bar ratio does.
4. **HP knowledge.** Use a player monster with extreme maximum HP. Before it is hit, the planner's HP is the bar ratio × baseline maximum HP. After one hit, the planner's HP equals the true HP.
5. **Stat refinement.** For each refined quantity, construct a player monster far from the baseline: max speed, a heavy attacker, a bulky wall. After the relevant observations, the inferred interval must contain the true effective stat, and the effective estimate must move off the baseline in the correct direction.
6. **Behavior fixtures.**
   - A faster boosted foe, with the AI holding a slow knockout and a priority boost removal: removal is chosen when it changes survival.
   - V57's defense/special-defense +6 case: the reliable priority knockout is still chosen.
   - A doomed monster holding inheritance with a slow heavy hitter in reserve: sacrifice is chosen. A healthy monster that can win its exchange holding the same skill: sacrifice is not chosen.
   - Medicine: the AI never uses HP-restoring medicine on six consecutive turns.
   - Evil Seal holder ownership, and Trainer/Boss isolation.
7. **Strength.** Mirror tournaments on all three facilities, with fixed seeds and sides swapped: the new AI against the V57 AI driving the same teams, and against a greedy best-damage policy as a floor. Report win rates with confidence intervals.
8. **Performance.** Record the distribution and maximum of decision time over the tournaments.

Existing tests tied to IV 15 / EV 0 or to observed-only opponent moves are updated deliberately. Tests that forbid reading the player's actual build stay.

## 10. Open details

1. **Evaluation constants** (`A`, `R`, style adjustments, crit-charge residual) are starting values to be tuned against the strength tournaments.

The player-facing HP display is decided (decision 5). In trainer battles the UI keeps the opposing HP bar and hides the opposing HP numbers everywhere they appear: the combatant panel's `hp / maxHp`, the enemy party view and battle log text. Damage and heal numbers stay. Boss and wild battles are unchanged.

## 11. Code map for implementation

| Change | Location |
| --- | --- |
| Planner: world construction, observation filter, stat refinement, matrix, solver, rollout, evaluation, sacrifice expansion | `battle/core/src/search-ai.ts` (and helpers), replacing `tacticalAction` and `tacticalReplacement`. |
| Clone utility | `battle/core/src/battle.ts` or a sibling module. |
| Fixed-roll damage probe for inversion | A small read-only entry in `battle.ts` that reuses `calcAttack`. |
| Conventional moveset extraction | Out of `src/progression/battle-facilities.ts`. The battle core does not import the app catalog, so the resolver is injected through `BattleOptions`. |
| Hide opposing HP numbers (bar kept) in trainer battles | `src/components/Battle.tsx`, the presentation state in `src/game.ts`, battle log text. |
| Retired after parity is shown | `battle/core/src/tactics.ts`. |
| Unchanged | `ai.ts` dispatch, `legacy-ai.ts`, Boss scripts. |

## 12. Implementation interfaces

These contracts let the parts be built in parallel. Every part lives on its own branch off `claude/search-ai` and is merged there.

### 12.1 Battle clone: `battle/core/src/clone.ts`

```ts
export function cloneBattle(b: Battle): Battle;
```

- **Deep copy** of every mutable field: sides, mons, conditions (`turns`, `charges`, `data`), `vol`, `persist`, Sets, Maps and the RNG state.
- **Shared by reference:** `data`, `scripts`, condition `def` objects, `species` objects and `encounter` / `variant`.
- **Copied shallowly:** `log` and `initialEvents`, because events are immutable after emission.
- **Guarantees:** the clone shares no mutable object with the original, and resolving turns on it never changes the original. With the same RNG state and the same actions, the clone produces the same events and `state` as the original.

### 12.2 Observation: `battle/core/src/observe.ts` and an engine journal

**Engine journal.** `battle.journal: JournalEntry[]` is appended by `battle.ts`. It is plain data and cloned like any other field. It records, at the moment of occurrence:

- **Attack hit:** every `kind: 'attack'` damage hit. It records:
  - turn, attacker side and slot, defender side and slot, skill id, crit, effectiveness, displayed damage (`amount + overkill`) and hit index;
  - both monsters' stages;
  - whether any script entry (`power`, `modifyDamage`, `finalDamage`, `defense`) or scripted or conditional damage hook took part, as an `opaque` flag.
- **Move order:** every turn in which both sides executed a move. It records both skill ids, which side acted first, whether the order came from a speed tie, and both actives' `spe` stages.

**Damage probe.** `battle.probeDamage(user, target, skill, {roll, crit}): number` returns the damage of one hit with a fixed roll and crit. It reuses the engine's damage routine, makes no RNG draw and has no side effect.

**Public opponent model:**

```ts
export function observeOpponent(b: Battle, viewer: 0 | 1, slot: number): ModeledFoe;
export function revealedOpponentSlots(b: Battle, viewer: 0 | 1): number[];

interface ModeledFoe {
  side: 0 | 1; slot: number; speciesId: number; level: number; types: string[];
  baseline: Stats;                 // computeStats(base, level, 31, EV 85 each), neutral nature
  stats: Stats;                    // stage-0 effective stats after refinement (2.2)
  intervals: Partial<Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', [number, number]>>;
  hpKnown: boolean; hp: number; maxHp: number;   // 2.3
  stages: Record<StageKey, number>;
  conditions: ActiveCondition[];   // visible only: status icons and announced conditions
  observedMoves: number[];         // first-use order since the last transform
  moveUses: Record<number, number>;
  conflicts: string[];
}
```

**Constraints on the implementation:**
- It reads the opponent's real `Mon` only for visible fields: species, level, types, stages, visible conditions, the HP ratio and, after the first hit, `hp` and `maxHp`.
- It reads the journal and the event log for everything else.

### 12.3 Conventional moves

- **Option:** `BattleOptions.conventionalMoves?: (speciesId: number) => number[]` is stored on the battle as `battle.conventionalMoves`.
- **App resolver:** `src/progression/conventional-moves.ts` returns it from the catalog, using an elite build if one exists and `ordinaryMember(species, eliteSkillEligible)` otherwise.
- **Missing resolver:** the planner falls back to the typed power-80 attacks.

### 12.4 Planner and dispatch

- **`AiSpec.planner?: 'search' | 'v57'`**, default `'search'`. `ai.ts` sends trainer `smart` decisions to `search-ai.ts`, or to `tactics.ts` when `'v57'` is set. Tournaments compare the two this way.
- **`search-ai.ts` exports** `searchAction(b, side, ai)`, `searchReplacement(b, side)` and `lastSearchDecision(b, side)`. The last one returns the explanation record.

### 12.5 Tournament harness: `tools/verification/trainer-ai-tournament-v58.mjs`

- Both sides are `kind: 'trainer'` with `{kind: 'smart', allow_switch: true, style, planner}`.
- Teams come from the real facility constructors.
- Every pairing is played twice with sides swapped, using the same teams and seed.
- The report gives wins, draws, a Wilson 95% interval, turns, and decision-time percentiles per planner.
