#!/usr/bin/env python3
"""Compose V61 battle atlases: locally redrawn raster cells over the published HD atlases.

The base of a species is its published HD atlas (V60, V59, V44 or the species 910 composition) and the report that
produced it; the base metadata must equal the original metadata remapped by that report's layout. A cell is a target
when, at the reference display (audit_battle_hd_density.py), it is below one texel per device pixel and its published
tile is byte-identical to its original Unity crop (a retained raster). battle_hd_redraw.py redraws it from the native
pixels at the smallest multiplier of 2, 4, 8, 16 and 32 that reaches the target (32 when none does), within the tile
limits. A redraw is kept only if it passes its gate (battle_hd_redraw.GATE, V60's native gate); complex art (a
creature's many-coloured body) is not redrawn. V60 AI tiles are not redrawn: on known-good vector cells the model is
closer to the vector than the redraw at the same multiplier (calibrate_battle_hd_redraw.py).

Packing: every other cell keeps its published tile, except that soft V60 AI tiles (glow or tiny class, where a lower
multiplier loses no visible detail) and V61 redraws share the decoded budget that the other cells leave (128 MiB). Over
budget, one cell at a time moves down a level, first outside the first standby pose, soft cells first, the largest
first: a redraw halves by premultiplied box reduction (re-gated) and at 1x returns to the original pixels; a soft AI
tile halves the same way and at 1x returns to the original pixels. Metadata changes only in UVs and atlas size.
Outputs are <id>-v61.webp (lossless, RGB under zero alpha kept) and <id>-v61.json.gz; reports, redraw SVGs and the base
source record stay in the ignored cache. Nothing is published here.
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
import time

import numpy as np
from PIL import Image

from audit_battle_hd_density import RASTER_MODES, TARGET_DENSITY, reference_box_device_pixels, uv_key
from battle_hd_atlas_layout import remap_clip, _verify
import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd
from build_battle_hd_atlases import ROOT, TILE_PIXEL_LIMIT, native_cells, pack_rows, sha
from build_battle_hd_ai_atlases import (HD_INDEX, HD_MANIFEST, ORIGINAL_INDEX, STANDARD_BUDGET, densities, read_json, rgba_image,
                                        source_record)
from recover_battle_shapes import save

REVISION = 1
OUTPUT_TAG = 'v61'
SCALES = (2, 4, 8, 16, 32)
SOFT_CLASSES = ('glow', 'tiny')


def flip(array):
    return np.ascontiguousarray(array[::-1])


def load_base(sid, entry, report_path):
    """The published base of a species: report, proven layout, every tile (atlas orientation) and its native cell."""
    original = read_json(ORIGINAL_INDEX)['species'][sid]
    original_meta_bytes = (ROOT/'public'/original['meta'].lstrip('/')).read_bytes()
    original_atlas_bytes = (ROOT/'public'/original['atlas'].lstrip('/')).read_bytes()
    meta = json.loads(gzip.decompress(original_meta_bytes))
    base_meta_bytes = (ROOT/'public'/entry['meta'].lstrip('/')).read_bytes()
    base_atlas_bytes = (ROOT/'public'/entry['atlas'].lstrip('/')).read_bytes()
    if sha(base_meta_bytes) != entry['metaSha256'] or sha(base_atlas_bytes) != entry['atlasSha256']:
        raise ValueError(f'{sid}: published base files differ from the HD index')
    report_bytes = (ROOT/report_path).read_bytes()
    report = json.loads(report_bytes)
    layout = report['layout']
    if json.loads(gzip.decompress(base_meta_bytes)) != remap_clip(meta, layout):
        raise ValueError(f'{sid}: the base report layout does not produce the published metadata')
    atlas = np.asarray(rgba_image(base_atlas_bytes))
    if atlas.shape[1::-1] != (layout['width'], layout['height']):
        raise ValueError(f'{sid}: base atlas size differs from its layout')
    original_atlas = rgba_image(original_atlas_bytes)
    rows, images = native_cells(meta, original_atlas)
    natives = {uv_key(row['sourceUvBounds']): (row, np.asarray(images[row['id']])) for row in rows}
    cells = {c['id']: c for c in report['cells']}
    base = {'sid': sid, 'entry': entry, 'reportPath': str(report_path), 'reportSha256': sha(report_bytes), 'report': report,
            'meta': meta, 'originalAtlas': original_atlas, 'originalMetadataSha256': sha(original_meta_bytes),
            'originalAtlasSha256': sha(original_atlas_bytes), 'cells': []}
    for placement in layout['placements']:
        row, native = natives[uv_key(placement['sourceUvBounds'])]
        x, y, w, h = placement['x'], placement['y'], placement['width'], placement['height']
        cell, tile = cells[placement['id']], atlas[y:y+h, x:x+w]
        raster = list(native.shape[1::-1]) == [w, h] and np.array_equal(tile, flip(native))
        if cell['mode'] in RASTER_MODES and not raster:
            raise ValueError(f'{sid}: cell {placement["id"]} mode {cell["mode"]} disagrees with its published pixels')
        base['cells'].append({'id': placement['id'], 'placement': placement, 'row': row, 'native': native, 'tile': tile,
                              'cell': cell, 'raster': raster and cell['mode'] in RASTER_MODES, 'ai': cell['mode'] == ai.AI_MODE,
                              'scale': w//native.shape[1], 'first': row['appearsInFirstStandbyPose']})
    return base


def fitted(size, scale):
    while scale > 1 and (max(size)*scale+4 > 8192 or size[0]*size[1]*scale*scale > TILE_PIXEL_LIMIT):
        scale //= 2
    return scale


def targets(base, scope):
    """Retained raster cells below the target: [(item, density record, requested multiplier)]."""
    magnification = densities(base)
    result = []
    for item in base['cells']:
        seen = magnification.get(uv_key(item['placement']['sourceUvBounds']))
        if not item['raster'] or seen is None or seen['anyFrame'] >= TARGET_DENSITY:
            continue
        first = bool(seen['firstPose'] is not None and seen['firstPose'] < TARGET_DENSITY)
        if scope == 'first-pose' and not first:
            continue
        size = list(item['native'].shape[1::-1])
        requested = fitted(size, next((m for m in SCALES if seen['anyFrame']*m >= TARGET_DENSITY), SCALES[-1]))
        if requested > 1:
            density = {'anyFrame': round(float(seen['anyFrame']), 6), 'firstPose': None if seen['firstPose'] is None
                       else round(float(seen['firstPose']), 6), 'firstPoseBelowTarget': first}
            result.append((item, density, requested))
    return result


def planned_scales(base, candidates, max_bytes):
    """The multiplier each target can have within the budget if every redraw passed, so a cell is redrawn once at the
    size it can keep (1: no room). Packed as the final atlas is: soft cells and cells outside the first pose give way."""
    plan = {item['id']: {'requested': requested, 'class': cell_class} for item, _, requested, cell_class in candidates}
    soft = soft_cells(base, plan)
    pool = ladders(base, plan, soft)
    _, position = fewest_steps(base, pool, reduction_steps(base, pool, soft), dict.fromkeys(pool, 0), max_bytes)
    return {cid: pool[cid][position[cid]][0] if pool[cid][position[cid]][1] == 'redrawn' else 1 for cid in plan}


def redraw_cells(base, scope, work, max_bytes):
    """Redraw every target at its planned multiplier: (accepted {id: record}, rejected {id: record}, skipped {id: record})."""
    accepted, rejected, skipped = {}, {}, {}
    candidates, complex_cells = [], []
    for item, density, requested in targets(base, scope):
        cell_class, features, _ = rd.classify(item['native'])
        (complex_cells if cell_class == 'complex' else candidates).append((item, density, requested, cell_class, features))
    for item, density, requested, cell_class, features in complex_cells:
        skipped[item['id']] = {'item': item, 'density': density, 'requested': requested, 'class': cell_class, 'features': features,
                               'reason': 'Complex many-coloured art: no local redraw; the published tile is kept.'}
    plan = planned_scales(base, [row[:4] for row in candidates], max_bytes) if candidates else {}
    for item, density, needed, cell_class, features in candidates:
        requested = plan[item['id']]
        record = {'item': item, 'density': density, 'needed': needed, 'requested': requested, 'class': cell_class, 'features': features}
        if requested < 2:
            skipped[item['id']] = {**record, 'reason': 'The decoded budget left no room above the base multiplier.'}
            continue
        result = rd.redraw(item['native'], requested, work/item['id'])
        record.update(features=result['features'] if result else features)
        if result is None or result['tile'] is None:
            skipped[item['id']] = {**record, 'reason': 'Nothing could be traced; the published tile is kept.'}
            continue
        metrics = ai.gate_metrics(item['native'], result['tile'], requested)
        record.update(full=result['tile'], tile=result['tile'], gate=metrics, method=result['method'], svg=result.get('svg'),
                      layers=result.get('layers'))
        (accepted if rd.gate_passes(metrics, result['class']) else rejected)[item['id']] = record
    return accepted, rejected, skipped


def ladders(base, accepted, soft):
    """Per pooled cell, its levels from the highest: [(multiplier, kind)], kind 'redrawn', 'ai' (the base AI tile or its
    box reduction), 'native' (an AI cell back to its original pixels) or 'base' (a raster target back to its base).

    Only a soft AI cell (glow or tiny class: a lower multiplier loses no visible detail) gives up budget below its
    published multiplier; every other AI tile, and every source cell, keeps its published size."""
    pool = {}
    for item in base['cells']:
        steps = []
        if item['id'] in accepted:
            scale = accepted[item['id']]['requested']
            while scale > item['scale']:
                steps.append((scale, 'redrawn'))
                scale //= 2
        if item['ai'] and item['id'] in soft:
            scale = item['scale']
            while scale > 1:
                steps.append((scale, 'ai'))
                scale //= 2
            steps.append((1, 'native'))
        elif steps:
            steps.append((item['scale'], 'base'))
        if steps:
            pool[item['id']] = steps
    return pool


def soft_cells(base, accepted):
    """Cells whose content is soft (glow or tiny class): a lower multiplier costs them least."""
    soft = {cid for cid, record in accepted.items() if record['class'] in rd.SOFT_CLASSES}
    for item in base['cells']:
        if item['ai'] and item['id'] not in accepted and rd.classify(item['native'])[0] in rd.SOFT_CLASSES:
            soft.add(item['id'])
    return soft


def reduction_steps(base, pool, soft):
    """The order in which pooled cells move down one level: outside the first standby pose first, soft cells first,
    then the largest tile."""
    by_id = {item['id']: item for item in base['cells']}
    position = dict.fromkeys(pool, 0)
    steps = []
    while True:
        movable = [cid for cid in pool if position[cid] < len(pool[cid])-1]
        if not movable:
            return steps
        def key(cid):
            native = by_id[cid]['native']
            return (not by_id[cid]['first'], cid in soft, native.shape[0]*native.shape[1]*pool[cid][position[cid]][0]**2, cid)
        chosen = max(movable, key=key)
        position[chosen] += 1
        steps.append(chosen)


def rows_for(base, pool, position):
    rows = []
    for item in base['cells']:
        scale = pool[item['id']][position[item['id']]][0] if item['id'] in pool else None
        width, height = ((item['native'].shape[1]*scale, item['native'].shape[0]*scale) if scale
                         else (item['placement']['width'], item['placement']['height']))
        rows.append({'id': item['id'], 'sourceUvBounds': item['placement']['sourceUvBounds'], 'width': width, 'height': height})
    return rows


def fewest_steps(base, pool, steps, start, max_bytes):
    """The fewest reduction steps (from the positions `start`) after which pack_rows fits the page, and its layout:
    galloping, then bisection, so a full atlas needs a few packings instead of one per step."""
    def position_after(k):
        position = dict(start)
        for cid in steps[:k]:
            position[cid] = min(position[cid]+1, len(pool[cid])-1)
        return position
    def attempt(k):
        rows = rows_for(base, pool, position_after(k))
        if sum((r['width']+4)*(r['height']+4) for r in rows) > max_bytes//4:
            return None
        try:
            return pack_rows(rows, max_bytes)
        except ValueError:
            return None
    failed, k, stride = -1, 0, 1
    while (layout := attempt(k)) is None:
        if k == len(steps):
            raise ValueError('The published source cells alone do not fit the budget')
        failed, k, stride = k, min(k+stride, len(steps)), stride*2
    low, high = failed+1, k-1
    while low <= high:
        middle = (low+high)//2
        if (found := attempt(middle)) is None:
            low = middle+1
        else:
            k, layout, high = middle, found, middle-1
    return layout, position_after(k)


def level_tile(item, record, level):
    """(image-orientation tile, gate metrics or None) of a pooled cell at a level."""
    scale, kind = level
    if kind == 'redrawn':
        tile = ai.reduce_premultiplied(record['full'], record['requested']//scale)
        return tile, ai.gate_metrics(item['native'], tile, scale)
    if kind == 'ai':
        tile = flip(item['tile'])
        if scale == item['scale']:
            return tile, None
        tile = ai.reduce_premultiplied(tile, item['scale']//scale)
        return tile, ai.gate_metrics(item['native'], tile, scale)
    return (flip(item['tile']) if kind == 'base' else item['native']), None


def passes(record, level, metrics):
    if metrics is None:
        return True
    return rd.gate_passes(metrics, record['class']) if level[1] == 'redrawn' else ai.gate_passes(metrics)


def pack(base, accepted, max_bytes):
    """Layout, the level of every pooled cell, and its tile and gate; a reduced tile that fails its gate moves down."""
    soft = soft_cells(base, accepted)
    pool = ladders(base, accepted, soft)
    steps = reduction_steps(base, pool, soft)
    by_id = {item['id']: item for item in base['cells']}
    start = dict.fromkeys(pool, 0)
    while True:
        layout, position = fewest_steps(base, pool, steps, start, max_bytes)
        tiles, failed = {}, False
        for cid, index in position.items():
            tile, metrics = level_tile(by_id[cid], accepted.get(cid), pool[cid][index])
            if not passes(accepted.get(cid), pool[cid][index], metrics):
                start[cid], failed = max(start[cid], index+1), True
            tiles[cid] = (tile, metrics)
        if not failed:
            return layout, {cid: pool[cid][index] for cid, index in position.items()}, tiles


def compose(base, layout, tiles):
    """The atlas page (atlas orientation): pooled cells at their level, every other cell its published tile, edge-extruded."""
    canvas = np.zeros((layout['height'], layout['width'], 4), dtype=np.uint8)
    by_id = {item['id']: item for item in base['cells']}
    placed = {}
    for placement in layout['placements']:
        cid = placement['id']
        tile = flip(tiles[cid][0]) if cid in tiles else by_id[cid]['tile']
        if tile.shape[:2] != (placement['height'], placement['width']):
            raise ValueError(f'Cell {cid} does not match its placement')
        x, y = placement['x'], placement['y']
        canvas[y-2:y+placement['height']+2, x-2:x+placement['width']+2] = np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge')
        placed[cid] = tile
    for placement in layout['placements']:
        x, y, w, h = placement['x']-2, placement['y']-2, placement['width']+4, placement['height']+4
        if not np.array_equal(canvas[y:y+h, x:x+w], np.pad(placed[placement['id']], ((2, 2), (2, 2), (0, 0)), mode='edge')):
            raise ValueError('Content or RGBA edge extrusion was changed during composition')
    return canvas, placed


def cell_records(base, accepted, rejected, skipped, levels, tiles, placed, work):
    """The base report cells with their V61 output: redrawn and reduced cells relabelled, every decision recorded."""
    records = []
    for item in base['cells']:
        cid, cell = item['id'], copy.deepcopy(item['cell'])
        output = placed[cid]
        cell.update(appearsInFirstStandbyPose=item['first'], outputPixels=list(output.shape[1::-1]),
                    outputRgbaSha256=sha(output.tobytes()))
        level = levels.get(cid)
        record = accepted.get(cid) or rejected.get(cid) or skipped.get(cid)
        if level and level[1] == 'redrawn':
            cell.update(baseMode=cell['mode'], baseReason=cell.get('reason'), baseScale=item['scale'], mode=rd.REDRAW_MODE,
                        scale=level[0], requestedScale=record['requested'],
                        reason=f'Local {record["class"]} redraw ({record["method"]}) of the published raster; its native-size reduction passed the gate.',
                        redraw=redraw_provenance(item, record, level[0], tiles[cid][1], work))
        elif level and level[1] in ('ai', 'native') and level[0] != item['scale']:
            cell.update(scale=level[0], aiReduction={'from': item['scale'], 'to': level[0], 'gate': tiles[cid][1],
                                                     'method': 'premultiplied box reduction of the base AI tile'
                                                     if level[1] == 'ai' else 'original pixels'})
            if level[1] == 'native':
                cell.update(baseMode=cell['mode'], mode='retained-original-cell',
                            reason='The V61 decoded budget left no room above 1x for this AI cell; original pixels kept.')
        if record and not (level and level[1] == 'redrawn'):
            cell['redrawNotUsed'] = {'class': record['class'], 'requestedScale': record['requested'],
                                     'referenceDensity': record['density'], 'gate': record.get('gate'),
                                     'reason': record.get('reason') or ('Failed its native gate; the published tile is kept.'
                                                                        if cid in rejected else 'The decoded budget left no room above the base multiplier.')}
        records.append(cell)
    return records


def redraw_provenance(item, record, scale, metrics, work):
    """Per redrawn cell: class, method, tool and versions, input/output digests, the SVG, the gate and the density."""
    svg_path = None
    if record['svg']:
        svg_path = work/'redraw'/f'{item["id"]}.svg'
        svg_path.parent.mkdir(parents=True, exist_ok=True)
        svg_path.write_text(record['svg'])
    return {'class': record['class'], 'method': record['method'], 'features': record['features'],
            'neededScale': record['needed'], 'inputRgbaSha256': sha(item['native'].tobytes()),
            'baseTileRgbaSha256': sha(flip(item['tile']).tobytes()),
            'redrawRgbaSha256': sha(record['full'].tobytes()), 'reducedFrom': record['requested'] if scale < record['requested'] else None,
            'svgPath': os.path.relpath(svg_path, ROOT) if svg_path else None,
            'svgSha256': sha(svg_path.read_bytes()) if svg_path else None, 'layers': record['layers'],
            'gate': metrics, 'referenceDensity': record['density'],
            'targetReached': record['density']['anyFrame']*scale >= TARGET_DENSITY}


def build(sid, entry, report_path, args):
    started = time.monotonic()
    base = load_base(sid, entry, report_path)
    if base['report']['layout']['rgbaBytes'] > args.max_rgba_mib*1024**2:
        raise ValueError(f'{sid}: the published atlas already uses an original-size budget exception')
    work = args.cache/'species'/sid
    shutil.rmtree(work/'redraw', ignore_errors=True)
    accepted, rejected, skipped = redraw_cells(base, args.scope, work/'render', args.max_rgba_mib*1024**2)
    shutil.rmtree(work/'render', ignore_errors=True)
    if not accepted:
        raise ValueError(f'{sid}: no redraw passed its gate' + (f' ({len(rejected)} rejected, {len(skipped)} skipped)'))
    layout, levels, tiles = pack(base, accepted, args.max_rgba_mib*1024**2)
    if not any(kind == 'redrawn' for _, kind in levels.values()):
        raise ValueError(f'{sid}: no redraw fits the decoded budget above its base multiplier')
    canvas, placed = compose(base, layout, tiles)
    verification = _verify(base['meta'], layout)
    verification['contentAndPaddingEveryRgbaPixelExact'] = True
    work.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_record(sid, report_path), work/'source.json')
    args.output.mkdir(parents=True, exist_ok=True)
    atlas_output, meta_output = args.output/f'{sid}-{OUTPUT_TAG}.webp', args.output/f'{sid}-{OUTPUT_TAG}.json.gz'
    Image.fromarray(canvas).save(atlas_output, format='WEBP', lossless=True, exact=True, method=0, quality=50)
    meta_output.write_bytes(gzip.compress(json.dumps(remap_clip(base['meta'], layout), separators=(',', ':')).encode(), mtime=0))
    cells = cell_records(base, accepted, rejected, skipped, levels, tiles, placed, work)
    report = species_report(sid, base, cells, layout, verification, args)
    report.update(meta=f'/battle-animations/hd/{meta_output.name}', atlas=f'/battle-animations/hd/{atlas_output.name}',
                  atlasWidth=layout['width'], atlasHeight=layout['height'], metaSha256=sha(meta_output.read_bytes()),
                  atlasSha256=sha(atlas_output.read_bytes()), atlasFileBytes=atlas_output.stat().st_size,
                  sourceRecordSha256=sha((work/'source.json').read_bytes()), elapsedSeconds=round(time.monotonic()-started, 3))
    save(work/'report.json', report)
    return report


def species_report(sid, base, cells, layout, verification, args):
    entry, prior = base['entry'], base['report']
    first = [c for c in cells if c['appearsInFirstStandbyPose'] and c['mode'] != 'constant-original-rgba']
    redrawn = [c for c in cells if c['mode'] == rd.REDRAW_MODE]
    return {'revision': REVISION, 'kind': rd.KIND, 'species': int(sid), 'scope': args.scope,
            'sourceSha256': prior.get('sourceSha256'), 'sourceMorphCharacters': prior.get('sourceMorphCharacters'),
            'sourceBitmapCharacters': prior.get('sourceBitmapCharacters'),
            'base': {key: entry[key] for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256')} | {
                'reportPath': base['reportPath'], 'reportSha256': base['reportSha256'], 'reportKind': prior.get('kind'),
                'rgbaBytes': prior['layout']['rgbaBytes']},
            'originalMetadataSha256': base['originalMetadataSha256'], 'originalAtlasSha256': base['originalAtlasSha256'],
            'redraw': rd.method(), 'gate': rd.GATE, 'aiGate': ai.GATE, 'maxRgbaMiB': args.max_rgba_mib,
            'densityPolicy': {'referenceBoxDevicePixels': reference_box_device_pixels(), 'targetTexelsPerDevicePixel': TARGET_DENSITY,
                              'scales': list(SCALES)},
            'counts': dict(collections.Counter(c['mode'] for c in cells)),
            'resolutionCounts': dict(collections.Counter(f'{c["mode"]}:{c["scale"]}x' for c in cells)),
            'redrawnCellIds': [c['id'] for c in redrawn],
            'redrawClasses': dict(collections.Counter(c['redraw']['class'] for c in redrawn)),
            'redrawNotUsedCellIds': [c['id'] for c in cells if 'redrawNotUsed' in c],
            'aiReducedCellIds': [c['id'] for c in cells if 'aiReduction' in c],
            'firstStandbyPoseFullyOriginalVector': prior.get('firstStandbyPoseFullyOriginalVector'),
            'firstStandbyPoseFullyAboveNative': bool(first) and all(c['scale'] > 1 for c in first),
            'nativeGateRescuedCells': prior.get('nativeGateRescuedCells', []),
            'publicationState': 'candidate-awaiting-reviewed-index', 'layout': layout, 'verification': verification, 'cells': cells}


def attempt(sid, entry, report_path, args):
    try:
        return sid, build(sid, entry, report_path, args), None
    except Exception as error:  # Recorded per species; the run continues.
        return sid, None, f'{type(error).__name__}: {error}'


def base_species(ids, published, manifest, args):
    """Species with a readable base report (the reviewed 346 prototype has another format) inside the standard budget."""
    result = {}
    for sid in ids:
        report_path = manifest[sid]['reportPath']
        report = read_json(ROOT/report_path)
        if 'layout' not in report or report.get('atlas') not in (None, published[sid]['atlas']):
            continue
        if report['layout']['rgbaBytes'] > args.max_rgba_mib*1024**2:
            continue
        result[sid] = (published[sid], report_path)
    return result


def reusable_report(sid, entry, report_path, args):
    """An existing report of this revision, scope, method and gate from the same base, whose outputs still match."""
    path = args.cache/'species'/sid/'report.json'
    if not path.exists():
        return None
    report = read_json(path)
    base = report.get('base', {})
    if (report.get('revision') != REVISION or report.get('scope') != args.scope or report.get('redraw') != rd.method()
            or report.get('gate') != rd.GATE or base.get('atlasSha256') != entry['atlasSha256']
            or base.get('reportSha256') != sha((ROOT/report_path).read_bytes())):
        return None
    for key in ('meta', 'atlas'):
        output = args.output/Path(report[key]).name
        if not output.exists() or sha(output.read_bytes()) != report[key+'Sha256']:
            return None
    return report


def write_provenance(args):
    """Compact tracked provenance of every published V61 species, bound to its cache report by digest."""
    published = read_json(HD_INDEX)['species']
    calibration = ROOT/'artifacts/battle-hd-redraw-v61/calibration.json'
    species, totals = {}, collections.Counter()
    for sid, entry in sorted(published.items(), key=lambda item: int(item[0])):
        if not entry['atlas'].endswith(f'-{OUTPUT_TAG}.webp'):
            continue
        path = args.cache/'species'/sid/'report.json'
        data = path.read_bytes()
        report = json.loads(data)
        if report['atlasSha256'] != entry['atlasSha256'] or report['metaSha256'] != entry['metaSha256']:
            raise ValueError(f'{sid}: published V61 entry differs from its report')
        cells = {c['id']: c for c in report['cells']}
        redrawn = {cid: {'class': cells[cid]['redraw']['class'], 'scale': cells[cid]['scale'], 'method': cells[cid]['redraw']['method'],
                         'firstPose': cells[cid]['appearsInFirstStandbyPose'], 'svgSha256': cells[cid]['redraw']['svgSha256'],
                         'outputRgbaSha256': cells[cid]['outputRgbaSha256']} for cid in report['redrawnCellIds']}
        species[sid] = {'reportPath': os.path.relpath(path, ROOT), 'reportSha256': sha(data),
                        'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256')}, 'redrawnCells': redrawn,
                        'notUsedCells': {cid: cells[cid]['redrawNotUsed']['reason'] for cid in report['redrawNotUsedCellIds']},
                        'aiReducedCells': {cid: cells[cid]['aiReduction'] for cid in report['aiReducedCellIds']}}
        totals['species'] += 1
        totals['redrawnCells'] += len(redrawn)
        totals['firstPoseRedrawnCells'] += sum(r['firstPose'] for r in redrawn.values())
        totals['aiReducedCells'] += len(report['aiReducedCellIds'])
        totals.update(f'{r["class"]}' for r in redrawn.values())
    result = {'revision': REVISION, 'kind': rd.KIND, 'mode': rd.REDRAW_MODE, 'method': rd.method(), 'gate': rd.GATE,
              'calibration': {'path': os.path.relpath(calibration, ROOT), 'sha256': sha(calibration.read_bytes())},
              'scope': 'Retained original raster cells below one texel per device pixel at the reference display, redrawn '
                       'locally from their native pixels; no model, no network.',
              'totals': dict(totals), 'species': species}
    save(ROOT/'public/battle-animations/hd'/f'redraw-provenance-{OUTPUT_TAG}.json', result)
    print(json.dumps(result['totals']))


def audit_ids(path, scope):
    audit = read_json(path)
    return [str(sid) for sid in audit['firstPose' if scope == 'first-pose' else 'anyFrame']['retained-raster']['ids']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species')
    parser.add_argument('--audit', type=Path, help='Density audit whose retained-raster species of the scope to build')
    parser.add_argument('--scope', choices=('first-pose', 'all'), default='all',
                        help='Cells to redraw: below the target in the first standby pose, or in any frame')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v61')
    parser.add_argument('--output', type=Path, default=ROOT/'public/battle-animations/hd')
    parser.add_argument('--max-rgba-mib', type=int, default=STANDARD_BUDGET//1024**2)
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2))
    parser.add_argument('--provenance', action='store_true', help='Only write the tracked provenance of the published V61 species')
    parser.add_argument('--resume', action='store_true', help='Keep species whose report and outputs are still current')
    args = parser.parse_args()
    # Not resolved: a worktree may link .cache, and report paths stay relative to this checkout.
    args.cache, args.output = args.cache.absolute(), args.output.absolute()
    if args.provenance:
        return write_provenance(args)
    ids = args.ids.split(',') if args.ids else audit_ids(args.audit, args.scope)
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    species = base_species(sorted(set(ids), key=int), published, manifest, args)
    summary_path = args.cache/'atlas-manifest.json'
    summary = read_json(summary_path) if summary_path.exists() else {'revision': REVISION, 'species': {}, 'failures': {}}
    def accept(sid, report, error):
        if error is None:
            summary['species'][sid] = {key: report[key] for key in ('counts', 'resolutionCounts', 'redrawnCellIds', 'redrawClasses',
                                       'redrawNotUsedCellIds', 'aiReducedCellIds', 'meta', 'atlas', 'metaSha256', 'atlasSha256',
                                       'scope', 'elapsedSeconds')} | {'rgbaBytes': report['layout']['rgbaBytes']}
            summary['failures'].pop(sid, None)
            print(json.dumps({'species': sid, 'redrawn': len(report['redrawnCellIds']), 'classes': report['redrawClasses'],
                              'notUsed': len(report['redrawNotUsedCellIds']), 'aiReduced': len(report['aiReducedCellIds']),
                              'rgbaMiB': round(report['layout']['rgbaBytes']/1024**2, 2), 'seconds': report['elapsedSeconds']}), flush=True)
        else:
            summary['failures'][sid] = {'error': error}
            summary['species'].pop(sid, None)
            print(json.dumps({'species': sid, 'error': error}), flush=True)
        save(summary_path, summary)
    for sid in [sid for sid in species if args.resume and reusable_report(sid, *species[sid], args)]:
        accept(sid, reusable_report(sid, *species.pop(sid), args), None)
    if args.jobs == 1:
        for sid in species:
            accept(*attempt(sid, *species[sid], args))
        return
    with concurrent.futures.ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context('spawn')) as pool:
        futures = [pool.submit(attempt, sid, *species[sid], args) for sid in species]
        for future in concurrent.futures.as_completed(futures):
            accept(*future.result())


if __name__ == '__main__':
    main()
