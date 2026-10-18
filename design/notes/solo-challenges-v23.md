# Ordinary solo challenges, revision 23

Seville is now an ordinary single-player SPT encounter against one species-413 opponent. Victory grants an essence hatching species 412, Sevi, which evolves into Seville at level 32. Qigesa is presented as a direct ordinary challenge, retaining its species-531 Sag reward. Neither encounter requires other players, a cooperative lobby or multiplayer formation.

## Scope and source boundaries

The current battle core already models one player's creature roster and one opposing side. No implemented cooperative subsystem needed removal. The existing source encounter set contained no Seville record or simultaneous three-dragon cooperative encounter. This change therefore adds `boss_spt_saiweier`, rather than claiming to modify a previously playable raid.

The [September 2010 Seville SPT guide](https://news.4399.com/seer/spt/201009-26-78033.html) identifies its essence reward and describes the original three-dragon battle. The [August 2010 dragon guide](https://news.4399.com/seer/spt/201008-14-75467.html) describes Seville's Dragon Flight, Immortal Will and low-HP recovery. A [contemporary 7k7k guide](https://news.7k7k.com/content/20100816/12670.html) reports approximately 140,000 HP in that cooperative format. The new **level 80 / 10,000 HP** values are explicit solo remake calibration; they are not represented as historical solo statistics.

The four equipped skills are actual species-413 catalog skills. The bounded burn/freeze/poison/leech immunity and recovery below 200 HP follow period behavior descriptions, adapted to the authored solo body. The rule uses the engine's absolute `hp: 200` field. Nonlethal damage leaving 1–199 HP restores full HP; exactly 200 HP does not trigger recovery, and a lethal hit does not revive the opponent. The exact original healing amount and hook timing remain unverified. No simultaneous allied dragons, area attacks against multiple human players or multiplayer damage-sharing rule was added.

Official RobotCoreDLL MapConfig symbol 155 identifies **map 349, Challenge Seville**, with replacement map 1147. The current remake's existing Dragon Temple is the visible meeting point. This does not certify that the modeled scene reproduces original map 349. No unsupported boss-13/map-536 binding was introduced. Parent integration owns the ordinary map entry in the existing region.

The [2010 Brave Trial source](https://m.news.4399.com/seer/saiergonglue/201011-12-80618.html) described a multiplayer trial and random-floor Qigesa encounter. Those facts remain historical provenance, including the original quoted team requirement. Current Qigesa text and notes now specify a direct ordinary challenge, without a floor ladder or other-player gate. Its combat values, reward identity and category remain intact.

## Records and unaffected behavior

Both changed source encounters are mirrored in `data/gamedata.json`. `data/bosses/_modes_tower.md` distinguishes the original Brave Trial mode from its current direct encounter. No battle-core rule or formula was changed.

Ordinary sequential enemy teams and campaign guardians remain part of single-player combat. The Azure Dragon guardian sequence, other divine-beast campaigns, Puni seals and Puni true body remain intact. Existing restrictions on one player's creature roster, such as Rei training's single-creature requirement, are not multiplayer rules and were preserved.

## Focused verification

`tools/verification/solo-challenges.ts`, executed through Vite SSR, checks:

- Seville and Qigesa both admit one player's roster sizes one through six and create exactly one opponent.
- Source and bundled encounter records match.
- Actual core damage checks verify the absolute 200-HP healing boundary, full recovery below it, and no revival after lethal damage.
- Real controller victory settles one essence, survives export/reload, and hatches the correct infant.
- Repeating a cleared challenge grants the essence again, as both species are repeatable within the six-copy limit. The V23 suite asserted that a repeat clear grants nothing; that rule was superseded by the bounded-repeat recruitment rule.
- Sevi has the new direct boss acquisition route and the executable level-32 evolution route to Seville.
- The Azure Dragon guardians, Puni true body and Black Tortoise body remain in the catalog.

Reward fixtures use a one-HP opponent and a harmless skill to isolate transaction correctness; they do not certify original difficulty or the authored full-HP encounter's balance. Integrated travel/dialogue/battle presentation belongs to the parent browser checks. No package, build or commit was produced by this subtask.
