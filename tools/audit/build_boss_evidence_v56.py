#!/usr/bin/env python3
"""Build conservative, field-specific provenance without changing encounter data.

Run with --check to check the tracked ledgers; omit it to regenerate them.
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
TOWER = source("https://news.4399.com/seer/yzzt/201004-13-66291.html", "2010 tower report: floor 1-30 displayed levels; hidden levels above 30; specific floor 50/57 HP observations; floor 60 damage restriction. No exact internal 120/130 level mapping.", "verified-period-observation")
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


def partial_skills(entry: dict, ids: list[int], src: str, slot: int = 0) -> None:
    member = entry["members"][slot]
    if not set(ids).issubset(member["configured"]["skills"]):
        raise ValueError(f"Named move no longer configured: {entry['id']}")
    member["fields"]["skills"].update({"verifiedMoveIds": ids, "sources": [src], "note": "Only the listed move IDs are individually supported. Remaining slots and the completeness of the loadout remain inferred."})


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
    set_field(entries["boss_tower_brave_f057"], "hp", 750, observed("The report specifically gives the species-79 member 750 HP; this is not extended to its teammates or every later floor.", [TOWER]), slot=1)
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
    partial_skills(entries["boss_spt_nainifenduo"], [20314, 10725, 10724], CLASSIC)
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
        ("boss_spt_moguguai", "level", [MUSHROOM, LIST2011], "Level 15 in the 2010 source conflicts with level 10 in 2011 summaries; the selected version remains inferred."),
        ("boss_spt_hamoleite", "hp", [CLASSIC, LIST2011], "The 2010 guide gives HP 10000 while the 2011 list gives 3000. The selected version remains inferred."),
        ("boss_spt_naduolei", "hp", [NADUO], "The same page states 1400 HP, then quotes an estimate of 2000-3000. Exact selected HP remains unresolved."),
        ("boss_spt_akexiya", "hp", [CLASSIC], "The guide says approximately 1000 HP; the exact integer remains an estimate."),
        ("boss_rei", "hp", [CLASSIC], "The 2010 guide reports 2800 HP; the configured 2000 is from a different 2011 source. Version consistency remains unresolved."),
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


def aggregate(fields: list[dict]) -> dict:
    least = max(fields, key=lambda field: RANK[field["status"]])
    return evidence(least["status"], least["basis"], "Aggregate retains the least certain member; inspect member records for exact field claims.", sorted({src for field in fields for src in field.get("sources", [])}))


def build() -> tuple[dict, dict]:
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
    if len(entries) != 180 or sum(len(e["members"]) for e in entries.values()) != 240:
        raise ValueError("Encounter scope changed; review the expected 180 encounters / 240 members before regenerating.")
    curate(entries)
    for entry in entries.values():
        for field in FIELDS:
            entry["fields"][field] = aggregate([member["fields"][field] for member in entry["members"]])
        entry["fields"]["rules"] = aggregate([rule["evidence"] for rule in entry["rules"]]) if entry["rules"] else evidence("inferred", "unverified", "No configured rule rows does not prove that the original encounter had no special mechanic.")
        entry["summary"] = {"hasInferredStats": any(member["fields"][key]["status"] == "inferred" for member in entry["members"] for key in FIELDS), "hasInferredLevel": entry["fields"]["level"]["status"] == "inferred", "hasUnverifiedSkills": entry["fields"]["skills"]["status"] == "inferred", "aiIsRemake": True}
    summary = {"encounters": len(entries), "members": sum(len(e["members"]) for e in entries.values()), "categories": dict(sorted(Counter(e["category"] for e in entries.values()).items())), "memberFieldStatuses": {key: dict(sorted(Counter(m["fields"][key]["status"] for e in entries.values() for m in e["members"]).items())) for key in FIELDS}, "ruleNodes": sum(len(e["rules"]) for e in entries.values())}
    full = {"schemaVersion": 1, "sourceBoundary": {"scope": "All 180 production boss records and 240 members; excludes ten authored trainer encounters.", "unknownPolicy": "Unreviewed, approximate, conflicting or incomplete claims remain inferred. Confidence labels and URL presence are metadata, not proof.", "officialBoundary": "Recovered official client code establishes display behavior and client-side conditions only. Exact boss IV/EV/nature, hidden combat stats and server AI were not recovered.", "periodBoundary": "Observed means a specific claim was read in a period gameplay report; it is not official server certification.", "executionBoundary": "Source provenance is separate from data/boss-rule-support-v56.json execution coverage. Implemented does not mean historically exact."}, "summary": summary, "sources": dict(sorted(SOURCES.items())), "encounters": entries}
    compact = lambda field: {"status": field["status"], "basis": field["basis"]}
    def source_urls(entry: dict) -> list[str]:
        refs = [src for member in entry["members"] for field in member["fields"].values() for src in field["sources"]]
        refs += [src for member in entry["members"] for src in member.get("displayEvidence", {}).get("sources", [])]
        refs += [src for rule in entry["rules"] for src in rule["evidence"]["sources"]]
        verified = [SOURCES[src]["url"] for src in refs if SOURCES[src]["verification"] != "metadata-only"]
        # Listed URLs remain visibly non-certifying in the full ledger; linking
        # to a source is not a claim that every field on its encounter is exact.
        return list(dict.fromkeys(verified + entry["sourceUrls"]))[:5]
    runtime = {"schemaVersion": 1, "encounters": {boss_id: {"fields": {key: compact(field) for key, field in entry["fields"].items()}, "members": [{"slot": member["slot"], "species": member["species"], "fields": {key: compact(field) for key, field in member["fields"].items()}, **({"displayLevelUnknown": True} if member.get("displayLevelUnknown") else {})} for member in entry["members"]], "sourceUrls": source_urls(entry), "summary": entry["summary"]} for boss_id, entry in entries.items()}}
    return full, runtime


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    full, runtime = build()
    for name, value in [("boss-evidence-v56.json", full), ("boss-evidence-runtime-v56.json", runtime)]:
        path = ROOT / "data" / name
        content = json.dumps(value, ensure_ascii=True, indent=2) + "\n"
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f"Stale evidence ledger: {path.relative_to(ROOT)}")
        else:
            path.write_text(content)
    print(json.dumps(full["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
