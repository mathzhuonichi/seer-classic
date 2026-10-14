#!/usr/bin/env python3
"""Apply the approved v33 evolution policy using pinned official XML evidence.

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
}
SOURCE_FIELDS = ("ID", "DefName", "Type", "EvolvesFrom", "EvolvesTo", "EvolvingLv", "EvolvFlag")
BRANCH_FROM = {91, 269, 366, 373, 756, 1461}
# The v32 acquisition audit had 77 missing forms. These 32 remain outside this
# approved mechanical / traditional branch policy; they are not new rewards.
DEFERRED_MISSING = {
    432, 652, 729, 811, 881, 1017, 1018, 1019, 1121, 1122, 1143, 1192,
    1215, 1216, 1230, 1237, 1238, 1266, 1277, 1278, 1279, 1297, 1298,
    1316, 1317, 1346, 1361, 1428, 1429, 1459, 1464, 1473,
}
NOTE_PREFIX = " Remake evolution policy v33: "
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

    deferred = []
    for target in sorted(DEFERRED_MISSING):
        predecessor = int(monsters[target]["EvolvesFrom"])
        source = evidence(predecessor)
        branch = next((branch for branch in source["branches"] if int(branch["MonTo"]) == target), None)
        deferred.append({
            "species": target, "name": by_id[target]["name"]["zh"], "from": predecessor,
            "category": "single-item-trigger" if branch else "special-ancestry",
            "source": source,
            "targetMonster": {key: monsters[target][key] for key in SOURCE_FIELDS if key in monsters[target]},
            "limitation": ("The single-target item conversion has no approved remake rule."
                           if branch else "Reverse ancestry does not supply an executable forward evolution or its level."),
        })
    assert sum(row["category"] == "single-item-trigger" for row in deferred) == 6

    policy = {
        "schemaVersion": 1,
        "policyVersion": "v33",
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
            "repeatAcquisition": "Branch-family initial forms must remain repeatedly obtainable under the existing six-per-species cap; this generator does not change acquisition limits or historical repeatability evidence.",
            "exclusions": "Do not infer missing levels from reverse ancestry; do not convert unrelated single-item or super-evolution forms without a separate rule.",
        },
        "coverage": {"mechanicalTransitions": 43, "branchPoints": 6, "branchTransitions": 16,
                     "newlyReachableFormsFromV32Audit": 45, "deferredMissingFormsFromV32Audit": 32},
        "rules": rules,
        "deferredMissingForms": deferred,
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
        species["source_note"] = species["source_note"].split(NOTE_PREFIX)[0] + NOTE_PREFIX + NOTES[rule["kind"]]
        outputs[relative] = encode(species)
        by_id[species_id]["evolution"] = species["evolution"]
        by_id[species_id]["source_note"] = species["source_note"]
        index_by_id[species_id]["evolves_to"] = [edge["to"] for edge in species["evolution"]]

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
                      "branchPoints": 6, "branchTransitions": 16, "changedFiles": len(changed)}))


if __name__ == "__main__":
    main()
