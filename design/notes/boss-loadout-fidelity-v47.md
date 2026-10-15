# Boss loadout fidelity: V47 source review and restoration plan

The V46 replacement of Tower 61's `眼球的掌控` (20330) with `失神之视` (20328) should be removed. A contemporary first-person battle account explicitly observes the Tower 61 boss using 20330, fainting, and strengthening the next opponent. The user's current original-boss requirement takes precedence over the earlier general preference against boss self-sacrifice. This finding supports restoring that move; it does not certify every move of every retained boss.

This was a read-only review of production code/data and sources. It examined V46 commit `ff528860160c7739c78b4be6b41f0eadf67db4cd` and the V30 import `21a15673c101b6e7f14dbe9cc52ad7ed5ba57f69`. Only this report was written. No game controller, normalizer, boss data, server, or user save was changed by this review.

## Tower 61: confirmed move, incomplete four-move evidence

The [2010-06-23 first-person Tower difficulty analysis](https://news.4399.com/seer/yzzt/201006-23-71411.html), in its floor-61 paragraph, describes the author's level-one light-type lead waiting for Chaloyan to use `眼球的掌控`. The boss then faints, and the subsequent Dixuyan is stronger. This is direct encounter-specific evidence for the move and its sacrifice/transfer role, not an inference from a collectible species' learnset. The page gives no complete four-move list for Chaloyan.

The originally cited [2010-10-10 floors 61-70 guide](https://news.4399.com/seer/jingyanxinde/201010-10-78575.html) says a light-type can exploit the first opponent's psychic attacks, but does not enumerate four skills. That shorthand cannot overturn the earlier explicit observation of its status move. The other retained source, the [2011-09-23 Juxia guide](https://www.juxia.com/news/2011-9-23/15944.html), could not be retrieved in this review; the project describes it as the basis for lineup, level, and HP information, not an exact skill list.

The stored first member is species 270 at level 230, HP override 1150, with `[10748,10744,10747,20330]`. The encounter-wide AI list also contains 20330. This JSON is byte-for-byte identical to the V30 imported file, but its own `confidence.uncertain` explicitly includes `skills`. The additional period source now confirms **20330 specifically**. The other three slots remain unverified in this focused review; do not claim that the complete four-move set has been calibrated to original server data.

## What the 180-record inventory establishes

`src/mechanics/catalog.ts` loads the 180 individual `data/bosses/*.json` files as the active boss catalog. `git diff --quiet 21a1567 ff52886 -- data/bosses` succeeds: the whole boss directory is unchanged between those two commits. This establishes preservation of the imported project records, not original-game authenticity.

| Metadata fact | Count | Interpretation |
| --- | ---: | --- |
| Boss JSON records | 180 | All have `source_note` and `confidence`. |
| Nonempty structured `sources` lists | 179 | `boss_spt_luolasike` has no URL list; its note only cites species data and a habitat/SPT listing. |
| Explicit `skills` entry in `confidence.uncertain` | 108 | The record itself warns that its loadout is uncertain. |
| No explicit `skills` uncertainty entry | 72 | Absence of a warning is not a four-slot source certification. These are 19 high, 48 medium, and 5 low overall confidence records. |
| Overall confidence distribution | 20 high / 130 medium / 30 low | This field covers the whole encounter, not individual skill assertions. |

No per-slot source-confirmation field exists in these 180 records. A reliable total of fully source-confirmed loadouts therefore cannot be computed from the metadata alone. This focused source review establishes a lower bound of **one complete matching four-move set**, Dark Door 6's species 359: the [2010-06-04 first-person guide](https://news.4399.com/seer/ahwdc/201006-04-70264.html) explicitly summarizes `混沌潮汐`, `邪光水泵`, `海洋之心`, and `海妖之力`, exactly matching `[10882,10885,20143,20397]`. The remaining 179 were not all subjected to an equivalent four-slot source audit here. This is a review-coverage bound, not a finding that only one is historically correct.

Additional focused boundaries:

- For species 356, the [Dark Door 6 guide](https://news.4399.com/seer/ahwdc/201105-30-98440.html) explicitly names three common boss moves: `虚体闪电`, `阴云密布`, and `蓄能炸弹`. All three match the record. It does not establish the fourth `超自然闪电`; the record's overall high confidence does not fill that gap. The page displays 2011-05-26 even though its URL and retained source note say May 30.
- For species 755, the [2011-07-21 player strategy collection](https://news.4399.com/seer/jingyanxinde/201107-21-105242.html) supports an 80-level encounter and a physical-attack tactic but does not list the boss's four moves. The stored record marks skills uncertain. Its general species skill table is not boss-loadout proof.
- For species 261, the [2011-03-16 Gaia guide](https://news.7k7k.com/content/20110316/76727.html) explicitly observes the boss using `末日宣告`. Its separate recommended player moves must not be mistaken for the boss's loadout. The complete boss quartet remains outside this review's confirmed set.
- Both ordinary Rei and its training shadow retain explicit skill uncertainty in their records. The fact that their species' ordinary or reward moves are known does not certify the boss's exact four slots.

## Separation from the 21 elite additions

The elite species-to-build map is consumed only by `eliteMember` inside `createFacilityEncounter(...,'elite',...)`. Original boss loading does not call the elite member factory or the ordinary automatic four-move selector. The NPC-training normalizer requires an explicit trainer context and profile; it does not infer a training profile from species 70 or 261.

A read-only Vite SSR check loaded all 180 active boss records and applied both normalizers independently. `normalizeBossSkillPolicy` changed exactly `boss_tower_brave_f061`; `normalizeNpcTrainingEncounter` changed zero original boss records. The 21 elite additions intersect 14 original boss team members in 14 encounter files. Every one of those members kept its original skill array under both normalizers, and the catalog itself remained unchanged.

| Relevant original encounter | Species | Preserved stored skills |
| --- | ---: | --- |
| `boss_dark_door6_sijiaerka` | 356 | 10874, 20394, 10876, 10877 |
| `boss_spt_sipulinte` | 755 | 11841, 20934, 11836, 20933 |
| `boss_rei` | 70 | 10170, 10176, 20087, 20086 |
| `boss_rei_training5` | 70 | 10825, 10823, 20364, 10170; its sequence selects 10825 |
| `boss_gaia` | 261 | 10715, 10714, 10720, 20312 |
| No original boss record in the current catalog | 599 | Its authored elite support build has no same-species original boss to overwrite. |
| `boss_tower_brave_f061`, first member | 270 | Raw JSON retains 20330; the V46 runtime policy replaces it with 20328. Species 270 is not one of the 21 elite additions. |

The remaining matching records are `boss_buleike`, `boss_campaign_baihu_guardians` (Medusa at member index 2), `boss_campaign_qinglong_guardians` (Ersaila at index 3), `boss_campaign_zhuque_guardians` (Kaxius at index 1), `boss_dark_door6_bulinkeke`, `boss_kaxiusi`, `boss_spt_eersaila`, `boss_spt_fuxisi`, and `boss_spt_moduosa`. Their skill arrays also pass the isolation check. The findings concern preservation and routing, not historical confirmation of those arrays.

## Minimal restoration and proportionate checks

The production owner should remove the automatic boss move-replacement call from the original-boss start path, preserving the existing imported records and explicit encounter references. Do not replace 20330 with a different natural move or remove it merely because it costs all HP. Keep the 21 elite builds and their trainer support logic separate. No source JSON rewrite is required to restore 20330; adding a precise provenance note is a separate documentation decision.

The targeted verification should establish:

1. All 180 original encounters retain their stored member skills, explicit AI move arrays/weights, and phase or variant move references through the actual start preparation. No replacement, deletion, reordering, or species-based elite overlay is allowed.
2. Starting the real Tower 61 encounter presents species 270 with `[10748,10744,10747,20330]`, the original three-member lineup, and unchanged HP/level/rules. Its AI references retain 20330, and 20328 is not newly inserted.
3. An explicit use of the restored 20330 can sacrifice the first boss and transfer its stored benefit to the next living member. This functional check verifies the retained script, not exact historical AI frequency or a complete server reconstruction. Avoid a new blanket boss-side selection ban that makes the restored move unusable.
4. The 14 overlapping original members remain unchanged while the distinct elite trainer variants still receive their authored builds. In particular, 356 and 755 do not gain the elite sacrifice moves, and original 70/261 do not acquire trainer-only profiles.
5. Revise the old `boss-and-support-v46.mjs` expectations that required replacing 20330 and sanitizing all boss self-KO references. Retain unrelated trainer support and player move tests. Confirm original boss data bytes and the source catalog remain unchanged by preparation.

The completed read-only checks cover inventory, provenance flags, commit preservation, normalizer effects, and elite/original isolation. Restoration implementation and its final controller/battle tests are the production owner's work. No full 180-boss historical loadout certification is claimed.

| Reviewed file | SHA-256 at the V46 review point |
| --- | --- |
| `data/bosses/boss_tower_brave_f061.json` | `c798b4ccaaca94b3d8f43841aa7090e57598d6e40fa2b923ea6d1747ff939e06` |
| `src/progression/boss-skill-policy.ts` | `539e0d5324a19574e70d3dbbc76bbcdb19cd6053fd6e2a221dd278417940ec45` |
