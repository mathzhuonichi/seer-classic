# Boss evidence audit, V56

The evidence ledgers cover all 180 production boss records and their 240 members. They cover 93 tower or dark-door encounters, 49 SPT encounters, 31 legendary encounters, six story encounters and one event encounter. The ten authored trainer encounters are excluded.

`data/boss-evidence-v56.json` records source-file hashes, original confidence metadata, member-level values, field-specific evidence, 324 rule/operation nodes with their phase conditions, and the remaining encounter constraints. `data/boss-evidence-runtime-v56.json` carries only UI statuses, member identities, short source-link lists and the explicit hidden-level display flag. Neither ledger changes combat parameters.

## Evidence boundary

The current review has 48 specifically reviewed period-report sources, four verified official-client sources, and 127 URLs retained as unverified metadata. It does not claim that every listed URL was reread or that every historical boss was fully reconstructed. Merely listing a URL, having a high confidence label, or matching a species learnset never promotes a field.

| Member field | Official table | Period observation | Inferred | Authored |
| --- | ---: | ---: | ---: | ---: |
| Level | 3 | 75 | 161 | 1 |
| HP | 1 | 42 | 196 | 1 |
| Complete skill set | 2 | 19 | 219 | 0 |
| IV | 0 | 0 | 240 | 0 |
| EVs | 0 | 0 | 240 | 0 |
| Nature | 0 | 0 | 240 | 0 |

All derived combat stats remain inferred because exact server IVs, EVs, nature and scaling were not recovered. All executable AI policies are remake policies. Approximate HP reports, conflicting versions and partially named move lists remain inferred; the full ledger preserves narrow positive observations separately. A complete period move list is evidence for its membership, not proof of exact selection probabilities or server implementation.

The official cached `PetFightDLL.swf` establishes numeric level display through 100 and `??` above 100. The inspected method is `BaseFighterPropView.update`, ABC method 18723, byte offsets 75-115. Its pinned SHA-256 is `1e6987a4e9bc8a78180f9946b1770afaee54b00959e1861450dcaef729b57970`. This later client is not a dated 2009-2013 server-stat snapshot. The internal tower values 120, 130 and 230-320 remain estimates.

## Verified discrepancies and retained uncertainty

- Akenoya's [dark-door report](https://news.4399.com/seer/ahwdc/201105-30-98372.html) gives 2500 HP and another 2500 after the first KO. The authorized source-data correction uses 2500 per life and one extra revival, making two total lives. The old 1250 split and two-extra-revival interpretation were incorrect. The URL contains a 2011 date, but the current page byline reads 2013-12-03; this audit does not assert an unchanged 2011 publication.
- Moshi Dilu's [2010 detailed report](https://news.4399.com/seer/spt/201006-05-70398.html) gives a status threshold below 1000000 HP. The authorized correction replaces the approximate 33.4 percent boundary with this absolute threshold. The same report supports level 50, HP 3000000 and all four configured moves. Its lost-HP damage increase has no reported numerical formula; other summaries conflict on the lethal-phase threshold.
- Difute is explicitly shown as `??` in the [2011 SPT report](https://news.4399.com/seer/jingyanxinde/201107-21-105242.html). Its internal level 80 remains a reconstruction; the runtime ledger sets `members[0].displayLevelUnknown=true`. This is a display exception supported by a report, not a newly recovered hidden level.
- The [Eersaila report](https://news.4399.com/seer/spt/201008-14-75469.html) supports weekday traits, but not the exact reflection fraction, seven-revival cap, Monday HP multiplier, Tuesday evasion stage or Saturday critical formula. Kenpeide's [report](https://news.4399.com/seer/spt/201101-17-84758.html) describes a temporary reflection shield and an approximate berserk threshold; it does not establish always-on 25 percent reflection or a speed override.
- Laokemengde's [three-field report](https://news.4399.com/seer/spt/201010-16-78995.html) supports both-side healing of 10 percent, both-side damage of 100, and double damage. HP 5000 is specifically stated for the energy field; carrying it to all variants remains inferred.
- Qilin's [2013 body report](https://news.4399.com/gonglue/seer/jingyanxinde/305908.html) supports the six configured body HP values. Its revival boost is internally inconsistent (+12 versus +6), and the separate wheel challenges must not inherit body HP claims. Puni's [2010 report](https://news.7k7k.com/content/20101028/18173.html) supports life 1 at 7000 and life 6 at 65000, but disagrees internally or with other sources on intermediate lives. Those unresolved values were not rebalanced.
- The V58 SPT fidelity pass (`SPT_CLAIMS` in the builder) applied verified original values: levels 克莱芬 first fight 55, 弗希斯 100, 帕里斯 100 (official SPT table, `maps.json` of seer_data a00bcdd), 蘑菇怪 10 and 洛拉斯克 100 (period reports); HP 斯克鲁 8000, 德拉萨 10000 (the daytime fight) and 钢牙鲨 about 200; 亚伦斯's single boss-form move 交错冰柱 (`monsters.json` ID 5012); 火龙红莲击 for the first 克拉尼特 and 蚀梦术 for 普兰特. Values that already matched now cite their sources. Not applied: the solo 塞维尔 stays the user-authored version, the 厄尔塞拉 Sunday HP 5000 and the 德拉萨 evening mode would need variant HP, the 洛拉斯克 per-win level decrease is a mechanic, and no source states the first 克莱芬 loadout.

Source provenance is separate from execution coverage in `data/boss-rule-support-v56.json`. An implemented effect can still use an estimated parameter; a supported historical observation can still lack an engine implementation. No empty rule list is treated as proof that the original boss had no special effects.

## Reproduction and validation

Run `python3 tools/audit/build_boss_evidence_v56.py` to regenerate both ledgers, or append `--check` to verify deterministic parity with the current source records. The generator rejects scope changes and curated claims that no longer match configured values. A final independent pass checked all 180 source hashes, all 240 member identities and six field statuses, full/runtime parity, source references, complete skill-ID/name mappings, the two corrected encounters and Difute's display exception. The original boss JSON edits and battle regressions belong to the separate rule audit.
