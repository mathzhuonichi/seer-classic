#!/usr/bin/env python3
"""Audit the texel density of every selected battle atlas at a reference battle display.

The battle scales each clip so the visible alpha box of its first standby pose fills the creature box times the
creature's art extent (battle-animation-registration.ts, BattleCreatureAnimation.tsx). From the original metadata and
atlas this tool derives, per species, device pixels per clip unit at the reference display, and per atlas cell the
selected atlas's texels per device pixel at the cell's largest on-screen size (first standby pose, and any frame).

Cells below the threshold are split by cause: an original-vector cell rendered at too low a multiplier (fixable by a
higher source render), a retained raster cell (original pixels; no source vector was accepted), or an AI cell (an
AI-upscaled raster still short of the target: capped at 8x or reduced by the budget, or the species 910 AI bitmap), or a
redrawn cell (a V61 local redraw still short of the target: capped at 32x or reduced by the budget). The WebGL backing
store is not a per-species cause; tools/verification/battle-hd-display.mjs measures it in the running game.
Writes a JSON report; read-only for every published asset.
"""
from __future__ import annotations

import argparse
from collections import Counter
import concurrent.futures
import gzip
import json
import math
import multiprocessing
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# The largest creature box: .classic-creature-motion is at most 280 CSS pixels; gameDisplayLayout zooms a 1920x1080
# viewport by 1.5; the reference device pixel ratio is 2.
REFERENCE = {'boxCssPixels': 280, 'layoutZoom': 1.5, 'devicePixelRatio': 2}
# BattleCreatureAnimation passes physicalScale * .9 as the extent; creature-art.ts falls back to .84 without a row.
ART_FILL, DEFAULT_PHYSICAL_SCALE = .9, .84
# visibleStandbyBounds treats alpha 16 of 255 as visible.
VISIBLE_ALPHA = 16
# Atlas texels per device pixel at which a cell is no longer magnified; the generator renders vector cells to reach it.
TARGET_DENSITY = 1.0
VECTOR_MODES = {'original-vector', 'original-vector-with-native-bitmap', 'original-bitmap-source-recovery'}
RASTER_MODES = {'retained-original-cell', 'retained-native-microstrip'}
AI_MODES = {'ai-upscaled', 'ai-source-bitmap'}
REDRAWN_MODES = {'redrawn'}
NO_DETAIL_MODES = {'constant-original-rgba'}
MULTIPLIERS = (1, 2, 4, 8, 16)


def uv_key(values):
    return tuple(round(v, 7) for v in values)


def quad_rows(frame):
    """(UV key, texel-space UVs and clip-unit vertices of each quad, multiply alpha) for a frame."""
    positions, uvs, mul = frame['positions'], frame['uvs'], frame['mulColors']
    for q in range(len(uvs)//8):
        p = [(positions[q*8+i*2], positions[q*8+i*2+1]) for i in range(4)]
        t = [(uvs[q*8+i*2], uvs[q*8+i*2+1]) for i in range(4)]
        key = uv_key((min(u for u, _ in t), min(v for _, v in t), max(u for u, _ in t), max(v for _, v in t)))
        yield key, t, p, mul[q*16+3]


def texels_per_unit(t, p, width, height):
    """Original atlas texels per clip unit along the quad's lower-density edge."""
    def ratio(i, j):
        texels = math.hypot((t[j][0]-t[i][0])*width, (t[j][1]-t[i][1])*height)
        units = math.hypot(p[j][0]-p[i][0], p[j][1]-p[i][1])
        return texels/units if units > 0 else math.inf
    return min(ratio(0, 1), ratio(0, 3))


def visible_box(frame, alpha, width, height):
    """Clip-unit box of the frame's texels whose rendered alpha reaches VISIBLE_ALPHA, or None."""
    box = [math.inf, math.inf, -math.inf, -math.inf]
    for _, t, p, mul in quad_rows(frame):
        if mul <= 0:
            continue
        x0, y0 = round(min(u for u, _ in t)*width), round(min(v for _, v in t)*height)
        x1, y1 = round(max(u for u, _ in t)*width), round(max(v for _, v in t)*height)
        region = alpha[y0:y1, x0:x1] >= VISIBLE_ALPHA/mul
        if not region.any():
            continue
        rows, cols = np.flatnonzero(region.any(1)), np.flatnonzero(region.any(0))
        u0, u1, v0, v1 = (x0+cols[0])/width, (x0+cols[-1]+1)/width, (y0+rows[0])/height, (y0+rows[-1]+1)/height
        (a, b, d), (pa, pb, pd) = (t[0], t[1], t[3]), (p[0], p[1], p[3])
        det = (b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0])
        if det == 0:
            continue
        for u, v in ((u0, v0), (u1, v0), (u0, v1), (u1, v1)):
            s = ((u-a[0])*(d[1]-a[1])-(v-a[1])*(d[0]-a[0]))/det
            r = ((b[0]-a[0])*(v-a[1])-(b[1]-a[1])*(u-a[0]))/det
            x, y = pa[0]+s*(pb[0]-pa[0])+r*(pd[0]-pa[0]), pa[1]+s*(pb[1]-pa[1])+r*(pd[1]-pa[1])
            box = [min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y)]
    return box if box[2] > box[0] else None


def mesh_box(standby):
    xs = [v for f in standby['frames'] for v in f['positions'][::2]]
    ys = [v for f in standby['frames'] for v in f['positions'][1::2]]
    return [min(xs), min(ys), max(xs), max(ys)]


def physical_scales():
    """Species id -> physicalScale, from the measured art rows that creature-art.ts reads."""
    return {sid: row[8] for sid, row in json.loads((ROOT/'src/shared/creature-art-data.json').read_text()).items()}


def reference_box_device_pixels():
    return REFERENCE['boxCssPixels']*REFERENCE['layoutZoom']*REFERENCE['devicePixelRatio']


def original_magnification(meta, alpha, physical_scale, box_device_pixels):
    """How the battle shows each original atlas cell at a creature box of `box_device_pixels`.

    Returns device pixels per clip unit, the visible first-pose box, and per UV cell key the original atlas texels per
    device pixel at the cell's largest on-screen size, in the first standby pose and in any frame.
    """
    height, width = alpha.shape
    standby = next((s for s in meta['sequences'] if s['name'] == 'standby'), meta['sequences'][0])
    box = visible_box(standby['frames'][0], alpha, width, height) or mesh_box(standby)
    device_per_unit = box_device_pixels*physical_scale*ART_FILL/max(box[2]-box[0], box[3]-box[1])
    cells = {}
    for sequence in meta['sequences']:
        for index, frame in enumerate(sequence['frames']):
            first = sequence is standby and index == 0
            for key, t, p, mul in quad_rows(frame):
                density = texels_per_unit(t, p, width, height)/device_per_unit
                cell = cells.setdefault(key, {'firstPose': None, 'anyFrame': math.inf})
                cell['anyFrame'] = min(cell['anyFrame'], density)
                if first and mul > 0:
                    cell['firstPose'] = min(cell['firstPose'] or math.inf, density)
    return device_per_unit, box, cells


def report_cells(report):
    """UV cell key -> cell id, mode and output multiplier, from a generation report."""
    placements = {p['id']: p for p in report['layout']['placements']}
    return {uv_key(placements[c['id']]['sourceUvBounds']): {'id': c['id'], 'mode': c['mode'],
            'multiplier': placements[c['id']]['width']/c['nativeSize'][0]} for c in report['cells']}


def low_cells(densities, threshold):
    """Nonconstant cells below `threshold`, lowest first, split by cause; vector cells name the multiplier they need."""
    rows = sorted((row for row in densities if row['mode'] not in NO_DETAIL_MODES), key=lambda row: row['density'])
    low = [row for row in rows if row['density'] < threshold]
    for row in low:
        if row['mode'] in VECTOR_MODES:
            needed = row['multiplier']*threshold/row['density']
            row['multiplierNeeded'] = next((m for m in MULTIPLIERS if m >= needed-1e-9), None)
    return {'lowest': rows[0]['density'] if rows else None, 'cells': len(rows),
            'below': {'vector': [r for r in low if r['mode'] in VECTOR_MODES], 'raster': [r for r in low if r['mode'] in RASTER_MODES],
                      'ai': [r for r in low if r['mode'] in AI_MODES], 'redrawn': [r for r in low if r['mode'] in REDRAWN_MODES],
                      'other': [r for r in low if r['mode'] not in VECTOR_MODES | RASTER_MODES | AI_MODES | REDRAWN_MODES]}}


def audit_species(sid, original, report_path, physical_scale, box_device_pixels, threshold):
    meta = json.loads(gzip.decompress((ROOT/'public'/original['meta'].lstrip('/')).read_bytes()))
    with Image.open(ROOT/'public'/original['atlas'].lstrip('/')) as image:
        alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    device_per_unit, box, magnification = original_magnification(meta, alpha, physical_scale, box_device_pixels)
    cells = report_cells(json.loads((ROOT/report_path).read_bytes()))
    scopes = {'firstPose': [], 'anyFrame': []}
    for key, seen in magnification.items():
        cell = cells.get(key)
        for scope, rows in scopes.items():
            if cell and seen[scope] is not None:
                rows.append({'id': cell['id'], 'mode': cell['mode'], 'multiplier': cell['multiplier'],
                             'density': round(seen[scope]*cell['multiplier'], 4)})
    return {'species': sid, 'physicalScale': physical_scale, 'visibleBox': [round(v, 5) for v in box],
            'devicePixelsPerUnit': round(device_per_unit, 3), 'unmatchedCells': sum(key not in cells for key in magnification),
            **{scope: low_cells(rows, threshold) for scope, rows in scopes.items()}}


def attempt(args):
    try:
        return audit_species(*args), None
    except Exception as error:  # Recorded per species; the audit continues.
        return None, f'{args[0]}: {error}'


def causes(results, scope):
    split = {'vector-multiplier': [], 'retained-raster': [], 'ai-cell': [], 'redrawn-cell': [], 'other': []}
    cells = dict.fromkeys(split, 0)
    for row in results:
        below = row[scope]['below']
        for cause, key in (('vector-multiplier', 'vector'), ('retained-raster', 'raster'), ('ai-cell', 'ai'), ('redrawn-cell', 'redrawn'),
                           ('other', 'other')):
            if below[key]:
                split[cause].append(int(row['species']))
                cells[cause] += len(below[key])
    return {cause: {'species': len(ids), 'cells': cells[cause], 'ids': sorted(ids)} for cause, ids in split.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species; omitted means every species in the original runtime index')
    parser.add_argument('--threshold', type=float, default=TARGET_DENSITY, help='Atlas texels per device pixel')
    parser.add_argument('--box-device-pixels', type=float, default=reference_box_device_pixels())
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2))
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/battle-hd-density/audit.json')
    args = parser.parse_args()
    original = json.loads((ROOT/'public/battle-animations/runtime-index.json').read_text())['species']
    manifest = json.loads((ROOT/'public/battle-animations/hd/manifest.json').read_text())['species']
    scales = physical_scales()
    ids = sorted(args.ids.split(',') if args.ids else original, key=int)
    tasks = [(sid, original[sid], manifest[sid]['reportPath'], scales.get(sid, DEFAULT_PHYSICAL_SCALE),
              args.box_device_pixels, args.threshold) for sid in ids]
    if args.jobs == 1:
        outcomes = [attempt(task) for task in tasks]
    else:
        with concurrent.futures.ProcessPoolExecutor(2, mp_context=multiprocessing.get_context('spawn')) as pool:
            outcomes = list(pool.map(attempt, tasks, chunksize=4))
    results = [row for row, _ in outcomes if row]
    failures = [error for _, error in outcomes if error]
    modes = Counter(row['mode'] for result in results for rows in result['firstPose']['below'].values() for row in rows)
    report = {'reference': {**REFERENCE, 'boxDevicePixels': args.box_device_pixels}, 'threshold': args.threshold,
              'canvasResolution': 'Species-independent: the WebGL backing store follows DPR times CSS zoom (battle-hd-display.mjs).',
              'speciesAudited': len(results), 'failures': failures,
              'firstPose': causes(results, 'firstPose'), 'anyFrame': causes(results, 'anyFrame'),
              'firstPoseLowCellModes': dict(modes), 'species': {row['species']: row for row in results}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=1)+'\n')
    print(json.dumps({key: report[key] for key in ('reference', 'threshold', 'speciesAudited', 'failures', 'firstPoseLowCellModes')}))
    for scope in ('firstPose', 'anyFrame'):
        print(scope, json.dumps({cause: [row['cells'], row['species']] for cause, row in report[scope].items()}))


if __name__ == '__main__':
    main()
