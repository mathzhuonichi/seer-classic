#!/usr/bin/env python3
"""Validate reviewed local battle candidates and publish their optional HD index.

This verifies actual output pixels, source/render hashes, unchanged animation
data, and memory limits. It does not replace browser inspection or claim that a
retained bitmap contains newly recovered vector detail. Original assets and the
original runtime index remain unchanged. A V60 report (build_battle_hd_ai_atlases.py)
is validated against its published base: every non-AI tile must be the base tile,
and every AI tile must replace an original raster and pass its recomputed gate.
A V61 report (build_battle_hd_redraw_atlases.py) is validated the same way, and every
redrawn tile is recomputed from the native pixels with the pinned redraw method and
must equal the published pixels, its SVG digest and its recomputed class gate.
A V62 report (build_battle_hd_priority_atlases.py) has its first-pose budget plan
derived again from its base (ladders, reduction order, layout, and no first-pose cell
held back while another cell keeps a raise); every changed tile is recomputed by its
method (vector renders rendered again, redraws redrawn, reductions reduced, AI tiles
re-gated) and held to its recorded gate (V60's, or the stroke gate for thin strokes,
which also needs an accepting visual review of exactly its pixels).
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import shutil
import tempfile

import numpy as np
from PIL import Image, ImageOps

import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd
import battle_hd_stroke_gate as sg
from battle_hd_atlas_layout import remap_clip, _verify
import build_battle_hd_priority_atlases as pr
import build_battle_hd_redraw_atlases as rda
from battle_hd_local_fidelity import local_color_comparison
from build_battle_hd_redraw_atlases import SCALES as REDRAW_SCALES
from build_battle_hd_atlases import ROOT, VECTOR_MODES, SOURCE_RENDER_MODES, sha, native_cells, additional_candidates, bitmap_rectangle_proof
from recover_battle_shapes import save

ORIGINAL_BUDGET_EXCEPTIONS = {'375', '382', '431', '498', '502', '811', '1202'}
RASTER = ('retained-original-cell', 'retained-native-microstrip')


def atlas_budget_policy(sid, original):
    original_size = [original['atlasWidth'], original['atlasHeight']]
    exception = sid in ORIGINAL_BUDGET_EXCEPTIONS and original_size == [8192, 8192]
    return {'standardDecodedBytes': 128*1024**2, 'allowedDecodedBytes': (256 if exception else 128)*1024**2,
            'originalDimensions': original_size, 'originalDecodedBytes': original_size[0]*original_size[1]*4,
            'pinnedSourceSizedExceptionEligible': exception}


def validate_species(sid, cache, runtime):
    work = cache/'species'/sid
    report_bytes = (work/'report.json').read_bytes()
    report = json.loads(report_bytes)
    source = json.loads((work/'source.json').read_text())
    candidates = json.loads((work/'candidates.json').read_text())
    if report.get('candidateManifestSha256') != sha((work/'candidates.json').read_bytes()):
        raise ValueError(f'{sid}: candidate manifest provenance changed or is missing')
    if report.get('candidateDependencies') != additional_candidates(work):
        raise ValueError(f'{sid}: additional candidate provenance changed or is missing')
    if report['sourceSha256'] != sha((ROOT / source['sourcePath']).read_bytes()):
        raise ValueError(f'{sid}: changed official source')
    if report['sourceSha256'] != candidates['sourceSha256']:
        raise ValueError(f'{sid}: candidate source differs')
    original_meta_bytes = (ROOT/'public'/runtime['meta'].lstrip('/')).read_bytes()
    original_atlas_path = ROOT/'public'/runtime['atlas'].lstrip('/')
    if (sha(original_meta_bytes) != report['originalMetadataSha256']
            or sha(original_atlas_path.read_bytes()) != report['originalAtlasSha256']):
        raise ValueError(f'{sid}: original runtime inputs changed')
    for key in ('meta', 'atlas'):
        if sha((ROOT/'public'/report[key].lstrip('/')).read_bytes()) != report[key+'Sha256']:
            raise ValueError(f'{sid}: output {key} digest changed')
    original = json.loads(gzip.decompress(original_meta_bytes))
    modified = json.loads(gzip.decompress((ROOT/'public'/report['meta'].lstrip('/')).read_bytes()))
    layout = report['layout']
    if modified != remap_clip(original, layout):
        raise ValueError(f'{sid}: output contains changes beyond the exact UV remapping')
    verification = _verify(original, layout)
    budget = atlas_budget_policy(sid, original)
    actual_decoded_bytes = layout['width']*layout['height']*4
    if layout['rgbaBytes'] != actual_decoded_bytes:
        raise ValueError(f'{sid}: declared decoded bytes disagree with actual atlas dimensions')
    if max(layout['width'], layout['height']) > 8192 or actual_decoded_bytes > budget['allowedDecodedBytes']:
        raise ValueError(f'{sid}: output exceeds the reviewed memory/side budget')
    if layout['rgbaBytes'] > 128*1024**2 and not report.get('sourceSizedBudgetException'):
        raise ValueError(f'{sid}: larger original-sized budget has no explicit provenance')
    for name, digest in report.get('postprocessInputs', {}).items():
        if sha((ROOT/name).read_bytes()) != digest:
            raise ValueError(f'{sid}: postprocess source provenance changed')
    with Image.open(original_atlas_path) as image:
        if list(image.size) != budget['originalDimensions']:
            raise ValueError(f'{sid}: actual original atlas dimensions differ from budget proof')
        _, native = native_cells(original, image.convert('RGBA'))
    with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
        atlas = image.convert('RGBA')
    if atlas.size != (layout['width'], layout['height']):
        raise ValueError(f'{sid}: actual atlas size differs from metadata')
    cells = {c['id']: c for c in report['cells']}
    candidate_map = {c['key']: c for c in candidates['candidates']}
    if set(cells) != {p['id'] for p in layout['placements']}:
        raise ValueError(f'{sid}: cell coverage is not exact')
    for placement in layout['placements']:
        cell = cells[placement['id']]
        width, height = placement['width'], placement['height']
        if cell['mode'] in SOURCE_RENDER_MODES:
            selected = cell['selected']
            candidate = candidate_map[selected['key']]
            path = work/'candidates'/f'{selected["key"]}.svg'
            if (selected.get('candidateSvgSha256') != candidate['candidateSvgSha256']
                    or sha(path.read_bytes()) != selected['candidateSvgSha256']):
                raise ValueError(f'{sid}: selected vector source changed')
            if candidate['hasBitmap']:
                proof = bitmap_rectangle_proof(path)
                recorded = cell.get('bitmapSourceProof', {})
                if (cell['mode'] != 'original-bitmap-source-recovery' or not proof
                        or any(recorded.get(key) != value for key,value in proof.items())
                        or cell['scale'] <= 1
                        or any(output > intrinsic for output,intrinsic in zip((width,height), proof['intrinsicSize']))):
                    raise ValueError(f'{sid}: bitmap interpolation misclassified as native-source detail')
            elif cell['mode'] != 'original-vector':
                raise ValueError(f'{sid}: vector source classification differs from selected source')
            if not cell.get('nativeComparison'):
                raise ValueError(f'{sid}: source fidelity comparison is missing')
            local = local_color_comparison(np.asarray(native[cell['id']]), np.asarray(Image.open(work/'rendered'/f'{cell["id"]}-1x.png').convert('RGBA')))
            if not local['passed']:
                raise ValueError(f'{sid}: selected source changes a stable interior color region')
            if cell.get('localColorComparison') is not None and cell['localColorComparison'] != local:
                raise ValueError(f'{sid}: local color comparison differs from the generation audit')
            tile = Image.open(work/'rendered'/f'{cell["id"]}-{cell["scale"]}x.png').convert('RGBA')
        else:
            tile = native[cell['id']]
            if cell['mode'] == 'constant-original-rgba':
                pixels = np.asarray(tile)
                if not np.all(pixels == pixels[0, 0]):
                    raise ValueError(f'{sid}: a nonconstant cell was labelled constant')
                tile = tile.resize((width, height), Image.Resampling.NEAREST)
            elif cell['scale'] != 1:
                raise ValueError(f'{sid}: unmatched raster was enlarged')
        if tile.size != (width, height):
            raise ValueError(f'{sid}: rendered cell dimensions differ')
        tile = ImageOps.flip(tile)
        if sha(tile.tobytes()) != cell['outputRgbaSha256']:
            raise ValueError(f'{sid}: expected cell pixels changed')
        expected = np.pad(np.asarray(tile), ((2, 2), (2, 2), (0, 0)), mode='edge')
        x, y = placement['x']-2, placement['y']-2
        actual = np.asarray(atlas.crop((x, y, x+width+4, y+height+4)))
        if not np.array_equal(expected, actual):
            raise ValueError(f'{sid}: atlas content or transparent RGBA padding differs')
    if not any(c['mode'] in SOURCE_RENDER_MODES and c['scale'] > 1 for c in cells.values()):
        raise ValueError(f'{sid}: no source-rendered resolution improvement')
    verification['actualAtlasContentAndRgbaPaddingExact'] = True
    entry = {key: report[key] for key in ('meta', 'atlas', 'atlasWidth', 'atlasHeight', 'metaSha256', 'atlasSha256')}
    audit = {'species': int(sid), 'sourceSha256': report['sourceSha256'], 'counts': report['counts'],
             'reportSha256': sha(report_bytes), 'metaSha256': report['metaSha256'], 'atlasSha256': report['atlasSha256'],
             'firstStandbyPoseFullyOriginalVector': report['firstStandbyPoseFullyOriginalVector'],
             'atlasRgbaBytes': layout['rgbaBytes'], 'verification': verification,
             'budgetPolicy': {**budget, 'actualDimensions': [layout['width'], layout['height']],
                              'actualDecodedBytes': layout['rgbaBytes'], 'sourceSizedExceptionUsed': layout['rgbaBytes'] > 128*1024**2},
             'retainedCells': [{'id': c['id'], 'nativeSize': c['nativeSize'], 'reason': c['reason'], 'appearsInFirstStandbyPose': c['appearsInFirstStandbyPose']} for c in cells.values() if c['mode'] == 'retained-original-cell'],
             'nativeBitmapCells': [c['id'] for c in cells.values() if c['mode'] == 'original-vector-with-native-bitmap'],
             'recoveredNativeBitmapCells': [c['id'] for c in cells.values() if c['mode'] == 'original-bitmap-source-recovery'],
             'scaleCounts': {str(scale): sum(c['scale'] == scale for c in cells.values()) for scale in (1, 2, 4, 8)}}
    return entry, audit


def base_tiles(report, original):
    """Tiles and modes of the published base atlas a V60 report was composed over, proven by its layout and metadata."""
    base = report['base']
    report_bytes = (ROOT/base['reportPath']).read_bytes()
    if sha(report_bytes) != base['reportSha256']:
        raise ValueError('base report changed')
    base_report = json.loads(report_bytes)
    layout = base_report['layout']
    meta_bytes = (ROOT/'public'/base['meta'].lstrip('/')).read_bytes()
    atlas_bytes = (ROOT/'public'/base['atlas'].lstrip('/')).read_bytes()
    if sha(meta_bytes) != base['metaSha256'] or sha(atlas_bytes) != base['atlasSha256']:
        raise ValueError('published base files changed')
    if json.loads(gzip.decompress(meta_bytes)) != remap_clip(original, layout):
        raise ValueError('base layout does not produce the base metadata')
    with Image.open(ROOT/'public'/base['atlas'].lstrip('/')) as image:
        atlas = image.convert('RGBA')
    tiles = {}
    for p in layout['placements']:
        tiles[p['id']] = np.asarray(atlas.crop((p['x'], p['y'], p['x']+p['width'], p['y']+p['height'])))
    return tiles, {c['id']: c['mode'] for c in base_report['cells']}


def ai_tile(sid, cell, native, base_tile, published):
    """An AI-upscaled cell's published tile, after proving it replaced an original raster and recomputing its gate."""
    if cell.get('baseMode') not in ('retained-original-cell', 'retained-native-microstrip'):
        raise ValueError(f'{sid}: AI cell {cell["id"]} did not replace a retained raster')
    if base_tile.shape[:2] != native.size[::-1] or not np.array_equal(base_tile, np.asarray(ImageOps.flip(native))):
        raise ValueError(f'{sid}: AI cell {cell["id"]} replaced published pixels that are not the original raster')
    scale = cell['scale']
    if scale not in ai.SCALES or list(published.size) != [v*scale for v in native.size]:
        raise ValueError(f'{sid}: AI cell {cell["id"]} has an unsupported multiplier or size')
    tile = ImageOps.flip(published)
    metrics = ai.gate_metrics(np.asarray(native), np.asarray(tile), scale)
    if metrics != cell['aiUpscale']['gate'] or not ai.gate_passes(metrics):
        raise ValueError(f'{sid}: AI cell {cell["id"]} fails or differs from its recorded native gate')
    return published


def validate_ai_species(sid, cache, runtime):
    """A V60 report: AI tiles over its published base; every other tile is the base tile, unchanged."""
    work = cache/'species'/sid
    report_bytes = (work/'report.json').read_bytes()
    report = json.loads(report_bytes)
    if report['upscaler'] != ai.method() or report['gate'] != ai.GATE:
        raise ValueError(f'{sid}: AI method or gate differs from the pinned one')
    ai.verify_upscaler()
    original_meta_bytes = (ROOT/'public'/runtime['meta'].lstrip('/')).read_bytes()
    original_atlas_path = ROOT/'public'/runtime['atlas'].lstrip('/')
    if (sha(original_meta_bytes) != report['originalMetadataSha256']
            or sha(original_atlas_path.read_bytes()) != report['originalAtlasSha256']):
        raise ValueError(f'{sid}: original runtime inputs changed')
    for key in ('meta', 'atlas'):
        if sha((ROOT/'public'/report[key].lstrip('/')).read_bytes()) != report[key+'Sha256']:
            raise ValueError(f'{sid}: output {key} digest changed')
    original = json.loads(gzip.decompress(original_meta_bytes))
    layout = report['layout']
    if json.loads(gzip.decompress((ROOT/'public'/report['meta'].lstrip('/')).read_bytes())) != remap_clip(original, layout):
        raise ValueError(f'{sid}: output contains changes beyond the exact UV remapping')
    verification = _verify(original, layout)
    budget = atlas_budget_policy(sid, original)
    if (layout['rgbaBytes'] != layout['width']*layout['height']*4 or max(layout['width'], layout['height']) > 8192
            or layout['rgbaBytes'] > budget['standardDecodedBytes']):
        raise ValueError(f'{sid}: output exceeds the standard memory/side budget')
    with Image.open(original_atlas_path) as image:
        _, native = native_cells(original, image.convert('RGBA'))
    try:
        base, base_modes = base_tiles(report, original)
    except ValueError as error:
        raise ValueError(f'{sid}: {error}') from None
    with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
        atlas = image.convert('RGBA')
    cells = {c['id']: c for c in report['cells']}
    if atlas.size != (layout['width'], layout['height']) or set(cells) != {p['id'] for p in layout['placements']} or set(cells) != set(base):
        raise ValueError(f'{sid}: atlas size or cell coverage is not exact')
    for placement in layout['placements']:
        cell, width, height = cells[placement['id']], placement['width'], placement['height']
        if (cell['baseMode'] if cell['mode'] == ai.AI_MODE else cell['mode']) != base_modes[cell['id']]:
            raise ValueError(f'{sid}: cell {cell["id"]} mode differs from its base report')
        if cell['mode'] == ai.AI_MODE:
            published = atlas.crop((placement['x'], placement['y'], placement['x']+width, placement['y']+height))
            tile = ai_tile(sid, cell, native[cell['id']], base[cell['id']], published)
        else:
            tile = Image.fromarray(base[cell['id']])
        if tile.size != (width, height) or sha(tile.tobytes()) != cell['outputRgbaSha256']:
            raise ValueError(f'{sid}: expected cell pixels changed')
        expected = np.pad(np.asarray(tile), ((2, 2), (2, 2), (0, 0)), mode='edge')
        x, y = placement['x']-2, placement['y']-2
        if not np.array_equal(expected, np.asarray(atlas.crop((x, y, x+width+4, y+height+4)))):
            raise ValueError(f'{sid}: atlas content or transparent RGBA padding differs')
    if not any(c['mode'] == ai.AI_MODE for c in cells.values()):
        raise ValueError(f'{sid}: no AI-upscaled cell')
    verification['actualAtlasContentAndRgbaPaddingExact'] = True
    entry = {key: report[key] for key in ('meta', 'atlas', 'atlasWidth', 'atlasHeight', 'metaSha256', 'atlasSha256')}
    audit = {'species': int(sid), 'kind': report['kind'], 'sourceSha256': report['sourceSha256'], 'counts': report['counts'],
             'reportSha256': sha(report_bytes), 'metaSha256': report['metaSha256'], 'atlasSha256': report['atlasSha256'],
             'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256', 'reportSha256')},
             'atlasRgbaBytes': layout['rgbaBytes'], 'verification': verification,
             'budgetPolicy': {**budget, 'actualDimensions': [layout['width'], layout['height']],
                              'actualDecodedBytes': layout['rgbaBytes'], 'sourceSizedExceptionUsed': False},
             'aiUpscaledCells': report['aiUpscaledCellIds'],
             'scaleCounts': {str(scale): sum(c['scale'] == scale for c in cells.values()) for scale in (1, 2, 4, 8)}}
    return entry, audit


def redrawn_tile(sid, cell, native, base_tile, base_mode, work):
    """A redrawn cell's tile (atlas orientation), recomputed from the native pixels and checked against its record."""
    record = cell['redraw']
    if cell.get('baseMode') != base_mode or base_mode not in ('retained-original-cell', 'retained-native-microstrip'):
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} did not replace a retained raster')
    native_array = np.asarray(native)
    if not np.array_equal(base_tile, np.asarray(ImageOps.flip(native))):
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} replaced published pixels that are not the original raster')
    base_scale, scale, requested = base_tile.shape[1]//native.size[0], cell['scale'], cell['requestedScale']
    if (cell['baseScale'] != base_scale or not base_scale < scale <= requested or requested not in REDRAW_SCALES
            or requested % scale or sha(native_array.tobytes()) != record['inputRgbaSha256']):
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} has an unsupported multiplier or another input')
    result = rd.redraw(native_array, requested, work/cell['id'])
    if result is None or result['class'] != record['class'] or result['method'] != record['method']:
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} recomputes to another class or method')
    svg_digest = sha(result['svg'].encode()) if result.get('svg') else None
    if sha(result['tile'].tobytes()) != record['redrawRgbaSha256'] or svg_digest != record['svgSha256']:
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} does not recompute to its recorded pixels or SVG')
    if record['svgPath'] and sha((ROOT/record['svgPath']).read_bytes()) != record['svgSha256']:
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} SVG file changed')
    tile = ai.reduce_premultiplied(result['tile'], requested//scale)
    metrics = ai.gate_metrics(native_array, tile, scale)
    if metrics != record['gate'] or not rd.gate_passes(metrics, record['class']):
        raise ValueError(f'{sid}: redrawn cell {cell["id"]} fails or differs from its recorded class gate')
    return np.ascontiguousarray(tile[::-1])


def reduced_ai_tile(sid, cell, native, base_tile):
    """A V60 AI cell that gave up budget: a box reduction of its base tile (re-gated) or its original pixels."""
    reduction = cell['aiReduction']
    native_array = np.asarray(native)
    if rd.classify(native_array)[0] not in rd.SOFT_CLASSES:
        raise ValueError(f'{sid}: AI cell {cell["id"]} is not soft and may not give up budget')
    if reduction['from'] != base_tile.shape[1]//native.size[0] or not reduction['to'] < reduction['from']:
        raise ValueError(f'{sid}: AI cell {cell["id"]} reduction does not start at its base tile')
    if cell['mode'] == 'retained-original-cell':
        return np.asarray(ImageOps.flip(native))
    tile = ai.reduce_premultiplied(np.ascontiguousarray(base_tile[::-1]), reduction['from']//reduction['to'])
    metrics = ai.gate_metrics(native_array, tile, reduction['to'])
    if cell['scale'] != reduction['to'] or metrics != reduction['gate'] or not ai.gate_passes(metrics):
        raise ValueError(f'{sid}: reduced AI cell {cell["id"]} fails or differs from its recorded gate')
    return np.ascontiguousarray(tile[::-1])


def validate_redraw_species(sid, cache, runtime):
    """A V61 report: redrawn and reduced tiles over its published base; every other tile is the base tile, unchanged."""
    work = cache/'species'/sid
    report_bytes = (work/'report.json').read_bytes()
    report = json.loads(report_bytes)
    if report['redraw'] != rd.method() or report['gate'] != rd.GATE or report['aiGate'] != ai.GATE:
        raise ValueError(f'{sid}: redraw method or gate differs from the pinned one')
    original, layout, verification, budget = checked_outputs(sid, report, runtime)
    with Image.open(ROOT/'public'/runtime['atlas'].lstrip('/')) as image:
        _, native = native_cells(original, image.convert('RGBA'))
    try:
        base, base_modes = base_tiles(report, original)
    except ValueError as error:
        raise ValueError(f'{sid}: {error}') from None
    with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
        atlas = np.asarray(image.convert('RGBA'))
    cells = {c['id']: c for c in report['cells']}
    if atlas.shape[1::-1] != (layout['width'], layout['height']) or set(cells) != {p['id'] for p in layout['placements']} or set(cells) != set(base):
        raise ValueError(f'{sid}: atlas size or cell coverage is not exact')
    scratch = Path(tempfile.mkdtemp(prefix=f'redraw-{sid}-', dir=work))
    try:
        for placement in layout['placements']:
            cell, width, height = cells[placement['id']], placement['width'], placement['height']
            cid, base_mode = cell['id'], base_modes[cell['id']]
            if cell['mode'] == rd.REDRAW_MODE:
                tile = redrawn_tile(sid, cell, native[cid], base[cid], base_mode, scratch)
            elif 'aiReduction' in cell:
                if base_mode != ai.AI_MODE or (cell['mode'] != ai.AI_MODE and cell.get('baseMode') != ai.AI_MODE):
                    raise ValueError(f'{sid}: cell {cid} reduction does not start from an AI tile')
                tile = reduced_ai_tile(sid, cell, native[cid], base[cid])
            elif cell['mode'] != base_mode:
                raise ValueError(f'{sid}: cell {cid} mode differs from its base report')
            else:
                tile = base[cid]
            if tile.shape[1::-1] != (width, height) or sha(tile.tobytes()) != cell['outputRgbaSha256']:
                raise ValueError(f'{sid}: expected cell pixels changed')
            x, y = placement['x']-2, placement['y']-2
            if not np.array_equal(np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge'), atlas[y:y+height+4, x:x+width+4]):
                raise ValueError(f'{sid}: atlas content or transparent RGBA padding differs')
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if not any(c['mode'] == rd.REDRAW_MODE for c in cells.values()):
        raise ValueError(f'{sid}: no redrawn cell')
    verification['actualAtlasContentAndRgbaPaddingExact'] = True
    entry = {key: report[key] for key in ('meta', 'atlas', 'atlasWidth', 'atlasHeight', 'metaSha256', 'atlasSha256')}
    audit = {'species': int(sid), 'kind': report['kind'], 'sourceSha256': report['sourceSha256'], 'counts': report['counts'],
             'reportSha256': sha(report_bytes), 'metaSha256': report['metaSha256'], 'atlasSha256': report['atlasSha256'],
             'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256', 'reportSha256')},
             'atlasRgbaBytes': layout['rgbaBytes'], 'verification': verification,
             'budgetPolicy': {**budget, 'actualDimensions': [layout['width'], layout['height']],
                              'actualDecodedBytes': layout['rgbaBytes'], 'sourceSizedExceptionUsed': False},
             'redrawnCells': report['redrawnCellIds'], 'aiReducedCells': report['aiReducedCellIds'],
             'scaleCounts': {str(scale): sum(c['scale'] == scale for c in cells.values()) for scale in (1, 2, 4, 8, 16, 32)}}
    return entry, audit


def priority_base(sid, report):
    """The published base of a V62 report, proven by digests and layout (build_battle_hd_redraw_atlases.load_base)."""
    base = report['base']
    if sha((ROOT/base['reportPath']).read_bytes()) != base['reportSha256']:
        raise ValueError(f'{sid}: base report changed')
    try:
        return rda.load_base(sid, {key: base[key] for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256')}, base['reportPath'])
    except ValueError as error:
        raise ValueError(f'{sid}: {error}') from None


def check_plan(sid, report, base, infos, classes):
    """The V62 plan derived again: every ladder is the rule's ladder less levels that recorded a failed attempt, the
    packing of those ladders gives the same steps, layout and levels, and a first-pose cell held below its ladder top
    means that every cell of an earlier tier gave back all it may."""
    expected = pr.ladders(base, infos, classes)
    recorded = {cid: (e['tier'], e['methods'], [tuple(level) for level in e['levels']]) for cid, e in report['plan']['ladders'].items()}
    cells = {c['id']: c for c in report['cells']}
    if set(expected) != set(recorded):
        raise ValueError(f'{sid}: the planned cells differ from the V62 rules')
    for cid, (tier, methods, levels) in recorded.items():
        rule_tier, rule_methods, rule_levels = expected[cid]
        attempted = {attempt['scale'] for attempt in cells[cid]['priority']['attempts']}
        if (tier, methods) != (rule_tier, rule_methods) or levels != [level for level in rule_levels if level in levels] \
                or levels[-1] != rule_levels[-1] or any(level[0] not in attempted for level in rule_levels if level not in levels):
            raise ValueError(f'{sid}: cell {cid} ladder differs from its V62 rule')
    layout, position, steps = pr.plan_layout(base, infos, recorded, pr.Soft(base), 128*1024**2)
    if layout != report['layout'] or steps != report['plan']['steps'] or sum(position.values()) != report['plan']['appliedSteps']:
        raise ValueError(f'{sid}: the V62 plan does not recompute to the recorded steps and layout')
    for cid, index in position.items():
        if list(recorded[cid][2][index]) != cells[cid]['priority']['level'] or cells[cid]['scale'] != recorded[cid][2][index][0]:
            raise ValueError(f'{sid}: cell {cid} level differs from the recomputed plan')
    _, first, _ = pr.fit(base, infos, recorded, pr.Soft(base), 128*1024**2)
    held = any(recorded[cid][0] == 'first-pose' and index > 0 for cid, index in first.items())
    if held and any(recorded[cid][0] != 'first-pose' and index != len(recorded[cid][2])-1 for cid, index in first.items()):
        raise ValueError(f'{sid}: a first-pose cell gave up budget while another cell could still give back')


def stroke_reviewed(sid, cell, item, review):
    """A tile accepted under the stroke gate must carry an accepting visual review of the redraw of its native pixels."""
    if (cell['priority'].get('gate') or {}).get('name') != 'stroke':
        return
    verdict = review.get(cell['id'], {})
    if verdict.get('verdict') != 'accepted' or verdict.get('inputRgbaSha256') != sha(item['native'].tobytes()):
        raise ValueError(f'{sid}: stroke-gate cell {cell["id"]} has no accepting visual review of its redraw')


def gated(sid, cell, native, tile, scale, gate_name):
    """Recompute a tile's native gate and require the recorded measurements and a pass of the recorded gate."""
    metrics = ai.gate_metrics(native, tile, scale)
    recorded = cell['priority']['gate']
    if recorded['name'] != gate_name or metrics != recorded['metrics'] or not ai.gate_passes(metrics, sg.GATE if gate_name == 'stroke' else ai.GATE):
        raise ValueError(f'{sid}: cell {cell["id"]} fails or differs from its recorded {gate_name} gate')
    return metrics


def priority_tile(sid, cell, item, gate_class, renders, published, scratch):
    """The image-orientation tile of a changed V62 cell, recomputed by its recorded method."""
    plan, native, base_mode, cid = cell['priority'], item['native'], item['cell']['mode'], cell['id']
    method, scale = plan['method'], plan['scale']
    gate_name = 'stroke' if gate_class == sg.STROKE_CLASS else 'v60'
    allowed = {'render': ('original-vector', ('original-vector',)), 'model': (ai.AI_MODE, (ai.AI_MODE, *RASTER)),
               'redraw': (rd.REDRAW_MODE, (rd.REDRAW_MODE, *RASTER)), 'ai-reduce': (ai.AI_MODE, (ai.AI_MODE,)),
               'redraw-reduce': (rd.REDRAW_MODE, (rd.REDRAW_MODE,)), 'native': ('retained-original-cell', (ai.AI_MODE, rd.REDRAW_MODE))}
    if method not in allowed or cell['mode'] != allowed[method][0] or base_mode not in allowed[method][1]:
        raise ValueError(f'{sid}: cell {cid} method {method} does not fit its modes')
    if method == 'native':
        return native
    if method == 'render':
        if cell.get('selected') != item['cell'].get('selected'):
            raise ValueError(f'{sid}: cell {cid} selected source changed')
        return renders[(cid, scale)]
    if method == 'model':
        # The pinned model is deterministic on the machine that built the atlas: run it again (a fresh cache) and
        # require the published tile; on another GPU or driver this fails and the cell must be rebuilt.
        if scale not in ai.SCALES:
            raise ValueError(f'{sid}: AI cell {cid} has an unsupported multiplier')
        output = ai.model_outputs({cid: native}, {cid: scale}, scratch/'model')[cid]
        if output['names'] != cell['aiUpscale']['modelOutputs'] or not np.array_equal(ai.tile_at(output, scale), published):
            raise ValueError(f'{sid}: AI cell {cid} does not recompute to its published tile with the pinned model')
        gated(sid, cell, native, published, scale, 'v60')
        return published
    if method == 'ai-reduce':
        tile = ai.reduce_premultiplied(rda.flip(item['tile']), item['scale']//scale)
        gated(sid, cell, native, tile, scale, 'v60')
        return tile
    requested = scale if method == 'redraw' else item['cell']['requestedScale']
    result = rd.redraw(native, requested, scratch/cid)
    if method == 'redraw-reduce':
        if not np.array_equal(ai.reduce_premultiplied(result['tile'], requested//item['scale']), rda.flip(item['tile'])):
            raise ValueError(f'{sid}: cell {cid} V61 redraw does not recompute to its base tile')
        tile = ai.reduce_premultiplied(result['tile'], requested//scale)
    else:
        record, tile = cell['redraw'], result['tile']
        svg = sha(result['svg'].encode()) if result.get('svg') else None
        if (result['class'] != record['class'] or result['method'] != record['method'] or record['gateClass'] != gate_class
                or sha(tile.tobytes()) != record['redrawRgbaSha256'] or svg != record['svgSha256']
                or (record['svgPath'] and sha((ROOT/record['svgPath']).read_bytes()) != svg)):
            raise ValueError(f'{sid}: redrawn cell {cid} does not recompute to its recorded class, pixels or SVG')
    gated(sid, cell, native, tile, scale, gate_name)
    return tile


def validate_priority_species(sid, cache, runtime):
    """A V62 report over its published base: the plan derived again, every changed tile recomputed by its method (a
    vector rendered again, a redraw redrawn, a reduction reduced, an AI tile re-gated), the stroke review, every other
    tile the base tile, and every atlas pixel and padding byte."""
    work = cache/'species'/sid
    report_bytes = (work/'report.json').read_bytes()
    report = json.loads(report_bytes)
    if (report['policy'] != pr.policy() or report['redraw'] != rd.method() or report['upscaler'] != ai.method()
            or report['gates'] != {'v60': ai.GATE, 'stroke': sg.GATE}):
        raise ValueError(f'{sid}: V62 policy, method or gate differs from the pinned one')
    _, layout, verification, budget = checked_outputs(sid, report, runtime)
    base = priority_base(sid, report)
    infos = pr.cell_infos(base)
    classes = pr.classify_targets(base, infos)
    check_plan(sid, report, base, infos, classes)
    review = pr.load_review().get(sid, {})
    with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
        atlas = np.asarray(image.convert('RGBA'))
    cells, by_id = {c['id']: c for c in report['cells']}, {item['id']: item for item in base['cells']}
    if atlas.shape[1::-1] != (layout['width'], layout['height']) or set(cells) != {p['id'] for p in layout['placements']} or set(cells) != set(by_id):
        raise ValueError(f'{sid}: atlas size or cell coverage is not exact')
    scratch = Path(tempfile.mkdtemp(prefix=f'priority-{sid}-', dir=work))
    try:
        renders = {}
        wanted = sorted((cid, c['scale']) for cid, c in cells.items() if c.get('priority', {}).get('method') == 'render')
        if wanted:
            renders = pr.render_vectors(base, wanted, scratch/'source')
        for placement in layout['placements']:
            cell, item = cells[placement['id']], by_id[placement['id']]
            x, y, width, height = placement['x'], placement['y'], placement['width'], placement['height']
            if cell.get('priority', {}).get('method', 'base') == 'base':
                if cell['mode'] != item['cell']['mode']:
                    raise ValueError(f'{sid}: cell {cell["id"]} mode differs from its base report')
                tile = item['tile']
            else:
                published = rda.flip(atlas[y:y+height, x:x+width])
                tile = rda.flip(priority_tile(sid, cell, item, classes.get(cell['id'], (None, None, None))[2], renders, published, scratch))
                stroke_reviewed(sid, cell, item, review)
            if tile.shape[1::-1] != (width, height) or sha(tile.tobytes()) != cell['outputRgbaSha256']:
                raise ValueError(f'{sid}: expected cell pixels changed')
            if not np.array_equal(np.pad(tile, ((2, 2), (2, 2), (0, 0)), mode='edge'), atlas[y-2:y+height+2, x-2:x+width+2]):
                raise ValueError(f'{sid}: atlas content or transparent RGBA padding differs')
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if not report['raised']:
        raise ValueError(f'{sid}: no raised cell')
    verification['actualAtlasContentAndRgbaPaddingExact'] = True
    entry = {key: report[key] for key in ('meta', 'atlas', 'atlasWidth', 'atlasHeight', 'metaSha256', 'atlasSha256')}
    audit = {'species': int(sid), 'kind': report['kind'], 'sourceSha256': report['sourceSha256'], 'counts': report['counts'],
             'reportSha256': sha(report_bytes), 'metaSha256': report['metaSha256'], 'atlasSha256': report['atlasSha256'],
             'base': {key: report['base'][key] for key in ('atlas', 'atlasSha256', 'reportSha256')},
             'atlasRgbaBytes': layout['rgbaBytes'], 'verification': verification, 'planRecomputed': True,
             'budgetPolicy': {**budget, 'actualDimensions': [layout['width'], layout['height']],
                              'actualDecodedBytes': layout['rgbaBytes'], 'sourceSizedExceptionUsed': False},
             'raised': sorted(report['raised'], key=int), 'givenBack': sorted(report['givenBack'], key=int),
             'strokeGateCells': report['strokeGateCells'],
             'gates': {c['id']: c['priority']['gate'] for c in cells.values() if (c.get('priority') or {}).get('gate')},
             'scaleCounts': {str(scale): sum(c['scale'] == scale for c in cells.values()) for scale in (1, 2, 4, 8, 16, 32)}}
    return entry, audit


def checked_outputs(sid, report, runtime):
    """Original inputs and outputs by digest, the exact UV-only metadata change, and the standard budget."""
    original_meta_bytes = (ROOT/'public'/runtime['meta'].lstrip('/')).read_bytes()
    original_atlas_path = ROOT/'public'/runtime['atlas'].lstrip('/')
    if (sha(original_meta_bytes) != report['originalMetadataSha256']
            or sha(original_atlas_path.read_bytes()) != report['originalAtlasSha256']):
        raise ValueError(f'{sid}: original runtime inputs changed')
    for key in ('meta', 'atlas'):
        if sha((ROOT/'public'/report[key].lstrip('/')).read_bytes()) != report[key+'Sha256']:
            raise ValueError(f'{sid}: output {key} digest changed')
    original = json.loads(gzip.decompress(original_meta_bytes))
    layout = report['layout']
    if json.loads(gzip.decompress((ROOT/'public'/report['meta'].lstrip('/')).read_bytes())) != remap_clip(original, layout):
        raise ValueError(f'{sid}: output contains changes beyond the exact UV remapping')
    budget = atlas_budget_policy(sid, original)
    if (layout['rgbaBytes'] != layout['width']*layout['height']*4 or max(layout['width'], layout['height']) > 8192
            or layout['rgbaBytes'] > budget['standardDecodedBytes']):
        raise ValueError(f'{sid}: output exceeds the standard memory/side budget')
    return original, layout, _verify(original, layout), budget


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', required=True, help='Explicit comma-separated reviewed candidate IDs')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v59')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    runtime_path = ROOT/'public/battle-animations/runtime-index.json'
    original_index = runtime_path.read_bytes()
    runtime = json.loads(original_index)['species']
    index_path = ROOT/'public/battle-animations/hd/runtime-index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'species': {}}
    audit_path = args.cache/'publication-validation.json'
    audit = json.loads(audit_path.read_text()) if audit_path.exists() else {'species': {}}
    staged = []
    cache = args.cache.resolve()
    for sid in sorted(set(args.ids.split(',')), key=int):
        kind = json.loads((cache/'species'/sid/'report.json').read_text()).get('kind')
        validate = {ai.KIND: validate_ai_species, rd.KIND: validate_redraw_species, pr.KIND: validate_priority_species}.get(kind, validate_species)
        entry, item = validate(sid, cache, runtime[sid])
        staged.append((sid, entry, item))
        print(json.dumps({'species': sid, 'validated': True, 'counts': item['counts'], 'rgbaMiB': item['atlasRgbaBytes']/1024**2}), flush=True)
    for sid, entry, item in staged:
        audit['species'][sid] = item
        if not args.check_only:
            index['species'][sid] = entry
    save(audit_path, audit)
    if not args.check_only:
        index['species'] = dict(sorted(index['species'].items(), key=lambda item: int(item[0])))
        save(index_path, index)
    if runtime_path.read_bytes() != original_index:
        raise ValueError('The original runtime index changed during publication')
    print(json.dumps({'validated': len(staged), 'published': 0 if args.check_only else len(staged), 'originalIndexUnchanged': True}))


if __name__ == '__main__':
    main()
