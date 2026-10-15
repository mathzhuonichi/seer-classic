#!/usr/bin/env python3
"""Rebuild original battle UV cells from digest-pinned official vector shapes.

Preserves all pose, timing, color, material, and sequence data. Only UVs and atlas
dimensions change. Uncertain cells retain their original pixels with an explicit
reason. Generated files are candidates until a separate reviewed index publishes
them. No AI images, smoothing filters, or runtime-index edits are performed here.
"""
from __future__ import annotations

import argparse
import base64
import collections
import concurrent.futures
import gzip
import hashlib
import json
import math
import multiprocessing
from pathlib import Path
import re
import subprocess
import time
import io
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageOps

from battle_hd_atlas_layout import layout_atlas, remap_clip, _verify, _pack
from battle_hd_local_fidelity import local_color_comparison
from battle_sprite_candidates import inspect as prepare_sprite_candidates
from recover_battle_shapes import save

ROOT = Path(__file__).resolve().parents[2]
REVISION = 6
VECTOR_MODES = ('original-vector', 'original-vector-with-native-bitmap')
SOURCE_RENDER_MODES = (*VECTOR_MODES, 'original-bitmap-source-recovery')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def additional_candidates(work):
    result = []
    for name in ('morph-study', 'sprite-study'):
        path = work.parent.parent/name/work.name/'candidates.json'
        if path.exists():
            result.append({'path': str(path), 'sha256': sha(path.read_bytes())})
    return result


def generator_inputs():
    names = ('build_battle_hd_atlases.py', 'battle_hd_atlas_layout.py', 'battle_hd_local_fidelity.py',
             'render_battle_shape_candidates.mjs', 'battle_sprite_candidates.py', 'battle_sprite_candidates.mjs',
             'battle_morph_candidates.py', 'battle_morph_candidates.mjs')
    return {name: sha((ROOT/'tools/assets'/name).read_bytes()) for name in names}


def reusable(item, sid, entry, args):
    """Reuse only when source, candidates, policy, and actual outputs agree."""
    work = args.cache/'species'/sid
    candidate_path = work/'candidates.json'
    if (item.get('revision') != REVISION or item.get('maxRgbaMiB') != args.max_rgba_mib
            or item.get('generatorInputs') != generator_inputs()
            or not candidate_path.exists()
            or item.get('candidateManifestSha256') != sha(candidate_path.read_bytes())
            or item.get('candidateDependencies') != additional_candidates(work)):
        return False
    source = json.loads((work/'source.json').read_text())
    if item.get('sourceSha256') != source.get('sourceSha256'):
        return False
    for key, expected in [('meta', 'originalMetadataSha256'), ('atlas', 'originalAtlasSha256')]:
        if sha((ROOT/'public'/entry[key].lstrip('/')).read_bytes()) != item.get(expected):
            return False
    for key in ('meta', 'atlas'):
        path = ROOT/'public'/item[key].lstrip('/')
        if not path.exists() or sha(path.read_bytes()) != item.get(key+'Sha256'):
            return False
    return True


def feature(image, size=64):
    array = np.asarray(image.resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32)/255
    return np.concatenate((array[:, :, :3]*array[:, :, 3:], array[:, :, 3:]), axis=2)


def bounds(uv):
    if len(uv) != 8:
        raise ValueError('A source frame contains a partial UV quad')
    return min(uv[::2]), min(uv[1::2]), max(uv[::2]), max(uv[1::2])


def native_cells(meta, atlas):
    unique = sorted({bounds(f['uvs'][i:i+8]) for s in meta['sequences'] for f in s['frames'] for i in range(0, len(f['uvs']), 8)})
    standby = next((s for s in meta['sequences'] if s['name'] == 'standby'), meta['sequences'][0])
    first = next((f for f in standby['frames'] if f['uvs']), {'uvs': []})
    first_bounds = {bounds(first['uvs'][i:i+8]) for i in range(0, len(first['uvs']), 8)}
    rows, images = [], {}
    width, height = atlas.size
    for index, uv in enumerate(unique):
        pixels = [uv[0]*width, uv[1]*height, uv[2]*width, uv[3]*height]
        crop = [round(value) for value in pixels]
        if crop[2] <= crop[0] or crop[3] <= crop[1]:
            raise ValueError(f'Degenerate original UV crop {index}')
        image = ImageOps.flip(atlas.crop(crop))
        sid = str(index)
        images[sid] = image
        rows.append({'id': sid, 'sourceUvBounds': list(uv), 'sourcePixels': pixels,
                     'nativeSize': list(image.size), 'appearsInFirstStandbyPose': uv in first_bounds,
                     'originalRgbaSha256': sha(image.tobytes())})
    return rows, images


def bitmap_rectangle_proof(path):
    """Recognize a translated, one-to-one bitmap rectangle without vector art.

    Unknown compositions are deliberately not assigned a resolution claim.
    Image dimensions are read from the embedded PNG/JPEG bytes, not inferred
    from the SVG canvas, and nontranslation transforms are rejected.
    """
    root = ET.parse(path).getroot()
    elements = list(root.iter())
    local = lambda element: element.tag.rsplit('}', 1)[-1]
    if any(local(e) in ('filter', 'mask', 'clipPath', 'use', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text') for e in elements):
        return None
    images = [e for e in elements if local(e) == 'image']
    paths = [e for e in elements if local(e) == 'path']
    patterns = [e for e in elements if local(e) == 'pattern']
    if len(images) != 1 or len(paths) != 1 or len(patterns) != 1:
        return None
    for element in elements:
        if element.get('opacity') not in (None, '1', '1.0'):
            return None
        for attribute in ('transform', 'patternTransform'):
            transform = element.get(attribute)
            if not transform:
                continue
            match = re.fullmatch(r'matrix\(([^)]+)\)', transform.strip())
            if not match:
                return None
            values = [float(v) for v in re.split(r'[\s,]+', match.group(1).strip())]
            if len(values) != 6 or any(abs(a-b) > 1e-8 for a,b in zip(values[:4], [1,0,0,1])):
                return None
    image, shape, pattern = images[0], paths[0], patterns[0]
    if 'stroke' in shape.get('style', '') or 'url(#' not in shape.get('style', ''):
        return None
    commands = re.findall(r'[A-Za-z]', shape.get('d', ''))
    if any(command not in ('M', 'L', 'Z') for command in commands):
        return None
    numbers = [float(v) for v in re.findall(r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?', shape.get('d', ''))]
    if len(numbers) < 8 or len(numbers)%2:
        return None
    points = list(zip(numbers[::2], numbers[1::2]))
    xs, ys = sorted({p[0] for p in points}), sorted({p[1] for p in points})
    if len(xs) != 2 or len(ys) != 2 or set(points) != {(x,y) for x in xs for y in ys}:
        return None
    href = image.get('{http://www.w3.org/1999/xlink}href', image.get('href', ''))
    if not href.startswith('data:image/') or ';base64,' not in href:
        return None
    data = base64.b64decode(href.split(',', 1)[1], validate=True)
    with Image.open(io.BytesIO(data)) as embedded:
        intrinsic = embedded.size
    width, height = intrinsic
    if (abs((xs[-1]-xs[0])-width) > .01 or abs((ys[-1]-ys[0])-height) > .01
            or abs(float(image.get('width', 0))-width) > .01
            or abs(float(image.get('height', 0))-height) > .01
            or abs(float(pattern.get('width', 0))-width) > .01
            or abs(float(pattern.get('height', 0))-height) > .01):
        return None
    viewbox = [float(v) for v in re.split(r'[\s,]+', pattern.get('viewBox', '').strip())]
    if viewbox != [0, 0, width, height]:
        return None
    return {'kind': 'original-bitmap-rectangle', 'intrinsicSize': list(intrinsic), 'embeddedImageSha256': sha(data)}


def match_cells(cells, images, manifest, work):
    candidates = manifest['candidates']
    features = [feature(Image.open(work/'candidates'/f'{c["key"]}.png').convert('RGBA')) for c in candidates]
    for cell in cells:
        width, height = cell['nativeSize']
        native = images[cell['id']]
        rgba = np.asarray(native)
        if np.all(rgba == rgba[0, 0]):
            cell.update(mode='constant-original-rgba', reason='Every original RGBA pixel is identical; exact constant extension.')
            continue
        matching = []
        target = feature(native)
        for index, candidate in enumerate(candidates):
            sw, sh = candidate['nativeSize']
            fitted_ratio = (width*sw+height*sh)/(sw*sw+sh*sh)
            ratios = [.125, .25, .5, 1, 2, 4, fitted_ratio]
            error, ratio = min((max(abs(width-sw*ratio), abs(height-sh*ratio)), ratio) for ratio in ratios)
            if error > 2:
                continue
            score = float(np.abs(features[index]-target).mean())
            matching.append({**candidate, 'score': score, 'nativeScale': ratio, 'sizeError': error, '_index': index})
        matching.sort(key=lambda row: (row['score'], row['character'], row['key']))
        cell['candidates'] = [{k: v for k, v in row.items() if k != '_index'} for row in matching[:4]]
        if not matching:
            cell.update(mode='retained-original-cell', reason='No original vector candidate has compatible bounds.')
            continue
        chosen = matching[0]
        full = next((row for row in matching if row['kind'] == 'full-shape' and row['character'] == chosen['character'] and row['score'] <= chosen['score']+.001), None)
        if full:
            chosen = full
        # Low-resolution slivers have substantial antialiasing error; they need
        # a much stronger source match before a contour is safely substituted.
        limit = .11 if min(width, height) < 16 else .065
        if chosen['score'] > limit:
            cell.update(mode='retained-original-cell', reason=f'Source comparison score {chosen["score"]:.6f} exceeds {limit}.')
            continue
        ambiguous, separated = [], []
        for alternative in matching:
            # Different component groups of one Flash character can have
            # different expressions or contours. Only identical vector bytes
            # are the same state for this ambiguity test.
            same_source_state = alternative['candidateSvgSha256'] == chosen['candidateSvgSha256']
            if same_source_state or alternative['score'] > chosen['score']+.003:
                continue
            difference = float(np.abs(features[chosen['_index']]-features[alternative['_index']]).mean())
            if difference > .002:
                selected_round = [math.floor(v*chosen['nativeScale']+.5) for v in chosen['nativeSize']]
                alternative_round = [math.floor(v*alternative['nativeScale']+.5) for v in alternative['nativeSize']]
                differing_region = np.abs(features[chosen['_index']]-features[alternative['_index']]).mean(2) > .02
                chosen_error = float(np.abs(features[chosen['_index']]-target)[differing_region].mean()) if differing_region.any() else 0
                alternative_error = float(np.abs(features[alternative['_index']]-target)[differing_region].mean()) if differing_region.any() else 0
                evidence = {'key': alternative['key'], 'candidateDifference': difference, 'score': alternative['score'],
                            'differingRegionPixels': int(differing_region.sum()), 'selectedRegionError': chosen_error,
                            'alternativeRegionError': alternative_error}
                if selected_round == cell['nativeSize'] and alternative_round != cell['nativeSize']:
                    separated.append({**evidence, 'reason': 'Only the selected candidate rounds to the original cell dimensions.'})
                elif differing_region.any() and chosen_error+.01 <= alternative_error:
                    separated.append({**evidence, 'reason': 'Original pixels distinguish the local expression or contour difference.'})
                else:
                    ambiguous.append(evidence)
        if separated:
            cell['localCandidateSeparation'] = separated
        if ambiguous:
            cell.update(mode='retained-original-cell', reason='Distinct source candidates have ambiguous comparison scores.', ambiguities=ambiguous)
            continue
        if chosen['hasBitmap']:
            proof = bitmap_rectangle_proof(work/'candidates'/f'{chosen["key"]}.svg')
            if proof:
                available = min(proof['intrinsicSize'][0]/width, proof['intrinsicSize'][1]/height)
                multiplier = next((scale for scale in (4, 2) if scale <= available+1e-6), 1)
                cell['bitmapSourceProof'] = {**proof, 'maximumNativeRecoveryScale': multiplier}
                if multiplier == 1:
                    cell.update(mode='retained-original-cell', reason='Original bitmap has no additional native pixels above the Unity cell resolution.')
                    continue
                cell['mode'] = 'original-bitmap-source-recovery'
            else:
                cell.update(mode='retained-original-cell', reason='Embedded bitmap composition has no proven higher native detail; preserve original pixels.')
                continue
        else:
            cell['mode'] = 'original-vector'
        cell['selected'] = {key: value for key, value in chosen.items() if key != '_index'}
        cell['reason'] = ('Original embedded bitmap contains additional native pixels lost in the Unity cell.'
                          if cell['mode'] == 'original-bitmap-source-recovery'
                          else 'Original vector geometry matched by dimensions and premultiplied RGBA comparison.')


def pack_with_budget(cells, max_bytes):
    for cell in cells:
        w, h = cell['nativeSize']
        cell['scale'] = (4 if max(w, h) <= 256 else 2) if cell['mode'] in VECTOR_MODES else (4 if cell['mode'] == 'constant-original-rgba' and max(w, h) <= 256 else 1)
        if cell['mode'] == 'original-bitmap-source-recovery':
            cell['scale'] = cell['bitmapSourceProof']['maximumNativeRecoveryScale']
        while max(w, h)*cell['scale']+4 > 8192 and cell['scale'] > 1:
            cell['scale'] //= 2
        cell['requestedScale'] = cell['scale']
    reductions = []
    while True:
        rows = [{'id': c['id'], 'width': c['nativeSize'][0]*c['scale'], 'height': c['nativeSize'][1]*c['scale'], 'sourceUvBounds': c['sourceUvBounds']} for c in cells]
        try:
            area = sum((r['width']+4)*(r['height']+4) for r in rows)
            pixels = max_bytes//4
            if area > pixels:
                raise ValueError('Padded content exceeds budget before packing')
            min_width = max(r['width']+4 for r in rows)
            min_height = max(r['height']+4 for r in rows)
            side = math.ceil(math.sqrt(area)/256)*256
            widths = list(dict.fromkeys(max(min_width, min(8192, w)) for w in (side, 4096, 8192, 2048, math.ceil(min_width/256)*256)))
            attempted = []
            for order in [sorted(rows, key=lambda r: (-max(r['width'], r['height']), -r['width']*r['height'], r['id'])),
                          sorted(rows, key=lambda r: (-r['width']*r['height'], -max(r['width'], r['height']), r['id']))]:
                for width in widths:
                    height = min(8192, pixels//width)
                    if min_height > height or width > 8192:
                        continue
                    attempted.append([width, height])
                    fast = _pack(order, width, height, 2)
                    if fast is not None and fast['rgbaBytes'] <= max_bytes:
                        fast.update(packingStrategy='Budget-bounded MaxRects first successful candidate', attemptedCanvasSizes=attempted)
                        return fast, reductions
            return layout_atlas(rows, max_side=8192, max_rgba_bytes=max_bytes), reductions
        except ValueError:
            available = [c for c in cells if c['scale'] > 1]
            if not available:
                raise ValueError('Even the retained native cells do not fit the configured single-page budget.')
            # Preserve first-pose parts and small-body resolution before large
            # transient effects. Every reduction remains in the audit record.
            choice = max(available, key=lambda c: (not c['appearsInFirstStandbyPose'], max(c['nativeSize']) > 256, c['nativeSize'][0]*c['nativeSize'][1]*c['scale']**2, c['id']))
            before = choice['scale']
            choice['scale'] //= 2
            reductions.append({'cell': choice['id'], 'from': before, 'to': choice['scale'], 'reason': 'Single-page decoded RGBA budget or 8192-pixel side limit.'})
            if choice['mode'] == 'original-bitmap-source-recovery' and choice['scale'] == 1:
                choice['mode'] = 'retained-original-cell'
                choice['reason'] = 'Atlas budget leaves no native-bitmap resolution gain; preserve original pixels.'
                choice.pop('selected', None)


def native_comparison(reference_image, rendered_image, is_body):
    reference = np.asarray(reference_image, dtype=np.float32)/255
    rendered = np.asarray(rendered_image, dtype=np.float32)/255
    alpha_a, alpha_b = reference[:, :, 3], rendered[:, :, 3]
    foreground = (alpha_a > 16/255) | (alpha_b > 16/255)
    intersection = (alpha_a > 16/255) & (alpha_b > 16/255)
    iou = float(intersection.sum()/max(1, foreground.sum()))
    black = np.abs(reference[:, :, :3]*alpha_a[:, :, None]-rendered[:, :, :3]*alpha_b[:, :, None])
    white = np.abs(reference[:, :, :3]*alpha_a[:, :, None]+1-alpha_a[:, :, None]-(rendered[:, :, :3]*alpha_b[:, :, None]+1-alpha_b[:, :, None]))
    error = max(float(black[foreground].mean()*255), float(white[foreground].mean()*255)) if foreground.any() else 0
    opaque = (alpha_a > .95) & (alpha_b > .95)
    opaque_error = float(np.abs(reference[:, :, :3]-rendered[:, :, :3])[opaque].mean()*255) if opaque.any() else None
    comparison = {'alphaIoU16': iou, 'foregroundBlackWhiteRgbMae': error, 'opaqueRgbMae': opaque_error}
    # Sparse one-pixel contours are dominated by the source rasterizer's
    # antialiasing phase. Their dimensional match and candidate score carry
    # the source identity check; larger opaque bodies have stricter gates.
    passes = (iou >= (.88 if is_body else .50) and error <= (22 if is_body else 55)
              and (opaque_error is None or opaque_error <= 18))
    local = local_color_comparison(np.asarray(reference_image), np.asarray(rendered_image))
    return comparison, local, passes and local['passed']

def compare_native(cells, images, work):
    rejected = []
    for cell in cells:
        if cell['mode'] not in SOURCE_RENDER_MODES:
            continue
        rendered = Image.open(work/'rendered'/f'{cell["id"]}-1x.png').convert('RGBA')
        comparison, local, passes = native_comparison(images[cell['id']], rendered,
            cell['appearsInFirstStandbyPose'] and min(cell['nativeSize']) >= 24)
        cell['nativeComparison'] = comparison
        cell['localColorComparison'] = local
        if not passes:
            rejected.append(cell['id'])
            cell['failedSourceSelection'] = cell['selected']
            cell['failedSourceComparison'] = {'nativeComparison': comparison, 'localColorComparison': local}
            cell['mode'] = 'retained-original-cell'
            cell['reason'] = ('Native-size source render changed a connected stable interior color region.'
                              if not local['passed'] else 'Native-size source render failed the recorded silhouette/color gate.')
            cell.pop('selected', None)
    return rejected


def retry_local_candidates(cells, images, work, source):
    """Try bounded original alternatives after a local-color mismatch.

    Each alternative must pass the same native silhouette, global color, and
    stable-interior checks. Multiple visibly distinct passing alternatives are
    still ambiguous and retain the original pixels.
    """
    requests, pending = [], []
    for cell in cells:
        if (cell['mode'] != 'retained-original-cell' or cell.get('localColorComparison', {}).get('passed', True)
                or not cell.get('failedSourceSelection')):
            continue
        limit = .11 if min(cell['nativeSize']) < 16 else .065
        alternatives = [candidate for candidate in cell.get('candidates', [])
                        if candidate['key'] != cell['failedSourceSelection']['key']
                        and not candidate['hasBitmap'] and candidate['score'] <= limit]
        if not alternatives:
            continue
        pending.append((cell, alternatives))
        requests.extend({'id': f'{cell["id"]}--{candidate["key"]}', 'nativeSize': cell['nativeSize'],
                         'mode': 'original-vector', 'scale': 1, 'selected': candidate}
                        for candidate in alternatives)
    if not requests:
        return []
    path = work/'native-alternatives.json'
    save(path, {'sourceSha256': source['sourceSha256'], 'species': source['species'], 'cells': requests})
    subprocess.run(['node', str(ROOT/'tools/assets/render_battle_shape_candidates.mjs'), 'render', str(work), str(path)],
                   check=True, stdout=subprocess.DEVNULL, timeout=180)
    rescued = []
    for cell, alternatives in pending:
        reviews, passing = [], []
        for candidate in alternatives:
            rendered = Image.open(work/'rendered'/f'{cell["id"]}--{candidate["key"]}-1x.png').convert('RGBA')
            comparison, local, passed = native_comparison(images[cell['id']], rendered,
                cell['appearsInFirstStandbyPose'] and min(cell['nativeSize']) >= 24)
            review = {'key': candidate['key'], 'candidateSvgSha256': candidate['candidateSvgSha256'],
                      'nativeComparison': comparison, 'localColorComparison': local, 'passed': passed}
            reviews.append(review)
            if passed:
                passing.append((candidate, review, rendered))
        cell['nativeAlternativeReview'] = reviews
        if not passing:
            continue
        chosen, review, rendered = passing[0]
        target = feature(rendered)
        distinct = [{'key': alternative['key'], 'difference': float(np.abs(feature(other)-target).mean())}
                    for alternative, _, other in passing[1:]]
        distinct = [item for item in distinct if item['difference'] > .002]
        if distinct:
            cell['nativeAlternativeAmbiguities'] = distinct
            cell['reason'] = 'Distinct source alternatives pass local checks but cannot be safely distinguished.'
            continue
        cell.update(mode='original-vector', selected=chosen, nativeComparison=review['nativeComparison'],
                    localColorComparison=review['localColorComparison'],
                    reason='An original source alternative passed all native fidelity gates after the initial candidate failed its local color check.')
        rescued.append(cell['id'])
    return rescued


def compose(cells, images, layout, work):
    canvas = Image.new('RGBA', (layout['width'], layout['height']))
    by_id = {c['id']: c for c in cells}
    for placement in layout['placements']:
        cell = by_id[placement['id']]
        width, height = placement['width'], placement['height']
        if cell['mode'] in SOURCE_RENDER_MODES:
            tile = Image.open(work/'rendered'/f'{cell["id"]}-{cell["scale"]}x.png').convert('RGBA')
        else:
            tile = images[cell['id']].resize((width, height), Image.Resampling.NEAREST)
        if tile.size != (width, height):
            raise ValueError('Selected render does not match its atlas placement')
        tile = ImageOps.flip(tile)
        padded = np.pad(np.asarray(tile), ((2, 2), (2, 2), (0, 0)), mode='edge')
        x, y = placement['x']-2, placement['y']-2
        canvas.paste(Image.fromarray(padded), (x, y))
        decoded = np.asarray(canvas.crop((x, y, x+width+4, y+height+4)))
        if not np.array_equal(decoded, padded):
            raise ValueError('Content or RGBA edge extrusion was changed during composition')
        cell['outputPixels'] = [width, height]
        cell['outputRgbaSha256'] = sha(tile.tobytes())
    return canvas


def build(sid, entry, args):
    started = time.monotonic()
    work = args.cache/'species'/sid
    source = json.loads((work/'source.json').read_text())
    source_raw = Path(source['sourcePath']).read_bytes()
    if sha(source_raw) != source['sourceSha256']:
        raise ValueError('Pinned official source digest has changed')
    prepare_sprite_candidates(int(sid), args.cache)
    subprocess.run(['node', str(ROOT/'tools/assets/render_battle_shape_candidates.mjs'), 'prepare', str(work)], check=True, stdout=subprocess.DEVNULL, timeout=120)
    candidates = json.loads((work/'candidates.json').read_text())
    original_bytes = (ROOT/'public'/entry['meta'].lstrip('/')).read_bytes()
    meta = json.loads(gzip.decompress(original_bytes))
    atlas_path = ROOT/'public'/entry['atlas'].lstrip('/')
    with Image.open(atlas_path) as source_image:
        atlas = source_image.convert('RGBA')
    if atlas.size != (meta['atlasWidth'], meta['atlasHeight']):
        raise ValueError('Original atlas dimensions disagree with original metadata')
    cells, native = native_cells(meta, atlas)
    match_cells(cells, native, candidates, work)
    layout, reductions = pack_with_budget(cells, args.max_rgba_mib*1024**2)
    selection = {'revision': REVISION, 'species': int(sid), 'sourceSha256': source['sourceSha256'], 'cells': cells}
    selection_path = work/'selected-cells.json'
    save(selection_path, selection)
    renderer = ['node', str(ROOT/'tools/assets/render_battle_shape_candidates.mjs'), 'render', str(work), str(selection_path)]
    subprocess.run(renderer, check=True, stdout=subprocess.DEVNULL, timeout=180)
    rejected = compare_native(cells, native, work)
    rescued = retry_local_candidates(cells, native, work, source)
    rejected = [sid for sid in rejected if sid not in rescued]
    if rejected or rescued:
        layout, second_reductions = pack_with_budget(cells, args.max_rgba_mib*1024**2)
        reductions.extend(second_reductions)
        save(selection_path, selection)
        subprocess.run(renderer, check=True, stdout=subprocess.DEVNULL, timeout=180)
    canvas = compose(cells, native, layout, work)
    verification = _verify(meta, layout)
    verification['contentAndPaddingEveryRgbaPixelExact'] = True
    modified = remap_clip(meta, layout)
    args.output.mkdir(parents=True, exist_ok=True)
    atlas_output = args.output/f'{sid}-v44.png'
    meta_output = args.output/f'{sid}-v44.json.gz'
    canvas.save(atlas_output)
    meta_output.write_bytes(gzip.compress(json.dumps(modified, separators=(',', ':')).encode(), mtime=0))
    counts = dict(collections.Counter(cell['mode'] for cell in cells))
    resolution_counts = dict(collections.Counter(f'{cell["mode"]}:{cell["scale"]}x' for cell in cells))
    first = [c for c in cells if c['appearsInFirstStandbyPose'] and max(c['nativeSize']) > 4]
    pure_first = bool(first) and all(c['mode'] in ('original-vector', 'constant-original-rgba') for c in first)
    report = {'revision': REVISION, 'species': int(sid), 'sourceSha256': source['sourceSha256'],
              'generatorInputs': generator_inputs(),
              'candidateManifestSha256': sha((work/'candidates.json').read_bytes()),
              'candidateDependencies': additional_candidates(work), 'maxRgbaMiB': args.max_rgba_mib,
              'originalMetadataSha256': sha(original_bytes), 'originalAtlasSha256': sha(atlas_path.read_bytes()),
              'sourceMorphCharacters': source['morphCharacters'], 'sourceBitmapCharacters': source['bitmapCharacters'],
              'counts': counts, 'resolutionCounts': resolution_counts,
              'firstStandbyPoseFullyOriginalVector': pure_first,
              'firstStandbyPoseFullyHigherResolution': bool(first) and all(c['mode'] in VECTOR_MODES and c['scale'] > 1 for c in first),
              'publicationState': 'candidate-awaiting-reviewed-index', 'layout': layout, 'scaleReductions': reductions,
              'nativeGateRejectedCells': rejected, 'nativeGateRescuedCells': rescued, 'verification': verification, 'cells': cells,
              'meta': '/'+str(meta_output.relative_to(ROOT/'public')), 'atlas': '/'+str(atlas_output.relative_to(ROOT/'public')),
              'atlasWidth': canvas.width, 'atlasHeight': canvas.height,
              'metaSha256': sha(meta_output.read_bytes()), 'atlasSha256': sha(atlas_output.read_bytes()),
              'atlasFileBytes': atlas_output.stat().st_size, 'elapsedSeconds': round(time.monotonic()-started, 3)}
    save(work/'report.json', report)
    save(selection_path, selection)
    return report


def attempt_build(sid, entry, args):
    """A worker writes only its species directory and unique output filenames."""
    try:
        return sid, build(sid, entry, args), None
    except Exception as error:
        return sid, None, str(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated IDs; omitted means every exported species')
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v44')
    parser.add_argument('--output', type=Path, default=ROOT/'public/battle-animations/hd')
    parser.add_argument('--max-rgba-mib', type=int, default=128)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--skip-ids', default='', help='Comma-separated candidates currently under independent review')
    parser.add_argument('--jobs', type=int, default=1, choices=(1, 2), help='Independent per-species processes; only the parent writes the aggregate manifest')
    args = parser.parse_args()
    args.cache = args.cache.resolve()
    args.output = args.output.absolute()
    runtime = json.loads((ROOT/'public/battle-animations/runtime-index.json').read_text())['species']
    ids = sorted(set(args.ids.split(',')) if args.ids else (p.name for p in (args.cache/'species').iterdir() if (p/'source.json').exists()), key=int)
    published_path = ROOT/'public/battle-animations/hd/runtime-index.json'
    published = set(json.loads(published_path.read_text()).get('species', {})) if published_path.exists() else set()
    skip = published | set(filter(None, args.skip_ids.split(',')))
    ids = [sid for sid in ids if sid not in skip]
    manifest_path = args.cache/'atlas-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'revision': REVISION, 'species': {}, 'failures': {}}
    pending = [sid for sid in ids if not (args.resume and sid in manifest['species'] and reusable(manifest['species'][sid], sid, runtime[sid], args))]
    def accept(number, sid, report, error):
        if error is None:
            manifest['species'][sid] = {key: value for key, value in report.items() if key not in ('cells', 'layout', 'scaleReductions')}
            manifest['species'][sid]['rgbaBytes'] = report['layout']['rgbaBytes']
            manifest['failures'].pop(sid, None)
            print(json.dumps({'species': sid, 'counts': report['counts'], 'firstPoseVector': report['firstStandbyPoseFullyOriginalVector'], 'rgbaMiB': report['layout']['rgbaBytes']/1024**2, 'seconds': report['elapsedSeconds']}), flush=True)
        else:
            manifest['failures'][sid] = {'error': error}
            print(json.dumps({'species': sid, 'error': error}), flush=True)
        manifest['lastRunCompleted'] = number
        manifest['lastRunRequested'] = len(pending)
        save(manifest_path, manifest)
    if args.jobs == 1:
        for number, sid in enumerate(pending, 1):
            accept(number, *attempt_build(sid, runtime[sid], args))
    else:
        with concurrent.futures.ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context('spawn')) as pool:
            futures = [pool.submit(attempt_build, sid, runtime[sid], args) for sid in pending]
            for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
                accept(number, *future.result())


if __name__ == '__main__':
    main()
