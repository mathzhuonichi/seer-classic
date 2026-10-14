#!/usr/bin/env python3
"""Decode the official Unity type table and compare the retained single types.

The binary field order was checked against SeerAPI's TypesRelationParser at
8529086d51e8047053c1fd4e6bb2cc0272dd3b17. This reader requires complete input
consumption and reports differences without changing the game catalog.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path


class Reader:
    def __init__(self, data):
        self.data, self.offset = data, 0

    def value(self, fmt):
        size = struct.calcsize(fmt)
        if self.offset + size > len(self.data):
            raise ValueError("Truncated type table")
        result = struct.unpack_from(fmt, self.data, self.offset)[0]
        self.offset += size
        return result

    def present(self):
        flag = self.value("<B")
        if flag not in (0, 1):
            raise ValueError("Invalid presence flag")
        return flag == 1

    def count(self):
        result = self.value("<i")
        if not 0 <= result <= 256:
            raise ValueError("Unexpected type count")
        return result

    def text(self):
        length = self.value("<H")
        if self.offset + length > len(self.data):
            raise ValueError("Truncated type name")
        result = self.data[self.offset:self.offset + length].decode("utf-8")
        self.offset += length
        return result


def decode(data):
    reader, rows = Reader(data), []
    if reader.present() and reader.present():
        for _ in range(reader.count()):
            opponents = []
            if reader.present():
                for _ in range(reader.count()):
                    multiple = reader.value("<f")
                    opponents.append({"type": reader.text(), "multiple": multiple})
            rows.append({"type": reader.text(), "opponent": opponents})
    if reader.offset != len(data):
        raise ValueError("Unconsumed bytes in type table")
    return {"root": {"relation": rows}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    raw = args.source.read_bytes()
    source = decode(raw)
    local = json.loads((root / "data/types.json").read_text())
    aliases = {"steel": "mechanical", "fight": "fighting", "dark": "shadow",
               "myth": "mystic", "saint": "holy", "demon": "evil"}
    name = lambda value: aliases.get(value, value)
    chart = {name(row["type"]): {name(col["type"]): col["multiple"]
                                for col in row["opponent"]}
             for row in source["root"]["relation"]}
    retained = [entry["id"] for entry in local["types"]]
    differences = []
    for attack in retained:
        for defender in retained:
            current = local["chart"].get(attack, {}).get(defender, 1)
            official = chart[attack][defender]
            if current != official:
                differences.append({"attack": attack, "defender": defender,
                                    "local": current, "unity": official})
    result = {"sourceSHA256": hashlib.sha256(raw).hexdigest(),
              "sourceBytes": len(raw), "completeInputConsumed": True,
              "sourceTypes": len(chart), "checkedCells": len(retained) ** 2,
              "matchingCells": len(retained) ** 2 - len(differences),
              "differences": differences, "decoded": source}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "decoded"}, indent=2))


if __name__ == "__main__":
    main()
