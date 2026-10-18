#!/usr/bin/env python3
"""Once-only independent index/manifest audit after generation/publication freeze.

Reads every published asset digest and PNG dimensions, joins the runtime index
to its verified source report, checks complete classification and strict memory
exceptions, and verifies the one accepted AI override. Does not repeat pixel
reconstruction tests or browser pose reviews.
"""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import time

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
EXCEPTIONS = {'375', '382', '431', '498', '502', '811', '1202'}
STANDARD_BYTES, EXCEPTION_BYTES = 128*1024**2, 256*1024**2
VECTOR_MODES = {'original-vector', 'original-vector-with-native-bitmap'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    with path.open('rb') as stream:
        result = hashlib.file_digest(stream, 'sha256').hexdigest()
    return result


def load(path):
    return json.loads(path.read_bytes())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def public_path(url, hd=False):
    prefix = '/battle-animations/hd/' if hd else '/battle-animations/'
    require(isinstance(url, str) and url.startswith(prefix), f'Unexpected asset URL: {url}')
    require('?' not in url and '#' not in url and '..' not in Path(url).parts, f'Unsafe asset URL: {url}')
    return ROOT/'public'/url.lstrip('/')


def png_size(path):
    with path.open('rb') as stream:
        header = stream.read(24)
    require(header[:8] == b'\x89PNG\r\n\x1a\n' and header[12:16] == b'IHDR', f'Expected PNG: {path}')
    return list(struct.unpack('>II', header[16:24]))


def original_image_size(path):
    # The restored runtime uses WebP atlases; published HD atlases are PNG.
    # Reading the image header avoids expanding these large source textures.
    with Image.open(path) as image:
        return list(image.size)


def meta_header(path):
    # Exact whole-file hashes below link the remaining animation content to the
    # publication validator. Only the top-level load identity is needed here.
    with gzip.open(path, 'rt') as stream:
        prefix = stream.read(8192)
    return {key: int(re.search(r'"'+key+r'"\s*:\s*(\d+)', prefix).group(1))
            for key in ('petId', 'atlasWidth', 'atlasHeight')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frozen', action='store_true', required=True,
                        help='Required acknowledgment that every producer and publisher is frozen')
    parser.add_argument('--baseline', default='00a93ec')
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/battle-animation-hd-v44/final-index-audit.json')
    args = parser.parse_args()
    started = time.monotonic()
    paths = {'originalIndex': ROOT/'public/battle-animations/runtime-index.json',
             'hdIndex': ROOT/'public/battle-animations/hd/runtime-index.json',
             'manifest': ROOT/'public/battle-animations/hd/manifest.json',
             'overrides': ROOT/'.cache/battle-hd-v44/runtime-overrides.json',
             'publicationValidation': ROOT/'.cache/battle-hd-v44/publication-validation.json'}
    raw = {key: path.read_bytes() for key, path in paths.items()}
    original = json.loads(raw['originalIndex'])['species']
    hd = json.loads(raw['hdIndex'])['species']
    manifest = json.loads(raw['manifest'])
    overrides = json.loads(raw['overrides'])['species']
    validation = json.loads(raw['publicationValidation'])['species']
    baseline = subprocess.check_output(['git', 'show', args.baseline+':public/battle-animations/runtime-index.json'], cwd=ROOT)
    require(raw['originalIndex'] == baseline, 'Original runtime index changed from the restoration baseline')
    require(len(original) == 1483, 'Expected the complete 1483-species original catalog')
    require(manifest['originalSpeciesCount'] == len(original), 'Manifest catalog count differs')
    require(set(manifest['species']) == set(original), 'Coverage manifest does not exactly cover the original catalog')
    require(set(hd) <= set(original), 'HD index contains unknown species')
    require(set(overrides) == {'910'}, 'Independent override whitelist must contain only species 910')
    require(manifest['originalRuntimeIndexSha256'] == digest(raw['originalIndex']), 'Manifest original-index hash is stale')
    require(manifest['hdRuntimeIndexSha256'] == digest(raw['hdIndex']), 'Manifest HD-index hash is stale')
    limits = manifest['limits']
    require(set(map(str, limits['sourceSizedExceptionSpecies'])) == EXCEPTIONS, 'Memory exception whitelist differs')
    require(limits['standardDecodedAtlasBytes'] == STANDARD_BYTES and limits['sourceSizedExceptionMaximumBytes'] == EXCEPTION_BYTES,
            'Manifest memory limits differ from the authorized policy')
    require(limits['maxAtlasSide'] == 8192, 'Unexpected texture side limit')
    states, modes, resolutions = Counter(), Counter(), Counter()
    seen_urls, exception_rows, largest = set(), [], []
    checks = 0
    for ordinal, (sid, item) in enumerate(sorted(manifest['species'].items(), key=lambda pair: int(pair[0])), 1):
        state = item['state']
        require(state in {'published-hd', 'original-runtime-no-resolution-gain', 'candidate-failed-original-runtime'},
                f'{sid}: generation or classification is unfinished at final freeze')
        states[state] += 1
        require((sid in hd) == (state == 'published-hd'), f'{sid}: runtime publication and coverage state disagree')
        if sid in EXCEPTIONS and sid not in hd:
            original_dimensions = original_image_size(public_path(original[sid]['atlas']))
            header = meta_header(public_path(original[sid]['meta']))
            require(original_dimensions == [8192, 8192] == [header['atlasWidth'], header['atlasHeight']],
                    f'{sid}: original fallback does not prove the pinned exception budget')
            exception_rows.append({'species': int(sid), 'publishedHd': False, 'usesOriginalFallback': True,
                                   'originalDimensions': original_dimensions, 'originalDecodedBytes': EXCEPTION_BYTES,
                                   'actualDimensions': original_dimensions, 'actualDecodedBytes': EXCEPTION_BYTES,
                                   'noIncreaseFromOriginal': True})
        if state == 'candidate-failed-original-runtime':
            require(bool(item.get('failure')), f'{sid}: fallback has no recorded failure reason')
            count = item['originalRuntimeCells']
            modes['retained-original-atlas-cell'] += count
            resolutions['retained-original-atlas-cell:1x'] += count
        if 'reportPath' not in item:
            require(sid not in hd, f'{sid}: published species has no source report')
            for key in ('meta', 'atlas'):
                require(public_path(original[sid][key]).is_file(), f'{sid}: original fallback file is missing')
            continue
        report_path = ROOT/item['reportPath']
        require(sha_file(report_path) == item['reportSha256'], f'{sid}: report hash differs')
        report = load(report_path)
        prototype = sid == '346' and item['reportPath'] == '.cache/battle-vector-prototype-346/prototype-report.json'
        counts = Counter(cell['mode'] for cell in report['cells'])
        resolution = Counter(f'{cell["mode"]}:{cell["scale"]}x' for cell in report['cells'])
        require(dict(counts) == item['counts'] and dict(resolution) == item['resolutionCounts'], f'{sid}: cell classification counts differ')
        modes.update(counts)
        resolutions.update(resolution)
        require(item['improvedVectorCells'] == sum(c['mode'] in VECTOR_MODES and c['scale'] > 1 for c in report['cells']), f'{sid}: vector-resolution classification differs')
        require(item['improvedSourceBitmapCells'] == sum(c['mode'] == 'original-bitmap-source-recovery' and c['scale'] > 1 for c in report['cells']), f'{sid}: source-bitmap resolution classification differs')
        require(item['reconstructedBitmapCells'] == counts['ai-source-bitmap'], f'{sid}: AI reconstruction classification differs')
        require(item['nativeRetainedCells'] == sum(c['mode'].startswith('retained-') for c in report['cells']), f'{sid}: retained-cell classification differs')
        require(sid == '910' or not counts['ai-source-bitmap'], f'{sid}: unexpected AI bitmap outside accepted override')
        require(len({c['id'] for c in report['cells']}) == len(report['cells']), f'{sid}: duplicate cell IDs')
        require({c['id'] for c in report['cells']} == {p['id'] for p in report['layout']['placements']}, f'{sid}: layout cell coverage differs')
        if sid not in hd:
            require(state == 'original-runtime-no-resolution-gain', f'{sid}: unresolved candidate remains at final freeze')
            continue
        entry = hd[sid]
        require(item.get('validatedPixelsAndMetadata') is True, f'{sid}: published candidate lacks completed validation')
        for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256'):
            require(entry[key] == item[key], f'{sid}: index/manifest {key} differs')
            if prototype:
                if key in ('meta', 'atlas'):
                    require(entry[key] == report[key+'Path'], f'{sid}: reviewed prototype {key} URL differs')
            else:
                require(entry[key] == report[key], f'{sid}: index/report {key} differs')
        for key in ('meta', 'atlas'):
            path = public_path(entry[key], hd=True)
            require(entry[key] not in seen_urls, f'{sid}: asset URL aliases another species')
            seen_urls.add(entry[key])
            require(sha_file(path) == entry[key+'Sha256'], f'{sid}: published {key} bytes differ')
        dimensions = png_size(public_path(entry['atlas'], hd=True))
        require(dimensions == [entry['atlasWidth'], entry['atlasHeight']] == [item['atlasWidth'], item['atlasHeight']], f'{sid}: PNG/index dimensions differ')
        require(dimensions == [report['layout']['width'], report['layout']['height']], f'{sid}: PNG/report layout dimensions differ')
        header = meta_header(public_path(entry['meta'], hd=True))
        require(header == {'petId': int(sid), 'atlasWidth': dimensions[0], 'atlasHeight': dimensions[1]}, f'{sid}: loader metadata identity/dimensions differ')
        decoded = dimensions[0]*dimensions[1]*4
        require(decoded == item['atlasRgbaBytes'] == report['layout']['rgbaBytes'], f'{sid}: decoded-byte accounting differs')
        require(all(isinstance(v, int) and 0 < v <= 8192 for v in dimensions), f'{sid}: invalid atlas side')
        original_dimensions = original_image_size(public_path(original[sid]['atlas']))
        original_header = meta_header(public_path(original[sid]['meta']))
        require(original_dimensions == [original_header['atlasWidth'], original_header['atlasHeight']], f'{sid}: original budget dimensions differ')
        original_bytes = original_dimensions[0]*original_dimensions[1]*4
        eligible = sid in EXCEPTIONS and original_dimensions == [8192, 8192]
        budget = EXCEPTION_BYTES if eligible else STANDARD_BYTES
        require(decoded <= budget, f'{sid}: unauthorized decoded-atlas size')
        if sid in EXCEPTIONS:
            require(eligible and decoded <= original_bytes, f'{sid}: exception increased original decoded memory')
            proof = report.get('sourceSizedBudgetException')
            require(proof is not None, f'{sid}: exception has no explicit proof')
            require(set(map(str, proof['allowedSpecies'])) == EXCEPTIONS, f'{sid}: exception proof broadens whitelist')
            require(proof['originalDimensions'] == original_dimensions and proof['originalDecodedBytes'] == original_bytes,
                    f'{sid}: exception original dimensions/bytes proof differs')
            require(proof['actualDimensions'] == dimensions and proof['actualDecodedBytes'] == decoded,
                    f'{sid}: exception output dimensions/bytes proof differs')
            exception_rows.append({'species': int(sid), 'publishedHd': True, 'originalDimensions': original_dimensions,
                                   'originalDecodedBytes': original_bytes, 'actualDimensions': dimensions,
                                   'actualDecodedBytes': decoded, 'noIncreaseFromOriginal': True})
        else:
            require(decoded <= STANDARD_BYTES, f'{sid}: non-whitelisted atlas exceeds 128 MiB')
        if sid == '910':
            override = overrides[sid]
            require(override['reportPath'] == item['reportPath'] and override['reportSha256'] == item['reportSha256'], '910: independent report descriptor differs')
            check_path = ROOT/override['validationPath']
            require(sha_file(check_path) == override['validationSha256'], '910: independent verification hash differs')
            check = load(check_path)
            require(counts == {'original-vector': 8, 'retained-original-cell': 17, 'ai-source-bitmap': 1}, '910: accepted subset changed')
            require(report['visualAcceptance']['acceptedBitmapIds'] == [19], '910: unaccepted AI part entered runtime')
            require(check['reportSha256'] == item['reportSha256'], '910: verification names another report')
            require(check['checks']['browserAndVisualAcceptance'] and check['checks']['frozenNonAiCellPixelsUnchanged'], '910: accepted evidence is incomplete')
            provenance = load(ROOT/'public/battle-animations/hd/910-ai-provenance-v44.json')
            require(provenance['reportSha256'] == item['reportSha256'] and provenance['validationSha256'] == override['validationSha256'], '910: portable provenance names another report')
            accepted = provenance['acceptedAiPart']
            require(sha_file(public_path(accepted['acceptedPng'], hd=True)) == accepted['acceptedPngSha256'], '910: transferred accepted AI PNG differs')
            frozen = ROOT/'.cache/battle-hd-v44/species/910/report.json'
            require(sha_file(frozen) == report['sourceOnlyReportSha256'], '910: source-only report changed')
            for key in ('meta', 'atlas'):
                old = load(frozen)
                require(sha_file(public_path(old[key], hd=True)) == old[key+'Sha256'], '910: source-only output changed')
        elif prototype:
            require(report['verification'].get('everyPaddingRgbaPixelExact') is True
                    and report['verification'].get('nonUvMetadataUnchanged') is True,
                    '346: reviewed prototype lacks its exact padding/metadata verification')
        else:
            check = validation.get(sid, {})
            require(all(check.get(key) == item[key] for key in ('reportSha256', 'metaSha256', 'atlasSha256')),
                    f'{sid}: publication-validation record differs')
            require(check.get('verification', {}).get('actualAtlasContentAndRgbaPaddingExact') is True, f'{sid}: pixel validation is missing')
        largest.append({'species': int(sid), 'width': dimensions[0], 'height': dimensions[1], 'rgbaBytes': decoded})
        checks += 1
        if ordinal % 200 == 0:
            print(json.dumps({'inspectedSpecies': ordinal, 'publishedEntriesVerified': checks}), flush=True)
    require(dict(states) == manifest['states'], 'Aggregate species state counts differ')
    require(dict(modes) == manifest['cellModes'], 'Aggregate cell mode counts differ')
    require(dict(resolutions) == manifest['cellResolutions'], 'Aggregate cell resolution counts differ')
    require({str(item['species']) for item in exception_rows} == EXCEPTIONS, 'Not all seven exception species were verified')
    for key, path in paths.items():
        require(path.read_bytes() == raw[key], f'{key} changed during the final audit')
    source_paths = ['src/presentation/battle-animation.ts', 'src/presentation/battle-animation-loader.ts',
                    'src/presentation/battle-clip-pool.ts', 'src/components/battle/creature-animation-mount.ts']
    result = {'passed': True, 'scope': 'Final frozen catalog/index/manifest/assets/loader-input audit; no repeated pixel reconstruction or browser pose review.',
        'originalSpecies': len(original), 'publishedSpecies': len(hd), 'states': dict(states),
        'cellModes': dict(modes), 'indexAndManifestDigests': {key: digest(value) for key, value in raw.items()},
        'originalIndexByteIdenticalToBaseline': args.baseline, 'publishedAssetDigestsAndPngDimensionsVerified': checks,
        'runtimeMetadataIdentityAndDimensionsVerified': checks, 'budgetExceptions': exception_rows,
        'largestPublishedAtlases': sorted(largest, key=lambda item: -item['rgbaBytes'])[:10],
        'auditedRuntimeSources': {path: sha_file(ROOT/path) for path in source_paths},
        'loaderReview': {'indexImportsOnlyJson': True, 'perSpeciesAssetRequests': True,
                         'preloadUniqueSpeciesLimit': 2, 'serializedPoolLoads': True,
                         'idleEntriesLimit': 2, 'idleBytesLimit': 32*1024**2, 'idleMilliseconds': 15000,
                         'basis': 'Direct source review of the hashed runtime modules; previously passed loader/lifecycle fixtures were not repeated.'},
        'limitations': ['Source/atlas pixel validation is linked through exact report and whole-asset hashes; this audit does not rerender every cell.',
                       'GPU/browser review is representative, not individual certification of all catalog species.',
                       'Decoded atlas byte limits exclude geometry, compressed blobs, tile overlap, framebuffers and browser/driver overhead.'],
        'elapsedSeconds': round(time.monotonic()-started, 3)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'passed': True, 'originalSpecies': len(original), 'publishedSpecies': len(hd),
                      'exceptionsVerified': len(exception_rows), 'output': str(args.output),
                      'elapsedSeconds': result['elapsedSeconds']}, indent=2))


if __name__ == '__main__':
    main()
