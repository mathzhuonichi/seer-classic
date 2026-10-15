#!/usr/bin/env python3
"""Validate reviewed local battle candidates and publish their optional HD index.

This verifies actual output pixels, source/render hashes, unchanged animation
data, and memory limits. It does not replace browser inspection or claim that a
retained bitmap contains newly recovered vector detail. Original assets and the
original runtime index remain unchanged.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from battle_hd_atlas_layout import remap_clip, _verify
from battle_hd_local_fidelity import local_color_comparison
from build_battle_hd_atlases import ROOT, VECTOR_MODES, SOURCE_RENDER_MODES, sha, native_cells, additional_candidates, bitmap_rectangle_proof
from recover_battle_shapes import save

ORIGINAL_BUDGET_EXCEPTIONS = {'375', '382', '431', '498', '502', '811', '1202'}


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
    if report['sourceSha256'] != sha(Path(source['sourcePath']).read_bytes()):
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
             'scaleCounts': {str(scale): sum(c['scale'] == scale for c in cells.values()) for scale in (1, 2, 4)}}
    return entry, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', required=True, help='Explicit comma-separated reviewed candidate IDs')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v44')
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
    for sid in sorted(set(args.ids.split(',')), key=int):
        entry, item = validate_species(sid, args.cache.resolve(), runtime[sid])
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
