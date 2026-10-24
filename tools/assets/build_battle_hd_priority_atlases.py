#!/usr/bin/env python3
"""Compose V62 battle atlases: within each atlas's decoded budget the first standby pose comes first.

The base of a species is its published HD atlas (V61, V60, V59 or V44) and the report that produced it, proven as V60
and V61 prove theirs. Densities are those of audit_battle_hd_density.py at the reference display. Decision of
2026-10-20: every cell drawn in the first standby pose (original vector, V60 AI tile, V61 redraw or retained raster)
reaches one texel per device pixel there before any cell outside it keeps a raise above its V44 multiplier.

Cells in the plan, each with a ladder of multipliers from its highest level down to its floor:
  first pose      a first-pose cell below the target in the first pose rises to the smallest multiplier that reaches it:
                  an original vector is rendered again from its selected SVG by the pipeline's own renderer (up to 32x;
                  V59 stopped at 8x), a V60 AI tile is upscaled again by the pinned model (up to 8x), a retained raster
                  is upscaled by the model or redrawn by the V61 method (a thin-stroke cell only redrawn), a V61 redraw is
                  redrawn. Its floor is its published multiplier.
  stroke          a retained raster outside that rule, below the target in some frame and classified as thin strokes,
                  redrawn at the multiplier its frames need (battle_hd_stroke_gate); floor 1x. Budget left over only.
  V59 raise       an original vector outside the first pose above its V44 multiplier; floor: the V44 multiplier.
  AI or redraw    a V60 AI tile or V61 redraw outside the first pose above 1x; floor 1x (its original pixels).
Over budget one cell at a time moves down a level: stroke cells first, then V59 raises, then AI tiles and redraws,
and first-pose cells last. Within a tier the step with the most bytes saved per unit of visible loss goes first (the
loss: how much further below one texel per device pixel the cell falls at its largest on-screen size); soft AI tiles
and redraws (glow, tiny) before the others. Every cell not in the plan keeps its published tile.

Every new tile passes its gate: AI tiles and redraws the V60 native gate, a thin-stroke redraw the stroke gate, a
visual review rejects stroke redraws (battle_hd_stroke_review_v62.json); a level that fails is dropped from its ladder
and the plan is made again. A second pass fixes every first-pose cell where the first left it and undoes the
give-backs that could not lift it. Pages are packed by the pipeline's MaxRects packer at the smallest of its canvas
widths (steps of 256). Metadata changes only in UVs and atlas size. Outputs: <id>-v62.webp (lossless, RGB under
zero alpha kept) and <id>-v62.json.gz; reports, redraw SVGs and cloned source SVGs stay in the ignored cache.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import copy
import gzip
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import subprocess
import time

import numpy as np
from PIL import Image

from audit_battle_hd_density import TARGET_DENSITY, reference_box_device_pixels, uv_key
from battle_hd_atlas_layout import remap_clip, _pack, _verify
import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd
import battle_hd_stroke_gate as sg
from build_battle_hd_ai_atlases import HD_INDEX, HD_MANIFEST, STANDARD_BUDGET, densities, read_json, source_record
from build_battle_hd_atlases import ROOT, pack_rows, sha
import build_battle_hd_redraw_atlases as rda
from recover_battle_shapes import save

REVISION = 1
OUTPUT_TAG = 'v62'
KIND = 'first-pose-priority-override'
VECTOR_SCALES = (2, 4, 8, 16, 32)
TIERS = ('stroke', 'v59-raise', 'ai-or-redraw', 'first-pose')
SHAPE_RENDERER = ROOT/'tools/assets/render_battle_shape_candidates.mjs'
REVIEW = ROOT/'tools/assets/battle_hd_stroke_review_v62.json'
CALIBRATION = ROOT/'tools/assets/battle_hd_stroke_calibration_v62.json'


def policy():
    """Everything besides the base and its pixels that decides a V62 plan; a report with another policy is not reused."""
    names = ('build_battle_hd_priority_atlases.py', 'battle_hd_stroke_gate.py', 'build_battle_hd_redraw_atlases.py',
             'render_battle_shape_candidates.mjs')
    return {'revision': REVISION, 'tiers': list(TIERS), 'vectorScales': list(VECTOR_SCALES), 'redrawScales': list(rda.SCALES),
            'aiScales': list(ai.SCALES), 'targetTexelsPerDevicePixel': TARGET_DENSITY,
            'referenceBoxDevicePixels': reference_box_device_pixels(), 'maxRgbaBytes': STANDARD_BUDGET,
            'code': {name: sha((ROOT/'tools/assets'/name).read_bytes()) for name in names}}


def needed(density, scales):
    """The smallest multiplier of `scales` at which `density` (texels per device pixel at 1x) reaches the target."""
    return next((m for m in scales if density*m >= TARGET_DENSITY), scales[-1])


def v44_scales(sid, meta):
    """Per original UV cell key, its multiplier in the published V44 atlas, read from the V44 metadata (not a report)."""
    path = ROOT/'public/battle-animations/hd'/f'{sid}-v44.json.gz'
    if not path.exists():
        return {}
    v44 = json.loads(gzip.decompress(path.read_bytes()))
    width, crops = v44['atlasWidth'], {}
    for sequence, sequence44 in zip(meta['sequences'], v44['sequences']):
        for frame, frame44 in zip(sequence['frames'], sequence44['frames']):
            for offset in range(0, len(frame['uvs']), 8):
                quad, quad44 = frame['uvs'][offset:offset+8:2], frame44['uvs'][offset:offset+8:2]
                key = uv_key((min(quad), min(frame['uvs'][offset+1:offset+8:2]), max(quad), max(frame['uvs'][offset+1:offset+8:2])))
                crops[key] = (max(quad44)-min(quad44))*(width-1)
    return crops


def base_of(sid, published, manifest):
    """(entry, report path) of the base: the published atlas, or under a published V62 atlas the base it was built on."""
    entry, report_path = published[sid], manifest[sid]['reportPath']
    if entry['atlas'].endswith(f'-{OUTPUT_TAG}.webp'):
        base = read_json(ROOT/report_path)['base']
        return {key: base[key] for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256')}, base['reportPath']
    return entry, report_path


def source_dir(report_path):
    """The cache directory of the source-render report (V59 or V44) beneath a base report."""
    path = ROOT/report_path
    report = read_json(path)
    while report.get('kind') in (ai.KIND, rd.KIND, KIND):
        path = ROOT/report['base']['reportPath']
        report = read_json(path)
    return path.parent


def cell_infos(base):
    """Per cell id: its kind, densities at 1x (anyFrame; firstPose when drawn there), published and V44 multipliers."""
    magnification = densities(base)
    v44 = v44_scales(base['sid'], base['meta'])
    infos = {}
    for item in base['cells']:
        key = uv_key(item['placement']['sourceUvBounds'])
        seen, cell = magnification[key], item['cell']
        kind = ('vector' if cell['mode'] == 'original-vector' and cell.get('selected') else 'ai' if item['ai']
                else 'redrawn' if cell['mode'] == rd.REDRAW_MODE else 'raster' if item['raster'] else 'fixed')
        floor = 1
        if kind == 'vector':
            floor = max(1, round(v44.get(key, item['native'].shape[1]*cell.get('defaultScale', item['scale']))/item['native'].shape[1]))
            if floor > item['scale']:
                raise ValueError(f'{base["sid"]}: cell {item["id"]} is published below its V44 multiplier')
        infos[item['id']] = {'kind': kind, 'anyFrame': float(seen['anyFrame']), 'base': item['scale'], 'v44': floor,
                             'firstPose': None if seen['firstPose'] is None else float(seen['firstPose'])}
    return infos


def deficit(info):
    return info['firstPose'] is not None and info['firstPose']*info['base'] < TARGET_DENSITY and info['kind'] != 'fixed'


def methods(item, info, gated, cell_class):
    """Methods that may raise a cell, in order of preference."""
    if info['kind'] == 'vector':
        return ['render']
    if info['kind'] == 'ai':
        return ['model']
    if info['kind'] == 'redrawn' or gated == sg.STROKE_CLASS:
        return ['redraw']
    small = ai.too_small(list(item['native'].shape[1::-1]))
    return (['model'] if not small else []) + (['redraw'] if cell_class != 'complex' else [])


def ladders(base, infos, classes):
    """Per pooled cell: its tier, method list and levels [(multiplier, method)] from the highest down to its floor."""
    pool = {}
    for item in base['cells']:
        cid, info = item['id'], infos[item['id']]
        cell_class, _, gated = classes.get(cid, (None, None, None))
        size = list(item['native'].shape[1::-1])
        if deficit(info):
            scales = VECTOR_SCALES if info['kind'] == 'vector' else ai.SCALES if info['kind'] == 'ai' else rda.SCALES
            top, chosen = rda.fitted(size, needed(info['firstPose'], scales)), methods(item, info, gated, cell_class)
            if top > info['base'] and chosen:
                pool[cid] = ('first-pose', chosen, [(s, 'raise') for s in halvings(top, info['base'])] + [(info['base'], 'base')])
        elif info['kind'] == 'raster' and info['anyFrame'] < TARGET_DENSITY and gated == sg.STROKE_CLASS:
            top = rda.fitted(size, needed(info['anyFrame'], rda.SCALES))
            if top > 1:
                pool[cid] = ('stroke', ['redraw'], [(s, 'raise') for s in halvings(top, 1)] + [(1, 'base')])
        elif info['firstPose'] is None and info['kind'] == 'vector' and info['base'] > info['v44']:
            pool[cid] = ('v59-raise', ['render'], [(info['base'], 'base')] + [(s, 'render') for s in halvings(info['base']//2, info['v44']-1)])
        elif info['firstPose'] is None and info['kind'] in ('ai', 'redrawn') and info['base'] > 1:
            reduce = 'ai-reduce' if info['kind'] == 'ai' else 'redraw-reduce'
            pool[cid] = ('ai-or-redraw', [reduce], [(info['base'], 'base')] + [(s, reduce) for s in halvings(info['base']//2, 1)] + [(1, 'native')])
    return pool


def halvings(top, floor):
    """top, top/2, ... while above `floor`."""
    scales = []
    while top > floor:
        scales.append(top)
        top //= 2
    return scales


def padded(item, scale):
    return (item['native'].shape[1]*scale+4)*(item['native'].shape[0]*scale+4)*4


def magnified(density):
    """Device pixels per texel beyond one at a density: how far a cell falls below the target."""
    return max(0.0, 1/density-1)


def step_value(item, info, tier, level, following):
    """Bytes saved per unit of visible loss when a cell moves from `level` to `following`."""
    density = info['firstPose'] if tier == 'first-pose' else info['anyFrame']
    saved = padded(item, level[0])-padded(item, following[0])
    loss = magnified(density*following[0])-magnified(density*level[0])
    return saved/max(loss, 1e-6)


def reduction_steps(base, infos, pool, soft, tier):
    """The order in which the cells of a tier move down one level: soft AI tiles and redraws first (AI-or-redraw tier),
    then the step with the most bytes saved per unit of visible loss."""
    by_id = {item['id']: item for item in base['cells']}
    members = sorted(cid for cid in pool if pool[cid][0] == tier)
    position, steps = dict.fromkeys(members, 0), []
    while True:
        movable = [cid for cid in members if position[cid] < len(pool[cid][2])-1]
        if not movable:
            return steps
        def key(cid):
            ladder = pool[cid][2]
            value = step_value(by_id[cid], infos[cid], tier, ladder[position[cid]], ladder[position[cid]+1])
            return (tier == 'ai-or-redraw' and cid in soft, value, cid)
        chosen = max(movable, key=key)
        position[chosen] += 1
        steps.append(chosen)


def plan_layout(base, infos, pool, soft, max_bytes):
    """(layout, position, steps) of the plan, in two passes. The first (fit) settles the first-pose cells: every
    other tier gives back before any of them moves down. The second fixes each first-pose cell at the level the first
    pass left it and fits again, so a give-back that could not lift a first-pose cell to a higher level is undone."""
    layout, position, steps = fit(base, infos, pool, soft, max_bytes)
    held = {cid: index for cid, index in position.items() if pool[cid][0] == 'first-pose' and index > 0}
    if not held:
        return layout, position, steps
    trimmed = {cid: (entry[0], entry[1], entry[2][held.get(cid, 0):]) for cid, entry in pool.items()}
    layout, position, steps = fit(base, infos, trimmed, soft, max_bytes)
    return layout, {cid: index+held.get(cid, 0) for cid, index in position.items()}, steps


def fit(base, infos, pool, soft, max_bytes):
    """(layout, position, steps): the fewest reduction steps that fit the budget (fewest_steps on the ladders), with
    the steps of a tier added only when the tiers before it cannot make the page fit."""
    levels = {cid: entry[2] for cid, entry in pool.items()}
    steps = []
    for tier in TIERS:
        steps += reduction_steps(base, infos, pool, soft, tier)
        try:
            layout, position = fewest_steps(base, levels, steps, max_bytes)
        except ValueError:
            if tier == TIERS[-1]:
                raise
            continue
        return layout, position, steps


def smallest_layout(rows, max_bytes):
    """The smallest page of the pipeline's MaxRects packer (both orders of build_battle_hd_atlases.pack_rows) over every
    canvas width in steps of 256, or pack_rows' own result when none of them fits; None when nothing fits."""
    pixels, min_width = max_bytes//4, max(r['width']+4 for r in rows)
    min_height = max(r['height']+4 for r in rows)
    widths = sorted({min_width, *range(-(-min_width//256)*256, 8193, 256)})
    best = None
    for order in [sorted(rows, key=lambda r: (-max(r['width'], r['height']), -r['width']*r['height'], r['id'])),
                  sorted(rows, key=lambda r: (-r['width']*r['height'], -max(r['width'], r['height']), r['id']))]:
        for width in widths:
            height = min(8192, pixels//width)
            if min_height > height:
                continue
            layout = _pack(order, width, height, 2)
            if layout and layout['rgbaBytes'] <= max_bytes and (best is None or layout['rgbaBytes'] < best['rgbaBytes']):
                best = layout
    if best:
        return {**best, 'packingStrategy': 'Smallest MaxRects page over canvas widths in steps of 256 (V62)'}
    try:
        return pack_rows(rows, max_bytes)
    except ValueError:
        return None


def fewest_steps(base, levels, steps, max_bytes):
    """The fewest reduction steps after which the smallest packing fits the page, and that layout: galloping, then
    bisection (as build_battle_hd_redraw_atlases.fewest_steps, with smallest_layout as the packer)."""
    def position_after(k):
        position = dict.fromkeys(levels, 0)
        for cid in steps[:k]:
            position[cid] = min(position[cid]+1, len(levels[cid])-1)
        return position
    def attempt(k):
        rows = rda.rows_for(base, levels, position_after(k))
        if sum((r['width']+4)*(r['height']+4) for r in rows) > max_bytes//4:
            return None
        return smallest_layout(rows, max_bytes)
    failed, k, stride = -1, 0, 1
    while (layout := attempt(k)) is None:
        if k == len(steps):
            raise ValueError('The cells do not fit the budget even after every step')
        failed, k, stride = k, min(k+stride, len(steps)), stride*2
    low, high = failed+1, k-1
    while low <= high:
        middle = (low+high)//2
        if (found := attempt(middle)) is None:
            low = middle+1
        else:
            k, layout, high = middle, found, middle-1
    return layout, position_after(k)


class Producer:
    """Tiles of pooled cells at a level, produced once and gated: vector renders (batched per plan), model outputs,
    redraws and reductions. A level that fails every method records its attempts and yields None."""

    def __init__(self, base, infos, pool, classes, review, work, model_cache):
        self.base, self.infos, self.pool, self.classes, self.review = base, infos, pool, classes, review
        self.work, self.model_cache = work, model_cache
        self.by_id = {item['id']: item for item in base['cells']}
        self.results, self.attempts, self.outputs, self.renders, self.full = {}, collections.defaultdict(list), {}, {}, {}

    def prefetch(self, chosen):
        """Render every original-vector level the plan chose that is not rendered yet, in one renderer run."""
        requests = sorted({(cid, level[0]) for cid, level in chosen.items() if (cid, level[0]) not in self.renders
                           and (level[1] == 'render' or (level[1] == 'raise' and self.infos[cid]['kind'] == 'vector'))})
        if requests:
            self.renders.update(render_vectors(self.base, requests, self.work/'source'))

    def produce(self, cid, level):
        """(image-orientation tile, record) of a cell at a level, or None when every method fails there."""
        key = (cid, level)
        if key not in self.results:
            self.results[key] = self._produce(cid, level)
        return self.results[key]

    def _produce(self, cid, level):
        item, (scale, kind) = self.by_id[cid], level
        if kind == 'base':
            return rda.flip(item['tile']), {'method': 'base'}
        if kind == 'native':
            return item['native'], {'method': 'native'}
        for method in (self.pool[cid][1] if kind == 'raise' else [kind]):
            tile, record = getattr(self, '_'+method.replace('-', '_'))(cid, item, scale)
            if tile is not None:
                return tile, record
            self.attempts[cid].append({'scale': scale, **{k: v for k, v in record.items() if k not in ('svg', 'layers')}})
        return None

    def _render(self, cid, item, scale):
        if (cid, scale) not in self.renders:
            self.prefetch({cid: (scale, 'render')})
        return self.renders[(cid, scale)], {'method': 'render', 'gate': None}

    def _model(self, cid, item, scale):
        if scale not in ai.SCALES:
            return None, {'method': 'model', 'reason': f'The V60 model has no {scale}x tile (its multipliers are {list(ai.SCALES)}).'}
        if cid not in self.outputs:
            self.outputs[cid] = ai.model_outputs({cid: item['native']}, {cid: scale}, self.model_cache)[cid]
        tile = ai.tile_at(self.outputs[cid], scale)
        metrics = ai.gate_metrics(item['native'], tile, scale)
        record = {'method': 'model', 'modelOutputs': self.outputs[cid]['names'], 'gate': gate_record('v60', metrics)}
        if item['ai'] and 'aiReduction' not in item['cell']:
            # The published V60 tile came from the same pinned model run on the same native pixels.
            record['modelReproducesBaseTile'] = bool(np.array_equal(ai.tile_at(self.outputs[cid], item['scale']), rda.flip(item['tile'])))
        return (tile if ai.gate_passes(metrics) else None), record

    def _redraw(self, cid, item, scale):
        cell_class, features, gated = self.classes[cid]
        verdict = self.review.get(cid, {})
        if gated == sg.STROKE_CLASS and verdict.get('verdict') == 'rejected':
            return None, {'method': 'redraw', 'class': cell_class, 'gateClass': gated, 'review': verdict}
        result = rd.redraw(item['native'], scale, self.work/'render'/cid)
        if result is None or result['tile'] is None:
            return None, {'method': 'redraw', 'class': cell_class, 'gateClass': gated, 'reason': 'Complex art, or nothing could be traced.'}
        metrics = ai.gate_metrics(item['native'], result['tile'], scale)
        record = {'method': 'redraw', 'class': result['class'], 'gateClass': gated, 'redrawMethod': result['method'],
                  'features': {**result['features'], 'strokeShare': features.get('strokeShare')}, 'svg': result.get('svg'),
                  'layers': result.get('layers'), 'redrawRgbaSha256': sha(result['tile'].tobytes()),
                  'gate': gate_record('stroke' if gated == sg.STROKE_CLASS else 'v60', metrics)}
        return (result['tile'] if sg.passes(metrics, gated) else None), record

    def _ai_reduce(self, cid, item, scale):
        tile = ai.reduce_premultiplied(rda.flip(item['tile']), item['scale']//scale)
        metrics = ai.gate_metrics(item['native'], tile, scale)
        return (tile if ai.gate_passes(metrics) else None), {'method': 'ai-reduce', 'gate': gate_record('v60', metrics)}

    def _redraw_reduce(self, cid, item, scale):
        requested = item['cell']['requestedScale']
        if cid not in self.full:
            self.full[cid] = rd.redraw(item['native'], requested, self.work/'render'/cid)['tile']
            if not np.array_equal(ai.reduce_premultiplied(self.full[cid], requested//item['scale']), rda.flip(item['tile'])):
                raise ValueError(f'{self.base["sid"]}: the V61 redraw of cell {cid} does not recompute to its published tile')
        tile = ai.reduce_premultiplied(self.full[cid], requested//scale)
        metrics = ai.gate_metrics(item['native'], tile, scale)
        gated = self.classes[cid][2]
        record = {'method': 'redraw-reduce', 'requestedScale': requested, 'gateClass': gated,
                  'gate': gate_record('stroke' if gated == sg.STROKE_CLASS else 'v60', metrics)}
        return (tile if sg.passes(metrics, gated) else None), record


def gate_record(name, metrics):
    """The gate a tile was held to (V60's or the stroke gate), its thresholds, its measurements and the outcome."""
    gate = sg.GATE if name == 'stroke' else ai.GATE
    return {'name': name, 'thresholds': {k: v for k, v in gate.items() if k != 'localColorCheck'}, 'metrics': metrics,
            'passed': ai.gate_passes(metrics, gate)}


def clone(source, target):
    """An APFS clone (cp -c) of a cache file."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        subprocess.run(['cp', '-c', str(source), str(target)], check=True)


def render_vectors(base, requests, work):
    """{(cid, scale): image-orientation tile} of original-vector cells rendered again from their selected SVGs."""
    source = source_dir(base['reportPath'])
    clone(source/'candidates.json', work/'candidates.json')
    manifest = read_json(work/'candidates.json')
    candidates = {c['key']: c for c in manifest['candidates']}
    by_id = {item['id']: item for item in base['cells']}
    cells = []
    for cid, scale in requests:
        selected = by_id[cid]['cell']['selected']
        if candidates[selected['key']]['candidateSvgSha256'] != selected['candidateSvgSha256']:
            raise ValueError(f'{base["sid"]}: the selected SVG of cell {cid} changed in its source cache')
        clone(source/'candidates'/f'{selected["key"]}.svg', work/'candidates'/f'{selected["key"]}.svg')
        cells.append({'id': cid, 'nativeSize': by_id[cid]['cell']['nativeSize'], 'mode': 'original-vector', 'scale': scale,
                      'selected': {'key': selected['key']}})
    selection = work/'selection.json'
    selection.write_text(json.dumps({'sourceSha256': manifest['sourceSha256'], 'species': int(base['sid']), 'cells': cells}))
    subprocess.run(['node', str(SHAPE_RENDERER), 'render', str(work), str(selection)], check=True, stdout=subprocess.DEVNULL, timeout=900)
    tiles = {}
    for cid, scale in requests:
        with Image.open(work/'rendered'/f'{cid}-{scale}x.png') as image:
            tiles[(cid, scale)] = np.asarray(image.convert('RGBA'))
        if tiles[(cid, scale)].shape[1::-1] != tuple(v*scale for v in by_id[cid]['cell']['nativeSize']):
            raise ValueError(f'{base["sid"]}: cell {cid} rendered at another size')
    shutil.rmtree(work/'rendered', ignore_errors=True)
    selection.unlink()
    return tiles


def settle(base, infos, pool, soft, producer, max_bytes):
    """Plan, produce the chosen levels, drop the levels that fail their gate, and plan again until every level holds.

    Returns the layout, the chosen level of every pooled cell, the reduction order and the number of steps applied."""
    while True:
        layout, position, steps = plan_layout(base, infos, pool, soft, max_bytes)
        chosen = {cid: pool[cid][2][index] for cid, index in position.items()}
        producer.prefetch(chosen)
        dropped = False
        for cid, level in chosen.items():
            if producer.produce(cid, level) is None:
                tier, chosen_methods, ladder = pool[cid]
                pool[cid] = (tier, chosen_methods, [entry for entry in ladder if entry != level])
                dropped = True
        if not dropped:
            return layout, chosen, steps, sum(position.values())


class Soft:
    """Soft cells (glow or tiny class), classified on first use: the AI-or-redraw tier order only needs the cells it
    reaches."""

    def __init__(self, base):
        self.by_id, self.known = {item['id']: item for item in base['cells']}, {}

    def __contains__(self, cid):
        if cid not in self.known:
            self.known[cid] = rd.classify(self.by_id[cid]['native'])[0] in rd.SOFT_CLASSES
        return self.known[cid]


def densities_at(info, scale):
    return {key: None if info[key] is None else round(info[key]*scale, 4) for key in ('firstPose', 'anyFrame')}


def shortfall(info, entry, level, attempts):
    """Why a first-pose cell stays below the target in the first pose, or None when it reaches it."""
    if info['firstPose']*level[0] >= TARGET_DENSITY:
        return None
    top = entry[2][0][0] if entry else info['base']
    if entry is None:
        return 'No method: complex art too small for the model, or no tile larger than the published one fits the tile limits.'
    if level[0] < top:
        return 'Decoded budget: every give-back allowed before the first pose was applied and the page still does not fit.'
    if any(a['scale'] > level[0] for a in attempts):
        return 'Every higher multiplier failed its gate or the visual review (attempts recorded).'
    return f'Capped at {top}x by the method or the tile limits.'


def first_pose_reasons(infos, pool, chosen, attempts):
    """Per first-pose cell below the target: its kind, first-pose density and why it stays there (no species output)."""
    return {cid: {'kind': info['kind'], 'firstPose': round(info['firstPose']*info['base'], 4),
                  'shortfall': shortfall(info, pool.get(cid), chosen.get(cid, (info['base'], 'base')), attempts.get(cid, []))}
            for cid, info in infos.items() if deficit(info)}


def priority_record(item, info, entry, level, record, attempts):
    """The plan's record of a pooled cell: tier, ladder, chosen level, densities before and after, gate, attempts."""
    tier, chosen_methods, ladder = entry
    result = {'tier': tier, 'methods': chosen_methods, 'ladder': [list(step) for step in ladder], 'level': list(level),
              'method': record['method'], 'baseScale': info['base'], 'v44Scale': info['v44'], 'scale': level[0],
              'referenceDensity': densities_at(info, 1), 'before': densities_at(info, info['base']),
              'after': densities_at(info, level[0]), 'gate': record.get('gate'), 'attempts': attempts}
    if tier == 'first-pose':
        result['firstPoseTargetReached'] = info['firstPose']*level[0] >= TARGET_DENSITY
        result['shortfall'] = shortfall(info, entry, level, attempts)
    return result


def apply_level(cell, item, info, level, record, svg_path):
    """Relabel a cell whose level changed: multiplier, mode and the method's own record (V60/V61 field names)."""
    scale, method = level[0], record['method']
    density = {'anyFrame': round(info['anyFrame'], 6), 'firstPose': None if info['firstPose'] is None else round(info['firstPose'], 6)}
    if method in ('model', 'redraw', 'native') and cell['mode'] in ('retained-original-cell', 'retained-native-microstrip'):
        cell.update(baseMode=cell['mode'], baseReason=cell.get('reason'))
    if method == 'model':
        if 'aiUpscale' in cell:
            cell['baseAiUpscale'] = cell['aiUpscale']
        cell.update(mode=ai.AI_MODE, requestedScale=scale, reason='AI super-resolution of the retained original raster at the multiplier '
                    'its first standby pose needs; its native-size reduction passed the V60 gate.',
                    aiUpscale={'referenceDensity': density, 'targetReached': (info['firstPose'] or info['anyFrame'])*scale >= TARGET_DENSITY,
                               'modelOutputs': record['modelOutputs'], 'gate': record['gate']['metrics']})
    elif method == 'redraw':
        if 'redraw' in cell:
            cell['baseRedraw'] = cell['redraw']
        cell.update(mode=rd.REDRAW_MODE, requestedScale=scale, baseScale=item['scale'],
                    reason=f'Local {record["class"]} redraw ({record["redrawMethod"]}); its native-size reduction passed the '
                           f'{record["gate"]["name"]} gate.',
                    redraw={'class': record['class'], 'gateClass': record['gateClass'], 'method': record['redrawMethod'],
                            'features': record['features'], 'inputRgbaSha256': sha(item['native'].tobytes()),
                            'baseTileRgbaSha256': sha(rda.flip(item['tile']).tobytes()), 'redrawRgbaSha256': record['redrawRgbaSha256'],
                            'svgPath': os.path.relpath(svg_path, ROOT) if record['svg'] else None,
                            'svgSha256': sha(record['svg'].encode()) if record['svg'] else None, 'layers': record['layers'],
                            'gate': record['gate']['metrics'], 'referenceDensity': density})
    elif method == 'ai-reduce':
        cell['aiReduction'] = {'from': item['scale'], 'to': scale, 'gate': record['gate']['metrics'],
                               'method': 'premultiplied box reduction of the base AI tile'}
    elif method == 'redraw-reduce':
        cell['redrawReduction'] = {'from': item['scale'], 'to': scale, 'requestedScale': record['requestedScale'],
                                   'gate': record['gate']['metrics'], 'gateClass': record['gateClass']}
    elif method == 'native':
        cell.update(baseMode=cell['mode'], mode='retained-original-cell',
                    reason='V62 gave this cell outside the first standby pose back to its original pixels for the first pose.')
    cell['scale'] = scale


def cell_records(base, infos, pool, chosen, producer, placed, work):
    """The base report cells with their V62 output; every pooled cell and every first-pose cell below the target
    carries its plan record."""
    records = []
    for item in base['cells']:
        cid, info = item['id'], infos[item['id']]
        cell = copy.deepcopy(item['cell'])
        cell.update(appearsInFirstStandbyPose=item['first'], outputPixels=list(placed[cid].shape[1::-1]),
                    outputRgbaSha256=sha(placed[cid].tobytes()))
        if cid in pool:
            _, record = producer.produce(cid, chosen[cid])
            cell['priority'] = priority_record(item, info, pool[cid], chosen[cid], record, producer.attempts.get(cid, []))
            if record['method'] != 'base':
                svg_path = work/'redraw'/f'{cid}.svg'
                if record.get('svg'):
                    svg_path.parent.mkdir(parents=True, exist_ok=True)
                    svg_path.write_text(record['svg'])
                apply_level(cell, item, info, chosen[cid], record, svg_path)
        elif deficit(info):
            cell['priority'] = {'tier': 'first-pose', 'methods': [], 'baseScale': info['base'], 'scale': info['base'],
                                'referenceDensity': densities_at(info, 1), 'before': densities_at(info, info['base']),
                                'after': densities_at(info, info['base']), 'firstPoseTargetReached': False,
                                'shortfall': shortfall(info, None, (info['base'], 'base'), [])}
        records.append(cell)
    return records


def summary(cells):
    """First-pose outcomes, give-backs and raises of the plan, from the cell records."""
    planned = [c for c in cells if 'priority' in c]
    def row(c):
        p = c['priority']
        return {'baseMode': c.get('baseMode', c['mode']), 'mode': c['mode'], 'tier': p['tier'],
                'from': p['baseScale'], 'to': p['scale'], 'before': p['before'], 'after': p['after'], 'method': p.get('method')}
    return {'firstPose': {c['id']: {**row(c), 'reached': c['priority']['firstPoseTargetReached'], 'shortfall': c['priority']['shortfall']}
                          for c in planned if c['priority']['tier'] == 'first-pose'},
            'givenBack': {c['id']: row(c) for c in planned if c['priority']['scale'] < c['priority']['baseScale']},
            'raised': {c['id']: row(c) for c in planned if c['priority']['scale'] > c['priority']['baseScale']},
            'strokeGateCells': [c['id'] for c in planned if (c['priority'].get('gate') or {}).get('name') == 'stroke'
                                and c['priority']['method'] in ('redraw', 'redraw-reduce')]}


def classify_targets(base, infos):
    """Gate classes (battle_hd_stroke_gate.classify) of retained rasters and redraws below the target in some frame."""
    classes = {}
    for item in base['cells']:
        info = infos[item['id']]
        if info['kind'] in ('raster', 'redrawn') and (info['anyFrame'] < TARGET_DENSITY or deficit(info) or info['base'] > 1):
            classes[item['id']] = sg.classify(item['native'])
    return classes


def build(sid, entry, report_path, args, review):
    started = time.monotonic()
    base = rda.load_base(sid, entry, report_path)
    if base['report']['layout']['rgbaBytes'] > STANDARD_BUDGET:
        raise ValueError(f'{sid}: the published atlas already uses an original-size budget exception')
    infos = cell_infos(base)
    classes = classify_targets(base, infos)
    pool = ladders(base, infos, classes)
    if not any(tier in ('first-pose', 'stroke') for tier, _, _ in pool.values()):
        raise ValueError(f'{sid}: nothing to raise (no first-pose cell below the target with a method, no thin-stroke cell): '
                         + json.dumps(first_pose_reasons(infos, pool, {}, {})))
    work = args.cache/'species'/sid
    shutil.rmtree(work/'redraw', ignore_errors=True)
    producer = Producer(base, infos, pool, classes, review.get(sid, {}), work, args.cache/'model'/sid)
    try:
        layout, chosen, steps, applied = settle(base, infos, pool, Soft(base), producer, STANDARD_BUDGET)
    finally:
        shutil.rmtree(work/'render', ignore_errors=True)
        shutil.rmtree(args.cache/'model'/sid, ignore_errors=True)
    if all(level[1] == 'base' for level in chosen.values()):
        raise ValueError(f'{sid}: no raise kept (gate, review or budget): '
                         + json.dumps(first_pose_reasons(infos, pool, chosen, producer.attempts)))
    tiles = {cid: (producer.produce(cid, level)[0], None) for cid, level in chosen.items()}
    canvas, placed = rda.compose(base, layout, tiles)
    verification = _verify(base['meta'], layout)
    verification['contentAndPaddingEveryRgbaPixelExact'] = True
    work.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_record(sid, report_path), work/'source.json')
    atlas_output, meta_output = write_outputs(sid, base, canvas, layout, args)
    cells = cell_records(base, infos, pool, chosen, producer, placed, work)
    report = species_report(sid, base, cells, layout, verification, args)
    report.update(plan={'tiers': list(TIERS), 'steps': steps, 'appliedSteps': applied,
                        'ladders': {cid: {'tier': entry[0], 'methods': entry[1], 'levels': [list(level) for level in entry[2]]}
                                    for cid, entry in sorted(pool.items(), key=lambda kv: int(kv[0]))}},
                  meta=f'/battle-animations/hd/{meta_output.name}', atlas=f'/battle-animations/hd/{atlas_output.name}',
                  atlasWidth=layout['width'], atlasHeight=layout['height'], metaSha256=sha(meta_output.read_bytes()),
                  atlasSha256=sha(atlas_output.read_bytes()), atlasFileBytes=atlas_output.stat().st_size,
                  sourceRecordSha256=sha((work/'source.json').read_bytes()), elapsedSeconds=round(time.monotonic()-started, 3))
    save(work/'report.json', report)
    return report


def write_outputs(sid, base, canvas, layout, args):
    """<id>-v62.webp and <id>-v62.json.gz in --output, linked into this checkout's HD directory when it is another one."""
    args.output.mkdir(parents=True, exist_ok=True)
    atlas_output, meta_output = args.output/f'{sid}-{OUTPUT_TAG}.webp', args.output/f'{sid}-{OUTPUT_TAG}.json.gz'
    Image.fromarray(canvas).save(atlas_output, format='WEBP', lossless=True, exact=True, method=0, quality=50)
    meta_output.write_bytes(gzip.compress(json.dumps(remap_clip(base['meta'], layout), separators=(',', ':')).encode(), mtime=0))
    local = ROOT/'public/battle-animations/hd'
    if args.output.resolve() != local.resolve():
        for output in (atlas_output, meta_output):
            if not (local/output.name).exists():
                (local/output.name).symlink_to(output)
    return atlas_output, meta_output


def species_report(sid, base, cells, layout, verification, args):
    entry, prior = base['entry'], base['report']
    first = [c for c in cells if c['appearsInFirstStandbyPose'] and c['mode'] != 'constant-original-rgba']
    return {'revision': REVISION, 'kind': KIND, 'species': int(sid), 'policy': policy(),
            'sourceSha256': prior.get('sourceSha256'), 'sourceMorphCharacters': prior.get('sourceMorphCharacters'),
            'sourceBitmapCharacters': prior.get('sourceBitmapCharacters'),
            'base': {key: entry[key] for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256')} | {
                'reportPath': base['reportPath'], 'reportSha256': base['reportSha256'], 'reportKind': prior.get('kind'),
                'rgbaBytes': prior['layout']['rgbaBytes']},
            'originalMetadataSha256': base['originalMetadataSha256'], 'originalAtlasSha256': base['originalAtlasSha256'],
            'redraw': rd.method(), 'upscaler': ai.method(), 'gates': {'v60': ai.GATE, 'stroke': sg.GATE},
            'review': {'path': os.path.relpath(REVIEW, ROOT), 'sha256': sha(REVIEW.read_bytes()) if REVIEW.exists() else None},
            'maxRgbaMiB': STANDARD_BUDGET//1024**2, 'counts': dict(collections.Counter(c['mode'] for c in cells)),
            'resolutionCounts': dict(collections.Counter(f'{c["mode"]}:{c["scale"]}x' for c in cells)),
            **summary(cells),
            'firstStandbyPoseFullyOriginalVector': prior.get('firstStandbyPoseFullyOriginalVector'),
            'firstStandbyPoseFullyAboveNative': bool(first) and all(c['scale'] > 1 for c in first),
            'nativeGateRescuedCells': prior.get('nativeGateRescuedCells', []),
            'publicationState': 'candidate-awaiting-reviewed-index', 'layout': layout, 'verification': verification, 'cells': cells}


def attempt(sid, entry, report_path, args, review):
    try:
        return sid, build(sid, entry, report_path, args, review), None
    except Exception as error:  # Recorded per species; the run continues.
        return sid, None, f'{type(error).__name__}: {error}'


def load_review():
    """{species: {cell: verdict}} of the visual review of thin-stroke redraws."""
    return read_json(REVIEW)['species'] if REVIEW.exists() else {}


def audit_ids(path):
    """Species with a first-pose cell below the target, or a retained raster below it in some frame (stroke candidates)."""
    audit = read_json(path)
    first = {sid for cause in ('vector-multiplier', 'retained-raster', 'ai-cell', 'redrawn-cell') for sid in audit['firstPose'][cause]['ids']}
    return sorted({str(sid) for sid in first | set(audit['anyFrame']['retained-raster']['ids'])}, key=int)


def write_provenance(args):
    """Compact tracked provenance of every published V62 species, bound to its cache report by digest."""
    published = read_json(HD_INDEX)['species']
    species, totals = {}, collections.Counter()
    for sid, entry in sorted(published.items(), key=lambda item: int(item[0])):
        if not entry['atlas'].endswith(f'-{OUTPUT_TAG}.webp'):
            continue
        path = args.cache/'species'/sid/'report.json'
        data = path.read_bytes()
        report = json.loads(data)
        if report['atlasSha256'] != entry['atlasSha256'] or report['metaSha256'] != entry['metaSha256']:
            raise ValueError(f'{sid}: published V62 entry differs from its report')
        cells = {c['id']: c for c in report['cells']}
        species[sid] = {'reportPath': os.path.relpath(path, ROOT), 'reportSha256': sha(data),
                        'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256')},
                        'firstPose': report['firstPose'], 'raised': report['raised'], 'givenBack': report['givenBack'],
                        'gates': {cid: {'tier': cells[cid]['priority']['tier'], 'method': cells[cid]['priority']['method'],
                                        'scale': cells[cid]['scale'], 'gate': cells[cid]['priority']['gate']}
                                  for cid in cells if (cells[cid].get('priority') or {}).get('gate')}}
        totals['species'] += 1
        totals['firstPoseCells'] += len(report['firstPose'])
        totals['firstPoseReached'] += sum(row['reached'] for row in report['firstPose'].values())
        totals['raisedCells'] += len(report['raised'])
        totals['givenBackCells'] += len(report['givenBack'])
        totals['strokeGateCells'] += len(report['strokeGateCells'])
    result = {'revision': REVISION, 'kind': KIND, 'policy': policy(), 'gates': {'v60': ai.GATE, 'stroke': sg.GATE},
              'strokeShareMinimum': sg.STROKE_SHARE_MINIMUM,
              'calibration': {'path': os.path.relpath(CALIBRATION, ROOT), 'sha256': sha(CALIBRATION.read_bytes())},
              'review': {'path': os.path.relpath(REVIEW, ROOT), 'sha256': sha(REVIEW.read_bytes())},
              'scope': 'Within the 128 MiB decoded budget, first standby pose cells reach one texel per device pixel at the reference '
                       'display before any other cell keeps a raise above its V44 multiplier; thin-stroke redraws are held to the '
                       'stroke gate and a visual review.',
              'totals': dict(totals), 'species': species}
    save(ROOT/'public/battle-animations/hd'/f'priority-provenance-{OUTPUT_TAG}.json', result)
    print(json.dumps(result['totals']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species')
    parser.add_argument('--audit', type=Path, help='Density audit: species with a first-pose cell or a retained raster below the target')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v62')
    parser.add_argument('--output', type=Path, default=ROOT/'public/battle-animations/hd')
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2))
    parser.add_argument('--provenance', action='store_true', help='Only write the tracked provenance of the published V62 species')
    args = parser.parse_args()
    # Not resolved: a worktree may link .cache, and report paths stay relative to this checkout.
    args.cache, args.output = args.cache.absolute(), args.output.absolute()
    if args.provenance:
        return write_provenance(args)
    ids = args.ids.split(',') if args.ids else audit_ids(args.audit)
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    species = {}
    for sid in sorted(set(ids), key=int):
        entry, report_path = base_of(sid, published, manifest)
        if 'layout' in read_json(ROOT/report_path):  # The reviewed 346 prototype report has another format.
            species[sid] = (entry, report_path)
    review = load_review()
    summary_path = args.cache/'atlas-manifest.json'
    record = read_json(summary_path) if summary_path.exists() else {'revision': REVISION, 'species': {}, 'failures': {}}
    def accept(sid, report, error):
        if error is None:
            record['species'][sid] = {key: report[key] for key in ('counts', 'resolutionCounts', 'firstPose', 'raised', 'givenBack',
                                      'strokeGateCells', 'meta', 'atlas', 'metaSha256', 'atlasSha256', 'elapsedSeconds')} | {
                                      'rgbaBytes': report['layout']['rgbaBytes']}
            record['failures'].pop(sid, None)
            print(json.dumps({'species': sid, 'raised': len(report['raised']), 'givenBack': len(report['givenBack']),
                              'stroke': len(report['strokeGateCells']), 'rgbaMiB': round(report['layout']['rgbaBytes']/1024**2, 2),
                              'seconds': report['elapsedSeconds']}), flush=True)
        else:
            record['failures'][sid] = {'error': error}
            record['species'].pop(sid, None)
            print(json.dumps({'species': sid, 'error': error}), flush=True)
        save(summary_path, record)
    if args.jobs == 1:
        for sid in species:
            accept(*attempt(sid, *species[sid], args, review))
        return
    with concurrent.futures.ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context('spawn')) as pool:
        futures = [pool.submit(attempt, sid, *species[sid], args, review) for sid in species]
        for future in concurrent.futures.as_completed(futures):
            accept(*future.result())


if __name__ == '__main__':
    main()
