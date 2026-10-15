#!/usr/bin/env python3
"""Recover seven pinned battle atlases within their original 256 MiB budget.

Run after the normal two-worker catalog batch. This narrow postprocess does not
publish the runtime index or generalize the larger budget to any other species.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import time
from types import SimpleNamespace

from PIL import Image

from battle_hd_atlas_layout import layout_atlas, remap_clip, _verify
from build_battle_hd_atlases import ROOT, build, compose, native_cells, sha
from publish_battle_hd_atlases import ORIGINAL_BUDGET_EXCEPTIONS, atlas_budget_policy
from recover_battle_shapes import save


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', default=','.join(sorted(ORIGINAL_BUDGET_EXCEPTIONS, key=int)))
    parser.add_argument('--cache', type=Path, default=ROOT/'.cache/battle-hd-v44')
    args = parser.parse_args()
    ids = set(args.ids.split(','))
    if not ids or not ids <= ORIGINAL_BUDGET_EXCEPTIONS:
        parser.error('Only the seven explicitly pinned original-budget species are eligible')
    args.cache = args.cache.resolve()
    original_index_path = ROOT/'public/battle-animations/runtime-index.json'
    original_index_bytes = original_index_path.read_bytes()
    runtime = json.loads(original_index_bytes)['species']
    index_path = ROOT/'public/battle-animations/hd/runtime-index.json'
    index_bytes = index_path.read_bytes()
    published = json.loads(index_bytes)['species']
    if ids & set(published):
        parser.error('Published outputs are frozen; remove them from this candidate-only command')
    aggregate_path = args.cache/'atlas-manifest.json'
    aggregate = json.loads(aggregate_path.read_text())
    for sid in sorted(ids, key=int):
        started = time.monotonic()
        original = json.loads(gzip.decompress((ROOT/'public'/runtime[sid]['meta'].lstrip('/')).read_bytes()))
        policy = atlas_budget_policy(sid, original)
        if not policy['pinnedSourceSizedExceptionEligible']:
            raise ValueError(f'{sid}: original metadata does not prove an 8192-square atlas')
        with Image.open(ROOT/'public'/runtime[sid]['atlas'].lstrip('/')) as image:
            if list(image.size) != [8192, 8192]:
                raise ValueError(f'{sid}: actual original atlas is not 8192 square')
        report = build(sid, runtime[sid], SimpleNamespace(cache=args.cache,
            output=ROOT/'public/battle-animations/hd', max_rgba_mib=256))
        # The normal generator chooses a bounded fast packing. For this small,
        # explicit exception set, search every existing width/order candidate
        # once at the accepted cell resolutions and retain the smallest result.
        rows = [{key: p[key] for key in ('id', 'width', 'height', 'sourceUvBounds')}
                for p in report['layout']['placements']]
        optimized = layout_atlas(rows, max_side=8192, max_rgba_bytes=policy['allowedDecodedBytes'])
        previous_layout = report['layout']
        if optimized['rgbaBytes'] < previous_layout['rgbaBytes']:
            with Image.open(ROOT/'public'/runtime[sid]['atlas'].lstrip('/')) as image:
                _, native = native_cells(original, image.convert('RGBA'))
            canvas = compose(report['cells'], native, optimized, args.cache/'species'/sid)
            canvas.save(ROOT/'public'/report['atlas'].lstrip('/'))
            modified = remap_clip(original, optimized)
            (ROOT/'public'/report['meta'].lstrip('/')).write_bytes(gzip.compress(json.dumps(modified, separators=(',', ':')).encode(), mtime=0))
            report['layout'] = optimized
        layout = report['layout']
        if layout['rgbaBytes'] > policy['originalDecodedBytes'] or max(layout['width'], layout['height']) > 8192:
            raise ValueError(f'{sid}: repacked output increased the original decoded-atlas budget')
        layout['packingStrategy'] = 'Smallest decoded-byte result from original width/order search or bounded initial pack'
        report.update(atlasWidth=layout['width'], atlasHeight=layout['height'],
                      verification={**_verify(original, layout), 'contentAndPaddingEveryRgbaPixelExact': True})
        for key in ('meta', 'atlas'):
            output = ROOT/'public'/report[key].lstrip('/')
            report[key+'Sha256'] = sha(output.read_bytes())
        report['atlasFileBytes'] = (ROOT/'public'/report['atlas'].lstrip('/')).stat().st_size
        report['sourceSizedBudgetException'] = {
            **policy, 'allowedSpecies': sorted(map(int, ORIGINAL_BUDGET_EXCEPTIONS)),
            'actualDimensions': [layout['width'], layout['height']], 'actualDecodedBytes': layout['rgbaBytes'],
            'initialCandidateDimensions': [previous_layout['width'], previous_layout['height']],
            'initialCandidateDecodedBytes': previous_layout['rgbaBytes'],
            'reason': 'This pinned species already used an original 8192-square 256 MiB atlas; the candidate must not exceed it.',
        }
        relative = 'tools/assets/recover_original_budget_battles.py'
        report['postprocessInputs'] = {relative: sha((ROOT/relative).read_bytes())}
        report['exceptionElapsedSeconds'] = round(time.monotonic()-started, 3)
        save(args.cache/'species'/sid/'report.json', report)
        aggregate['species'][sid] = {key:value for key,value in report.items() if key not in ('cells', 'layout', 'scaleReductions')}
        aggregate['species'][sid]['rgbaBytes'] = layout['rgbaBytes']
        aggregate['failures'].pop(sid, None)
        save(aggregate_path, aggregate)
        print(json.dumps({'species':sid, 'counts':report['counts'], 'originalRgbaMiB':256,
                          'actualRgbaMiB':layout['rgbaBytes']/1024**2,
                          'seconds':report['exceptionElapsedSeconds']}), flush=True)
    if original_index_path.read_bytes() != original_index_bytes or index_path.read_bytes() != index_bytes:
        raise ValueError('An animation index changed during the candidate-only exception pass')


if __name__ == '__main__':
    main()
