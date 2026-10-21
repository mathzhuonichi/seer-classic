#!/usr/bin/env python3
"""Record each original battle clip's native size: the largest side of its first standby pose's visible box, in clip units.

The battle shows a creature at its native size times one scale, as the original game showed its clips
(src/features/battle/battle-creature-size.ts). Registration measures the same visible box at runtime (visibleStandbyBounds);
a pose with no visible texel falls back to the standby mesh extent, as registration does. Writes `standbySize` into
public/battle-animations/manifest.json and into its projection runtime-index.json. export_battle_animation.mjs runs this
after each export; run it from anywhere.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import gzip
import json
import multiprocessing
from pathlib import Path

import numpy as np
from PIL import Image

from audit_battle_hd_density import mesh_box, visible_box

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT/'public/battle-animations/manifest.json'
RUNTIME_INDEX = MANIFEST.with_name('runtime-index.json')
# The entry fields the game reads; export_battle_animation.mjs and optimize_battle_atlases.py project the same ones.
RUNTIME_KEYS = ('meta', 'atlas', 'frameRate', 'atlasWidth', 'atlasHeight', 'sequences', 'standbySize')
# Clip units are recorded to this many decimals: 1e-4 unit is 0.01 original pixel at 100 pixels per unit.
DECIMALS = 4


def standby_size(entry):
    """(largest side of the first standby pose's visible box, the same of the standby mesh, which box was used)."""
    meta = json.loads(gzip.decompress((ROOT/'public'/entry['meta'].lstrip('/')).read_bytes()))
    with Image.open(ROOT/'public'/entry['atlas'].lstrip('/')) as image:
        alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    standby = next((s for s in meta['sequences'] if s['name'] == 'standby'), meta['sequences'][0])
    height, width = alpha.shape
    visible, mesh = visible_box(standby['frames'][0], alpha, width, height), mesh_box(standby)
    side = lambda box: max(box[2]-box[0], box[3]-box[1])
    return side(visible or mesh), side(mesh), 'visible-alpha' if visible else 'standby-mesh'


def measure(sid_entry):
    sid, entry = sid_entry
    try:
        return sid, standby_size(entry), None
    except Exception as error:  # Reported per species; the others are still recorded.
        return sid, None, str(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species; omitted means every species in the manifest')
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2))
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    species = manifest['species']
    tasks = [(sid, species[sid]) for sid in (args.ids.split(',') if args.ids else species)]
    if args.jobs == 1:
        results = list(map(measure, tasks))
    else:
        with concurrent.futures.ProcessPoolExecutor(2, mp_context=multiprocessing.get_context('spawn')) as pool:
            results = list(pool.map(measure, tasks, chunksize=8))
    failures = {sid: error for sid, _, error in results if error}
    fallbacks = []
    for sid, measured, _ in results:
        if measured:
            species[sid]['standbySize'] = round(measured[0], DECIMALS)
            if measured[2] == 'standby-mesh':
                fallbacks.append(sid)
    for path, text in ((MANIFEST, json.dumps(manifest, indent=2)),
                       (RUNTIME_INDEX, json.dumps({'species': {sid: {key: entry[key] for key in RUNTIME_KEYS if key in entry}
                                                                for sid, entry in species.items()}}, separators=(',', ':')))):
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(text+'\n')
        temporary.replace(path)
    ratios = sorted(measured[1]/measured[0] for _, measured, _ in results if measured)
    print(json.dumps({'measured': len(results)-len(failures), 'meshFallbacks': fallbacks, 'failures': failures,
                      'meshToVisible': {'p5': ratios[len(ratios)//20], 'median': ratios[len(ratios)//2], 'p95': ratios[len(ratios)*19//20]}
                      if ratios else None}))
    if failures:
        raise SystemExit(f'{len(failures)} species could not be measured')


if __name__ == '__main__':
    main()
