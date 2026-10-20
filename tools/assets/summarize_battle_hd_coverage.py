#!/usr/bin/env python3
"""Write compact, source-pinned coverage for every original battle species.

Large cell reports and generated images remain ignored local artifacts. This
manifest records their hashes and separates source recovery, actual resolution
gain, successful validation, and runtime publication.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path

from battle_hd_ai_upscale import AI_MODE, GATE as AI_GATE, method as ai_method
from build_battle_hd_atlases import ROOT, VECTOR_MODES, SOURCE_RENDER_MODES, MAX_VECTOR_SCALE, bounds, sha
from audit_battle_hd_density import TARGET_DENSITY, reference_box_device_pixels
from recover_battle_shapes import save
from publish_battle_hd_atlases import ORIGINAL_BUDGET_EXCEPTIONS, atlas_budget_policy


def reason_group(reason):
    if reason.startswith('Source comparison score'):
        return 'Source RGBA comparison exceeded its limit'
    if reason.startswith('No original vector candidate'):
        return 'No compatible original vector bounds'
    if 'ambiguous' in reason.lower():
        return 'Distinct original candidates could not be distinguished'
    if 'native' in reason.lower() and ('comparison' in reason.lower() or 'gate' in reason.lower()):
        return 'Native-resolution source fidelity check failed'
    return reason or 'Original raster retained without a source-vector match'


def first_pose_ids(meta, layout):
    standby = next((s for s in meta['sequences'] if s['name'] == 'standby'), meta['sequences'][0])
    first = next((f for f in standby['frames'] if f['uvs']), {'uvs': []})
    used = {bounds(first['uvs'][i:i+8]) for i in range(0, len(first['uvs']), 8)}
    return {p['id'] for p in layout['placements'] if tuple(p['sourceUvBounds']) in used}


def report_cache(sid, caches, published):
    """The generation cache of a species: for a published species the one whose report produced its atlas, else the newest."""
    found = [cache for cache in caches if (cache/'species'/sid/'report.json').exists()]
    for cache in found:
        if sid in published and json.loads((cache/'species'/sid/'report.json').read_bytes())['atlas'] == published[sid]['atlas']:
            return cache
    return found[0] if found else caches[-1]


def read_caches(caches):
    """Per cache: its generation failures and its publication validation records."""
    def records(path, key):
        return json.loads(path.read_text()).get(key, {}) if path.exists() else {}
    return {cache: (records(cache/'atlas-manifest.json', 'failures'), records(cache/'publication-validation.json', 'species'))
            for cache in caches}


def kept_totals(item):
    """Aggregate contributions of an entry kept from the existing manifest: modes, resolutions, reasons, asset bytes."""
    modes, resolutions = Counter(item.get('counts', {})), Counter(item.get('resolutionCounts', {}))
    if item['state'] == 'candidate-failed-original-runtime':
        modes['retained-original-atlas-cell'] += item['originalRuntimeCells']
        resolutions['retained-original-atlas-cell:1x'] += item['originalRuntimeCells']
        return modes, resolutions, Counter(item['retainedReasonCounts']), 0
    size = sum((ROOT/'public'/item[key].lstrip('/')).stat().st_size for key in ('meta', 'atlas') if key in item)
    return modes, resolutions, Counter(item.get('retainedReasonCounts', {})), size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species to summarize again; the existing manifest keeps every other entry')
    parser.add_argument('--caches', type=Path, nargs='+',
                        default=[ROOT/'.cache/battle-hd-v60', ROOT/'.cache/battle-hd-v59', ROOT/'.cache/battle-hd-v44'],
                        help='Generation caches, newest first; the last one also holds the source recovery and override records')
    parser.add_argument('--output', type=Path, default=ROOT/'public/battle-animations/hd/manifest.json')
    parser.add_argument('--verify-hashes', action='store_true', help='Read every pinned source and generated atlas before writing')
    args = parser.parse_args()
    # Not resolved: a worktree may link .cache, and report paths stay relative to this checkout.
    caches = [cache.absolute() for cache in args.caches]
    original_index_path = ROOT/'public/battle-animations/runtime-index.json'
    original_index_bytes = original_index_path.read_bytes()
    runtime = json.loads(original_index_bytes)['species']
    hd_index_path = ROOT/'public/battle-animations/hd/runtime-index.json'
    hd_index_bytes = hd_index_path.read_bytes() if hd_index_path.exists() else b'{"species":{}}'
    published = json.loads(hd_index_bytes)['species']
    records = read_caches(caches)
    sources_path = caches[-1]/'source-manifest.json'
    overrides_path = caches[-1]/'runtime-overrides.json'
    overrides = json.loads(overrides_path.read_text()).get('species', {}) if overrides_path.exists() else {}
    species = {}
    status_counts, mode_counts, resolution_counts, native_reasons = Counter(), Counter(), Counter(), Counter()
    generated_bytes = 0
    refreshed = set(args.ids.split(',')) if args.ids else None
    kept = json.loads(args.output.read_text())['species'] if refreshed else {}
    for sid, original in sorted(runtime.items(), key=lambda item: int(item[0])):
        if refreshed is not None and sid not in refreshed:
            species[sid] = item = kept[sid]
            status_counts[item['state']] += 1
            modes, resolutions, reasons, size = kept_totals(item)
            mode_counts.update(modes)
            resolution_counts.update(resolutions)
            native_reasons.update(reasons)
            generated_bytes += size
            continue
        cache = report_cache(sid, caches, published)
        failures, validated = records[cache]
        work = cache/'species'/sid
        generation_failed = sid in failures and sid not in published
        source_path = work/'source.json'
        source = json.loads(source_path.read_text()) if source_path.exists() else None
        item = {'state': 'source-not-recovered'}
        if source:
            item.update(state='source-recovered-no-candidate', sourceSha256=source['sourceSha256'],
                        sourceShapeCount=len(source['shapes']), sourceMorphCount=len(source['morphCharacters']),
                        sourceBitmapCount=len(source['bitmapCharacters']))
            if args.verify_hashes and sha((ROOT / source['sourcePath']).read_bytes()) != source['sourceSha256']:
                raise ValueError(f'{sid}: official source digest changed')
        report_path = work/'report.json'
        prototype = sid == '346' and not report_path.exists()
        if prototype:
            report_path = ROOT/'.cache/battle-vector-prototype-346/prototype-report.json'
        # An independent override applies only while its own atlas is the published one (not a later V60 composition).
        own = report_path.exists() and sid in published and json.loads(report_path.read_bytes()).get('atlas') == published[sid]['atlas']
        override = overrides.get(sid) if sid in published and not own else None
        override_validation = None
        if override:
            report_path = ROOT/override['reportPath']
            validation_bytes = (ROOT/override['validationPath']).read_bytes()
            if (sha(report_path.read_bytes()) != override['reportSha256']
                    or sha(validation_bytes) != override['validationSha256']):
                raise ValueError(f'{sid}: independent runtime override provenance changed')
            override_validation = json.loads(validation_bytes)
        if report_path.exists() and not generation_failed:
            report_bytes = report_path.read_bytes()
            report = json.loads(report_bytes)
            cells = report['cells']
            original_meta = json.loads(gzip.decompress((ROOT/'public'/original['meta'].lstrip('/')).read_bytes()))
            first_ids = first_pose_ids(original_meta, report['layout'])
            first_all = [c for c in cells if c['id'] in first_ids]
            first = [c for c in first_all if c['mode'] != 'constant-original-rgba']
            counts = Counter(c['mode'] for c in cells)
            resolutions = Counter(f'{c["mode"]}:{c["scale"]}x' for c in cells)
            improved = sum(c['mode'] in VECTOR_MODES and c['scale'] > 1 for c in cells)
            improved_bitmaps = sum(c['mode'] == 'original-bitmap-source-recovery' and c['scale'] > 1 for c in cells)
            reconstructed_bitmaps = sum(c['mode'] == 'ai-source-bitmap' for c in cells)
            ai_upscaled = sum(c['mode'] == AI_MODE for c in cells)
            retained = [c for c in cells if c['mode'].startswith('retained-')]
            reasons = Counter(reason_group(c.get('reason', 'Native microstrip has insufficient source detail for a reliable match')) for c in retained)
            output = published[sid] if prototype else report
            for key in ('meta', 'atlas'):
                asset_path = ROOT/'public'/output[key].lstrip('/')
                if args.verify_hashes and sha(asset_path.read_bytes()) != output[key+'Sha256']:
                    raise ValueError(f'{sid}: generated {key} digest changed')
                generated_bytes += asset_path.stat().st_size
            item.update(
                state='candidate-awaiting-publication' if improved+improved_bitmaps else 'original-runtime-no-resolution-gain',
                counts=dict(counts), resolutionCounts=dict(resolutions), improvedVectorCells=improved,
                improvedSourceBitmapCells=improved_bitmaps,
                reconstructedBitmapCells=reconstructed_bitmaps, aiUpscaledCells=ai_upscaled,
                sourceAlternativeRecoveredCells=len(report.get('nativeGateRescuedCells', [])),
                nativeRetainedCells=len(retained), retainedReasonCounts=dict(reasons),
                firstPoseCells=len(first_all), firstPoseConstantCells=len(first_all)-len(first),
                firstPoseNonconstantCells=len(first), firstPoseVectorCells=sum(c['mode'] == 'original-vector' for c in first),
                firstPoseHigherResolutionCells=sum(c['mode'] in SOURCE_RENDER_MODES and c['scale'] > 1 for c in first),
                firstPoseAiReconstructedCells=sum(c['mode'] == 'ai-source-bitmap' for c in first),
                firstPoseAiUpscaledCells=sum(c['mode'] == AI_MODE for c in first),
                firstPoseNonconstantFullyAboveNative=bool(first) and all(c['scale'] > 1 for c in first),
                firstPoseNonconstantFullyPureVector=bool(first) and all(c['mode'] == 'original-vector' for c in first),
                firstPoseNonconstantFullyHigherResolution=bool(first) and all(c['mode'] in SOURCE_RENDER_MODES and c['scale'] > 1 for c in first),
                atlasWidth=report['layout']['width'], atlasHeight=report['layout']['height'],
                atlasRgbaBytes=report['layout']['rgbaBytes'],
                budgetPolicy={**atlas_budget_policy(sid, original_meta),
                              'actualDimensions': [report['layout']['width'], report['layout']['height']],
                              'actualDecodedBytes': report['layout']['rgbaBytes'],
                              'sourceSizedExceptionUsed': report['layout']['rgbaBytes'] > 128*1024**2},
                originalMetadataSha256=report.get('originalMetadataSha256') or sha((ROOT/'public'/original['meta'].lstrip('/')).read_bytes()),
                originalAtlasSha256=report.get('originalAtlasSha256') or sha((ROOT/'public'/original['atlas'].lstrip('/')).read_bytes()),
                meta=output['meta'], atlas=output['atlas'], metaSha256=output['metaSha256'], atlasSha256=output['atlasSha256'],
                reportPath=override['reportPath'] if override else ('.cache/battle-vector-prototype-346/prototype-report.json' if prototype else os.path.relpath(report_path, ROOT)),
                reportSha256=sha(report_bytes), reportRevision=report.get('revision', 'reviewed-prototype'),
            )
            if report.get('kind'):
                item['reportKind'] = report['kind']
            mode_counts.update(counts)
            if report.get('sourceSizedBudgetException'):
                item['sourceSizedBudgetException'] = report['sourceSizedBudgetException']
            resolution_counts.update(resolutions)
            native_reasons.update(reasons)
            if sid in validated:
                check = validated[sid]
                item['validatedPixelsAndMetadata'] = bool(
                    check.get('reportSha256') == item['reportSha256']
                    and check.get('metaSha256') == item['metaSha256']
                    and check.get('atlasSha256') == item['atlasSha256']
                    and check['verification'].get('actualAtlasContentAndRgbaPaddingExact'))
            if prototype:
                item['validatedPixelsAndMetadata'] = bool(report['verification'].get('everyPaddingRgbaPixelExact'))
            if override:
                source_only_path = work/'report.json'
                if (report.get('sourceOnlyReportSha256') != sha(source_only_path.read_bytes())
                        or report.get('sourceSha256') != source['sourceSha256']):
                    raise ValueError(f'{sid}: independent override is not based on the frozen original source report')
                check = override_validation
                item['validatedPixelsAndMetadata'] = bool(
                    check.get('reportSha256') == item['reportSha256']
                    and check.get('metaSha256') == item['metaSha256']
                    and check.get('atlasSha256') == item['atlasSha256']
                    and check['checks'].get('decodedAtlasContentAndRgbaPaddingEveryPixelExact')
                    and check['checks'].get('nonUvMetadataUnchanged')
                    and check['checks'].get('frozenNonAiCellPixelsUnchanged')
                    and check['checks'].get('originalSourceRegistrationAttributesUnchanged'))
                if not item['validatedPixelsAndMetadata']:
                    raise ValueError(f'{sid}: independent override lacks matching verified pixels and registration')
                item.update(runtimeOverrideKind=report['kind'], sourceOnlyReportSha256=report['sourceOnlyReportSha256'],
                            overrideValidationPath=override['validationPath'], overrideValidationSha256=override['validationSha256'])
            if sid in published:
                for key in ('meta', 'atlas', 'metaSha256', 'atlasSha256'):
                    if published[sid][key] != item[key]:
                        raise ValueError(f'{sid}: published entry differs from the reported candidate')
                item['state'] = 'published-hd'
        if generation_failed:
            item['state'] = 'candidate-failed-original-runtime'
            item['failure'] = failures[sid]['error']
            original_bytes = (ROOT/'public'/original['meta'].lstrip('/')).read_bytes()
            original_meta = json.loads(gzip.decompress(original_bytes))
            original_cells = len({bounds(frame['uvs'][offset:offset+8]) for sequence in original_meta['sequences']
                                  for frame in sequence['frames'] for offset in range(0, len(frame['uvs']), 8)})
            reason = 'Whole original atlas retained because candidate generation failed'
            item.update(originalRuntimeCells=original_cells, improvedVectorCells=0, improvedSourceBitmapCells=0,
                        nativeRetainedCells=original_cells, retainedReasonCounts={reason: original_cells},
                        originalMetadataSha256=sha(original_bytes),
                        originalAtlasSha256=sha((ROOT/'public'/original['atlas'].lstrip('/')).read_bytes()))
            mode_counts['retained-original-atlas-cell'] += original_cells
            resolution_counts['retained-original-atlas-cell:1x'] += original_cells
            native_reasons[reason] += original_cells
            if report_path.exists():
                item['previousCandidateReportSha256'] = sha(report_path.read_bytes())
        if sid in published and item['state'] != 'published-hd':
            raise ValueError(f'{sid}: published species has no traceable report')
        status_counts[item['state']] += 1
        species[sid] = item
    result = {
        'revision': 2, 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'originalSpeciesCount': len(runtime), 'originalRuntimeIndexSha256': sha(original_index_bytes),
        'hdRuntimeIndexSha256': sha(hd_index_bytes), 'sourceManifestSha256': sha(sources_path.read_bytes()) if sources_path.exists() else None,
        'states': dict(status_counts), 'cellModes': dict(mode_counts), 'cellResolutions': dict(resolution_counts),
        'retainedReasonCounts': dict(native_reasons), 'generatedAssetBytes': generated_bytes,
        'firstPoseNonconstantFullyHigherResolutionSpecies': sum(v.get('firstPoseNonconstantFullyHigherResolution', False) for v in species.values()),
        # Entries kept from an earlier summary have no AI cells; their source-rendered first pose answers the same question.
        'firstPoseNonconstantFullyAboveNativeSpecies': sum(
            v.get('firstPoseNonconstantFullyAboveNative', v.get('firstPoseNonconstantFullyHigherResolution', False)) for v in species.values()),
        'aiUpscaled': {'cells': sum(v.get('aiUpscaledCells', 0) for v in species.values()),
                       'firstPoseCells': sum(v.get('firstPoseAiUpscaledCells', 0) for v in species.values()),
                       'species': sum(v.get('aiUpscaledCells', 0) > 0 for v in species.values()),
                       'method': {key: ai_method()[key] for key in ('tool', 'release', 'archiveSha256', 'binarySha256', 'model',
                                                                    'modelParamSha256', 'modelBinSha256', 'alphaMode', 'eightTimesMode')},
                       'gate': AI_GATE},
        'fullyImprovedNonconstantSpecies': sum(v.get('improvedVectorCells', 0)+v.get('improvedSourceBitmapCells', 0) == sum(n for k,n in v.get('counts', {}).items() if k != 'constant-original-rgba') and v.get('improvedVectorCells', 0)+v.get('improvedSourceBitmapCells', 0) > 0 for v in species.values()),
        'limits': {'maxAtlasSide': 8192, 'standardDecodedAtlasBytes': 128*1024**2,
                   'sourceSizedExceptionMaximumBytes': 256*1024**2,
                   'sourceSizedExceptionSpecies': sorted(map(int, ORIGINAL_BUDGET_EXCEPTIONS)),
                   'sourceSizedExceptionCondition': 'Only these seven species with a verified original 8192-square atlas; actual output must not exceed original decoded bytes.',
                   'smallVectorScale': 4, 'largeVectorScale': 2,
                   'densityVectorScale': {'maximum': MAX_VECTOR_SCALE, 'targetTexelsPerDevicePixel': TARGET_DENSITY,
                                          'referenceBoxDevicePixels': reference_box_device_pixels()},
                   'nativeUnmatchedScale': 1, 'geometryTimingColorsAndLabels': 'Original metadata preserved; only UV coordinates and atlas dimensions change'},
        'recoveryBoundary': 'Source vectors can be regenerated from digest-pinned official SWFs and the recorded toolchain. Generated atlases and complete cell reports are ignored local artifacts; transfer them with the checkout or regenerate and validate them before using the optional HD index. Independently reviewed AI bitmap outputs are not byte-reproducible from a prompt and must be transferred with their matching provenance and generated artifacts.',
        'species': species,
    }
    if original_index_path.read_bytes() != original_index_bytes:
        raise ValueError('Original index changed during summary')
    save(args.output, result)
    keys = ('originalSpeciesCount', 'states', 'cellModes', 'firstPoseNonconstantFullyHigherResolutionSpecies',
            'firstPoseNonconstantFullyAboveNativeSpecies', 'generatedAssetBytes')
    print(json.dumps({key: result[key] for key in keys} | {'aiUpscaledCells': result['aiUpscaled']['cells']}))


if __name__ == '__main__':
    main()
