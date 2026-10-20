#!/usr/bin/env python3
"""Calibrate the V61 redraw on known-good original-vector cells.

A published original-vector cell has both the original Unity raster (native size) and a real high-resolution render of
its original vector source. For the V60 calibration sample (same seed, 360 cells) and a second sample of stroke-like
cells (thin parts carry most of the coverage), this tool
  1. classifies the native raster as the redraw does, and measures the vector render with the native gate (reduced to
     native size against the raster): the spread of a faithful high-resolution version, per class;
  2. redraws the native raster (battle_hd_redraw) at the vector render's multiplier, gates it, and compares it with the
     vector render at full resolution, aligned like calibrate_battle_hd_ai_gates.py, beside a Lanczos enlargement.
Writes artifacts/battle-hd-redraw-v61/calibration.json. Read-only for published assets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import shutil
import tempfile

import numpy as np
from PIL import Image, ImageOps

import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd
from build_battle_hd_ai_atlases import ROOT, HD_INDEX, HD_MANIFEST, load_base, read_json
from calibrate_battle_hd_ai_gates import best_shift, lanczos, sample, source_base, summarize, truth_metrics

GATE_KEYS = ('alphaIoU16', 'premultipliedRgbaMae', 'blockError')
TRUTH_KEYS = ('alphaIoU16', 'premultipliedRgbaMae', 'gradientMae', 'sharpnessRatio')


def stroke_share(native):
    """Share of the native coverage in thin parts (battle_hd_redraw.split_strokes), or None for a non-vector class."""
    cell_class, _, vector = rd.classify(native)
    if vector is None:
        return None
    coverage = np.clip(vector[1].sum(axis=2), 0, 1)
    zone, thin, _ = rd.split_strokes(coverage)
    return float(coverage[thin > 0].sum()/max(coverage.sum(), 1e-9))


def stroke_sample(count, seed, exclude):
    """Known-good original-vector cells whose thin parts hold at least half of the coverage."""
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    ids = sorted((s for s in published if s != '346'), key=str)
    random.Random(seed).shuffle(ids)
    chosen = []
    for sid in ids:
        if len(chosen) >= count:
            break
        entry, report_path = source_base(sid, published, manifest)
        try:
            base = load_base(sid, entry, report_path)
        except ValueError:  # A base the V60 loader does not read (a 1x constant cell); another species is taken.
            continue
        for item in base['cells']:
            key = (sid, item['id'])
            if (key in exclude or item['cell']['mode'] != 'original-vector' or item['placement']['width'] <= item['native'].shape[1]
                    or not 8 <= min(item['native'].shape[:2]) or max(item['native'].shape[:2]) > 256):
                continue
            share = stroke_share(item['native'])
            if share is None or share < .5:
                continue
            scale = item['placement']['width']//item['native'].shape[1]
            chosen.append({'species': sid, 'cell': item['id'], 'scale': scale, 'native': item['native'],
                           'truth': np.asarray(ImageOps.flip(Image.fromarray(item['tile']))),
                           'firstPose': item['row']['appearsInFirstStandbyPose'], 'size': list(item['native'].shape[1::-1])})
            if len([c for c in chosen if c['species'] == sid]) >= 2 or len(chosen) >= count:
                break
    return chosen


def measure(cell, work):
    row = {k: cell[k] for k in ('species', 'cell', 'scale', 'firstPose', 'size')}
    row['vectorGate'] = ai.gate_metrics(cell['native'], cell['truth'], cell['scale'])
    result = rd.redraw(cell['native'], cell['scale'], work)
    row['class'] = result['class'] if result else 'none'
    row['features'] = result['features'] if result else {}
    baseline = lanczos(cell['native'], cell['scale'])
    radius = cell['scale']//2
    shift = best_shift(baseline, cell['truth'], radius)
    row['lanczosAligned'] = truth_metrics(baseline, cell['truth'], shift, radius)
    if result and result['tile'] is not None:
        row['redrawGate'] = ai.gate_metrics(cell['native'], result['tile'], cell['scale'])
        row['redrawAligned'] = truth_metrics(result['tile'], cell['truth'], shift, radius)
    return row


def class_summary(rows, thresholds):
    """Per class: counts, the vector-render gate spread, and the redraw's gate pass rate and closeness to the truth."""
    result = {}
    for name in sorted({r['class'] for r in rows}):
        part = [r for r in rows if r['class'] == name]
        drawn = [r for r in part if 'redrawGate' in r]
        entry = {'cells': len(part), 'vectorGate': summarize([r['vectorGate'] for r in part], GATE_KEYS),
                 'vectorGatePassRate': float(np.mean([ai.gate_passes(r['vectorGate'], thresholds) for r in part]))}
        if drawn:
            entry.update(redrawGate=summarize([r['redrawGate'] for r in drawn], GATE_KEYS),
                         redrawPassRate=float(np.mean([ai.gate_passes(r['redrawGate'], thresholds) for r in drawn])),
                         redrawAligned=summarize([r['redrawAligned'] for r in drawn], TRUTH_KEYS),
                         lanczosAligned=summarize([r['lanczosAligned'] for r in drawn], TRUTH_KEYS),
                         closerThanLanczos=float(np.mean([r['redrawAligned']['premultipliedRgbaMae'] < r['lanczosAligned']['premultipliedRgbaMae']
                                                          for r in drawn])))
        result[name] = entry
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cells', type=int, default=360)
    parser.add_argument('--per-species', type=int, default=3)
    parser.add_argument('--seed', default='v60-calibration')
    parser.add_argument('--stroke-cells', type=int, default=120)
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/battle-hd-redraw-v61/calibration.json')
    args = parser.parse_args()
    general = sample(args.cells, args.per_species, args.seed)
    strokes = stroke_sample(args.stroke_cells, f'{args.seed}-strokes', {(c['species'], c['cell']) for c in general})
    work = Path(tempfile.mkdtemp(prefix='redraw-calibration-', dir=args.output.parent if args.output.parent.exists() else None))
    try:
        rows = [{**measure(cell, work), 'sample': 'general'} for cell in general]
        rows += [{**measure(cell, work), 'sample': 'strokes'} for cell in strokes]
    finally:
        shutil.rmtree(work, ignore_errors=True)
    thresholds = {key: value for key, value in ai.GATE.items() if key != 'localColorCheck'}
    result = {'redraw': {'classes': ['tiny', 'glow', 'complex', 'flat', 'shaded']},
              'sample': {'general': len(general), 'strokes': len(strokes), 'seed': args.seed},
              'gate': ai.GATE,
              'general': class_summary([r for r in rows if r['sample'] == 'general'], thresholds),
              'strokes': class_summary([r for r in rows if r['sample'] == 'strokes'], thresholds),
              'all': class_summary(rows, thresholds), 'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=1)+'\n')
    for part in ('general', 'strokes'):
        for name, entry in result[part].items():
            compact = {k: round(v, 3) for k, v in entry.items() if isinstance(v, float)}
            means = {k: round(entry[k]['alphaIoU16']['mean'], 3) for k in ('vectorGate', 'redrawGate') if k in entry}
            mae = {k: round(entry[k]['premultipliedRgbaMae']['mean'], 2) for k in ('redrawAligned', 'lanczosAligned') if k in entry}
            print(part, name, entry['cells'], compact, means, mae)


if __name__ == '__main__':
    main()
