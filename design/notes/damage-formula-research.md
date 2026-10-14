# Seer Classic damage formula: source research

The ordinary Seer attack formula is reasonably well supported at the level of its algebraic shape, but an exact pre-2013 server calculation—including every truncation, modifier boundary and multi-hit RNG draw—has not been recovered. The current engine should therefore be described as a documented reconstruction, rather than an independently certified copy of the original damage routine. This review changes no engine code.

The strongest practical findings are that the quoted **1.1 STAB sources contradict their own 1.5 examples**, ordinary Seer critical hits have a **defense-boost removal effect after the current damage calculation**, and a frequently repeated **four-decimal truncation hypothesis was explicitly rejected by its author**. Pokémon damage rules cannot fill these evidence gaps automatically.

## Scope and evidence standard

The target is the original browser game, principally its pre-2013 ordinary PvE behavior. Sources about Seer 2, Seer Mobile/Seer Qihang, Seer Planet War and Pokémon are excluded as evidence for that target. Later browser-game experiments are useful, but their dates and tested skill families must remain attached to their conclusions. A modern experiment does not establish an unchanged historical implementation.

Confidence below distinguishes three things: direct inspection of this repository, an observed or personally reported game result, and a proposed explanation of that result. Reposted period guides are retained to audit the existing citation claims; they are not treated as official documentation or independent experimental replications. The 2023 community encyclopedia was used as an index to original reports, rather than as proof of their claims.

## What the current engine actually implements

The reviewed `battle/core/src/battle.ts` calculation is, for a conventional powered attack,

\[
Q=(0.4L+2)P A/D/50,
\qquad B=\lfloor Q\rfloor+2,
\]

\[
H_0=B\,S\,T\,(r/255)\,C,
\quad S\in\{1,1.5\},\quad
r\in\{217,\ldots,255\},\quad C\in\{1,2\}.
\]

`A` and `D` already include the corresponding attack and defense stages and applicable stat hooks. The denominator is guarded by `Math.max(1,D)`. Scripted skill hooks can alter power or defense before this expression. The critical flag is selected after those effective stats have been evaluated; it does not itself bypass stages or clear the defender's positive defense stage.

This is only the start of the local pipeline. `dealDamage` then applies matching outgoing and incoming multiplicative hooks, floors the result, applies its minimum-damage rule, processes skill final-damage hooks and outgoing/final condition scripts with further floors, checks encounter immunities/caps/HP floors, and caps the reported loss at current HP. Burn is currently an outgoing attack-damage multiplier of 0.5, for both physical and special attacks. Multi-hit skills call `calcAttack` separately for every hit, drawing a fresh critical result and random roll each time.

This describes the inspected engine before any follow-up corrections from the independent implementation audit. These statements are **code-verified**, not statements that the original server followed that entire sequence. `battle/RULES.md` compresses several of these stages into one final-floor formula and currently uses a broad “sourced” label that overstates the evidence for exact order.

## Findings by rule

| Rule | Evidence and version | Assessment for the classic target | Consequence |
| --- | --- | --- | --- |
| Main algebraic shape | A 2010 period guide [S1] and later first-person investigation [S5] use `(0.4L+2)PA/D/50+2`, followed by type, STAB and random factors. | Moderate confidence in the shape; no official server routine or exhaustive integer boundary proof. | Keep the recognizable structure while marking exact evaluation order as unresolved. |
| STAB | The 2011 and 2012 guides [S2–S3] state 1.1 in prose but use 1.5 in the same numerical example. A 2010 guide [S1] explicitly uses 1.5. | The evidence cited for switching to 1.1 is defective. 1.5 remains the better-supported reconstruction. | Do not change STAB to 1.1 on the basis of those two pages. |
| Random factor | Period notation in [S1–S3] is `(217…255)/255`; [S1] also calls it approximately 85–100%. | These forms do not establish the distribution, independence or exact seed/draw implementation. | Keep the discrete local convention identified as such; do not replace it with integer percentages merely because both ranges look similar. |
| Critical multiplier and ordinary stage behavior | A personally framed 2010 explanation [S4] says double damage is calculated using the defender's strengthened corresponding defense, then that boost disappears for following attacks. The attacker's existing weakening remains. | Moderate historical confidence; no full sample table or official routine. Later author reports distinguish special variable-power skill families [S8]. | A normal critical hit must not acquire Pokémon's generic negative-stage/positive-defense ignoring rule. The current missing post-hit defense-boost removal deserves a narrowly tested correction. |
| Burn | A period test report [S6] records physical damage 40→20 and special damage 72→36. | Moderate evidence that both categories are reduced approximately by half; insufficient precision to distinguish power halving from final-damage halving. | Preserve reduction of both attack categories. Do not claim the precise placement of the 0.5 factor is historically proved. |
| Integer boundaries | A first-person 2021 investigation [S5] reports over 100 trials disagreeing with a widely used full-precision calculator, then rejects its own four-decimal truncation proposal. | High confidence that this source does not establish a four-decimal algorithm; exact classic rounding remains open. | Do not implement that rejected proposal or label the present inner floor as independently validated. |
| Minimum damage | No classic-specific primary experiment establishing a universal minimum of one was recovered in this review. | Unverified convention; immunity, explicit shields and scripted zero damage also need separate treatment. | Keep minimum-one claims distinct from verified game behavior and from local zero-damage bugs. |
| Multi-hit processing | A 2021 author report distinguishes old effect-31 attacks from newer multi-hit effects [S7]. A 2026 measured low-power case describes a changed aggregate calculation [S9]. | Later results are skill-family/version dependent; no recovered pre-2013 trial establishes independent rolls, uniform hit counts or individual-hit crits. | Do not transfer the 2026 aggregate formula or Pokémon hit-count weights into all classic skills. |
| Fixed and percentage damage | A player's 2022 testing methodology [S10] distinguishes fixed-number **red attack damage** from ordinary pink fixed/percentage damage. | Strong warning against classification by number or color alone; precise interactions are skill dependent and modern scope must be retained. | Do not run every fixed amount through STAB/critical damage, or classify every fixed amount as exempt from attack modifiers. |

### STAB: the alleged historical conflict is internally inconsistent

[S2] and [S3] both discuss Blake's 85-power attack with attack 366 against defense 208 at level 100, with type factor 2. Their worked example uses 1.5 and gives an approximate 326–383 range, despite the 1.1 prose. The near-identical wording and example are evidence of shared text, not two independent measurements.

An arithmetic check of those published inputs gives approximately **325.85–382.91** with 1.5, versus **238.96–280.80** with 1.1. These are calculations of the articles' model, not measurements of the official game. The local inner-floor convention instead yields approximately **324.22–381.00** before its final flooring. Consequently, even that example cannot certify the current rounding boundaries.

[S1] predates both pages and states 1.5, but it is a republication without a documented measurement protocol. Later first-person testing in [S5] works with 1.5 and investigates small precision discrepancies, rather than a 27% difference of the size that a 1.1 substitution would produce. This is corroboration for keeping 1.5, not an official historical proof.

### Critical hits: Seer-specific stage semantics

[S4] (2010-06-24) describes ordinary physical/special critical hits as double damage using the **prior boosted corresponding defense**, followed by removal of that positive defense stage. Other boosts and the attacker's weakening remain. The article also discusses the PvE encounter Puni's Void; no classic PvE-wide exemption was recovered.

The current calculation preserves those stages, but omits the subsequent reset. A correction should remove only the positive corresponding defense stage after damage, retaining other stages and explicit clearing immunities. This must not become Pokémon-style same-hit stage ignoring. Multi-hit reset timing still needs separate evidence.

Later reports [S7–S8] describe variable-power/new multi-hit skills that clear defense before recalculating damage and can be exempt from burn. Those reports are not permission to move every classic critical defense reset before damage or to exempt every `power_if` skill from burn. Skill identity, effect code and version must govern any extension.

The official energy-bead catalogue [S11] advertises an additional 1/16 critical chance. That is primary evidence for the advertised item increment. It does **not**, by itself, prove the innate probability of every classic move, the full RNG distribution or either calibrated trait's historical rate.

### Rounding and randomness remain unresolved

The short decisive excerpts in [S5] are “这里假设一种可能” and, after comparing the proposed calculation with battle results, “猜测出错了”. The four-decimal proposal therefore cannot be treated as a discovered server algorithm. The positive result of that investigation is narrower: the tested ordinary calculator did not reproduce all measured boundaries. Its setup includes later gear, skill effects and a battle instrument, so it does not directly certify pre-2013 rounding either.

The exact local minimum random factor is `217/255 = 0.850980392…`, with **39** possible integers. Integer percentages 85–100 provide **16** values and an exact 0.85 minimum. A continuous range is a third model. These are mathematically distinct distributions even when described colloquially as 85–100%. This review found no classic primary roll histogram sufficient to choose among all implementation details; uniform sampling and draw independence remain local conventions.

### Burn: a useful historical experiment with a limited conclusion

[S6] preserves a test attributed to 蜉蝣撼大树 against the Xuanwu guardian Mushroom Monster. The reported physical and special damage pairs establish that reducing only physical damage would be an inappropriate Pokémon-derived default for this Seer reconstruction. However, the source supplies neither repeated samples, fixed random factors nor complete numeric setups. It cannot discriminate a reduction in `P` from a reduction after the additive `+2` term. Later variable-power reports [S8] describe exceptions, but their modern classifications should be audited per effect rather than generalized from the skill text alone.

### Multi-hit and damage categories require their own evidence

[S7] identifies old multi-hit effect 31 separately from newer effect families. It does not publish the classic hit-count probability distribution or prove fresh independent crit/random rolls for every individual hit.

[S9] is explicitly a **2026-03-15** report about changed multi-hit behavior. Its controlled setup uses a 1-power, 90-hit skill and reports quantized totals of 90 or 180 against a specified defense. It illustrates the large consequences of intermediate rounding and aggregate versus individual rolls. The report also warns that the low-power skill's critical behavior is unusual. Its complete phase order and internal explanation are not independently replayed here, and its updated behavior must not be backdated to 2010–2012.

[S10] describes using Sacrifice and Illusory Blade—zero-power moves that yield fixed-number **red** attack damage—to measure encounter damage reduction. Those attacks are conceptually different from an added pink fixed-damage effect or a percentage drain. The local catalogue entries 10398 and 10864 currently have zero power and empty effects; that is a concrete coverage gap, not evidence that the game's original skills did zero damage. The reported formulas and non-critical behavior are modern player evidence and should be rechecked against the intended classic version before repairing those entries.

The `attack`, `fixed`, `percent` and `true` engine labels are useful internal categories. They are not automatically equivalent to every historical red/pink/white display or every natural-language use of “fixed damage”. The exact modifier/rounding pipeline must be documented for each category.

## Type effectiveness: avoid a false correction

The directly reported controlled experiment in [S12] uses equal defender special-defense values, first-turn attacks and six observations for each of two targets. Its mean damage ratio is approximately **1.4886**, supporting the proposed **1.5** coefficient rather than the incorrectly transposed **2.5** coefficient.

For a dual attacking skill against a dual defender, the tested direction splits the **defending** types first: combine the two attacking-type coefficients separately against each single defending type, then average those two results. This is the direction in the currently reviewed `typechart.ts`. For example, fire+ground attacking grass+flying gives `(1.25+0.25)/2 = 0.75`; transposing the grouping would give `(1.5+0.125)/2 = 0.8125`. Do not apply that transpose as an engine fix. [S12] is a strong 2018 browser-game experiment, while exact pre-2013 persistence remains a separate historical question.

## What official client inspection establishes

The local static export of the official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf) contains `com/robot/core/info/fightInfo/attack/AttackValue.as`. Its constructor reads attack count, lost HP, real hurt HP, remaining HP and a critical flag from `IDataInput`, rather than deriving the damage formula in that class. The inspected download has SHA-256 `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`; the export is under the ignored `.cache/classic-robots/core-script/scripts/` tree. The client also contains replay-version branches, including a 2013 version marker, so it must not be described as an authenticated 2010 server source.

This provides primary evidence for the shape of a damage-result parser. It does not recover the server's arithmetic, prove absence of all client-side calculations elsewhere, or certify a historical rounding routine. Extracted skill/effect configuration specifies skill parameters; it does not automatically reveal the undocumented probability or arithmetic semantics of each server effect.

## Recommended handoff

1. Keep STAB 1.5 and critical multiplier 2 provisionally; revise their provenance instead of treating contradictory guide prose as independent evidence for 1.1.
2. Implement and narrowly verify ordinary critical hits' corresponding **post-damage positive defense-stage removal**, without introducing generic Pokémon stage ignoring. Keep the exceptional variable-power families separate.
3. Correct local shield, hook, category and estimator bugs from the independent implementation audit on their own evidence. Passing those regressions verifies the reconstruction, not equivalence with the original server.
4. Retain explicit uncertainty for inner floors, minimum damage, burn-factor placement, random-roll distribution and classic multi-hit RNG. Do not implement the rejected four-decimal hypothesis.
5. For future measurement, collect matched attacks with fixed species, level, actual stats, skill, gear, conditions and stage state; retain raw damage and following-turn stage observations. Use low-power/high-defense cases to distinguish rounding and burn placement, and record individual versus aggregate multi-hit results. No new official-game battles were run for this review.

## Source register

- **S1 — Historical formula republication:** [赛尔号里一些基础的公式](https://news.7k7k.com/content/20100827/13700.html), 2010-08-27; credits original author 寂-天青色. Supports a period claim of the familiar formula and 1.5 STAB; no measurement table or official attribution.
- **S2 — Internally inconsistent period guide:** [赛尔号能力伤害计算公式](https://news.7k7k.com/content/20111116/104376.html), 2011-11-16. Its own example uses 1.5 while prose says 1.1; retained to audit the old citation.
- **S3 — Repeated inconsistent example:** [赛尔号伤害计算公式](https://news.4399.com/seer/jingyanxinde/201209-05-194310.html), displayed date 2012-09-01, URL dated 2012-09-05; credits contributor 4399雪影. Near-identical example to S2, so independent corroboration is not established.
- **S4 — Contemporary personally framed critical explanation:** [赛尔号解读致命一击效果](https://news.7k7k.com/content/20100624/9258.html), jason, 2010-06-24. Describes current boosted-defense damage followed by corresponding defense-boost removal; no raw trial table.
- **S5 — Primary first-person precision investigation:** [赛尔号的伤害计算公式，真的是流传的那样吗？](https://www.bilibili.com/opus/586675451549824957), 流风天啸, 2021-10-28. Reports over 100 tests and rejects its own four-decimal hypothesis.
- **S6 — Republished contemporary burn test:** [赛尔号烧伤的效果](https://news.7k7k.com/content/20101203/25356.html), 2010-12-03; original tester 蜉蝣撼大树. Includes two reported physical/special damage pairs; no repeated-sample protocol.
- **S7 — Primary author skill-family report:** [赛尔号·技能效果说明 | 关于连击技能](https://www.bilibili.com/opus/586643578601375078), 摸鱼的异域华尔兹, 2021-10-28. Differentiates effect 31 from new multi-hit families and identifies untested cases.
- **S8 — Author research synthesis with explicit revisions:** [赛尔号 | 关于变威力技能](https://www.bilibili.com/opus/578056710615284990), 摸鱼的异域华尔兹; currently edited 2023-05-01, with March/April 2023 revision notes. Describes ordinary-versus-variable-power critical timing and burn exceptions; not a pre-2013 server specification.
- **S9 — Primary modern low-power multi-hit report:** [〖赛尔号〗赛学扩展4—连击计算（新）](https://www.bilibili.com/opus/1173979935440633860), 新萌小山东, 2026-03-15. Includes specified attack/defense values and screenshots; explicitly concerns changed contemporary behavior.
- **S10 — Primary player testing methodology:** [赛尔号 全部类型PVE精灵汇总、因子关卡特性汇总、相关判定详解](https://www.bilibili.com/opus/719083340631638018), 云端少女莫妮卡, 2022-10-20. Based on the author's recorded factor-battle experience; explains fixed-number red-damage tests.
- **S11 — Official advertised item behavior:** [赛尔号-道具大全-超级NONO装备](https://seer.61.com/main/props/NONO/index.html), historical page without a displayed publication date. Advertises a 1/16 critical increment for the critical energy bead; scope is that item.
- **S12 — Primary controlled dual-type experiment:** [单双属性克制系数计算方法与n属性计算公式猜想](https://news.4399.com/gonglue/seer/jingyanxinde/825548.html), 橙汁, 2018-02-01. Provides controls, twelve observed damage values and the grouping-direction comparison.

Sources were retrieved during this review. No inaccessible video was treated as a watched experiment, no quoted hypothesis was promoted to a verified algorithm, and no source from another Seer game was used to certify the classic formula.
