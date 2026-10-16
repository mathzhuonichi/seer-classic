# Battle AI redesign: discussion handoff

**Status: discussion only. Do not implement or rewrite the AI yet.**

The user wants to establish the AI's information model first, then design its battle decisions. A substantial rewrite is an option, not an approved implementation. Do not continue adding local scoring patches before agreeing on the overall rules.

## 1. Workspace and starting point

- Project: Seer Classic, a local TypeScript/React game with separate battle and raising engines.
- Working checkout: `/Users/zhuonismacbookair/code/scratch/codex/2026-10-14-seer-classic/seer-classic-codex-takeover`.
- Branch: `codex/seer-takeover`.
- Code baseline: `d8d4db9` — `Prioritize reliable trainer knockouts and adopt Boss execution policy`.
- The preceding audit commit is `271d526`.
- All repository-relative paths below are relative to this checkout. Verify the current HEAD before relying on line numbers or test results.
- This handoff adds documentation only. No new battle-rule implementation is authorized by it.

The human conversation should continue in Chinese. Repository files are written in English. Keep all work under `~/code`, preserve unrelated changes, and do not build, package, push, restart the user's servers, or access real player saves merely to discuss the design.

## 2. User-confirmed direction

The latest request establishes this order:

1. Construct the opponent's complete numeric model for its species, with the level policy to be agreed below, using a **neutral nature, no trait, IV 31, and evenly distributed EVs**.
2. Obtain that species' **conventional moveset for the current game mode**. This is knowledge from our own mode definitions, **not access to the player's actually equipped skills**.
3. Only then apply the battle-decision rules, which still need to be discussed.

These requirements supersede the current IV-15/zero-EV estimate and its reliance on observed attacks plus a generic fallback. They do not authorize reading the player's hidden build or pending command.

The user explicitly asked to discuss the foundation before proceeding further and requested this Markdown file for a new conversation. Do not treat proposals or open questions below as settled requirements.

## 3. Opponent-stat model: confirmed facts and unresolved details

The project's current EV caps are 255 per stat and 510 total (`raising/core/stats.ts`). If "evenly distributed" means distributing the full 510-point budget across all six stats, the vector is:

```text
hp=85, atk=85, def=85, spa=85, spd=85, spe=85
iv=31
nature modifier=1 for every stat
trait=none
```

This is the natural interpretation of the request, but **the user has not separately specified that the full EV budget must be spent**. Confirm that interpretation in the design conversation rather than silently presenting it as an extra user decision. The existing formula uses `floor(EV / 4)`, so EV 85 contributes 21 before level scaling; do not round the allocation to 84 without agreement.

Reuse the shared reconstructed stat formula for consistency with actual battles; do not invent a second formula in the planner. `battle/core/src/stats.ts` delegates to `raising/core/stats.ts`. Its intermediate rounding is the project's retained reconstruction, not proof of original server arithmetic.

Distinguish three separate objects:

- **Baseline reference stats:** the neutral, no-trait, IV-31/equal-EV model requested above.
- **Current observable state:** HP information, stat stages, statuses, types, and effects already visible in the fight.
- **Predicted effective state:** whichever visible modifiers the agreed battle rules apply to the reference model.

Open decisions:

- Use the visible current level or a mode-normalized level? Facilities currently use level 100, but the contract should be explicit.
- How does current HP enter the reference model: visible absolute HP, or visible HP percentage multiplied by modeled maximum HP? The current implementation uses the latter.
- Does "no trait" apply only to baseline stats, or must the opponent model ignore even a subsequently revealed passive? Do not assume either answer.
- How should visible equipment, engravings, special training, shields, or temporary stat changes affect the reference model? Keep each category separate from a nature or trait.
- May the AI use its own exact controlled-team stats, skills, PP, passives, and reserves? This seems appropriate, but should be stated as part of the information contract.

## 4. Conventional mode movesets: what exists now

There is **no single universal species-to-standard-four-moves registry** today. The existing sources are mode-dependent:

| Mode/source | Current construction |
| --- | --- |
| Ordinary random facility | `ordinaryMember` in `src/progression/battle-facilities.ts` selects four legal level-up moves using damage, coverage, priority and support preferences. |
| Elite facility | `data/elite-roster.json` contains 21 authored additions/builds at this baseline. `eliteMember` uses these where available, otherwise ordinary selection with elite eligibility restrictions. |
| Classic/fixed trainer teams | Ten JSON files under `data/trainers/` define fixed teams, roles and movesets. |
| Catalog and legality | `data/gamedata.json` supplies species, learnsets, skills and effects. `src/progression/trainer-skills.ts` also recognizes explicit training-reward skills. |

The same species can have different authored sets. For example, Gaia's elite entry and the fixed fast-pressure trainer entry carry different four-move sets. A lookup that returns whichever entry happens to be encountered first would not define a reliable standard.

The new design needs an explicit lookup contract, conceptually:

```text
resolveConventionalMoveset(mode, species, approvedPublicContext)
    -> a declared standard set, or declared candidate sets
```

The signature is a discussion sketch, not an implementation decision. Resolve:

- Which mode identifier and public context determine the set?
- Is there one canonical set per species/mode, or several role-based candidate sets?
- What is the precedence among elite builds, fixed-team builds and ordinary generated sets?
- How do species without an authored set obtain a deterministic fallback?
- Are training-only moves included when that mode convention permits them?
- If the player reveals a different real move, does it supplement or replace the reference set? This is not yet decided.
- How is unknown opposing PP represented? Knowing a conventional move is not knowing that the player equipped it or how much PP remains.

Do not inspect the player's actual equipped skill IDs to pick a matching "standard" set. Do not use hidden IVs, EVs, nature, trait, inventory, unrevealed reserves or pending commands to resolve ambiguity.

## 5. Current implementation: verified differences and failure

At the baseline commit, `battle/core/src/tactics.ts` does the following:

- `publicOpponent` estimates stats with `computeStats(base, level, 15)`: neutral nature, IV 15 and EV 0.
- It maps the visible HP ratio onto that estimated maximum HP and retains visible stages/statuses and announced effects.
- Its move knowledge comes from observed `move_used` events. For damage threats, if no usable attack is observed, it substitutes a generic power-80 same-type attack.
- V57 added a separate reliable-first-KO tier before normal scores, medicine or switching. It uses minimum modeled damage and strict action ordering; equal-priority/equal-speed ties are random.
- Outside that tier, ordinary scoring still gives a slow nominal KO a bonus, then multiplies the result by 0.35 if the enemy is predicted to KO first.
- Ordinary boost removal is still valued largely as 15 points per positive stage. It does not fully recompute the enemy's incoming damage after removing its boosts.

The recent failure motivating this discussion:

> The opponent is faster. Our slow high-power attack would KO it if we could act, but its boosted attack KOs us first. We also have a higher-priority boost-removal move that can reduce that threat before it attacks.

The current planner can incorrectly choose the slow attack. A read-only fixture reproduced this at enemy attack +2: the AI selected the slow nuke and fainted before acting in all 32 sampled turns. In the same fixture, forcing priority removal survived 29 of 32 turns; three critical hits still caused a KO. At attack +6 the planner selected removal because its flat stage score became larger, not because it had explicitly established survival.

The fixture report is `artifacts/ai-slower-ko-question/report.json` (ignored local artifact, not guaranteed to exist in another checkout). It uses the **old** IV-15/zero-EV reference model. Its exact numbers are not requirements for the new IV-31/equal-EV model.

Changing the input model alone will not fix this outcome-ordering problem. A nominal damage value cannot count as realized KO damage if the actor falls before executing the move.

## 6. Battle rules to discuss next

Do not select an architecture or a new list of arbitrary scoring weights yet. First agree on how candidate actions are compared under the new information model.

| Question | Why it matters |
| --- | --- |
| Who acts first, and can they act? | Account for move priority, speed, ties, incapacitation, accuracy and visible interception. |
| Can we remove the active enemy before it acts? | The user has explicitly prioritized a realizable immediate knockout over unnecessary removal/setup. |
| If not, which actions let us survive this exchange? | Evaluate priority removal, control, protection, healing or switching against the threat **after** that action's effects. |
| Does removal actually reduce the relevant threat? | Removing defensive boosts does not reduce incoming attack damage; removing an irrelevant attacking stat may not help. |
| Can the opponent still KO after removal? | Removal must not receive an automatic survival label merely because positive stages existed. |
| How are the opponent's conventional moves combined? | Discuss worst-case response, expected response or a declared candidate-response model. Do not read the player's pending action. |
| How is uncertainty handled? | Separate guaranteed/minimum damage, expected damage, critical hits, misses and variable hit counts. |
| What if every action loses the active creature? | Discuss achievable damage, team support, preserving stronger reserves, and the value of sacrificing a member. |
| How far ahead should the planner look? | One exchange, a bounded second exchange or another approach remains a design choice. |
| What are the medicine and switching policies? | Include their turn cost, incoming damage, resource use and replacement consequences. |

The priority-removal example only establishes the intended preference **when removal genuinely enables a better outcome**. It does not authorize a blanket rule to remove boosts whenever the opponent is faster.

A possible discussion structure is:

```text
Agreed information contract
    -> reference stats + conventional mode movesets + allowed visible state
    -> candidate actions and plausible opponent responses
    -> ordered exchange outcomes after each action's effects
    -> agreed outcome preference / tie-breaking rules
    -> chosen legal action
```

This is a proposal for organizing the conversation, not an approved rewrite or a settled search algorithm.

## 7. Existing constraints and regression cases to preserve

Unless the user changes them explicitly:

- Enhanced strategy applies to simulated-player/trainer encounters, including their facilities. Bosses keep their separate historical project AI. Do not silently extend the redesign to Bosses or wild encounters.
- The AI can know its mode's conventional opponent set under the new request; this must remain distinct from reading the player's actual loadout or future command.
- Planning must preserve battle state and RNG. Do not execute live mutating callbacks just to score a move. A future isolated simulator would need its own explicitly designed isolation contract.
- Passive ownership is per individual. Evil Seal's extra 30 belongs only to its actual active holder; Gaia's species, a teammate or a previous holder does not grant it. The opponent's requested no-trait reference model must not silently acquire that bonus.
- Prefer a reliable immediate first-action KO over unnecessary boost removal, healing or setup. The existing V57 defense +6/special-defense +6 fixture captures this intent.
- Preserve the reverse case: when a slow attack cannot execute because we die first, compare a priority removal/control action's actual resulting survival rather than granting the slow attack fictitious KO value.
- Keep legal PP use, speed-tie uncertainty, protection, effect order, recoil, sequential percentage damage, and per-hit rounding explicit.
- Retain deterministic replay and explanations that can say what the AI assumed and why the chosen action wins under that model.

The current Boss-specific decisions are separate: four previously unresolved additions were explicitly waived, and Moshidilu uses strict current HP below 25% for forced-first direct execution. They are documented in `design/notes/boss-user-policies-v57.md`; do not revisit them as part of this AI-input discussion.

## 8. Useful code and evidence map

| File | Purpose |
| --- | --- |
| `battle/core/src/ai.ts` | Dispatch between trainer tactics, legacy Boss policy and explicit move policies. |
| `battle/core/src/tactics.ts` | Current opponent model, threat estimate, KO tier, utility, medicine and switching. |
| `battle/core/src/legacy-ai.ts` | Historical project Boss policy; outside this proposed redesign. |
| `battle/core/src/battle.ts` | Actual action order, move execution, damage, effects and replacement semantics. |
| `battle/core/src/stats.ts`; `raising/core/stats.ts` | Shared stat formula, IV/EV bounds and neutral-nature calculation. |
| `src/progression/battle-facilities.ts` | Random/elite/fixed mode construction and conventional move selection. |
| `data/elite-roster.json`; `data/trainers/` | Existing authored movesets and roles. |
| `src/progression/trainer-skills.ts`; `src/progression/npc-training.ts` | Skill provenance and explicit special training. |
| `tools/verification/trainer-ko-priority-v57.mjs` | First-KO preference, public-information boundaries and false-KO negative cases. |
| `tools/verification/battle-ai.mjs` | Existing ordinary tactics regressions. |
| `tools/verification/boss-ai-isolation-v56.mjs` | Trainer/Boss separation and historical Boss-policy comparison. |
| `tools/verification/holder-ownership-v47.mjs` | Per-individual passive ownership. |
| `design/notes/trainer-ko-priority-v57.md` | Current KO tier and its public-model limits. |

The current tests include assumptions tied to IV 15/EV 0 and observed-only opponent moves. When implementation is eventually authorized, update those assumptions deliberately. Preserve tests that prohibit reading the **actual** hidden player build; do not mistakenly prohibit the newly authorized conventional-catalog knowledge.

Green existing tests establish their covered cases, not an adequate overall strategy. The slower-KO/priority-removal failure above remains unresolved at this baseline.

## 9. Suggested opening prompt for the new conversation

> Read this handoff and inspect the referenced local code as needed. We are discussing the battle AI foundation before any implementation. First restate the confirmed information contract: opponent reference stats use neutral nature, no trait, IV 31 and equally allocated EVs; opponent move knowledge comes from the current mode's conventional species moveset, never the player's equipped skills. Separate that contract from unresolved visibility and moveset-resolution questions. Then help design battle-decision rules using the faster-KO and slower-KO/priority-removal examples. Compare possible designs without treating current weights or the V57 patch as final. Do not edit or rewrite battle code until we finish discussing and explicitly proceed.
