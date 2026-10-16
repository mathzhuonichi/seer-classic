# Boss rule execution audit, V56

All 180 encounter files are classified in `data/boss-rule-support-v56.json`.
The audit traverses encounter and member rules, all variants, phase operations,
phase conditions and objectives. Its 592 handled entries describe execution
paths, not 592 independently sourced historical claims. Five entries remain
unsupported, and 119 entries preserve explicit catalog reconstruction notes.
The source-evidence inventory is maintained separately; a working rule does not
establish official server parity.

## Corrected execution paths

- Floor 60 now restricts each defender to its own type, normal-type attacks or
  status-category skill damage. The native restriction also covers OHKO effects.
- Native `heal_full_below` accepts either absolute `hp` or percentage `pct`;
  `heal_each_turn` accepts either flat `amount` or `pct_max_hp`. Member selectors
  work for native rules, script installation and aliases. Floor 70's flat 200
  healing and below-20-percent refill apply only to member 3. The first three
  enemies no longer acquire NaN HP. This also repairs the affected floor 62/65
  threshold rules and Dark Door 7's flat 300 heal.
- Rule arrays are cloned before expansion; constructing battles no longer adds
  native aliases to caller-owned catalog arrays. Member-scoped extra lives are
  initialized only on their specified member. Unknown native rule names and
  fields now produce explicit warnings.
- Damage-cap categories are honored. Defender-only `ignore_type_chart` no
  longer neutralizes that boss's own outgoing type effectiveness.
- Variant phases are added to common phases with their own once-only tracking.
  First-turn phases execute before moves; previously common phases could wait
  until damage or turn end. This restores Eersaila's Saturday stages and Sunday
  low-HP execution trigger without changing their configured magnitudes.
- Registered the singular priority alias, explicit critical bonus, delayed
  critical trigger, HP multiplier, evasion bonus, one-skill unlimited PP,
  water/fire/grass damage rotation, all three bilateral field variants,
  status-dependent revival, execution and new-status-block phase operations,
  and the explicit boss-fled objective predicate. Clear encoded magnitudes are
  executed as configured, including magnitudes already labeled as estimates.
- Pre-battle validation now checks every party member against a required species
  list and minimum level, and honors minimum as well as maximum team size.
  Aluobisi's attempt-based level adjustment belongs to the game adapter because
  it needs persisted attempts; its registered installation deliberately does
  nothing after that adaptation. This is not a placeholder for an unknown rule.

## Two narrow source-data corrections

Moshidilu's new-status immunity is now triggered strictly below 1,000,000 HP,
using `self_hp_below`, rather than the rounded 33.4-percent condition. The
[period boss guide](https://news.4399.com/seer/spt/201006-05-70398.html) describes
the absolute boundary. Existing statuses keep ticking. Its unquantified
HP-loss damage curve remains unsupported.

Akenoya now has two total lives of 2,500 HP each. The
[Dark Door 9 guide](https://news.4399.com/seer/ahwdc/201105-30-98372.html)
explicitly describes a 2,500-HP bar followed by another 2,500 HP after depletion.
The old file split 2,500 into two halves and also set `lives.count` to 2, which
means two additional revivals in this engine. The corrected configuration is
`hp_override: 2500` and `lives.count: 1`. The URL contains 2011-05-30, but the
currently rendered page is dated 2013-12-03; this is period-guide evidence,
not an official server dump. Level 100 and hidden training values stay inferred.

## Mechanisms still not restored

| Encounter | Unrestored behavior |
| --- | --- |
| Puni seal 7 | Reported unusually low boss accuracy has no recovered probability or trigger. |
| Puni true body | Reported 70-percent player accuracy below 10,000 HP lacks a restored life-specific trigger. Ordinary critical defense clearing is implemented separately. |
| Eersaila | No numeric curve, or unambiguous direction, is recovered for the Saturday HP-dependent critical rate. |
| Kenpede | The period guide describes a temporary reflection shield with an ending cue; activation and duration are not restored. The existing static reflection model is disclosed as incomplete. |
| Moshidilu | HP-dependent damage growth has no recovered formula. |

No replacement curves were invented. These entries remain visible to the UI
through the support manifest. Existing estimated parameters are separate from
missing behavior: examples include Eersaila's seven-revival cap, Monday HP
multiplier, Tuesday evasion stages and Wednesday reflection percentage. The
exact early-turn revival window mentioned by another account remains unresolved.
Field damage doubling currently applies to powered attack damage; extending it
to every indirect damage class is not established by the inspected text.

## Verification

Run `node tools/verification/boss-rules-v56.mjs --write-support` to regenerate the
support manifest and its execution report. Omitting the flag verifies that the
saved manifest still matches the source. The runner uses the real core and full
catalog directly in Node, with no controller, browser, user save, storage,
network or listening server. Only the smoke-test player HP is enlarged; boss
configurations and rule handlers remain intact.

The focused run passes 21 groups, including 193 actual base/variant battle
configurations over bounded turns. It checks finite HP and stats, member scope,
strict threshold boundaries, positive and negative damage controls, actual PP
consumption, phase order, revival settlement, bilateral field effects, two-life
settlement and unchanged input objects. `campaign-mechanics.ts` also passes its
14 existing groups, including ordered member transitions and campaign hooks.
TypeScript and whitespace checks pass. These are compatibility regressions,
not evidence that all original probabilities, timing and hidden stats are known.
