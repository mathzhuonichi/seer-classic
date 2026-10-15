#!/usr/bin/env python3
"""Apply the approved v33-v35 evolution policies using pinned official XML.

Use --source-dir for the extracted RobotCoreDLL XML directory. The default is
.cache/evolution-v33. --check verifies the generated records without writing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = "https://seer.61.com/dll/RobotCoreDLL.swf"
SOURCE_HASHES = {
    "23-PetXMLInfo_xmlClass.xml": "bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d",
    "44-EvolveXMLInfo_xmlcls.xml": "f88fa14c15e7fe725e848c152de4a30bdd3e4bb2988429be66290ba6184ad80d",
    "160-SuperEvolves.xml": "9fb8c3a1b0c8ee38b0c8f052060ad00f5bfdec54aff757d10505658b748b8b85",
}
SOURCE_FIELDS = ("ID", "DefName", "Type", "EvolvesFrom", "EvolvesTo", "EvolvingLv", "EvolvFlag")
BRANCH_FROM = {91, 269, 366, 373, 756, 1461}
# The v32 acquisition audit had 77 missing forms. v33 resolved 45; the user
# subsequently approved level-evolution adaptations for these remaining 32.
V33_DEFERRED_MISSING = {
    432, 652, 729, 811, 881, 1017, 1018, 1019, 1121, 1122, 1143, 1192,
    1215, 1216, 1230, 1237, 1238, 1266, 1277, 1278, 1279, 1297, 1298,
    1316, 1317, 1346, 1361, 1428, 1429, 1459, 1464, 1473,
}
SOURCE_LEVEL_TARGETS = {432, 652, 729, 811, 881, 1143}
LEVEL_ONE_OVERRIDES = {729, 881, 1143}
CANONICAL_PARENT_OVERRIDES = {1459: 79}
SPECIAL_BRANCH_PARENTS = {67, 739}
SPECIAL_STAGE = {1018: 2, 1019: 3, 1238: 2, 1279: 2}
NOTE_PREFIX = " Remake evolution policy v33: "
SPECIAL_NOTE_PREFIX = " Remake evolution policy v35: "
PREVIOUS_SPECIAL_NOTE_PREFIX = " Remake evolution policy v34: "
ANCESTRY_NOTE_PREFIX = " Remake ancestry policy v34: "
NOTES = {
    "mechanical-level": (
        "the user requested ordinary automatic level evolution for mechanical species. "
        "The target and level are recovered from official PetXMLInfo and EvolveXMLInfo; "
        "automatic evolution replaces the original trigger and supersedes any earlier "
        "manual-confirmation policy. See data/evolution-rules.json for original fields."
    ),
    "branch-choice": (
        "the user requested a direct manual choice among the original evolution branches "
        "at the source level, without the original item costs. The choice is never automatic. "
        "See data/evolution-rules.json for original targets, trigger flags, and item costs."
    ),
}


def read_json(relative: str):
    return json.loads((ROOT / relative).read_text())


def encode(value, indent=2, newline=True) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=indent,
                       separators=(",", ":") if indent is None else None)
            + ("\n" if newline else "")).encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".cache/evolution-v33")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    xml = {}
    for filename, expected in SOURCE_HASHES.items():
        source_file = args.source_dir / filename
        if not source_file.is_file():
            parser.error(f"Missing pinned source {source_file}; supply --source-dir with the official extracted XML files.")
        raw = source_file.read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        if actual != expected:
            raise ValueError(f"{filename}: expected SHA-256 {expected}, got {actual}")
        xml[filename] = ET.fromstring(raw)
    monsters = {int(row.get("ID")): dict(row.attrib)
                for row in xml["23-PetXMLInfo_xmlClass.xml"].iter("Monster")}
    evolves = {int(row.get("ID")): [dict(branch.attrib) for branch in row.findall("Branch")]
               for row in xml["44-EvolveXMLInfo_xmlcls.xml"].iter("Evolve")}
    super_evolves = [
        {"attributes": dict(row.attrib),
         "inputItems": [dict(item.attrib) for item in row.findall("./In/Item")]}
        for row in xml["160-SuperEvolves.xml"].iter("SuperEvolve")
    ]
    catalog = read_json("data/gamedata.json")
    by_id = {row["id"]: row for row in catalog["species"]}
    index = read_json("data/catalog_index.json")
    index_by_id = {row["id"]: row for row in index["monsters"]}

    def evidence(species_id):
        source = monsters[species_id]
        return {
            "monster": {key: source[key] for key in SOURCE_FIELDS if key in source},
            "branches": evolves.get(int(source.get("EvolvFlag", "0")), []),
        }

    rules = []
    for species_id, row in sorted(by_id.items()):
        source = monsters.get(species_id, {})
        branches = evolves.get(int(source.get("EvolvFlag", "0")), [])
        if not branches or any(int(branch["MonTo"]) not in by_id for branch in branches):
            continue
        mechanical = ("mechanical" in row["types"] and len(branches) == 1
                      and int(branches[0].get("EvolvItem", "0")) == 0)
        if species_id not in BRANCH_FROM and not mechanical:
            continue
        kind = "mechanical-level" if mechanical else "branch-choice"
        level = int(source.get("EvolvingLv", "0"))
        assert 1 <= level <= 100, f"Invalid source level for {species_id}: {level}"
        assert len(branches) > 1 or mechanical, f"Expected a source branch point: {species_id}"
        transitions = []
        for branch in branches:
            target = int(branch["MonTo"])
            assert int(monsters[target]["EvolvesFrom"]) == species_id, f"Conflicting ancestry: {species_id} -> {target}"
            transitions.append({"to": target, "method": "level", "level": level, "automatic": mechanical})
        rules.append({"from": species_id, "name": row["name"]["zh"], "kind": kind,
                      "transitions": transitions, "source": evidence(species_id)})

    mechanical_rules = [rule for rule in rules if rule["kind"] == "mechanical-level"]
    branch_rules = [rule for rule in rules if rule["kind"] == "branch-choice"]
    assert len(mechanical_rules) == 43
    assert {rule["from"] for rule in branch_rules} == BRANCH_FROM
    assert sum(len(rule["transitions"]) for rule in branch_rules) == 16
    assert 671 not in {rule["from"] for rule in rules}, "Non-mechanical chamber evolution is outside this policy"

    resolved = []
    special_rules = {}
    for target in sorted(V33_DEFERRED_MISSING):
        original_predecessor = int(monsters[target]["EvolvesFrom"])
        predecessor = CANONICAL_PARENT_OVERRIDES.get(target, original_predecessor)
        original_source = evidence(original_predecessor)
        source = evidence(predecessor)
        branch = next((branch for branch in source["branches"] if int(branch["MonTo"]) == target), None)
        super_records = [row for row in super_evolves if int(row["attributes"]["Target"]) == target]
        target_monster = {key: monsters[target][key] for key in SOURCE_FIELDS if key in monsters[target]}
        if super_records:
            assert any(predecessor in [int(value) for value in row["attributes"]["Origin"].split()]
                       for row in super_records), f"Canonical predecessor is not source-supported: {predecessor} -> {target}"
        if target in SOURCE_LEVEL_TARGETS:
            assert branch is not None, f"Source-level target lacks a matching source branch: {target}"
            original_level = int(source["monster"]["EvolvingLv"])
            assert original_level in {1, 34, 40, 63}
            if target in LEVEL_ONE_OVERRIDES:
                assert original_level == 1
                level = 60
                kind = "special-remake-override"
                level_evidence = {
                    "kind": "remake-override", "originalLevel": original_level, "remakeLevel": level,
                    "field": "PetXMLInfo.EvolvingLv for the EvolveXMLInfo branch targeting this form",
                    "interpretation": "The original value 1 belonged to an item-gated conversion. The user now requires remake level 60 and manual confirmation; the original source field remains unchanged in provenance. This is an explicit override, not a recovered level-60 source rule.",
                }
            else:
                assert original_level > 1
                level = original_level
                kind = "special-source-level"
                level_evidence = {
                    "kind": "source-gate", "originalLevel": original_level,
                    "field": "PetXMLInfo.EvolvingLv for the EvolveXMLInfo branch targeting this form",
                    "interpretation": "The target-specific source level is retained while the original item gate is removed. The remake requires manual confirmation.",
                }
        else:
            assert branch is None, f"A source branch must be reviewed instead of assigned a fallback: {target}"
            # A different ordinary EvolvesTo edge's level is not target evidence.
            assert int(monsters[predecessor].get("EvolvesTo", "0")) != target
            stage = SPECIAL_STAGE.get(target, 1)
            level = 60 + 10 * (stage - 1)
            kind = "special-branch-choice" if predecessor in SPECIAL_BRANCH_PARENTS else "special-remake-level"
            level_evidence = {
                "kind": "remake-fallback", "originalLevel": None,
                "baseLevel": 60, "specialStage": stage, "stageIncrement": 10,
                "interpretation": "No target-specific level is present in the pinned PetXMLInfo, EvolveXMLInfo, or applicable SuperEvolves records. This threshold is an explicit remake rule; complete historical activity and server restrictions remain unverified.",
            }
        transition = {"to": target, "method": "level", "level": level, "automatic": False}
        target_evidence = {
            "targetMonster": target_monster,
            "superEvolutions": super_records,
            "edgeBasis": ("conditional-forward-branch" if branch else "super-evolution-forward-origin"
                          if super_records else "reverse-ancestry-adapted-to-forward-level-evolution"),
        }
        if predecessor != original_predecessor:
            target_evidence["ancestryAdaptation"] = {
                "originalEvolvesFrom": original_predecessor, "runtimeEvolvesFrom": predecessor,
                "reason": "Select the source-supported mature predecessor to preserve the normal automatic chain and keep the runtime acquisition ancestry consistent.",
            }
        if predecessor not in special_rules:
            special_rules[predecessor] = {
                "from": predecessor, "name": by_id[predecessor]["name"]["zh"],
                "kind": kind, "transitions": [], "levelEvidence": level_evidence,
                "source": {**source, "targets": []},
            }
        rule = special_rules[predecessor]
        assert rule["kind"] == kind and rule["levelEvidence"] == level_evidence
        rule["transitions"].append(transition)
        rule["source"]["targets"].append(target_evidence)
        resolved.append({
            "species": target, "name": by_id[target]["name"]["zh"], "from": original_predecessor,
            "category": "single-item-trigger" if branch else "special-ancestry",
            "source": original_source, "targetMonster": target_monster,
            "resolution": {"policyVersion": "v35", "from": predecessor, **transition,
                           "levelSource": level_evidence["kind"]},
        })
    assert sum(row["category"] == "single-item-trigger" for row in resolved) == 6
    assert len(special_rules) == 30
    assert sum(len(rule["transitions"]) for rule in special_rules.values()) == 32
    assert {rule["from"] for rule in special_rules.values() if rule["kind"] == "special-branch-choice"} == SPECIAL_BRANCH_PARENTS
    assert sum(rule["kind"] == "special-source-level" for rule in special_rules.values()) == 3
    assert sum(rule["kind"] == "special-remake-override" for rule in special_rules.values()) == 3
    assert sum(rule["kind"] == "special-remake-level" for rule in special_rules.values()) == 22
    assert all(not edge["automatic"] and edge["level"] > 1
               for rule in special_rules.values() for edge in rule["transitions"])
    rules = sorted([*rules, *special_rules.values()], key=lambda rule: rule["from"])

    policy = {
        "schemaVersion": 2,
        "policyVersion": "v35",
        "source": {
            "url": SOURCE_URL,
            "retrievedAt": "2026-10-14",
            "encodedSha256": "4fdde653317cf81ad34bcd87e0a4e01c2f518bfe4cfadcc396bbad6b698b1e1e",
            "decodedSha256": "e97b3f53a5f0242e89018bee91be508dc8fc6f41ae5e4bc5818d8f5161e81c42",
            "xml": [{"file": filename, "sha256": value} for filename, value in SOURCE_HASHES.items()],
            "scope": "Retained official Flash client configuration. Target and level evidence is separate from the user-approved remake behavior.",
        },
        "remakePolicy": {
            "mechanical-level": "Automatically evolve mechanical species along source-backed single-target, resource-free trigger edges at their source level.",
            "branch-choice": "Retain every target and source level at the six traditional branch points; replace item costs with an explicit manual target choice.",
            "special-source-level": "Retain the three meaningful source item-trigger levels, 63, 34, and 40, while removing item costs and requiring manual confirmation.",
            "special-remake-override": "Replace the three original item-trigger levels of 1, for 347 to 729, 601 to 881, and 55 to 1143, with explicit remake level 60 and manual confirmation. Preserve the original value 1 in source evidence.",
            "special-remake-level": "Use the canonical mature predecessor for single-target special forms. Where the pinned source has no target-specific level, retain remake level 60, then 70 and 80 for successive special stages; every transition requires manual confirmation.",
            "special-branch-choice": "The two genuine special forks, from 67 and 739, require a manual choice at remake level 60.",
            "specialConfirmation": "All 32 special and super-evolution transitions require an explicit player action. None triggers automatically from training, experience, level items, or loading an existing save.",
            "canonicalAncestry": "The source SuperEvolves record for 1459 accepts 77, 78, and 79. Use mature 79 in both the forward rule and runtime reverse ancestry; preserve the original EvolvesFrom 77 in provenance. Do not add infancy-to-super shortcuts.",
            "repeatAcquisition": "Branch-family initial forms must remain repeatedly obtainable under the existing six-per-species cap; this generator does not change acquisition limits or historical repeatability evidence.",
            "sourceBoundary": "Fallback levels and the three level-1-to-60 overrides are explicit remake decisions. The pinned XML establishes target relationships and original gates; complete historical activity and server-side restrictions remain unverified.",
            "exclusions": "Do not infer target-specific source levels from another ordinary edge; do not add unreviewed forms outside the 32 historical v33 omissions.",
        },
        "coverage": {"mechanicalTransitions": 43, "traditionalBranchPoints": 6, "traditionalBranchTransitions": 16,
                     "specialTransitions": 32, "manualSpecialTransitions": 32, "specialBranchPoints": 2, "specialBranchTransitions": 4,
                     "branchPoints": 8, "branchTransitions": 20, "totalTransitions": 91,
                     "sourceLevelTransitions": 62, "fallbackLevelTransitions": 26, "overrideLevelTransitions": 3,
                     "newlyReachableFormsFromV32Audit": 77, "newlyReachableFormsInV34": 32,
                     "deferredMissingFormsFromV32Audit": 0, "ancestryOverrides": 1},
        "rules": rules,
        "resolvedHistoricalMissingForms": resolved,
        "deferredMissingForms": [],
    }

    outputs = {"data/evolution-rules.json": encode(policy)}
    for rule in rules:
        species_id = rule["from"]
        relative = f"data/monsters/{species_id:04}.json"
        species = read_json(relative)
        assert species["id"] == species_id
        targets = {edge["to"] for edge in rule["transitions"]}
        # Only the reviewed targets are replaced. Other existing edges survive.
        species["evolution"] = ([edge for edge in species["evolution"] if edge["to"] not in targets]
                                + rule["transitions"])
        if rule["kind"] in NOTES:
            species["source_note"] = species["source_note"].split(NOTE_PREFIX)[0] + NOTE_PREFIX + NOTES[rule["kind"]]
        else:
            level = rule["transitions"][0]["level"]
            if rule["kind"] == "special-source-level":
                note = (f"the user requires manual confirmation for this special conversion. The target-specific source EvolvingLv {level} "
                        "is retained while the original item gate is removed. ")
            elif rule["kind"] == "special-remake-override":
                note = (f"the user replaces this original item-gated EvolvingLv 1 conversion with remake level {level} and manual confirmation. "
                        "The original value 1 remains in provenance; level 60 is an explicit remake override, not an original-source level. ")
            else:
                note = (f"the user requires manual confirmation for this special conversion. Level {level} remains an explicit remake fallback "
                        "because the pinned target-specific source records do not supply a level; successive special stages use levels 60, 70, and 80. ")
                if rule["kind"] == "special-branch-choice":
                    note += "The player must select the desired branch. "
            prior_note = species["source_note"].split(PREVIOUS_SPECIAL_NOTE_PREFIX)[0].split(SPECIAL_NOTE_PREFIX)[0]
            species["source_note"] = prior_note + SPECIAL_NOTE_PREFIX + note + "See data/evolution-rules.json for original fields and the exact source/remake distinction."
        outputs[relative] = encode(species)
        by_id[species_id]["evolution"] = species["evolution"]
        by_id[species_id]["source_note"] = species["source_note"]
        index_by_id[species_id]["evolves_to"] = [edge["to"] for edge in species["evolution"]]

    for target, predecessor in CANONICAL_PARENT_OVERRIDES.items():
        relative = f"data/monsters/{target:04}.json"
        species = json.loads(outputs[relative]) if relative in outputs else read_json(relative)
        species["evolves_from"] = predecessor
        note = (f"use mature predecessor {predecessor} for the approved special level evolution. "
                f"The original EvolvesFrom {monsters[target]['EvolvesFrom']} is retained in data/evolution-rules.json; "
                "the pinned SuperEvolves Origin list explicitly supports the selected mature form. This preserves the normal automatic family chain.")
        species["source_note"] = species["source_note"].split(ANCESTRY_NOTE_PREFIX)[0] + ANCESTRY_NOTE_PREFIX + note
        outputs[relative] = encode(species)
        by_id[target]["evolves_from"] = predecessor
        by_id[target]["source_note"] = species["source_note"]
        if "evolves_from" in index_by_id[target]:
            index_by_id[target]["evolves_from"] = predecessor

    outputs["data/gamedata.json"] = encode(catalog, indent=None)
    outputs["data/catalog_index.json"] = encode(index, indent=0, newline=False)
    changed = [relative for relative, data in outputs.items()
               if not (ROOT / relative).is_file() or (ROOT / relative).read_bytes() != data]
    if args.check:
        if changed:
            raise SystemExit("Generated evolution files are stale: " + ", ".join(changed))
    else:
        for relative in changed:
            (ROOT / relative).write_bytes(outputs[relative])
    print(json.dumps({"mode": "check" if args.check else "write", "mechanicalTransitions": 43,
                      "traditionalBranchPoints": 6, "traditionalBranchTransitions": 16,
                      "specialTransitions": 32, "manualSpecialTransitions": 32, "levelOneOverrides": 3,
                      "specialBranchPoints": 2, "changedFiles": len(changed)}))


if __name__ == "__main__":
    main()
