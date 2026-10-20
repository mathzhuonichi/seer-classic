#!/usr/bin/env python3
"""Compose V60 battle atlases: AI-upscaled retained raster cells over the published HD atlases.

The base of a species is its published HD atlas (V59, V44, or the species 910 composition) with the report that
produced it; the base metadata must equal the original metadata remapped by the report's layout. A cell is eligible
only when its published tile is byte-identical to its original Unity crop (a retained original raster) and it is
below one texel per device pixel at the reference display (audit_battle_hd_density.py). It is upscaled to the
smallest of 2x, 4x and 8x that reaches the target (8x when none does), and kept only if its tile passes the native
gate of battle_hd_ai_upscale.py; otherwise, and for cells of a few pixels, the original pixels stay.

Every other cell keeps its published pixels and multiplier. AI cells use only the decoded budget the source cells
leave: over budget, the largest AI cell outside the first standby pose halves first, then first-pose cells; at 1x a
cell returns to its original pixels. Metadata changes only in UVs and atlas size. Outputs are <id>-v60.webp
(lossless WebP that keeps the RGB under zero alpha) and <id>-v60.json.gz; reports stay in the ignored cache. The
atlas itself holds each accepted AI tile (the publisher recomputes its gate from there). Species run in batches: one
model run per batch, then the atlases, then the batch's model outputs are deleted, so the cache does not grow with the
catalog. Nothing is published here.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import copy
import gzip
import io
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import time

import numpy as np
from PIL import Image, ImageOps

from audit_battle_hd_density import (DEFAULT_PHYSICAL_SCALE, RASTER_MODES, TARGET_DENSITY, original_magnification,
                                     physical_scales, reference_box_device_pixels, uv_key)
from battle_hd_atlas_layout import remap_clip, _verify
import battle_hd_ai_upscale as ai
from build_battle_hd_atlases import ROOT, VECTOR_MODES, fitted, native_cells, pack_rows, sha
from battle_hd_ai_upscale import AI_MODE, KIND
from recover_battle_shapes import save

REVISION = 1
OUTPUT_TAG = 'v60'
STANDARD_BUDGET = 128*1024**2
HD_INDEX = ROOT/'public/battle-animations/hd/runtime-index.json'
HD_MANIFEST = ROOT/'public/battle-animations/hd/manifest.json'
ORIGINAL_INDEX = ROOT/'public/battle-animations/runtime-index.json'


def read_json(path):
    return json.loads(Path(path).read_text())


def rgba_image(data):
    with Image.open(io.BytesIO(data)) as image:
        return image.convert('RGBA')


def load_base(sid, entry, report_path, verify_pixels=True):
    """The published base of a species: its report, proven layout, tiles, and the original clip and native cells.

    Without `verify_pixels` (model preparation only) the base atlas is not decoded and a cell counts as raster by its
    report mode and native size; the build always verifies the published pixels.
    """
    original = read_json(ORIGINAL_INDEX)['species'][sid]
    original_meta_bytes = (ROOT/'public'/original['meta'].lstrip('/')).read_bytes()
    original_atlas_bytes = (ROOT/'public'/original['atlas'].lstrip('/')).read_bytes()
    meta = json.loads(gzip.decompress(original_meta_bytes))
    original_atlas = rgba_image(original_atlas_bytes)
    base_meta_bytes = (ROOT/'public'/entry['meta'].lstrip('/')).read_bytes()
    base_atlas_bytes = (ROOT/'public'/entry['atlas'].lstrip('/')).read_bytes()
    if sha(base_meta_bytes) != entry['metaSha256'] or sha(base_atlas_bytes) != entry['atlasSha256']:
        raise ValueError(f'{sid}: published base files differ from the HD index')
    report_bytes = (ROOT/report_path).read_bytes()
    report = json.loads(report_bytes)
    layout = report['layout']
    if json.loads(gzip.decompress(base_meta_bytes)) != remap_clip(meta, layout):
        raise ValueError(f'{sid}: the base report layout does not produce the published metadata')
    base_atlas = rgba_image(base_atlas_bytes) if verify_pixels else None
    if base_atlas and base_atlas.size != (layout['width'], layout['height']):
        raise ValueError(f'{sid}: base atlas size differs from its layout')
    rows, images = native_cells(meta, original_atlas)
    natives = {uv_key(row['sourceUvBounds']): (row, images[row['id']]) for row in rows}
    cells = {c['id']: c for c in report['cells']}
    base = {'sid': sid, 'entry': entry, 'reportPath': str(report_path), 'reportSha256': sha(report_bytes), 'report': report,
            'meta': meta, 'originalAtlas': original_atlas, 'originalMetadataSha256': sha(original_meta_bytes),
            'originalAtlasSha256': sha(original_atlas_bytes), 'cells': []}
    for placement in layout['placements']:
        row, native = natives[uv_key(placement['sourceUvBounds'])]
        x, y, w, h = placement['x'], placement['y'], placement['width'], placement['height']
        cell = cells[placement['id']]
        tile = np.asarray(base_atlas.crop((x, y, x+w, y+h))) if base_atlas else None
        same_size = list(native.size) == [w, h]
        raster = same_size and (np.array_equal(tile, np.asarray(ImageOps.flip(native))) if base_atlas else cell['mode'] in RASTER_MODES)
        if raster != (cell['mode'] in RASTER_MODES):
            raise ValueError(f'{sid}: cell {placement["id"]} mode {cell["mode"]} disagrees with its published pixels')
        base['cells'].append({'id': placement['id'], 'placement': placement, 'row': row, 'native': np.asarray(native),
                              'tile': tile, 'raster': raster, 'cell': cell})
    return base


def densities(base):
    """Original texels per device pixel of each UV cell at the reference display: anyFrame and firstPose."""
    scale = physical_scales().get(base['sid'], DEFAULT_PHYSICAL_SCALE)
    _, _, magnification = original_magnification(base['meta'], np.asarray(base['originalAtlas'])[:, :, 3], scale,
                                                 reference_box_device_pixels())
    return magnification


def requested_scale(size, density):
    """Smallest multiplier that reaches the target, 8x when none does, within the tile limits."""
    scale = next((m for m in ai.SCALES if density*m >= TARGET_DENSITY), ai.SCALES[-1])
    return fitted({'nativeSize': size}, scale)


def eligible(base, scope):
    """Raster cells below the target, by scope ('first-pose' or 'all'), with their density record."""
    magnification = densities(base)
    rows = []
    for item in base['cells']:
        seen = magnification.get(uv_key(item['placement']['sourceUvBounds']))
        if not item['raster'] or seen is None or seen['anyFrame'] >= TARGET_DENSITY:
            continue
        first = bool(seen['firstPose'] is not None and seen['firstPose'] < TARGET_DENSITY)
        if scope == 'first-pose' and not first:
            continue
        rows.append((item, {'anyFrame': round(float(seen['anyFrame']), 6),
                            'firstPose': None if seen['firstPose'] is None else round(float(seen['firstPose']), 6),
                            'firstPoseBelowTarget': first}))
    return rows


def base_species(ids, published, manifest):
    """Species whose published atlas is not already a V60 atlas, with the generator report that produced it.

    The reviewed 346 prototype report has another format and only two-pixel microstrips as raster cells; it is left out.
    """
    result = {}
    for sid in ids:
        entry = published[sid]
        report_path = manifest[sid]['reportPath']
        report = read_json(ROOT/report_path)
        if entry['atlas'].endswith(f'-{OUTPUT_TAG}.webp') or 'atlas' not in report:
            continue
        if report['atlas'] != entry['atlas']:
            raise ValueError(f'{sid}: manifest report does not describe the published atlas')
        result[sid] = (entry, report_path)
    return result


def selection(base, scope):
    """Eligible cells: {id: (item, density, requested scale)} to upscale, and {id: record} kept for their size."""
    chosen, small = {}, {}
    for item, density in eligible(base, scope):
        size = list(item['native'].shape[1::-1])
        if ai.too_small(size):
            small[item['id']] = {'reason': 'Too small for the model to add detail; original pixels kept.', 'referenceDensity': density}
        else:
            chosen[item['id']] = (item, density, requested_scale(size, density['anyFrame']))
    return chosen, small


def gate(item, output, scale):
    tile = ai.tile_at(output, scale)
    metrics = ai.gate_metrics(item['native'], tile, scale)
    return tile, metrics, ai.gate_passes(metrics)


def reduction_steps(accepted):
    """The order in which AI cells halve when the page does not fit: the largest AI cell outside the first standby
    pose first, then first-pose cells. Each step halves one cell."""
    scales = {cid: record['scale'] for cid, record in accepted.items()}
    first = {cid: record['item']['row']['appearsInFirstStandbyPose'] for cid, record in accepted.items()}
    area = {cid: record['item']['native'].shape[0]*record['item']['native'].shape[1] for cid, record in accepted.items()}
    steps = []
    while any(scale > 1 for scale in scales.values()):
        cid = max((c for c in scales if scales[c] > 1), key=lambda c: (not first[c], area[c]*scales[c]**2, c))
        steps.append((cid, scales[cid], scales[cid]//2))
        scales[cid] //= 2
    return steps


def rows_for(base, scales):
    """Packing rows: AI cells at their scale (1x is the native size), every other cell at its published size."""
    rows = []
    for item in base['cells']:
        scale = scales.get(item['id'])
        width, height = ((item['native'].shape[1]*scale, item['native'].shape[0]*scale) if scale
                         else (item['placement']['width'], item['placement']['height']))
        rows.append({'id': item['id'], 'sourceUvBounds': item['placement']['sourceUvBounds'], 'width': width, 'height': height})
    return rows


def fewest_steps(base, accepted, steps, max_bytes):
    """The fewest reduction steps after which pack_rows fits the page, and its layout.

    Step counts whose padded area alone exceeds the budget are skipped without packing; the rest are searched by
    galloping and bisection, so a budget-limited atlas needs a few packings instead of one per step.
    """
    def scales_after(k):
        scales = {cid: record['scale'] for cid, record in accepted.items()}
        for cid, _, scale in steps[:k]:
            scales[cid] = scale
        return scales
    def attempt(k):
        rows = rows_for(base, scales_after(k))
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
    return k, layout, scales_after(k)


def pack_ai(base, accepted, outputs, max_bytes):
    """Pack base cells at their published size and AI cells at their scale, halving AI cells until the page fits.

    A cell halved to 1x, or failing the gate at its reduced scale, returns to its original pixels (base['dropped']).
    """
    reductions = []
    while True:
        steps = reduction_steps(accepted)
        k, layout, scales = fewest_steps(base, accepted, steps, max_bytes)
        reductions.extend({'cell': cid, 'from': old, 'to': new, 'reason': 'Single-page decoded RGBA budget.'} for cid, old, new in steps[:k])
        dropped = False
        for cid, scale in scales.items():
            record = accepted[cid]
            if scale == record['scale']:
                continue
            if scale == 1:
                record['dropped'] = {'reason': 'The decoded budget left no room above 1x; original pixels kept.', 'at': record['scale']}
            else:
                tile, metrics, passed = gate(record['item'], outputs[cid], scale)
                record.update(scale=scale, tile=tile, gate=metrics)
                if not passed:
                    record['dropped'] = {'reason': f'Failed the native gate after the budget reduced it to {scale}x; original pixels kept.',
                                         'at': scale}
            if 'dropped' in record:
                base.setdefault('dropped', {})[cid] = accepted.pop(cid)
                dropped = True
        if not dropped:
            return layout, reductions


def compose(base, accepted, layout):
    """The atlas page: AI tiles flipped to atlas orientation, every other cell its published tile, edge-extruded."""
    canvas = Image.new('RGBA', (layout['width'], layout['height']))
    tiles = {}
    by_id = {item['id']: item for item in base['cells']}
    for placement in layout['placements']:
        cid = placement['id']
        tile = (np.asarray(ImageOps.flip(Image.fromarray(accepted[cid]['tile']))) if cid in accepted else by_id[cid]['tile'])
        if tile.shape[:2] != (placement['height'], placement['width']):
            raise ValueError(f'Cell {cid} does not match its placement')
        padded = np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge')
        x, y = placement['x']-2, placement['y']-2
        canvas.paste(Image.fromarray(padded), (x, y))
        tiles[cid] = tile
    for placement in layout['placements']:
        x, y, w, h = placement['x']-2, placement['y']-2, placement['width']+4, placement['height']+4
        expected = np.pad(tiles[placement['id']], ((2, 2), (2, 2), (0, 0)), mode='edge')
        if not np.array_equal(np.asarray(canvas.crop((x, y, x+w, y+h))), expected):
            raise ValueError('Content or RGBA edge extrusion was changed during composition')
    return canvas, tiles


def source_record(sid, report_path):
    """The species' recovered-source record, copied into this cache so the coverage summary finds it."""
    for path in ((ROOT/report_path).parent/'source.json', ROOT/'.cache/battle-hd-v44/species'/sid/'source.json'):
        if path.exists():
            return path
    raise ValueError(f'{sid}: no recovered-source record')


def upscale(base, chosen, model_cache):
    """Gate every chosen cell at its requested scale: (accepted, rejected, model outputs)."""
    outputs = ai.model_outputs({cid: row[0]['native'] for cid, row in chosen.items()},
                               {cid: row[2] for cid, row in chosen.items()}, model_cache) if chosen else {}
    accepted, rejected = {}, {}
    for cid, (item, density, scale) in chosen.items():
        tile, metrics, passed = gate(item, outputs[cid], scale)
        record = {'item': item, 'density': density, 'requested': scale, 'scale': scale, 'tile': tile, 'gate': metrics,
                  'names': outputs[cid]['names']}
        (accepted if passed else rejected)[cid] = record
    return accepted, rejected, outputs


def cell_records(base, accepted, rejected, small, tiles):
    """The base report cells with their V60 output, AI cells relabelled, and every AI decision recorded."""
    records = []
    for item in base['cells']:
        cid, cell = item['id'], copy.deepcopy(item['cell'])
        cell.update(appearsInFirstStandbyPose=item['row']['appearsInFirstStandbyPose'],
                    outputPixels=list(tiles[cid].shape[1::-1]), outputRgbaSha256=sha(tiles[cid].tobytes()))
        if cid in accepted:
            record = accepted[cid]
            cell.update(baseMode=cell['mode'], baseReason=cell.get('reason'), mode=AI_MODE, scale=record['scale'],
                        requestedScale=record['requested'],
                        reason='AI super-resolution of the retained original raster; its native-size reduction passed the gate.',
                        aiUpscale={'referenceDensity': record['density'],
                                   'targetReached': record['density']['anyFrame']*record['scale'] >= TARGET_DENSITY,
                                   'modelOutputs': record['names'], 'gate': record['gate']})
        elif cid in rejected:
            record = rejected[cid]
            cell['aiUpscaleRejected'] = {'referenceDensity': record['density'], 'scale': record['scale'], 'gate': record['gate'],
                                         'reason': record.get('dropped', {}).get('reason', 'Failed the native gate; original pixels kept.')}
        elif cid in small:
            cell['aiUpscaleSkipped'] = small[cid]
        records.append(cell)
    return records


def build(sid, entry, report_path, args):
    started = time.monotonic()
    base = load_base(sid, entry, report_path)
    if base['report']['layout']['rgbaBytes'] > args.max_rgba_mib*1024**2:
        raise ValueError(f'{sid}: the published atlas already uses an original-size budget exception')
    chosen, small = selection(base, args.scope)
    if not chosen:
        raise ValueError(f'{sid}: no eligible raster cell' + (' above the minimum size' if small else ''))
    accepted, rejected, outputs = upscale(base, chosen, args.model_cache)
    layout, reductions = pack_ai(base, accepted, outputs, args.max_rgba_mib*1024**2)
    if not accepted:
        raise ValueError(f'{sid}: no AI cell passed the gate within the budget')
    rejected.update(base.pop('dropped', {}))
    canvas, tiles = compose(base, accepted, layout)
    meta = base['meta']
    verification = _verify(meta, layout)
    verification['contentAndPaddingEveryRgbaPixelExact'] = True
    work = args.cache/'species'/sid
    work.mkdir(parents=True, exist_ok=True)
    source = source_record(sid, report_path)
    shutil.copy2(source, work/'source.json')
    args.output.mkdir(parents=True, exist_ok=True)
    atlas_output, meta_output = args.output/f'{sid}-{OUTPUT_TAG}.webp', args.output/f'{sid}-{OUTPUT_TAG}.json.gz'
    canvas.save(atlas_output, format='WEBP', lossless=True, exact=True, method=0, quality=50)
    meta_output.write_bytes(gzip.compress(json.dumps(remap_clip(meta, layout), separators=(',', ':')).encode(), mtime=0))
    cells = cell_records(base, accepted, rejected, small, tiles)
    report = species_report(sid, base, cells, layout, reductions, verification, args)
    # Runtime URLs: --output may be another checkout's public/battle-animations/hd (a worktree links its files).
    report.update(meta=f'/battle-animations/hd/{meta_output.name}', atlas=f'/battle-animations/hd/{atlas_output.name}',
                  atlasWidth=canvas.width, atlasHeight=canvas.height, metaSha256=sha(meta_output.read_bytes()),
                  atlasSha256=sha(atlas_output.read_bytes()), atlasFileBytes=atlas_output.stat().st_size,
                  sourceRecordSha256=sha((work/'source.json').read_bytes()), elapsedSeconds=round(time.monotonic()-started, 3))
    save(work/'report.json', report)
    return report


def species_report(sid, base, cells, layout, reductions, verification, args):
    entry, prior = base['entry'], base['report']
    first = [c for c in cells if c['appearsInFirstStandbyPose'] and c['mode'] != 'constant-original-rgba']
    return {'revision': REVISION, 'kind': KIND, 'species': int(sid), 'scope': args.scope,
            'sourceSha256': prior.get('sourceSha256'), 'sourceMorphCharacters': prior.get('sourceMorphCharacters'),
            'sourceBitmapCharacters': prior.get('sourceBitmapCharacters'),
            'base': {key: entry[key] for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256')} | {
                'reportPath': base['reportPath'], 'reportSha256': base['reportSha256'], 'reportKind': prior.get('kind'),
                'rgbaBytes': prior['layout']['rgbaBytes']},
            'originalMetadataSha256': base['originalMetadataSha256'], 'originalAtlasSha256': base['originalAtlasSha256'],
            'upscaler': ai.method(), 'gate': ai.GATE, 'maxRgbaMiB': args.max_rgba_mib,
            'densityPolicy': {'referenceBoxDevicePixels': reference_box_device_pixels(), 'targetTexelsPerDevicePixel': TARGET_DENSITY,
                              'scales': list(ai.SCALES), 'minimumSide': ai.MINIMUM_SIDE, 'minimumArea': ai.MINIMUM_AREA},
            'counts': dict(collections.Counter(c['mode'] for c in cells)),
            'resolutionCounts': dict(collections.Counter(f'{c["mode"]}:{c["scale"]}x' for c in cells)),
            'aiUpscaledCellIds': [c['id'] for c in cells if c['mode'] == AI_MODE],
            'aiRejectedCellIds': [c['id'] for c in cells if 'aiUpscaleRejected' in c],
            'aiSkippedSmallCellIds': [c['id'] for c in cells if 'aiUpscaleSkipped' in c],
            'firstStandbyPoseFullyOriginalVector': prior.get('firstStandbyPoseFullyOriginalVector'),
            'firstStandbyPoseFullyHigherResolution': bool(first) and all(c['mode'] in VECTOR_MODES and c['scale'] > 1 for c in first),
            'firstStandbyPoseFullyAboveNative': bool(first) and all(c['scale'] > 1 for c in first),
            'nativeGateRescuedCells': prior.get('nativeGateRescuedCells', []),
            'publicationState': 'candidate-awaiting-reviewed-index', 'layout': layout, 'scaleReductions': reductions,
            'verification': verification, 'cells': cells}


def reusable_report(sid, entry, report_path, args):
    """An existing report built by this revision, scope, method and gate from the same base, whose outputs still match."""
    path = args.cache/'species'/sid/'report.json'
    if not path.exists():
        return None
    report = read_json(path)
    base = report.get('base', {})
    if (report.get('revision') != REVISION or report.get('scope') != args.scope or report.get('upscaler') != ai.method()
            or report.get('gate') != ai.GATE or base.get('atlasSha256') != entry['atlasSha256']
            or base.get('reportSha256') != sha((ROOT/report_path).read_bytes())):
        return None
    for key in ('meta', 'atlas'):
        output = args.output/Path(report[key]).name
        if not output.exists() or sha(output.read_bytes()) != report[key+'Sha256']:
            return None
    return report


def attempt(sid, entry, report_path, args):
    try:
        return sid, build(sid, entry, report_path, args), None
    except Exception as error:  # Recorded per species; the run continues.
        return sid, None, f'{type(error).__name__}: {error}'


def batches(species, args):
    """Species in batches of about `--batch-pixels` native pixels of eligible cells, with those cells and scales."""
    batch, cells, scales, pixels = [], {}, {}, 0
    for sid, (entry, report_path) in species.items():
        try:
            base = load_base(sid, entry, report_path, verify_pixels=False)
            chosen, _ = selection(base, args.scope)
        except Exception as error:  # The build of this species reports it.
            chosen = {}
            print(json.dumps({'species': sid, 'selectionError': str(error)}), flush=True)
        for cid, (item, _, scale) in chosen.items():
            cells[(sid, cid)], scales[(sid, cid)] = item['native'], scale
            pixels += item['native'].shape[0]*item['native'].shape[1]
        batch.append(sid)
        if pixels >= args.batch_pixels:
            yield batch, cells, scales
            batch, cells, scales, pixels = [], {}, {}, 0
    if batch:
        yield batch, cells, scales


def model_batches(species, args):
    """(species, args with the batch's model cache) per batch; the next batch's model runs while this one builds."""
    def run(number, cells, scales):
        cache, started = args.model_cache/f'batch-{number}', time.monotonic()
        if cells:
            ai.prepare(cells, scales, cache)
        print(json.dumps({'batch': number, 'cells': len(cells), 'modelSeconds': round(time.monotonic()-started, 1)}), flush=True)
        return copy.copy(args), cache
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as model:
        queued = None
        for number, (batch, cells, scales) in enumerate(batches(species, args)):
            submitted = (batch, model.submit(run, number, cells, scales))
            if queued:
                yield finish(*queued)
            queued = submitted
        if queued:
            yield finish(*queued)


def finish(batch, future):
    batch_args, cache = future.result()
    batch_args.model_cache = cache
    return batch, batch_args


def budget_dropped(cell):
    """A cell whose AI tile passed the gate but found no room above 1x in the decoded budget."""
    return cell['aiUpscaleRejected']['reason'].startswith('The decoded budget')


def write_provenance(args):
    """Compact tracked provenance of every published V60 species, bound to its cache report by digest."""
    published = read_json(HD_INDEX)['species']
    calibration = ROOT/'artifacts/battle-hd-ai-v60/calibration.json'
    species, totals = {}, collections.Counter()
    for sid, entry in sorted(published.items(), key=lambda item: int(item[0])):
        if not entry['atlas'].endswith(f'-{OUTPUT_TAG}.webp'):
            continue
        path = args.cache/'species'/sid/'report.json'
        data = path.read_bytes()
        report = json.loads(data)
        if report['atlasSha256'] != entry['atlasSha256'] or report['metaSha256'] != entry['metaSha256']:
            raise ValueError(f'{sid}: published V60 entry differs from its report')
        cells = {c['id']: c for c in report['cells']}
        species[sid] = {'reportPath': os.path.relpath(path, ROOT), 'reportSha256': sha(data),
                        'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256')},
                        'aiUpscaledCells': {cid: cells[cid]['scale'] for cid in report['aiUpscaledCellIds']},
                        'firstPoseAiUpscaledCells': [cid for cid in report['aiUpscaledCellIds'] if cells[cid]['appearsInFirstStandbyPose']],
                        'gateRejectedCells': [cid for cid in report['aiRejectedCellIds'] if not budget_dropped(cells[cid])],
                        'budgetDroppedCells': [cid for cid in report['aiRejectedCellIds'] if budget_dropped(cells[cid])],
                        'tooSmallCells': report['aiSkippedSmallCellIds']}
        totals['species'] += 1
        for key in ('aiUpscaledCells', 'firstPoseAiUpscaledCells', 'gateRejectedCells', 'budgetDroppedCells', 'tooSmallCells'):
            totals[key] += len(species[sid][key])
        totals.update(f'{scale}x' for scale in species[sid]['aiUpscaledCells'].values())
    result = {'revision': REVISION, 'kind': KIND, 'mode': AI_MODE, 'method': ai.method(), 'gate': ai.GATE,
              'calibration': {'path': os.path.relpath(calibration, ROOT), 'sha256': sha(calibration.read_bytes())},
              'scope': 'Retained original raster cells below one texel per device pixel at the reference display; '
                       'original-vector, constant and other cells keep their published pixels.',
              'totals': dict(totals), 'species': species,
              'transfer': 'Model output is not guaranteed byte-reproducible on another GPU or driver: transfer the V60 atlases, '
                          'metadata and cache reports together; regeneration needs revalidation by the publisher.'}
    save(ROOT/'public/battle-animations/hd'/f'ai-upscale-provenance-{OUTPUT_TAG}.json', result)
    print(json.dumps(result['totals']))


def audit_ids(path, scope):
    audit = read_json(path)
    return [str(sid) for sid in audit['firstPose' if scope == 'first-pose' else 'anyFrame']['retained-raster']['ids']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species')
    parser.add_argument('--audit', type=Path, help='Density audit whose retained-raster species of the scope to build')
    parser.add_argument('--scope', choices=('first-pose', 'all'), default='all',
                        help='Cells to upscale: below the target in the first standby pose, or in any frame')
    parser.add_argument('--batch-pixels', type=int, default=3_000_000, help='Native pixels of eligible cells per model batch')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v60')
    parser.add_argument('--output', type=Path, default=ROOT/'public/battle-animations/hd')
    parser.add_argument('--max-rgba-mib', type=int, default=128)
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2))
    parser.add_argument('--provenance', action='store_true', help='Only write the tracked provenance of the published V60 species')
    parser.add_argument('--resume', action='store_true', help='Keep species whose report and outputs are still current')
    args = parser.parse_args()
    # Not resolved: a worktree may link .cache, and report paths stay relative to this checkout.
    args.cache, args.output = args.cache.absolute(), args.output.absolute()
    args.model_cache = args.cache/'model-run'
    if args.provenance:
        return write_provenance(args)
    ids = args.ids.split(',') if args.ids else audit_ids(args.audit, args.scope)
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    species = base_species(sorted(set(ids), key=int), published, manifest)
    manifest_path = args.cache/'atlas-manifest.json'
    summary = read_json(manifest_path) if manifest_path.exists() else {'revision': REVISION, 'species': {}, 'failures': {}}
    def accept(sid, report, error):
        if error is None:
            summary['species'][sid] = {key: report[key] for key in ('counts', 'resolutionCounts', 'aiUpscaledCellIds', 'aiRejectedCellIds',
                                       'aiSkippedSmallCellIds', 'meta', 'atlas', 'metaSha256', 'atlasSha256', 'scope', 'elapsedSeconds')}
            summary['species'][sid]['rgbaBytes'] = report['layout']['rgbaBytes']
            summary['failures'].pop(sid, None)
            print(json.dumps({'species': sid, 'ai': len(report['aiUpscaledCellIds']), 'rejected': len(report['aiRejectedCellIds']),
                              'rgbaMiB': round(report['layout']['rgbaBytes']/1024**2, 2), 'seconds': report['elapsedSeconds']}), flush=True)
        else:
            summary['failures'][sid] = {'error': error}
            print(json.dumps({'species': sid, 'error': error}), flush=True)
        save(manifest_path, summary)
    for sid in [sid for sid in species if args.resume and reusable_report(sid, *species[sid], args)]:
        accept(sid, reusable_report(sid, *species.pop(sid), args), None)
    for batch, batch_args in model_batches(species, args):
        if args.jobs == 1:
            for sid in batch:
                accept(*attempt(sid, *species[sid], batch_args))
        else:
            with concurrent.futures.ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context('spawn')) as pool:
                futures = [pool.submit(attempt, sid, *species[sid], batch_args) for sid in batch]
                for future in concurrent.futures.as_completed(futures):
                    accept(*future.result())
        shutil.rmtree(batch_args.model_cache, ignore_errors=True)


if __name__ == '__main__':
    main()
