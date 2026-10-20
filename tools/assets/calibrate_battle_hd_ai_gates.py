#!/usr/bin/env python3
"""Calibrate the V60 AI gate and method on known-good original-vector cells.

A published original-vector cell has both the original Unity raster (native size) and a real high-resolution render
of its original vector source. For a deterministic sample of such cells this tool
  1. measures the vector render with the AI gate (reduced to native size against the original raster): the spread of
     a faithful high-resolution version, from which the gate thresholds are taken;
  2. upscales the original raster with the pinned model in every alpha mode (and both 8x modes) and compares the
     result with the vector render at full resolution, beside a Lanczos enlargement of the same raster. The Unity
     raster and the vector render can differ by a subpixel registration, which favours blur in a plain error; the
     comparison therefore also aligns each pair by the integer shift (within half a native pixel) that best matches
     the Lanczos baseline, and reports the gradient-magnitude ratio (1 = as sharp as the vector render).
Writes artifacts/battle-hd-ai-v60/calibration.json. Read-only for published assets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import random

import numpy as np
from PIL import Image, ImageOps

import battle_hd_ai_upscale as ai
from build_battle_hd_ai_atlases import ROOT, HD_INDEX, HD_MANIFEST, base_species, load_base, read_json

PERCENTILES = (1, 5, 50, 95, 99)


def lanczos(native, scale):
    """Premultiplied Lanczos enlargement (no AI), the interpolation baseline."""
    pm = ai.premultiplied(native)
    size = (native.shape[1]*scale, native.shape[0]*scale)
    channels = [np.asarray(Image.fromarray(pm[:, :, c].astype(np.float32), 'F').resize(size, Image.Resampling.LANCZOS)) for c in range(4)]
    out = np.clip(np.stack(channels, axis=2), 0, 255)
    out[:, :, :3] = np.minimum(out[:, :, :3], out[:, :, 3:])
    return ai.straight(out)


def best_shift(baseline, truth, radius):
    """Integer shift of the truth that best matches the baseline's alpha, within `radius` pixels."""
    a = baseline[:, :, 3].astype(np.float32)
    b = truth[:, :, 3].astype(np.float32)
    height, width = a.shape
    if min(height, width) <= 2*radius+2:
        return 0, 0
    core = a[radius:height-radius, radius:width-radius]
    errors = {(dy, dx): float(np.abs(core-b[radius+dy:height-radius+dy, radius+dx:width-radius+dx]).mean())
              for dy in range(-radius, radius+1) for dx in range(-radius, radius+1)}
    return min(errors, key=lambda key: (errors[key], abs(key[0])+abs(key[1])))


def aligned(candidate, truth, shift, radius):
    height, width = truth.shape[:2]
    if min(height, width) <= 2*radius+2:
        return candidate, truth
    dy, dx = shift
    return (candidate[radius:height-radius, radius:width-radius],
            truth[radius+dy:height-radius+dy, radius+dx:width-radius+dx])


def truth_metrics(candidate, truth, shift=None, radius=0):
    """Comparison with the original-vector render: alpha IoU, premultiplied MAE, gradient MAE and sharpness ratio."""
    if shift is not None:
        candidate, truth = aligned(candidate, truth, shift, radius)
    a, b = ai.premultiplied(candidate), ai.premultiplied(truth)
    fa, fb = candidate[:, :, 3] > 16, truth[:, :, 3] > 16
    foreground = fa | fb
    def gradient(x):
        return np.abs(np.diff(x, axis=0))[:, :-1]+np.abs(np.diff(x, axis=1))[:-1, :]
    mask = foreground[:-1, :-1]
    grad = np.abs(gradient(a)-gradient(b)).mean(axis=2)[mask]
    sharp_a, sharp_b = gradient(a).mean(axis=2)[mask].mean(), gradient(b).mean(axis=2)[mask].mean()
    return {'alphaIoU16': float((fa & fb).sum()/max(1, foreground.sum())),
            'premultipliedRgbaMae': float(np.abs(a-b).mean(axis=2)[foreground].mean()) if foreground.any() else 0.0,
            'gradientMae': float(grad.mean()) if grad.size else 0.0,
            'sharpnessRatio': float(sharp_a/sharp_b) if grad.size and sharp_b > 0 else 1.0}


def sample(count, per_species, seed):
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    ids = sorted(base_species([s for s in published if s != '346'], published, manifest))
    random.Random(seed).shuffle(ids)
    chosen = []
    for sid in ids:
        if len(chosen) >= count:
            break
        entry, report_path = base_species([sid], published, manifest)[sid]
        base = load_base(sid, entry, report_path)
        cells = [item for item in base['cells'] if item['cell']['mode'] == 'original-vector'
                 and item['placement']['width'] > item['native'].shape[1] and 8 <= min(item['native'].shape[:2])
                 and max(item['native'].shape[:2]) <= 256
                 and not np.all(item['native'] == item['native'][0, 0])]
        random.Random(f'{seed}-{sid}').shuffle(cells)
        cells.sort(key=lambda item: item['placement']['width']//item['native'].shape[1] != 8)
        for item in cells[:per_species]:
            scale = item['placement']['width']//item['native'].shape[1]
            truth = np.asarray(ImageOps.flip(Image.fromarray(item['tile'])))
            chosen.append({'species': sid, 'cell': item['id'], 'scale': scale, 'native': item['native'], 'truth': truth,
                           'firstPose': item['row']['appearsInFirstStandbyPose'], 'size': list(item['native'].shape[1::-1])})
    return chosen[:count]


def summarize(rows, path):
    values = [row for row in (r for r in rows) if row is not None]
    return {key: {f'p{p}': float(np.percentile([v[key] for v in values], p)) for p in PERCENTILES} | {'mean': float(np.mean([v[key] for v in values]))}
            for key in path}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cells', type=int, default=360)
    parser.add_argument('--per-species', type=int, default=3)
    parser.add_argument('--seed', default='v60-calibration')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v60/model')
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/battle-hd-ai-v60/calibration.json')
    parser.add_argument('--tail', type=float, default=5, help='Percentile of the vector-cell gate spread used as threshold')
    args = parser.parse_args()
    cells = sample(args.cells, args.per_species, args.seed)
    natives = {i: c['native'] for i, c in enumerate(cells)}
    scales = {i: c['scale'] for i, c in enumerate(cells)}
    outputs = ai.model_outputs(natives, scales, args.cache, kinds=('rgb', 'alpha', 'lifted'), second_pass=True)
    rows = []
    for i, cell in enumerate(cells):
        row = {k: cell[k] for k in ('species', 'cell', 'scale', 'firstPose', 'size')}
        row['vectorGate'] = ai.gate_metrics(cell['native'], cell['truth'], cell['scale'])
        baseline = lanczos(cell['native'], cell['scale'])
        radius = cell['scale']//2
        shift = best_shift(baseline, cell['truth'], radius)
        row['registrationShift'] = list(shift)
        row['lanczosTruth'] = truth_metrics(baseline, cell['truth'])
        row['lanczosAligned'] = truth_metrics(baseline, cell['truth'], shift, radius)
        row['ai'] = {}
        for alpha_mode in ai.ALPHA_MODES:
            for eight_mode in (ai.EIGHT_MODES if cell['scale'] == 8 else ai.EIGHT_MODES[:1]):
                tile = ai.tile_at(outputs[i], cell['scale'], alpha_mode, eight_mode)
                row['ai'][f'{alpha_mode}/{eight_mode}'] = {'truth': truth_metrics(tile, cell['truth']),
                                                         'aligned': truth_metrics(tile, cell['truth'], shift, radius),
                                                         'gate': ai.gate_metrics(cell['native'], tile, cell['scale'])}
        rows.append(row)
    gate_keys = ('alphaIoU16', 'premultipliedRgbaMae', 'blockError')
    truth_keys = ('alphaIoU16', 'premultipliedRgbaMae', 'gradientMae', 'sharpnessRatio')
    vector = summarize([r['vectorGate'] for r in rows], gate_keys)
    low, high = f'p{args.tail:g}', f'p{100-args.tail:g}'
    vector_tail = {key: {low: float(np.percentile([r['vectorGate'][key] for r in rows], args.tail)),
                         high: float(np.percentile([r['vectorGate'][key] for r in rows], 100-args.tail))} for key in gate_keys}
    thresholds = {'alphaIoU16Minimum': round(vector_tail['alphaIoU16'][low], 4),
                  'premultipliedRgbaMaeMaximum': round(vector_tail['premultipliedRgbaMae'][high], 4),
                  'blockErrorMaximum': round(vector_tail['blockError'][high], 4)}
    names = sorted({mode for r in rows for mode in r['ai']})
    modes = {}
    for scale in (None, 2, 4, 8):
        subset = [r for r in rows if scale is None or r['scale'] == scale]
        if not subset:
            continue
        suffix = '' if scale is None else f'@{scale}x'
        modes['lanczos'+suffix] = {'cells': len(subset), 'truth': summarize([r['lanczosTruth'] for r in subset], truth_keys),
                                   'aligned': summarize([r['lanczosAligned'] for r in subset], truth_keys)}
        for mode in names:
            part = [r for r in subset if mode in r['ai']]
            if not part:
                continue
            gates = [r['ai'][mode]['gate'] for r in part]
            modes[mode+suffix] = {'cells': len(part), 'truth': summarize([r['ai'][mode]['truth'] for r in part], truth_keys),
                                  'aligned': summarize([r['ai'][mode]['aligned'] for r in part], truth_keys),
                                  'gate': summarize(gates, gate_keys),
                                  'gatePassRate': float(np.mean([ai.gate_passes(g, thresholds) for g in gates])),
                                  'alignedCloserThanLanczos': float(np.mean([r['ai'][mode]['aligned']['premultipliedRgbaMae']
                                                                             < r['lanczosAligned']['premultipliedRgbaMae'] for r in part]))}
    result = {'method': ai.method(), 'sample': {'cells': len(rows), 'species': len({r['species'] for r in rows}), 'seed': args.seed,
              'scales': {str(s): sum(r['scale'] == s for r in rows) for s in (2, 4, 8)}},
              'vectorGate': vector, 'thresholdTail': args.tail, 'vectorGateTail': vector_tail, 'thresholds': thresholds,
              'modes': modes, 'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=1)+'\n')
    print(json.dumps({'sample': result['sample'], 'thresholds': thresholds}))
    for mode, value in modes.items():
        compact = {part: {key: round(stats['mean'], 4) for key, stats in value[part].items()} for part in ('truth', 'aligned')}
        print(mode, value['cells'], json.dumps(compact), {k: round(v, 3) for k, v in value.items() if k in ('gatePassRate', 'alignedCloserThanLanczos')})


if __name__ == '__main__':
    main()
