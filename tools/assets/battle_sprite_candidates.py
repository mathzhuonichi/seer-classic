#!/usr/bin/env python3
"""Record static original display-list placements for supplemental battle cells.

The paired renderer retains original SVG curves and original placement matrices.
No Flash code is executed and no public/runtime asset is modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import zlib

from restore_mystery_realm_floor import _Bits, _tags, _placement

ROOT = Path(__file__).resolve().parents[2]


def inspect(species: int, cache: Path):
    work = cache / 'species' / str(species)
    source = json.loads((work / 'source.json').read_text())
    raw = (ROOT / source['sourcePath']).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != source['sourceSha256']:
        raise ValueError('Official SWF source digest changed')
    destination = cache / 'sprite-study' / str(species)
    manifest_path = destination / 'candidates.json'
    signature = hashlib.sha256(Path(__file__).read_bytes()
                               + (ROOT / 'tools/assets/battle_sprite_candidates.mjs').read_bytes()).hexdigest()
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        if (previous.get('sourceSha256') == digest
                and previous.get('generatorSha256') == signature
                and all((ROOT / row[key]).is_file() for row in previous['candidates'] for key in ('svgPath', 'pngPath'))):
            print(json.dumps({'species': species, 'candidates': len(previous['candidates']), 'reused': True}), flush=True)
            return
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    if raw[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Unsupported official SWF signature')
    reader = _Bits(data)
    reader.rect()
    reader.ui16()
    reader.ui16()
    sprites = []
    skipped = []
    shape_ids = {shape['character'] for shape in source['shapes']}
    for tag, body in _tags(data, reader.i // 8):
        if tag != 39:
            continue
        character, frame_count = struct.unpack_from('<HH', body)
        placed = []
        masks = []
        for kind, payload in _tags(body, 4):
            if kind == 1:
                break
            if kind not in (26, 70):
                continue
            try:
                item = _placement(kind, payload)
            except ValueError as error:
                skipped.append({'sprite': character, 'reason': str(error)})
                continue
            if item.get('clipDepth'):
                masks.append((item['depth'], item['clipDepth']))
            if item.get('character') not in shape_ids:
                continue
            if (item.get('remainingBytes') or item.get('clipDepth')
                    or item.get('multiply', [1]*4) != [1]*4
                    or item.get('add', [0]*4) != [0]*4):
                skipped.append({'sprite': character, 'depth': item['depth'],
                                'reason': 'Filtered, masked, or color-transformed placement is not a plain vector composite.'})
                continue
            item.setdefault('matrix', [1, 0, 0, 1, 0, 0])
            placed.append(item)
        for item in list(placed):
            if any(start < item['depth'] <= end for start, end in masks):
                placed.remove(item)
                skipped.append({'sprite': character, 'depth': item['depth'],
                                'reason': 'Placement is inside a source mask depth range.'})
        if len(placed) > 1:
            sprites.append({'character': character, 'frame': 1,
                            'frameCount': frame_count,
                            'placements': sorted(placed, key=lambda row: row['depth'])})
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {'revision': 1, 'species': species, 'sourceSha256': digest, 'generatorSha256': signature,
                'sourcePath': source['sourcePath'], 'shapeDirectory': os.path.relpath(work, ROOT),
                'shapes': source['shapes'], 'sprites': sprites, 'skipped': skipped}
    path = destination / 'display-list.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    subprocess.run(['node', str(ROOT / 'tools/assets/battle_sprite_candidates.mjs'), str(path)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated source species IDs; omitted means all exported sources')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/battle-hd-v44')
    args = parser.parse_args()
    cache = args.cache.resolve()
    ids = sorted(set(map(int, args.ids.split(','))) if args.ids else
                 (int(p.parent.name) for p in (cache / 'species').glob('*/source.json')))
    failures = []
    for species in ids:
        try:
            inspect(species, cache)
        except Exception as error:
            failures.append({'species': species, 'error': str(error)})
            print(json.dumps(failures[-1]), flush=True)
    if failures:
        raise SystemExit(f'{len(failures)} source candidate exports failed')


if __name__ == '__main__':
    main()
