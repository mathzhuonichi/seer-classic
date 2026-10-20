#!/usr/bin/env python3
"""Calibrate the V62 stroke-only gate on true vector renders of thin-stroke battle cells.

A published original-vector cell has both the original Unity raster (native size) and a real render of its original
vector source at its published multiplier. This tool samples such cells whose native raster is a thin-stroke cell
(battle_hd_stroke_gate.classify), measures each true render with V60's native measurements (battle_hd_ai_upscale.
gate_metrics), and splits the sample by a seeded shuffle into a calibration half and a held-out validation half.
The thresholds are equal tails of the calibration half: the alpha IoU minimum at its q-th percentile and both error
maxima at their (100-q)-th, with the largest q (the tightest gate) that still passes TARGET_PASS of the calibration
renders on every check at once (the stable-interior colour check included). The validation half reports the pass
rate on renders the thresholds did not see. Every sampled raster is also redrawn (battle_hd_redraw, the V61 method)
at the true render's multiplier and compared with the true render (aligned as calibrate_battle_hd_ai_gates.py does),
so the report shows how the gate treats redraws that are close to and far from the vector truth. The four hairline
speed lines of species 166 are measured as the reference case: their V61 redraws, and renders of the original shapes
the V44 matcher selected for them (which failed its source gate), against the V60 and the stroke gate.
Writes artifacts/battle-hd-v62/stroke-calibration.json. Read-only for published assets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image

import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd
import battle_hd_stroke_gate as sg
from build_battle_hd_ai_atlases import HD_INDEX, HD_MANIFEST, read_json
from build_battle_hd_atlases import ROOT
from build_battle_hd_redraw_atlases import flip, load_base
from calibrate_battle_hd_ai_gates import best_shift, lanczos, truth_metrics

TARGET_PASS = .95
GATE_KEYS = ('alphaIoU16', 'premultipliedRgbaMae', 'blockError')
REFERENCE = ('166', ('39', '40', '56', '58'))


def sample(count, per_species, seed, max_side):
    """Thin-stroke cells with a true vector render: [{species, cell, scale, native, truth, ...}], seeded."""
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    ids = sorted((s for s in published if s != '346'), key=str)
    random.Random(seed).shuffle(ids)
    chosen = []
    for sid in ids:
        if len(chosen) >= count:
            break
        try:
            base = load_base(sid, published[sid], manifest[sid]['reportPath'])
        except (ValueError, KeyError):  # A base this loader does not read (prototype or override formats).
            continue
        cells = [item for item in base['cells'] if item['cell']['mode'] == 'original-vector' and item['scale'] >= 2
                 and 8 <= min(item['native'].shape[:2]) and max(item['native'].shape[:2]) <= max_side]
        random.Random(f'{seed}-{sid}').shuffle(cells)
        taken = 0
        for item in cells:
            if taken >= per_species or len(chosen) >= count:
                break
            cell_class, features, gated = sg.classify(item['native'])
            if gated != sg.STROKE_CLASS:
                continue
            chosen.append({'species': sid, 'cell': item['id'], 'scale': item['scale'], 'native': item['native'],
                           'truth': flip(item['tile']), 'class': cell_class, 'features': features,
                           'firstPose': item['first'], 'size': list(item['native'].shape[1::-1])})
            taken += 1
    return chosen


def measure(cell, work):
    row = {k: cell[k] for k in ('species', 'cell', 'scale', 'class', 'features', 'firstPose', 'size')}
    row['vectorGate'] = ai.gate_metrics(cell['native'], cell['truth'], cell['scale'])
    result = rd.redraw(cell['native'], cell['scale'], work)
    if result and result['tile'] is not None:
        radius = cell['scale']//2
        shift = best_shift(lanczos(cell['native'], cell['scale']), cell['truth'], radius)
        row['redrawGate'] = ai.gate_metrics(cell['native'], result['tile'], cell['scale'])
        row['redrawAligned'] = truth_metrics(result['tile'], cell['truth'], shift, radius)
    return row


def passes(metrics, gate):
    return ai.gate_passes(metrics, gate)


def tails(rows, q):
    """Equal-tail thresholds, rounded outwards to four decimals so a render at the percentile itself passes."""
    values = {key: np.array([r['vectorGate'][key] for r in rows]) for key in GATE_KEYS}
    return {'alphaIoU16Minimum': float(np.floor(np.percentile(values['alphaIoU16'], q)*1e4)/1e4),
            'premultipliedRgbaMaeMaximum': float(np.ceil(np.percentile(values['premultipliedRgbaMae'], 100-q)*1e4)/1e4),
            'blockErrorMaximum': float(np.ceil(np.percentile(values['blockError'], 100-q)*1e4)/1e4)}


def calibrate(rows):
    """The tightest equal-tail gate (largest q, in steps of 0.05) that passes TARGET_PASS of `rows` on every check."""
    for step in range(1000, -1, -1):
        q = step/20
        gate = tails(rows, q)
        rate = float(np.mean([passes(r['vectorGate'], gate) for r in rows]))
        if rate >= TARGET_PASS:
            return q, gate, rate
    raise ValueError('No equal-tail gate reaches the target pass rate')


def rates(rows, gate):
    redrawn = [r for r in rows if 'redrawGate' in r]
    accepted = [r for r in redrawn if passes(r['redrawGate'], gate)]
    rejected = [r for r in redrawn if not passes(r['redrawGate'], gate)]
    def mean_error(part):
        return round(float(np.mean([r['redrawAligned']['premultipliedRgbaMae'] for r in part])), 3) if part else None
    return {'cells': len(rows), 'trueRendersPass': round(float(np.mean([passes(r['vectorGate'], gate) for r in rows])), 4),
            'redraws': len(redrawn), 'redrawsPass': round(len(accepted)/max(len(redrawn), 1), 4),
            'acceptedRedrawErrorVsVector': mean_error(accepted), 'rejectedRedrawErrorVsVector': mean_error(rejected)}


def render_candidate(sid, key, size, scratch):
    """A render of one V59-cache candidate SVG at `size` by the pipeline's own candidate renderer, in a scratch copy."""
    source = ROOT/'.cache/battle-hd-v59/species'/sid
    work = scratch/f'{sid}-{key}-{size[0]}'
    (work/'candidates').mkdir(parents=True, exist_ok=True)
    shutil.copy2(source/'candidates.json', work/'candidates.json')
    shutil.copy2(source/'candidates'/f'{key}.svg', work/'candidates'/f'{key}.svg')
    candidates = read_json(work/'candidates.json')
    scale = size[0]
    selection = {'sourceSha256': candidates['sourceSha256'], 'species': int(sid),
                 'cells': [{'id': 'reference', 'nativeSize': size[1], 'mode': 'original-vector', 'scale': scale, 'selected': {'key': key}}]}
    (work/'selection.json').write_text(json.dumps(selection))
    subprocess.run(['node', str(ROOT/'tools/assets/render_battle_shape_candidates.mjs'), 'render', str(work), str(work/'selection.json')],
                   check=True, stdout=subprocess.DEVNULL, timeout=180)
    with Image.open(work/'rendered'/f'reference-{scale}x.png') as image:
        return np.asarray(image.convert('RGBA'))


def reference_case(scratch):
    """166's speed lines: gate class, V61 redraw metrics, and the selected original shapes' renders, per gate."""
    sid, cells = REFERENCE
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    base = load_base(sid, published[sid], manifest[sid]['reportPath'])
    v59 = {c['id']: c for c in read_json(ROOT/'.cache/battle-hd-v59/species'/sid/'report.json')['cells']}
    rows = []
    for item in (i for i in base['cells'] if i['id'] in cells):
        cell_class, features, gated = sg.classify(item['native'])
        row = {'cell': item['id'], 'size': list(item['native'].shape[1::-1]), 'class': cell_class, 'gateClass': gated,
               'strokeShare': features['strokeShare'], 'publishedMode': item['cell']['mode'], 'publishedScale': item['scale']}
        if item['cell']['mode'] == rd.REDRAW_MODE:
            metrics = item['cell']['redraw']['gate']
            row['redrawGate'] = metrics
            row['redrawPasses'] = {'v60': passes(metrics, ai.GATE), 'stroke': passes(metrics, sg.GATE)}
        failed = v59[item['id']].get('failedSourceSelection')
        if failed:
            row['sourceShape'] = failed['key']
            row['sourceRenders'] = {}
            for scale in (2, 4, 8):
                truth = render_candidate(sid, failed['key'], (scale, row['size']), scratch)
                metrics = ai.gate_metrics(item['native'], truth, scale)
                row['sourceRenders'][f'{scale}x'] = {'gate': metrics, 'passes': {'v60': passes(metrics, ai.GATE),
                                                                                 'stroke': passes(metrics, sg.GATE)}}
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cells', type=int, default=400)
    parser.add_argument('--per-species', type=int, default=3)
    parser.add_argument('--max-side', type=int, default=1024)
    parser.add_argument('--seed', default='v62-stroke-gate')
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/battle-hd-v62/stroke-calibration.json')
    parser.add_argument('--reference-only', action='store_true', help='Only measure the 166 reference case against the pinned gates')
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix='stroke-calibration-', dir=args.output.parent))
    try:
        if args.reference_only:
            print(json.dumps(reference_case(scratch), indent=1))
            return
        cells = sample(args.cells, args.per_species, args.seed, args.max_side)
        rows = [measure(cell, scratch) for cell in cells]
        order = list(range(len(rows)))
        random.Random(f'{args.seed}-split').shuffle(order)
        calibration = [rows[i] for i in sorted(order[::2])]
        validation = [rows[i] for i in sorted(order[1::2])]
        q, gate, rate = calibrate(calibration)
        v60 = {key: value for key, value in ai.GATE.items() if key != 'localColorCheck'}
        result = {'sample': {'cells': len(rows), 'species': len({r['species'] for r in rows}), 'seed': args.seed,
                             'perSpecies': args.per_species, 'maxSide': args.max_side,
                             'rule': f'original-vector cells published at 2x or more, shorter side >= 8 px, longer side <= {args.max_side} px, '
                                     f'native raster of class flat or shaded whose line-like thin parts (skeleton >= '
                                     f'{sg.STROKE_MINIMUM_LENGTH} px) hold >= {sg.STROKE_SHARE_MINIMUM} of the coverage',
                             'scales': {str(s): sum(r['scale'] == s for r in rows) for s in sorted({r['scale'] for r in rows})},
                             'classes': {c: sum(r['class'] == c for r in rows) for c in sg.STROKE_CLASSES},
                             'calibrationCells': len(calibration), 'validationCells': len(validation)},
                  'method': f'Equal tails: IoU minimum at the q-th percentile, both error maxima at the (100-q)-th, of the calibration '
                            f'half; the largest q in steps of 0.05 whose gate passes at least {TARGET_PASS:.0%} of the calibration renders '
                            f'on every check at once (stable-interior colour check included).',
                  'tailPercentile': q, 'thresholds': gate, 'calibrationPassRate': round(rate, 4),
                  'stroke': {'calibration': rates(calibration, gate), 'validation': rates(validation, gate), 'all': rates(rows, gate)},
                  'v60Gate': {'thresholds': v60, 'calibration': rates(calibration, v60), 'validation': rates(validation, v60), 'all': rates(rows, v60)},
                  'rows': [{**r, 'half': 'calibration' if i in set(order[::2]) else 'validation'} for i, r in enumerate(rows)]}
        args.output.write_text(json.dumps(result, indent=1)+'\n')
        print(json.dumps({key: result[key] for key in ('sample', 'tailPercentile', 'thresholds', 'calibrationPassRate', 'stroke', 'v60Gate')}, indent=1))
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


if __name__ == '__main__':
    main()
