#!/usr/bin/env python3
"""Build conservative, field-specific provenance without changing encounter data.

Run with --check to check the tracked ledger; omit it to regenerate it.
Only the small explicit claim table below can promote a field to observed.
Existing confidence labels and source URLs never promote fields automatically.
"""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ("level", "iv", "evs", "nature", "hp", "skills")
RANK = {"official": 0, "observed": 1, "authored": 2, "inferred": 3}
SOURCES: dict[str, dict] = {}
USER_POLICY_LEDGER = json.loads((ROOT / "data/boss-user-policies-v57.json").read_text())


def source(url: str, scope: str = "Listed by an encounter; no field verified by URL presence.",
           verification: str = "metadata-only") -> str:
    key = "src-" + sha256(url.encode()).hexdigest()[:12]
    prior = SOURCES.get(key)
    if prior is None or verification != "metadata-only":
        SOURCES[key] = {"url": url, "scope": scope, "verification": verification}
    return key


def evidence(status: str, basis: str, note: str, sources: list[str] | None = None, **extra) -> dict:
    return {"status": status, "basis": basis, "note": note, "sources": sources or [], **extra}


def observed(note: str, sources: list[str]) -> dict:
    return evidence("observed", "verified-period-observation", note, sources)


def unknown(field: str, row: dict, member: dict, sources: list[str]) -> dict:
    uncertain = row.get("confidence", {}).get("uncertain", [])
    if field in ("iv", "evs", "nature"):
        return evidence("inferred", "explicit-estimate", "The assigned boss IV, EVs and nature are remake calibration. Official species bases and nature multipliers do not establish this server encounter's assignment.")
    if field == "level" and member["level"] > 100:
        return evidence("inferred", "explicit-estimate", "The internal over-cap level is an estimate. The recovered client displays ?? above 100; hidden display does not reveal an exact server level.", [CLIENT])
    if row["id"].startswith("boss_campaign_") and field == "level":
        return evidence("inferred", "explicit-estimate", "Level 100 is an explicit campaign calibration; this opponent's exact server level was not recovered.")
    return evidence("inferred", "explicit-estimate" if field in uncertain else "unverified", {
        "level": "The configured level has not been verified by the curated field claims below.",
        "hp": "Exact HP has not been established for this member; approximate reports, extrapolation and reconstructed formulas are not exact server parameters.",
        "skills": "A species learnset or a report naming some attacks does not certify the complete four-slot boss loadout.",
    }[field], sources)


CLIENT = source("https://seer.61.com/dll/PetFightDLL.swf",
    "Cached official BaseFighterPropView.update, ABC method 18723, offsets 75-115: levels <=100 are numeric; larger values use string ??. This later client is not a dated 2009-2013 server-stat snapshot.", "verified-client")
SOURCES[CLIENT].update({"localPath": ".cache/hd-ui-v44/sources/PetFightDLL.swf", "sha256": "1e6987a4e9bc8a78180f9946b1770afaee54b00959e1861450dcaef729b57970", "xmlPath": ".cache/hd-ui-v44/xml/PetFightDLL.xml", "method": 18723})
TOWER = source("https://news.4399.com/seer/yzzt/201004-13-66291.html", "2010 tower report: floor 1-30 displayed levels; hidden levels above 30; specific floor 50/57 HP observations; floor 60 damage restriction; moves named on floors 18 and 34. No exact internal 120/130 level mapping.", "verified-period-observation")
TECHBANG = {start: source(f"https://www.techbang.com/posts/{post}",
    f"2011-01-19 T客邦 tower guide, floors {start}-{start + 9} (TW server): per-floor boss HP table; listed levels and rewards match the CN 2010 report.",
    "verified-period-observation") for start, post in {11: "33131", 21: "33132", 31: "33133"}.items()}
TOWER_HP = dict(zip(range(12, 36), [260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 365, 380, 395, 410, 425, 440, 460, 480, 500,
                                    520, 540, 560, 580, 600]))
MOSHI = source("https://news.4399.com/seer/spt/201006-05-70398.html", "2010-06-05 report: level 50, HP 3000000, four named moves, half-HP lethal phase, below-1000000 status threshold, qualitative lost-HP damage growth.", "verified-period-observation")
EER = source("https://news.4399.com/seer/spt/201008-14-75469.html", "Page dated 2010-08-13: weekday traits. Wednesday reflection threshold >150, Thursday heal 1000, Friday status finish, Saturday qualitative critical increase; no exact reflection ratio or revive count.", "verified-period-observation")
KEN = source("https://news.4399.com/seer/spt/201101-17-84758.html", "Temporary reflection shield with expiration and approximate one-fifth HP-loss berserk trigger. No 25% ratio or speed override is stated.", "verified-period-observation")
LAOKE = source("https://news.4399.com/seer/spt/201010-16-78995.html", "Page dated 2010-09-17: both sides double damage, both lose 100 HP per turn, or both heal 10% per turn. The double-damage field is reported at HP 5000.", "verified-period-observation")
CLASSIC = source("https://news.4399.com/seer/seertuijiangonglue/sptgonglue/201006-01-69998.html", "2010-06-01 report: selected classic levels, HP and named moves. HP and lethal thresholds conflict with some later guides; approximate values remain inferred.", "verified-period-observation")
LIST2011 = source("https://news.7k7k.com/content/20110316/76862.html", "2011-03-16 classic boss observations; selected complete named move lists and levels. Reports differ across versions, including Mushroom level and Hamo HP.", "verified-period-observation")
DARK = {door: source("https://news.4399.com/seer/ahwdc/201105-30-" + suffix + ".html", "Dark-door report: displayed levels, HP and explicitly named attacks only; unnamed loadout slots remain inferred. Page bylines for doors 1-7 read 2011-05-26, not the date embedded in the URL.", "verified-period-observation") for door, suffix in {1: "98433", 2: "98434", 3: "98436", 4: "98438", 5: "98439", 6: "98440", 7: "98441"}.items()}
SPT2011 = source("https://news.4399.com/seer/jingyanxinde/201107-21-105242.html", "2011-07-21 player report explicitly lists selected encounter levels; Difute is displayed as ??. It also reports Puni's sixth-life HP 65000.", "verified-period-observation")
DARK8 = source("https://news.4399.com/seer/ahwdc/201105-28-98332.html", "The URL embeds a 2011 date, but the current page byline is 2013-12-03. HP values are explicitly approximate; complete loadouts and levels are not supplied.", "verified-period-observation")
DARK9 = source("https://news.4399.com/seer/ahwdc/201105-30-98372.html", "The URL embeds a 2011 date, but the current page byline is 2013-12-03. Akenoya has HP 2500 and replenishes 2500 once: two total lives. The other two HP figures are approximate.", "verified-period-observation")
BULIN = source("https://news.4399.com/seer/ahwdc/201006-04-70264.html", "2010-06-04 firsthand report names all four Bulinkeke attacks. Its below-100 refill guess conflicts with the later below-200 report.", "verified-period-observation")
QILIN = source("https://news.4399.com/gonglue/seer/jingyanxinde/305908.html", "2013-10-04 report lists the six body HP values and the final 15000-HP recovery. The same article conflicts between +12 and +6 revival boosts.", "verified-period-observation")
PUNI = source("https://news.7k7k.com/content/20101028/18173.html", "2010-10-28 report supports body lives 1 and 6 at 7000 and 65000 HP. Other life totals conflict within this article or across sources; they remain inferred.", "verified-period-observation")
RIOS = source("https://news.4399.com/seer/spt/201006-05-70392.html", "2010-06-05 report explicitly gives level 35, HP 340 and four named attacks.", "verified-period-observation")
NADUO = source("https://news.4399.com/seer/spt/201006-05-70395.html", "2010-06-05 report gives level 70, HP 1400 and four named attacks, but later text guesses 2000-3000 HP. Preserve this conflict.", "verified-period-observation")
MUSHROOM = source("https://news.4399.com/seer/spt/201006-05-70388.html", "2010-06-05 report says level 15; 2011 summaries say level 10. Both name the same four attacks.", "verified-period-observation")


def set_field(entry: dict, field: str, expected, proof: dict, slot: int = 0) -> None:
    actual = entry["members"][slot]["configured"][field]
    matches = sorted(actual) == sorted(expected) if field == "skills" else actual == expected
    if not matches:
        raise ValueError(f"Curated claim no longer matches {entry['id']}[{slot}].{field}: {actual!r}")
    entry["members"][slot]["fields"][field] = deepcopy(proof)


def partial_skills(entry: dict, ids: list[int], src: str | list[str], slot: int = 0, note: str | None = None) -> None:
    member = entry["members"][slot]
    if not set(ids).issubset(member["configured"]["skills"]):
        raise ValueError(f"Named move no longer configured: {entry['id']}")
    srcs = [src] if isinstance(src, str) else src
    note = note or "Only the listed move IDs are individually supported. Remaining slots and the completeness of the loadout remain inferred."
    member["fields"]["skills"].update({"verifiedMoveIds": ids, "sources": srcs, "note": note})


def rule_nodes(value, path: str = "", condition: dict | None = None):
    if isinstance(value, dict):
        condition = value.get("when", condition)
        if "rule" in value or "op" in value:
            yield path, value, condition
        for key, child in value.items():
            if key not in ("source_note", "engine_notes"):
                yield from rule_nodes(child, f"{path}.{key}" if path else key, condition)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from rule_nodes(child, f"{path}[{index}]", condition)


def rule_proof(boss_id: str, path: str, node: dict) -> dict:
    symbol = node.get("id", node.get("rule", node.get("op")))
    if boss_id == "boss_spt_moshidilu" and symbol == "forced_execution_below_pct":
        if node != {"rule": "forced_execution_below_pct", "pct": 25}:
            raise ValueError("Moshidilu no longer matches the user-adopted strict-quarter policy.")
        return evidence("authored", "user-adopted-policy", "The user explicitly chose strict current HP below 25%, forced-first attacking and direct KO, with ordinary behavior restored at 25% or above. Historical guides conflict between half and quarter HP; this is a remake policy, not server certification.", [MOSHI, CLASSIC], policyId="v57-moshidilu-quarter-execution")
    if boss_id == "boss_spt_eersaila" and symbol == "crit_rate_scales_with_hp_lost":
        return evidence("authored", "user-waived-mechanic", "The historical qualitative probability claim remains unquantified and is explicitly omitted by user request; no numerical curve is executed.", [EER], policyId="v57-eersaila-critical-curve", scopeStatus="waived")
    specific = {
        ("boss_spt_moshidilu", "ignore_type_chart"): (MOSHI, "Neutral type interaction is explicitly reported."),
        ("boss_spt_moshidilu", "damage_scales_with_hp_lost"): (MOSHI, "Damage increases as HP falls; no formula is reported."),
        ("boss_spt_moshidilu", "ohko_attacks"): (MOSHI, "The detailed report supports the half-HP lethal phase and speed override; other period summaries give a conflicting threshold."),
        ("boss_spt_moshidilu", "block_new_status"): (MOSHI, "The report gives an absolute threshold below 1000000 HP. Persistence of existing statuses and event timing require reconstruction."),
        ("boss_spt_eersaila", "revive_unless_status_ko"): (EER, "The status-finish requirement is reported; a precise seven-revival cap is not established by this source."),
        ("boss_spt_eersaila", "reflect_damage"): (EER, "Wednesday reflects hits above 150; the reflection fraction is not given."),
        ("boss_spt_eersaila", "crit_rate_scales_with_hp_lost"): (EER, "A qualitative low-HP critical increase is reported; beneficiary and numerical formula are unresolved."),
        ("boss_spt_kenpeide", "reflect_damage"): (KEN, "A temporary shield is reported. Always-on reflection and a 25% ratio are not source-certified."),
        ("boss_spt_kenpeide", "ohko_attacks"): (KEN, "Berserk after approximately one-fifth HP loss is reported; exact threshold, timing and speed override are not established."),
        ("boss_spt_laokemengde", "field_heal_each_turn"): (LAOKE, "Both sides heal 10% per turn in the healing field."),
        ("boss_spt_laokemengde", "field_damage_each_turn"): (LAOKE, "Both sides lose 100 HP per turn in the extreme field."),
        ("boss_spt_laokemengde", "field_damage_multiplier"): (LAOKE, "Both sides deal double damage in the energy field."),
        ("boss_spt_eersaila", "heal_flat_each_turn"): (EER, "Thursday healing is reported as 1000 per turn; whether using an item skips it is left uncertain by the reporter."),
        ("boss_dark_door9_akenuoya", "lives"): (DARK9, "Two total lives of 2500 HP are reported. The engine's count parameter counts extra revivals, so one is required."),
        ("boss_tower_brave_f060", "damage_only_from_own_type_normal_or_status"): (TOWER, "Floor 60 allows the defender's own type, Normal attacks and status-category effects. Exact event semantics remain reconstructed."),
    }
    hit = specific.get((boss_id, symbol))
    if hit:
        src, note = hit
        exact_fields = {
            "field_heal_each_turn": {"pct_max_hp": 10, "sides": "both"},
            "field_damage_each_turn": {"amount": 100, "sides": "both"},
            "field_damage_multiplier": {"multiplier": 2, "sides": "both"},
        }
        if boss_id == "boss_spt_laokemengde" and node.get("params") == exact_fields.get(symbol) and symbol in exact_fields:
            return observed(note + " This supports the stated effect and magnitude, not every engine hook.", [src])
        if boss_id == "boss_spt_moshidilu" and symbol == "ignore_type_chart":
            return observed(note, [src])
        return evidence("inferred", "unverified", note, [src], mechanicStatus="observed", parameterStatus="inferred")
    return evidence("inferred", "unverified", "This exact rule, parameter set and event timing have not been independently certified. Consult the separate execution-support ledger for engine coverage.")


def curate(entries: dict[str, dict]) -> None:
    levels = list(range(30, 70, 2)) + [70, 73, 76, 79, 82, 85, 88, 92, 96, 100]
    for floor, level in enumerate(levels, 1):
        entry = entries[f"boss_tower_brave_f{floor:03d}"]
        set_field(entry, "level", level, observed("The floor's displayed level is explicitly listed in the 2010 report.", [TOWER]))
    set_field(entries["boss_tower_brave_f050"], "hp", 900, observed("The floor-50 refill is reported to restore HP to 900.", [TOWER]))
    for floor, hp in TOWER_HP.items():
        proof = observed("The floor's boss HP is explicitly listed in the 2011 TW-server tower guide.", [TECHBANG[floor - (floor - 1) % 10]])
        set_field(entries[f"boss_tower_brave_f{floor:03d}"], "hp", hp, proof)
    partial_skills(entries["boss_tower_brave_f018"], [10073], TOWER)
    partial_skills(entries["boss_tower_brave_f034"], [10215], TOWER)
    set_field(entries["boss_tower_brave_f057"], "hp", 750, observed("The report specifically gives the species-79 member 750 HP; this is not extended to its teammates or every later floor.", [TOWER]), slot=1)
    curate_tower_high(entries)
    for boss_id, fields, src in [
        ("boss_spt_moshidilu", {"level": 50, "hp": 3000000, "skills": [10540, 10543, 20232, 20231]}, MOSHI),
        ("boss_spt_younasi", {"level": 70, "hp": 2800, "skills": [10410, 20176, 10406, 10409]}, CLASSIC),
        ("boss_spt_nainifenduo", {"level": 60, "hp": 8000}, CLASSIC),
        ("boss_spt_hamoleite", {"level": 80, "skills": [10618, 10617, 10622, 20269]}, CLASSIC),
        ("boss_spt_akexiya", {"level": 65, "skills": [10207, 10208, 20060, 10218]}, CLASSIC),
        ("boss_rei", {"level": 70}, CLASSIC),
        ("boss_spt_gangyasha", {"level": 25, "skills": [10075, 20011, 10076, 20040]}, LIST2011),
        ("boss_spt_liaosi", {"level": 35, "skills": [10098, 20051, 10099, 10096]}, LIST2011),
        ("boss_spt_moguguai", {"skills": [10042, 10001, 20020, 20004]}, LIST2011),
        ("boss_spt_liaosi", {"hp": 340}, RIOS),
        ("boss_spt_naduolei", {"level": 70, "skills": [20113, 10247, 10249, 10246]}, NADUO),
        ("boss_dark_door6_bulinkeke", {"skills": [10882, 10885, 20143, 20397]}, BULIN),
    ]:
        for key, value in fields.items():
            set_field(entries[boss_id], key, value, observed("This configured value or complete named loadout is explicitly reported by the cited period guide; it is not an official server dump.", [src]))
    # These reports name fewer than four attacks. Do not upgrade the whole loadout.
    dark_members = {1: [("moyasha", 50, 300)], 2: [("beilujide", 60, 500)], 3: [("bafuluo", 70, 700), ("qilatadun", 75, 750)], 4: [("xisalasi", 80, 800), ("kelinkaxiu", 85, 800)], 5: [("kaku", 90, 900), ("hedeka", 95, 950), ("yilanluoni", 100, 1000)], 6: [("sijiaerka", 100, 1200), ("aieryiluo", 100, 1500), ("bulinkeke", None, 2000)], 7: [("mohuashizhe", 100, 1800), ("moerjiasi", 100, 2000), ("sanuolasi", 100, 2000)]}
    for door, members in dark_members.items():
        for name, level, hp in members:
            entry = entries[f"boss_dark_door{door}_{name}"]
            for field, value in [("level", level), ("hp", hp)]:
                if value is not None:
                    set_field(entry, field, value, observed("Explicit value in the cited dark-door report; this does not establish the other combat stats.", [DARK[door]]))
    for boss_id, moves, door in [("boss_dark_door4_kelinkaxiu", [10153, 10555, 10156, 20238], 4), ("boss_dark_door7_sanuolasi", [10035, 11172, 10084, 20457], 7)]:
        set_field(entries[boss_id], "skills", moves, observed("All four configured attacks are named in the report.", [DARK[door]]))
    partial_skills(entries["boss_dark_door6_sijiaerka"], [10874, 20394, 10876], DARK[6])
    for suffix, level in {"tiyasi": 45, "leinaduo": 75, "taxiya": 70, "takelin": 80, "eersaila": 80, "sipulinte": 80, "laokemengde": 80, "kelanite1": 50, "kelanite2": 80, "moduosa": 80, "kenpeide": 80, "yalunsi": 80, "delasa": 70}.items():
        set_field(entries["boss_spt_" + suffix], "level", level, observed("Displayed level explicitly listed in the 2011 player report.", [SPT2011]))
    for boss_id in ("boss_gaia", "boss_kaxiusi"):
        set_field(entries[boss_id], "level", 70, observed("Displayed level explicitly listed in the 2011 player report.", [SPT2011]))
    for slot, hp in enumerate([20000, 15000, 15000, 10000, 15000, 50000]):
        set_field(entries["boss_campaign_qilin_body"], "hp", hp, observed("This body's life HP is explicitly listed in the 2013-10-04 report. Wheel challenges are distinct encounters.", [QILIN]), slot=slot)
    for slot, hp in [(0, 7000), (5, 65000)]:
        set_field(entries["boss_puni_zhenshen"], "hp", hp, observed("This life's HP is explicitly listed in the 2010 report; conflicting other lives remain inferred.", [PUNI]), slot=slot)
    entries["boss_spt_difute"]["members"][0].update({"displayLevelUnknown": True, "displayEvidence": observed("The 2011 report explicitly displays ??; internal level 80 is a remake estimate and must not replace the historical display.", [SPT2011])})
    # Narrow claims with disagreement or approximation stay inferred even when read.
    for boss_id, field, srcs, note in [
        ("boss_spt_laokemengde", "hp", [LAOKE], "HP 5000 is reported for the energy field. Applying it to all three field variants remains inferred."),
        ("boss_dark_door8_paduoni", "hp", [DARK8], "The source says approximately 1600 HP; exact HP and level remain unverified."),
        ("boss_dark_door8_jialuode", "hp", [DARK8], "The source says approximately 1700 HP; exact HP and level remain unverified."),
        ("boss_dark_door8_saduolani", "hp", [DARK8], "The source says approximately 1500 HP; exact HP and level remain unverified."),
        ("boss_dark_door9_dipulide", "hp", [DARK9], "The source says approximately 1500 HP; exact HP and level remain unverified."),
        ("boss_dark_door9_bailuoyasi", "hp", [DARK9], "The source says approximately 1200 HP; exact HP and level remain unverified."),
    ]:
        entries[boss_id]["members"][0]["fields"][field] = evidence("inferred", "explicit-estimate", note, srcs, observationStatus="observed")
    akenoya = entries["boss_dark_door9_akenuoya"]
    if akenoya["members"][0]["configured"]["hp"] == 2500:
        set_field(akenoya, "hp", 2500, observed("The report explicitly states HP 2500 and another 2500 after the first KO, not a 2500 total split across two lives.", [DARK9]))
    else:
        akenoya["members"][0]["fields"]["hp"] = evidence("inferred", "unverified", "The configured 1250 conflicts with a report of 2500 per life. A separate authorized data correction is pending.", [DARK9], observedValue=2500)
    for key in ("level", "hp"):
        entries["boss_spt_saiweier"]["members"][0]["fields"][key] = evidence("authored", "remake-policy", "The solo Seville encounter deliberately uses authored difficulty values; cooperative-era parameters are not substituted.")


SEER_DATA = "https://raw.githubusercontent.com/Nattsu39/seer_data/a00bcdd5800e3bae5df881b4994a170a87541115/resource/config/xml/"
MAPS = source(SEER_DATA + "maps.json", "Official client config (seer_data a00bcdd): SPT rows Maps.Map[].Bosses.Boss[] give MonID, Hp and Lv. "
              "Its levels agree with every period-stated SPT level checked; several single-player HP values are later reductions.", "verified-client")
SOURCES[MAPS]["sha256"] = "a913f0085b9a3908749dcbe88b0d6f488825af6804039289d76a655e11faf7e3"
MONSTERS = source(SEER_DATA + "monsters.json", "Official client config (seer_data a00bcdd): learnsets of the boss-only forms. ID 5012 亚伦斯 (RealId 672), "
                  "used by the SPT row, lists only 11668; ID 5022 斯普林特 lists 20933, 11836, 20934 and 11841.", "verified-client")
SOURCES[MONSTERS]["sha256"] = "12d8c059973a9c03560d3739910ecb5a578da3a1235c24260279b723743d7936"


def period(url: str, scope: str) -> str:
    return source(url, scope, "verified-period-observation")


TW_TABLES = {start: period(f"https://www.techbang.com/posts/{post}",
                           f"T客邦 2011-01-19 Brave Tower floors {start}-{end} (TW server): one table per floor with name, HP and type.")
             for start, end, post in [(31, 40, 33133), (41, 50, 33135), (51, 53, 33136), (54, 56, 33139), (57, 60, 33146)]}
TW6566 = period("https://www.techbang.com/posts/33166", "T客邦 2011-01-19 Brave Tower floors 65-66 (TW server): fight order and named moves.")
T41 = period("https://news.4399.com/seer/yzzt/201001-10-62507.html", "4399 2010-01-10 floors 41-50: named moves of floors 41, 46, 48 and 50.")
T4145 = period("https://news.4399.com/seer/yzzt/201001-18-63642.html", "4399 2010-01-18 floors 41-45: named moves of floors 42 and 44.")
T5560 = period("https://news.4399.com/seer/yzzt/201001-18-63641.html", "4399 2010-01-18 floors 55-60: 60F attack-use counts and 洛比特's 暗黑加持.")
T52 = period("https://news.4399.com/seer/yzzt/201005-26-69566.html", "4399 2010-05-26 repost: 52F 巴拉龟's 光栅炮 and 高压水枪.")
T5160 = period("https://news.4399.com/seer/yzzt/201006-02-70107.html", "4399 2010-06-02 floors 51-60 tips: 55F 栖息 and 59F 浴火重生.")
RUN4966 = period("https://news.4399.com/seer/yzzt/201006-23-71411.html", "4399 2010-06-23 run of floors 49-66: fight orders, line-ups and named moves.")
SPEED6170 = period("https://news.7k7k.com/content/20100622/9177.html", "7k7k 2010-06-22 run of floors 61-70: named moves of floors 65, 66, 67 and 69.")
LIST6170 = period("https://news.4399.com/seer/jingyanxinde/201006-18-71186.html", "4399 2010-06-18 release-day floor 61-70 list: line-ups and 70F 冬眠.")
EASY6170 = period("https://news.4399.com/seer/jingyanxinde/201010-10-78575.html", "4399 2010-10-10 floors 61-70: 63F 狙击 and 66F psychic-only 闪尼.")
JUXIA = period("https://www.juxia.com/news/2011-9-23/15944.html", "聚侠 2011-09-23 floors 61-65 headings: Lv and HP, the HP stated for each monster.")
RUN70 = period("https://news.7k7k.com/content/20100708/10242.html", "7k7k 2010-07-08 floor-70 run: 炽翼蝶's 燃烧之翼 and 橡木蝶's 橡木贤者.")
SOLO60 = period("https://news.7k7k.com/content/20100729/11741.html", "7k7k 2010-07-29 floor-60 solo: 艾迪希洛 uses one normal physical attack against light.")
ZHIDAO58 = period("https://zhidao.baidu.com/question/167247201.html", "Baidu Zhidao 2010-07: 58F 蝠迪's 音波干扰 and 66F 波克尔's 突进. Weak forum support.")
ZHIDAO70 = period("https://zhidao.baidu.com/question/185752745.html", "Baidu Zhidao 2010-09/10: 70F 橡木蝶's 木之振奋 has 30 uses. Weak forum support.")
TOWER_HIGH_MOVES = [
    (38, 0, [10043], TOWER), (40, 0, [10153], TOWER), (41, 0, [20091, 10180, 10181], [T41, TOWER]), (42, 0, [10315, 10310], T4145),
    (44, 0, [10299, 10301, 20134], T4145), (46, 0, [10326], T41), (48, 0, [10256, 20116], [T41, TOWER]), (50, 0, [10188, 10189], T41),
    (51, 0, [10064], TOWER), (52, 0, [10073, 10027], T52), (55, 0, [10026, 10060, 20027], [TOWER, RUN4966, T5160]),
    (58, 1, [10274], RUN4966), (58, 2, [10261, 10164, 20119], [RUN4966, ZHIDAO58]), (59, 0, [20116], T5160), (60, 0, [20184], T5560),
    (60, 1, [10432, 10436], [SOLO60, RUN4966]), (60, 2, [10445], RUN4966), (61, 0, [20330], RUN4966), (62, 0, [10670, 10671], [RUN4966, JUXIA]),
    (63, 0, [20355], EASY6170), (65, 2, [10654], SPEED6170), (66, 0, [10038, 10039], [ZHIDAO58, RUN4966]), (66, 1, [10219], TW6566),
    (66, 2, [10039], TW6566), (67, 1, [20264], SPEED6170), (69, 0, [20289], SPEED6170), (70, 0, [20409], LIST6170),
    (70, 2, [20415], RUN70), (70, 3, [10918, 20416], [RUN70, ZHIDAO70]),
]


def curate_tower_high(entries: dict[str, dict]) -> None:
    """Brave Tower floors 36-70: per-floor HP tables and individually named moves."""
    tower = lambda floor: entries[f"boss_tower_brave_f{floor:03d}"]
    table_note = "This member's HP is listed in the floor's table; TW server, not the mainland server."
    for floor in range(36, 61):
        table = TW_TABLES[max(start for start in TW_TABLES if start <= floor)]
        for slot in range(len(tower(floor)["members"])):
            if (floor, slot) in ((50, 0), (57, 1)):
                continue  # Already curated from the 2010 report.
            set_field(tower(floor), "hp", 20 * floor - 100, observed(table_note, [table]), slot=slot)
    for floor in range(61, 66):
        for slot in range(len(tower(floor)["members"])):
            set_field(tower(floor), "hp", 50 * floor - 1900, observed("The floor heading states this HP for each of its monsters.", [JUXIA]), slot=slot)
    for floor, slot, ids, srcs in TOWER_HIGH_MOVES:
        partial_skills(tower(floor), ids, srcs, slot=slot)
G4399, G7K = "https://news.4399.com/seer/spt/", "http://news.7k7k.com/content/"
AJIASHA = period(G4399 + "201201-10-137149.html", "Page dated 2012-01-10: 阿加莎，80级，草系，8000血左右, and four named attacks.")
AKEXIYA = period(G4399 + "200911-23-48480.html", "Page dated 2009-11-23: 等级：65级, 阿克希亚生命：1000.")
ANYE = period(G4399 + "201112-05-130110.html", "2011-12 report: 暗夜冰狐 level 80, HP 8000左右 and four named attacks.")
BOKATE = period(G4399 + "201206-02-165052.html", "2012-06 report: 博卡特 体力12000.")
DELASA = period(G7K + "20110328/82467.html", "2011-03-28 report: the 19:00-21:00 limited mode lowers 德拉萨's HP from 10000 to 5000 and weakens its attacks.")
DELASA2 = period(G7K + "20110331/82812.html", "2011-03-31 report: the daytime 德拉萨 has 10000 HP and strong attacks; the evening one has 5000.")
DIFUTE = period(G4399 + "201108-23-111513.html", "Page dated 2011-08-23: 迪符特 HP10000, unlimited PP.")
EER_FRI = period(G7K + "20100816/12668.html", "2010-08-16 report: the Friday 厄尔塞拉 revives to its full 3000 HP.")
EER_SUN = period(G7K + "20100809/12297.html", "2010-08-09 report: the Sunday 厄尔塞拉 has HP 5000.")
EER_SAT = period(G7K + "20100809/12295.html", "2010-08-09 report: the Saturday 厄尔塞拉 hits 丽莎布布 with 时空裂痕 for 30-40 HP.")
EER_ZHIDAO = period("https://zhidao.baidu.com/question/186710571.html", "Baidu Zhidao 2010-09-26: the Friday 厄尔塞拉 只会用光芒附体与时空裂痕; 对于草系只会用属性和100攻击的普通.")
FUXISI = period(G4399 + "201212-31-227044.html", "Page dated 2012-12-31: 弗希斯，草暗影系，体力10000.")
GUER = period(G4399 + "201109-17-115971.html", "2011-09 report: 古尔扎迪，80级，地面系，5000血左右, and four named attacks.")
HAMO = period(G7K + "20100816/12660.html", "2010-08-16 report: 哈默雷特有10000的血.")
KAILUOYA = period(G4399 + "201203-17-148791.html", "Page dated 2012-03-17: four named 凯洛亚 attacks.")
KALUNNI = period(G4399 + "201204-07-152582.html", "2012-04 report: 卡伦尼 血量8000 (有待验证).")
KELAIFEN = period(G4399 + "201108-23-111468.html", "2011-08 report: the second 克莱芬 fight is level 80.")
KELANITE = period(G4399 + "201011-22-81263.html", "Page dated 2010-11-22: the first 克拉尼特 form uses 火龙红莲击 until its PP is drained.")
LANSITE = period(G4399 + "201202-08-141904.html", "2012-02 report: 兰斯特，80级，战斗地面系，12000血左右, and four named attacks.")
LEINADUO = period(G4399 + "201006-05-70396.html", "2010-06-05 report: 雷纳多 level 75 and four named attacks.")
LUOLA = period(G4399 + "201211-24-216477.html", "2012-11-24 report: 洛拉斯克 returns to level 100 after a capture; the original lowered its level with each win.")
MUSH7K = period(G7K + "20100816/12649.html", "2010-08-16 report: 蘑菇怪 等级：10级.")
PALISI = period(G4399 + "201208-22-189879.html", "Page dated 2012-08-22: 帕里斯 血量大概12000 and 帕里斯血量12000.")
PULANTE = period(G4399 + "201205-19-161367.html", "2012-05-19 report: 8000血量; the boss uses 混沌绿光, 蚀梦术 and 灵光缠绕.")
SIKELU = period(G4399 + "201209-21-199064.html", "Page dated 2012-09-21: 斯克鲁 体力8000.")
TIYASI = period(G4399 + "201006-05-70393.html", "2010-06-05 report: 提亚斯 level 45 and four named attacks.")
YALUNSI = period(G4399 + "201102-28-87994.html", "2011-02 report: 亚伦斯 体力为5000.")
ROBOT2013 = source("https://web.archive.org/web/20130706235627id_/http://seer.61.com/dll/RobotCoreDLL.swf?hir2eh3c",
                   "Official 2013-07-06 client PetXMLInfo (DefineBinaryData 196): boss-only form 2522 斯普林特 lists 20933, 11836, 20934, 11841.",
                   "verified-client")
# The 2026-10-19 SPT moveset pass (design/notes/spt-movesets-2026-10-19.md): every quote and screenshot below was re-read on its page.
V4399, G4399J, G4399G = "http://v.4399pk.com/seer/video_", "https://news.4399.com/seer/jingyanxinde/", "https://news.4399.com/gonglue/seer/saiergonglue/"
KEN_LIST = period("http://news.4399.com/seer/jingyanxinde/201101-18-84816.html",
                  "Page dated 2011-01-18: 常用技能 暗流深渊，暗影之力，暗黑狂流，黑色旋涡 (catalog 黑色漩涡); it also reports fear.")
SILIPU_VIDEO = period(V4399 + "120526.htm", "4399 fight video (page dated 2012-06-21): the Boss's battle log shows 混沌惩戒, 震怒之魂, 展翅冲锋 and 龙怒乾坤.")
SILIPU_TEXT = period(G4399J + "201204-28-156784.html", "Page dated 2012-04-28: after its boosts are cleared the Boss uses 龙怒乾坤.")
KALUNNI_LIST = period("https://www.juxia.com/news/2012-4-7/37635.html", "聚侠 2012-04-07: 常用技能 异界毒蔓，黑暗魔影草，暗能吸收，魔雾缠绕.")
KALUNNI_VIDEO = period(V4399 + "116640.htm", "4399 fight video (page dated 2012-06-04): the Boss's battle log shows all four named moves.")
KELANITE_VIDEO = period(V4399 + "21622.htm", "4399 fight video (page dated 2010-12-18): the Lv50 log shows 龙族之力 and 火龙的咆哮; "
                        "the Lv80 rematch log shows 火龙红莲击, 进攻意识, 赤色龙息 and 自我暗示.")
MINUOSI_LIST = period(G4399J + "201110-27-122862.html", "Page dated 2011-10-27: 常用技能 狂暴裂袭 (sic, 狂暴烈袭)，皮毛强化，暗之迷宫，魂之审判.")
MINUOSI_READER = period(G4399J + "201110-24-122382.html", "Reader report dated 2011-10-25: the same four moves with their effects.")
PITE = period(G4399 + "201111-21-127453.html", "Page dated 2011-11-21: 常用技能 羽翼利刃，破空长鸣，怒鸣，绝灭射线.")
RUIER = period(G4399 + "201112-26-134340.html", "Page dated 2011-12-26: 常用技能 风林火山，势如破竹，撼地震击，气贯长虹.")
SIBIN = period(G4399 + "201110-08-119108.html", "Page dated 2011-10-08: 常用技能 黑暗撕裂 (catalog 暗黑撕裂)，黑暗迷雾，湮灭之球，生命汲取.")
KELAIFEN_SHOTS = period("https://news.4399.com/seer/zenmezhua/201107-22-105527.html",
                        "Page dated 2011-07-22, battle screenshots: the Lv55 Boss uses 醉酒燃烧 and 致命漏洞; the Lv80 rematch uses 怒火咆哮 and 醉酒燃烧.")
TAKELIN_SHOT = period(G4399 + "201009-26-78027.html", "Page dated 2010-09-17, a solo-fight battle screenshot: the Boss uses 潜龙伏地啸.")
TAKELIN_7K = period(G7K + "20100730/11811.html", "2010-07-30 guide, solo-fight battle screenshots: the Boss uses 咆哮震九天 and 潜龙伏地啸.")
TAXIYA_7K = period(G7K + "20100730/11809.html", "2010-07-30 guide, a solo-fight battle screenshot: the Boss uses 龙之结界 and 真龙灭世咒.")
TAXIYA_SHOT = period(G4399 + "201009-26-78028.html", "Page dated 2010-09-17, a solo-fight battle screenshot: the Boss uses 真龙灭世咒.")
KAWOER_V1 = period("https://v.4399pk.com/seer/video_107740.htm", "4399 fight video (page dated 2012-03-31): the Boss uses 闪电冰暴 and 冰雷幻阵.")
KAWOER_V2 = period("https://v.4399pk.com/seer/video_107738.htm", "4399 fight video (page dated 2012-04-06): the Boss uses 雷霆横扫.")
MODUOSA_7K = period(G7K + "20101224/55647.html", "Debut-day 2010-12-24 report: it usually uses 念力碰撞 and uses 决然一击 against light pets.")
KULI_4399 = period(G4399G + "201211-07-211331.html", "Page dated 2012-11-09: the Boss's 星光奔腾击 has a 15% chance to restore 1/4 HP.")
NATE_SHOTS = period(G4399J + "201210-12-203269_2.html", "Page dated 2012-10-12, battle screenshots: the Boss uses 爆裂岩浆拳, 火之神力 and 巨石飞掷.")
NATE_VIDEO = period(V4399 + "164835.htm", "4399 fight video '击杀SPT纳特': the Boss uses 火之神力 and 爆裂岩浆拳.")
PALISI_SHOTS = period(G4399G + "201208-08-185427.html", "Page dated 2012-08-10, battle screenshots: the Boss uses 深渊之爪 and 暗流涌动.")
PALISI_VIDEO = period(V4399 + "147677.htm", "4399 fight video (page dated 2012-09-06): the Boss uses 深渊之爪 and 狂暴冲击.")
SAIWEIER_TEAM = period(G4399 + "201008-14-75467.html", "Page dated 2010-08-13 (team fight): 塞维尔 常用技能 龙翔天驱 and 不灭意志.")
SAIWEIER_RUN = period(G4399J + "201008-17-75577.html", "Page dated 2010-08-17: in the team fight 塞维尔 uses 龙翔天驱 and then 不灭意志.")
SIKELU_SHOTS = period(G4399J + "201209-21-198996_2.html", "Page dated 2012-09-21, battle screenshots: every logged Boss turn is 寒冰破碎拳.")
SITUERTE_SHOTS = period(G4399J + "201210-26-207406.html", "Page dated 2012-10-26, battle screenshots: the Boss uses 混元归气斩, 震慑之光 and 金刚罩.")
YISUOLI_SHOTS = period(G4399G + "201212-07-220127.html", "Page dated 2012-12-07, battle screenshots: the Boss uses 巨力猛爪击 and 狂战之力.")
PULANTE_SHOTS = period(G4399J + "201205-19-161214_2.html", "Page dated 2012-05-19, battle screenshots: the Boss uses 破魂射线 and 混沌绿光.")
PULANTE_XIYE = period(G4399J + "201205-18-160964_2.html", "Page dated 2012-05-18, battle screenshots: the Boss uses 虚空魔刺 and 灵光缠绕.")
PULANTE_VIDEO = period(V4399 + "124268.htm", "4399 fight video (page dated 2012-05-25): the Boss uses 灵光缠绕 and 混沌绿光.")
DELASA_WIKI = source("https://wapbaike.baidu.com/item/%E5%BE%B7%E6%8B%89%E8%90%A8",
                     "Undated wiki Boss section citing 4399: the Boss uses 双爪强化.", "verified-secondary")
DIFUTE_WIKI = source("https://wapbaike.baidu.com/item/%E8%BF%AA%E7%AC%A6%E7%89%B9", "Undated wiki Boss section: the Boss uses 山神护体.",
                     "verified-secondary")
KEN_NOTE = ("The only list (2011-01-18) names all four. The same page reports fear, which only 黯然一击 can cause in this learnset, "
            "so one slot is in doubt and the loadout stays inferred.")
PULANTE_NOTE = ("The 2012-05-19 guide names 蚀梦术 and 2012 battle logs show 混沌绿光, 灵光缠绕 and 虚空魔刺. One low-resolution "
                "screenshot shows 破魂射线, which is not kept because the guide comes first (user, 2026-10-20).")
# The V58 SPT fidelity pass: (boss suffix, field, value, kind, sources, note). observed = a period report states it; official = an
# official client table states it; estimate = an approximate or single-tip report; partial = only the listed moves are named.
SPT_CLAIMS = [
    ("ajiasha", "level", 80, "observed", [AJIASHA], "The report states level 80."),
    ("ajiasha", "hp", 8000, "estimate", [AJIASHA], "The report says about 8000 HP."),
    ("ajiasha", "skills", [12494, 12495, 12491, 21296], "observed", [AJIASHA], "The report names all four attacks."),
    ("akexiya", "hp", 1000, "observed", [AKEXIYA, MAPS], "The 2009 report states 1000 HP, as does the official SPT table."),
    ("anyebinghu", "level", 80, "observed", [ANYE], "The report states level 80."),
    ("anyebinghu", "hp", 8000, "estimate", [ANYE], "The report says about 8000 HP."),
    ("anyebinghu", "skills", [12396, 12399, 12398, 21249], "observed", [ANYE], "The report names all four attacks."),
    ("bokate", "hp", 12000, "observed", [BOKATE], "The report states 12000 HP; the later single-player 6000 is a reduction."),
    ("delasa", "hp", 10000, "observed", [DELASA, DELASA2], "The daytime fight has 10000 HP. The evening limited mode (5000 HP) is not modelled."),
    ("difute", "hp", 10000, "observed", [DIFUTE], "The report states HP 10000."),
    ("eersaila", "hp", 3000, "estimate", [EER_FRI, EER_SUN], "Friday revives to its full 3000 HP; a Sunday report gives 5000, which no variant carries."),
    ("eersaila", "skills", [20564, 11139], "partial", [EER_SAT, EER_ZHIDAO], None),
    ("fuxisi", "level", 100, "official", [MAPS], "The official SPT table gives level 100 for the single and team fights; no period report states a level."),
    ("fuxisi", "hp", 10000, "observed", [FUXISI], "The report states 体力10000."),
    ("gangyasha", "hp", 200, "estimate", [LIST2011, MAPS], "A 2011 tip implies 200 HP (从200拉到50以下); the official team-fight row also has 200."),
    ("guerzhadi", "level", 80, "observed", [GUER], "The report states level 80."),
    ("guerzhadi", "hp", 5000, "estimate", [GUER], "The report says about 5000 HP."),
    ("guerzhadi", "skills", [12213, 21145, 12215, 12212], "observed", [GUER], "The report names all four attacks."),
    ("hamoleite", "hp", 10000, "observed", [CLASSIC, HAMO, MAPS],
     "Two 2010 reports and the official map-348 SPT row give 10000; the 3000 copy is a weakened duplicate."),
    ("kailuoya", "skills", [12661, 12660, 12658, 21383], "observed", [KAILUOYA], "The report names all four attacks."),
    ("kalunni", "hp", 8000, "estimate", [KALUNNI], "The report gives 8000 HP and marks it unverified."),
    ("kelaifen1", "level", 55, "official", [MAPS], "The official SPT table's 'SPT克莱芬难度1' row gives level 55."),
    ("kelaifen2", "level", 80, "observed", [KELAIFEN], "The report states the rematch is level 80."),
    ("kelanite1", "skills", [11357, 11356, 20457], "partial", [KELANITE, KELANITE_VIDEO], None),
    ("lansite", "level", 80, "observed", [LANSITE], "The report states level 80."),
    ("lansite", "hp", 12000, "estimate", [LANSITE], "The report says about 12000 HP."),
    ("lansite", "skills", [12563, 12562, 12564, 21333], "observed", [LANSITE], "The report names all four attacks."),
    ("leinaduo", "hp", 1500, "observed", [LIST2011], "The 2011 list states 1500 HP."),
    ("leinaduo", "skills", [20145, 10331, 10336, 10335], "observed", [LEINADUO], "The report names all four attacks."),
    ("luolasike", "level", 100, "observed", [LUOLA], "The fight starts at level 100; each win lowers it by 5 and each lost fight by 1, down to level 1."),
    ("moguguai", "level", 10, "observed", [MUSH7K, LIST2011, SPT2011, MAPS, MUSHROOM],
     "Four period reports and the official SPT table give level 10; the 2010-06 report's 15 is the SPT panel's recommended level."),
    ("naduolei", "hp", 1400, "observed", [NADUO], "The report states 1400 HP; the same page's later 2000-3000 is a guess."),
    ("nainifenduo", "skills", [20314, 10723, 10724, 10725], "observed", [CLASSIC, LIST2011], "The two reports together name all four attacks."),
    ("palisi", "level", 100, "official", [MAPS], "The official SPT table gives level 100 for the single and team fights; no period report states a level."),
    ("palisi", "hp", 12000, "observed", [PALISI], "The report states 12000 HP."),
    ("pulante", "hp", 8000, "observed", [PULANTE], "The report states 8000 HP."),
    ("pulante", "skills", [12796, 21451, 12793, 12794], "partial", [PULANTE, PULANTE_XIYE, PULANTE_VIDEO, PULANTE_SHOTS], PULANTE_NOTE),
    ("sikelu", "hp", 8000, "observed", [SIKELU, MAPS], "The report states 体力8000, as does the official SPT table."),
    ("sipulinte", "skills", [20933, 11836, 20934, 11841], "official", [MONSTERS, ROBOT2013], "The boss form 5022 (2013: 2522) lists these four."),
    ("tiyasi", "hp", 500, "official", [MAPS], "The official SPT table gives 500 HP for the single fight."),
    ("tiyasi", "skills", [10161, 20082, 10162, 10163], "observed", [TIYASI], "The report names all four attacks."),
    ("yalunsi", "hp", 5000, "observed", [YALUNSI], "The report states 体力为5000."),
    ("yalunsi", "skills", [11668], "official", [MONSTERS], "The SPT boss form 5012 has the single move 交错冰柱."),
    # The 2026-10-19 SPT moveset pass.
    ("kalunni", "skills", [12699, 12696, 12698, 21405], "observed", [KALUNNI_LIST, KALUNNI_VIDEO],
     "The guide names all four attacks and all four appear in the Boss's battle log."),
    ("kelanite2", "skills", [11357, 11359, 20528, 20666], "observed", [KELANITE_VIDEO], "All four appear in the Lv80 rematch battle log."),
    ("minuosi", "skills", [12285, 12284, 21187, 21186], "observed", [MINUOSI_LIST, MINUOSI_READER], "Two reports name all four attacks."),
    ("pitesaluo", "skills", [12373, 12370, 21233, 12372], "observed", [PITE], "The report names all four attacks."),
    ("ruiersi", "skills", [12316, 21278, 12453, 12455], "observed", [RUIER], "The report names all four attacks."),
    ("sibinsai", "skills", [12254, 21169, 12257, 12256], "observed", [SIBIN], "The report names all four attacks."),
    ("silipu", "skills", [12740, 21423, 12736, 12741], "observed", [SILIPU_VIDEO, SILIPU_TEXT], "All four appear in the Boss's battle log."),
    ("kenpeide", "skills", [11546, 20593, 11548, 11544], "partial", [KEN_LIST], KEN_NOTE),
    ("kelaifen1", "skills", [12047, 21052], "partial", [KELAIFEN_SHOTS], None),
    ("kelaifen2", "skills", [12051, 21052], "partial", [KELAIFEN_SHOTS], None),
    ("takelin", "skills", [10760, 20339], "partial", [TAKELIN_SHOT, TAKELIN_7K], None),
    ("taxiya", "skills", [10979, 20448], "partial", [TAXIYA_7K, TAXIYA_SHOT], None),
    ("kawoer", "skills", [12614, 21363, 12610], "partial", [KAWOER_V1, KAWOER_V2], None),
    ("moduosa", "skills", [11466, 11470], "partial", [MODUOSA_7K], None),
    ("kuli", "skills", [13292], "partial", [KULI_4399], None),
    ("nate", "skills", [13210, 21689, 13209], "partial", [NATE_SHOTS, NATE_VIDEO], None),
    ("palisi", "skills", [13034, 21591, 13033], "partial", [PALISI_SHOTS, PALISI_VIDEO], None),
    ("saiweier", "skills", [11114, 20554], "partial", [SAIWEIER_TEAM, SAIWEIER_RUN], None),
    ("sikelu", "skills", [13156], "partial", [SIKELU_SHOTS], None),
    ("situerte", "skills", [13249, 13251, 21707], "partial", [SITUERTE_SHOTS], None),
    ("yisuoli", "skills", [13371, 21784], "partial", [YISUOLI_SHOTS], None),
    ("delasa", "skills", [20878], "partial", [DELASA_WIKI], None),
    ("difute", "skills", [20990], "partial", [DIFUTE_WIKI], None),
]


def curate_spt(entries: dict[str, dict]) -> None:
    for suffix, field, value, kind, srcs, note in SPT_CLAIMS:
        entry = entries["boss_spt_" + suffix]
        if kind == "partial":
            partial_skills(entry, value, srcs, note=note)
        elif kind == "official":
            set_field(entry, field, value, evidence("official", "official-client-table", note, srcs))
        elif kind == "estimate":
            set_field(entry, field, value, evidence("inferred", "explicit-estimate", note, srcs, observationStatus="observed"))
        else:
            set_field(entry, field, value, observed(note, srcs))
SEER_DATA = "https://github.com/Nattsu39/seer_data/blob/a00bcdd5800e3bae5df881b4994a170a87541115/resource/config/xml/"
MAPS = source(SEER_DATA + "maps.json", "Official H5 copy of the server map config: Boss entries with MonID, Hp and Lv, matched to encounters by map, "
              "region index, task id and name. A later table, not a dated 2009-2013 snapshot.", "verified-official-table")
SOURCES[MAPS].update({"localPath": "../analysis/seer-data-a00bcdd/maps.json",
                      "sha256": "a913f0085b9a3908749dcbe88b0d6f488825af6804039289d76a655e11faf7e3"})
MONSTERS = source(SEER_DATA + "monsters.json", "Official H5 monster table: boss-only forms and their complete LearnableMoves lists.",
                  "verified-official-table")
SOURCES[MONSTERS].update({"localPath": "../analysis/seer-data-a00bcdd/monsters.json",
                          "sha256": "12d8c059973a9c03560d3739910ecb5a578da3a1235c24260279b723743d7936"})
CORE2013 = source("https://web.archive.org/web/20130706235627/http://seer.61.com/dll/RobotCoreDLL.swf?hir2eh3c",
                  "2013-07-06 official client PetXMLInfo: boss forms 2505 (雷伊的幻影) and 2513-2516 (白虎 avatars) with their complete move lists.",
                  "verified-client")
SOURCES[CORE2013].update({"sha256": "ad513c3aa7c36c0a19cc58ab7a20fa8960b2f1efc489f8c0a05aa3b5d16a5df0",
                          "decodedSha256": "6b1fc3dad932939e163c471ede28f6305e10d6fd71d0586f26fcf436f6be5288",
                          "xmlSha256": "782e1f0a60fa3f6aa6d811da9a1c75396635c76cee04bb554dac169da1f91f9a"})
REI2011 = period("https://news.4399.com/seer/jingyanxinde/201109-28-117631.html",
                 "2011-09-28 report: Lv70 Rei with about 2000-2200 HP and four named attacks.")
REI_SHADOW = period("https://news.7k7k.com/content/20110316/76887.html",
                    "2011-03-16 Rei training report: the final shadow is Lv100 with 1200 HP under a four-round limit.")
PALUO = period("https://news.4399.com/gonglue/seer/saiergonglue/201204-25-156091.html",
               "Live report dated 2012-04-29: round one Lv100; the essence fights from the 40th minute are Lv30.")
BULEIKE = period("https://news.7k7k.com/content/20110815/95405.html", "2011-08-15 report: Buleike Lv70, about 2000 HP, four commonly used attacks.")
KAXIUSI = period("https://news.4399.com/seer/spt/201108-23-111511.html",
                 "Page dated 2011-08-23: Kaxiusi Lv70, about 5000 HP, four commonly used attacks.")
QILIN_WHEELS = {wheel: period(url, f"Qilin wheel-{wheel} report: HP{' and four named attacks' if wheel == 1 else ''}.") for wheel, url in {
    1: "https://news.4399.com/gonglue/seer/jingyanxinde/243814.html", 2: "https://news.4399.com/gonglue/seer/saiergonglue/201305-03-262154.html",
    3: "https://news.4399.com/gonglue/seer/jingyanxinde/272923.html", 5: "https://news.7k7k.com/51seer/20140924-673219.html",
    6: "https://news.4399.com/gonglue/seer/jingyanxinde/304371.html"}.items()}
FORBIDDEN = period("https://news.4399.com/seer/jingyanxinde/201108-18-110516.html",
                   "Page dated 2011-08-18: the Xuanwu and Qinglong bodies have 50000 HP after the 2011-08-05 update.")
BAIHU = period("https://news.4399.com/seer/saiergonglue/201103-11-88984.html",
               "Release-day 2011-03-11 report: electric avatar HP 2500, fighting avatar HP 3000.")
BAIHU_BODY = period("https://news.7k7k.com/content/20110426/84954.html", "2011-04-26 report: the Baihu body has 50000 HP.")
BAIHU_MOVES = period("https://news.7k7k.com/content/20130106/555761.html", "2013 report: the Baihu body's four commonly used attacks.")
BAIHU_GUARD = period("https://news.4399.com/seer/jingyanxinde/201103-12-89181.html", "2011-03-12 report: the Baihu guardian Laokemengde has 10000 HP.")
ZHUQUE = period("https://news.4399.com/seer/jingyanxinde/201108-10-108989.html",
                "2011-08-10 report: all three Zhuque shadows have 2000 HP and the same four attacks.")
ZHUQUE_BODY = source("https://www.511du.com/p/7432.html", "Undated Q&A repost: the Zhuque body has 50000 HP. Weak secondary evidence.", "verified-secondary")
PUNI_SEALS = {seal: period("https://news.4399.com/seer/pngl/" + page + ".html", f"2010-10 seal-{seal} guide: the four attacks and their PP, 35 in total.")
              for seal, page in {1: "201010-14-78876", 2: "201010-16-78978", 3: "201010-16-78979", 4: "201010-16-78980", 5: "201010-16-78982"}.items()}
PUNI2012 = period("https://news.4399.com/seer/jingyanxinde/201210-18-204899.html",
                  "2012-10-18 report: the Puni body's six lives have 7000/8000/9000/10000/20000/65000 HP.")
YILAN = period("https://news.7k7k.com/content/20100602/8159.html", "2010-06-02 report: Yilanluoni used 纯净能量 (special attack +2); Katesi used 舍身撞击.")
KATESI = period("https://news.4399.com/seer/ahwdc/200912-04-54186.html", "Opening-day 2009-12-04 report: the trial-door Katesi is Lv45.")
KATESI_WIKI = source("https://wapbaike.baidu.com/item/%E5%8D%A1%E7%89%B9%E6%96%AF/10553470",
                     "Undated wiki boss section: Lv45 and four named attacks; only 舍身撞击 is corroborated by period reports.", "verified-secondary")
DARK_WIKI = source("https://wapbaike.baidu.com/item/%E6%9A%97%E9%BB%91%E6%AD%A6%E6%96%97%E5%9C%BA/9200029",
                   "Undated wiki door-8 section attributed to the 4399 2013-08-19 guide: Paduoni and Jialuode are Lv100.", "verified-secondary")
REI_TRAINING = [("boss_rei_training1", 35, 350, "map 17 region 1"), ("boss_rei_training2", 45, 500, "map 27 region 1"),
                ("boss_rei_training3", 75, 1500, "map 49 entry 雷伊技能特训之雷纳多"), ("boss_rei_training4", 65, 1000, "map 40 entry 雷伊技能特训之阿克希亚"),
                ("boss_rei_training5", 100, 1200, "map 32 entry 雷伊技能特训之雷伊幻影")]


def fidelity_table(note: str, *extra: str) -> dict:
    return evidence("official", "official-data-table", note, [MAPS, *extra])


def fidelity_claim(entries: dict[str, dict], boss_id: str, field: str, value, proof: dict, slots=(0,)) -> None:
    for slot in slots:
        set_field(entries[boss_id], field, value, proof, slot)


def curate_legendary_dark(entries: dict[str, dict]) -> None:
    """Fidelity values for the legendary, story, event and dark-door encounters."""
    for seal, level in enumerate([101, 105, 105, 105, 105, 105, 105], 1):
        fidelity_claim(entries, f"boss_puni_seal{seal}", "level", level, fidelity_table(f"Map 108 region-{seal} seal entry."))
    for seal, hp in {2: 6000, 3: 7000, 5: 10000, 6: 13000, 7: 16000}.items():
        fidelity_claim(entries, f"boss_puni_seal{seal}", "hp", hp, fidelity_table(f"Map 108 region-{seal} seal entry."))
    for seal, src in PUNI_SEALS.items():
        moves = observed("The guide lists all four attacks with PP summing to 35.", [src])
        fidelity_claim(entries, f"boss_puni_seal{seal}", "skills", [20500, 10995, 11000, 10999], moves)
    fidelity_claim(entries, "boss_puni_zhenshen", "level", 105, fidelity_table("Map 108 entry 普尼真身: all six lives Lv105."), range(6))
    for slot, hp in {1: 8000, 2: 9000, 4: 20000}.items():
        note = "Map 108 entry 普尼真身; the 7k7k 2010-10-28 per-life table and the 4399 2012-10-18 guide agree."
        fidelity_claim(entries, "boss_puni_zhenshen", "hp", hp, fidelity_table(note, PUNI, PUNI2012), [slot])
    entries["boss_puni_zhenshen"]["members"][3]["fields"]["hp"] = evidence(
        "inferred", "explicit-estimate", "Both 2010 sources give life 4 12000 HP; the map table and the 2012 guide give 10000. 12000 is kept.",
        [PUNI, PUNI2012, MAPS], observationStatus="observed")
    rei_hp = "Map 32 entry SPT雷伊 (Hp 2000, Lv70). The 2010 guide's 2800 is an early report; 2011 sources give about 2000."
    fidelity_claim(entries, "boss_rei", "hp", 2000, fidelity_table(rei_hp, REI2011, CLASSIC))
    rei_moves = observed("Two 2011 reports name the same four attacks for the Lv70 Rei.", [LIST2011, REI2011])
    fidelity_claim(entries, "boss_rei", "skills", [10176, 10175, 20087, 10170], rei_moves)
    for boss_id, level, hp, region in REI_TRAINING:
        proof = fidelity_table(f"The training opponent is the {region} entry fought by LeiyiTrainController.", *([REI_SHADOW] if level == 100 else []))
        fidelity_claim(entries, boss_id, "level", level, proof)
        fidelity_claim(entries, boss_id, "hp", hp, proof)
    shadow = evidence("official", "official-data-table", "Boss form 雷伊的幻影 (2013 id 2505, modern 5005) knows only 雷神天明闪.", [MONSTERS, CORE2013])
    fidelity_claim(entries, "boss_rei_training5", "skills", [10825], shadow)
    fidelity_claim(entries, "boss_ailike", "level", 100, fidelity_table("Map 782 event table, first (13:00-13:08) tier."))
    fidelity_claim(entries, "boss_ailike", "hp", 6000, fidelity_table("Map 782 event table, first (13:00-13:08) tier."))
    fidelity_claim(entries, "boss_gaia", "hp", 2000, fidelity_table("Map 66 entry 盖亚; period reports also give 2000 HP."))
    fidelity_claim(entries, "boss_buleike", "level", 70, fidelity_table("Map 693 entry; the 2011 report agrees.", BULEIKE))
    fidelity_claim(entries, "boss_buleike", "hp", 2000, fidelity_table("Map 693 entry; the 2011 report says about 2000.", BULEIKE))
    fidelity_claim(entries, "boss_buleike", "skills", [12112, 21090, 21089, 12114], observed("The report names four commonly used attacks.", [BULEIKE]))
    fidelity_claim(entries, "boss_paluodiya", "level", 30, observed("The essence-granting fights from the 40th minute are Lv30.", [PALUO]))
    fidelity_claim(entries, "boss_kaxiusi", "skills", [11925, 20982, 20639, 11927], observed("The report names four commonly used attacks.", [KAXIUSI]))
    entries["boss_kaxiusi"]["members"][0]["fields"]["hp"] = evidence(
        "inferred", "explicit-estimate", "The report says about 5000 HP; a later undated wiki says it was weakened to 2500.", [KAXIUSI], observationStatus="observed")
    curate_campaign_fidelity(entries)
    curate_dark_fidelity(entries)


def curate_campaign_fidelity(entries: dict[str, dict]) -> None:
    for boss_id, slots in [("boss_campaign_baihu_avatars", range(2)), ("boss_campaign_baihu_body", (0,)), ("boss_campaign_xuanwu_body", (0,)),
                           ("boss_campaign_qinglong_body", (0,)), ("boss_campaign_zhuque_avatars", range(3)), ("boss_campaign_zhuque_body", (0,))]:
        fidelity_claim(entries, boss_id, "level", 105, fidelity_table("The campaign map entry gives Lv105."), slots)
    fidelity_claim(entries, "boss_campaign_baihu_avatars", "hp", 3000, observed("The fighting avatar has 3000 HP.", [BAIHU]))
    fidelity_claim(entries, "boss_campaign_baihu_avatars", "hp", 2500, observed("The electric avatar has 2500 HP.", [BAIHU]), [1])
    form = evidence("official", "official-data-table", "Boss forms 2513-2516 list exactly these four moves.", [CORE2013, MONSTERS])
    fidelity_claim(entries, "boss_campaign_baihu_avatars", "skills", [11710, 20853, 20854, 11714], form)
    fidelity_claim(entries, "boss_campaign_baihu_avatars", "skills", [20475, 11711, 20853, 11713], form, [1])
    fidelity_claim(entries, "boss_campaign_baihu_body", "hp", 50000, observed("The body has 50000 HP.", [BAIHU_BODY]))
    body_moves = observed("The report names the body's four commonly used attacks.", [BAIHU_MOVES])
    fidelity_claim(entries, "boss_campaign_baihu_body", "skills", [11712, 11714, 20854, 20853], body_moves)
    fidelity_claim(entries, "boss_campaign_baihu_guardians", "hp", 10000, observed("劳克蒙德 has 10000 HP as the Baihu guardian.", [BAIHU_GUARD]))
    for boss_id in ("boss_campaign_xuanwu_body", "boss_campaign_qinglong_body"):
        fidelity_claim(entries, boss_id, "hp", 50000, observed("The body has 50000 HP.", [FORBIDDEN]))
    fidelity_claim(entries, "boss_campaign_zhuque_avatars", "hp", 2000, observed("Each shadow has 2000 HP (two lives for the rebirth shadow).", [ZHUQUE]), range(3))
    shadows = observed("All three shadows use the same four named attacks.", [ZHUQUE])
    fidelity_claim(entries, "boss_campaign_zhuque_avatars", "skills", [12095, 12094, 21078, 12091], shadows, range(3))
    entries["boss_campaign_zhuque_body"]["members"][0]["fields"]["hp"] = evidence(
        "inferred", "explicit-estimate", "Only an undated Q&A repost gives 50000 HP.", [ZHUQUE_BODY], observationStatus="observed")
    for wheel, hp in {1: 20000, 2: 15000, 3: 15000, 5: 15000, 6: 15000}.items():
        fidelity_claim(entries, f"boss_campaign_qilin_wheel{wheel}", "hp", hp, observed("The wheel report states this HP.", [QILIN_WHEELS[wheel]]))
    wheel1 = observed("The report lists the four attacks used in this wheel.", [QILIN_WHEELS[1]])
    fidelity_claim(entries, "boss_campaign_qilin_wheel1", "skills", [13550, 21895, 13554, 21896], wheel1)


def curate_dark_fidelity(entries: dict[str, dict]) -> None:
    partial_skills(entries["boss_dark_door5_yilanluoni"], [10357, 10644, 20281], DARK[5])
    entries["boss_dark_door5_yilanluoni"]["members"][0]["fields"]["skills"]["sources"] = [DARK[5], YILAN]
    fidelity_claim(entries, "boss_dark_trial_katesi", "level", 45, observed("The opening-day report gives the trial-door boss Lv45.", [KATESI, KATESI_WIKI]))
    katesi = entries["boss_dark_trial_katesi"]["members"][0]["fields"]["skills"]
    katesi.update({"verifiedMoveIds": [10043], "sources": [KATESI_WIKI, YILAN],
                   "note": "The loadout is an undated wiki list; only 舍身撞击 is corroborated by period reports."})
    for name in ("paduoni", "jialuode"):
        fidelity_claim(entries, f"boss_dark_door8_{name}", "level", 100, observed("The wiki door-8 section gives Lv100; it is the only level source.", [DARK_WIKI]))


def aggregate(fields: list[dict]) -> dict:
    least = max(fields, key=lambda field: RANK[field["status"]])
    return evidence(least["status"], least["basis"], "Aggregate retains the least certain member; inspect member records for exact field claims.", sorted({src for field in fields for src in field.get("sources", [])}))


def build() -> dict:
    entries = {}
    for path in sorted((ROOT / "data/bosses").glob("*.json")):
        raw = path.read_bytes()
        row = json.loads(raw)
        if row.get("category") == "trainer":
            continue
        refs = [source(url) for url in row.get("sources", [])]
        members = []
        for slot, member in enumerate(row["team"]):
            configured = {field: member.get("hp_override") if field == "hp" else member.get(field) for field in FIELDS}
            members.append({"slot": slot, "species": member["species"], "configured": configured, "fields": {field: unknown(field, row, member, refs) for field in FIELDS}, "computedCombatStats": "inferred", "statMultipliers": member.get("stat_multipliers", {})})
        rules = [{"index": index, "path": loc, "rule": node.get("id", node.get("rule", node.get("op"))), "configuration": node, "condition": condition, "evidence": rule_proof(row["id"], loc, node)} for index, (loc, node, condition) in enumerate(rule_nodes(row))]
        entries[row["id"]] = {"id": row["id"], "category": row["category"], "sourceFile": str(path.relative_to(ROOT)), "sourceSha256": sha256(raw).hexdigest(), "sourceNoteSha256": sha256(row.get("source_note", "").encode()).hexdigest(), "sourceUrls": row.get("sources", []), "originalConfidence": row.get("confidence", {}), "members": members, "rules": rules, "additionalConfiguration": {key: row.get(key) for key in ("win", "lose", "limits", "unlock", "ai")}, "fields": {"ai": evidence("authored", "remake-policy", "The executable choice policy is a remake. Named tendencies do not certify exact weights, random seeds, branch order or hidden server AI.")}}
    if len(entries) != 180 or sum(len(e["members"]) for e in entries.values()) != 247:
        raise ValueError("Encounter scope changed; review the expected 180 encounters / 247 members before regenerating.")
    curate(entries)
    curate_spt(entries)
    curate_legendary_dark(entries)
    for entry in entries.values():
        entry["userPolicies"] = [deepcopy(policy) for policy in USER_POLICY_LEDGER["policies"] if policy["bossId"] == entry["id"]]
    for entry in entries.values():
        for field in FIELDS:
            entry["fields"][field] = aggregate([member["fields"][field] for member in entry["members"]])
        entry["fields"]["rules"] = aggregate([rule["evidence"] for rule in entry["rules"]]) if entry["rules"] else evidence("inferred", "unverified", "No configured rule rows does not prove that the original encounter had no special mechanic.")
        entry["summary"] = {"hasInferredStats": any(member["fields"][key]["status"] == "inferred" for member in entry["members"] for key in FIELDS), "hasInferredLevel": entry["fields"]["level"]["status"] == "inferred", "hasUnverifiedSkills": entry["fields"]["skills"]["status"] == "inferred", "aiIsRemake": True}
    summary = {"encounters": len(entries), "members": sum(len(e["members"]) for e in entries.values()), "categories": dict(sorted(Counter(e["category"] for e in entries.values()).items())), "memberFieldStatuses": {key: dict(sorted(Counter(m["fields"][key]["status"] for e in entries.values() for m in e["members"]).items())) for key in FIELDS}, "ruleNodes": sum(len(e["rules"]) for e in entries.values())}
    summary["waivedMechanics"] = sum(policy["disposition"] == "waived" for policy in USER_POLICY_LEDGER["policies"])
    summary["userReplacementPolicies"] = sum(policy["disposition"] == "replaced" for policy in USER_POLICY_LEDGER["policies"])
    full = {"schemaVersion": 1, "userPolicyAuthority": {key: value for key, value in USER_POLICY_LEDGER.items() if key != "policies"}, "sourceBoundary": {"scope": "All 180 production boss records and 247 members; excludes ten authored trainer encounters.", "unknownPolicy": "Unreviewed, approximate, conflicting or incomplete claims remain inferred. Confidence labels and URL presence are metadata, not proof.", "officialBoundary": "Recovered official client code establishes display behavior and client-side conditions only. Exact boss IV/EV/nature, hidden combat stats and server AI were not recovered.", "periodBoundary": "Observed means a specific claim was read in a period gameplay report; it is not official server certification.", "executionBoundary": "Source provenance is separate from data/boss-rule-support-v56.json execution coverage. Implemented does not mean historically exact."}, "summary": summary, "sources": dict(sorted(SOURCES.items())), "encounters": entries}
    return full


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    full = build()
    path = ROOT / "data" / "boss-evidence-v56.json"
    content = json.dumps(full, ensure_ascii=True, indent=2) + "\n"
    if args.check:
        if not path.exists() or path.read_text() != content:
            raise SystemExit(f"Stale evidence ledger: {path.relative_to(ROOT)}")
    else:
        path.write_text(content)
    print(json.dumps(full["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
