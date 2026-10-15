#!/usr/bin/env python3
"""Publish complete, hash-verified source frames after numeric and visual review."""
from pathlib import Path
from PIL import Image
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--quality-report', type=Path, required=True)
    parser.add_argument('--review-report', type=Path, required=True)
    args = parser.parse_args()
    main_path = ROOT / 'public/battle-effects/manifest.json'
    original_bytes = main_path.read_bytes()
    manifest = json.loads(original_bytes)
    quality = json.loads(args.quality_report.read_text())
    review = json.loads(args.review_report.read_text())
    quality_rows = {str(row['id']): row for row in quality['effects']}
    review_rows = {str(row['id']): row for row in review['effects']}
    if quality['summary']['pending'] or quality['summary']['blankMismatches']:
        raise ValueError('Incomplete source comparison or a blank-frame mismatch blocks publication.')
    if set(quality_rows) != set(manifest['effects']):
        raise ValueError('Quality evidence must cover every published effect.')
    rows = {}
    copies = []
    for sid, effect in manifest['effects'].items():
        directory = args.candidates / sid
        row = json.loads((directory / 'report.json').read_text())
        if sha((args.sources / f'{sid}.swf').read_bytes()) != effect['sourceSha256']:
            raise ValueError(f'{sid}: original source does not match the established manifest.')
        for field in ('sourceUrl', 'sourceSha256', 'sourceSymbol', 'sourceViewport', 'fps', 'representativeFrame'):
            if row[field] != effect[field]:
                raise ValueError(f'{sid}: changed original {field}.')
        if row['originalFrames'] != effect['frames'] or [f['n'] for f in row['frames']] != list(range(effect['frames'])):
            raise ValueError(f'{sid}: changed source frame sequence.')
        if not row.get('fixedViewportNormalization') and not row.get('viewportNormalization'):
            raise ValueError(f'{sid}: fixed-viewport normalization is not documented.')
        if row.get('filteredPlacements') and row.get('boxBlurPixelsLimit') != 1_000_000_000:
            raise ValueError(f'{sid}: original filter radii are not preserved.')
        dimensions = {(f['width'], f['height']) for f in row['frames']}
        if len(dimensions) != 1 or max(next(iter(dimensions))) != 2048:
            raise ValueError(f'{sid}: unexpected fixed frame dimensions.')
        q = quality_rows[sid]
        if q['frames'] != effect['frames']:
            raise ValueError(f'{sid}: quality comparison missed source frames.')
        if q['reviewFrames'] and (review_rows.get(sid, {}).get('decision') != 'accepted'
                                  or not review_rows[sid].get('reason')):
            raise ValueError(f'{sid}: flagged source differences need a recorded visual decision.')
        for frame in row['frames']:
            source = directory / f"{frame['n']}.webp"
            data = source.read_bytes()
            if sha(data) != frame['sha256'] or len(data) != frame['bytes']:
                raise ValueError(f'{sid}/{frame["n"]}: candidate bytes changed after export.')
            with Image.open(source) as image:
                if image.format != 'WEBP' or image.size != (frame['width'], frame['height']):
                    raise ValueError(f'{sid}/{frame["n"]}: invalid frame image.')
            if data[12:16] != b'VP8L':
                raise ValueError(f'{sid}/{frame["n"]}: a frame is not lossless WebP.')
            copies.append((source, ROOT / 'public/battle-effects/hd' / sid / source.name))
        frame_hash = sha(''.join(f"{f['n']}:{f['sha256']}\n" for f in row['frames']).encode())
        width, height = next(iter(dimensions))
        effect['hd'] = dict(path=f'/battle-effects/hd/{sid}', width=width, height=height, sha256=frame_hash)
        row['sha256'] = frame_hash
        row['path'] = effect['hd']['path']
        row['quality'] = {key: value for key, value in q.items() if key != 'metrics'}
        row['visualReview'] = review_rows.get(sid, dict(decision='not-flagged'))
        rows[sid] = row
    # All evidence is checked before writing any public asset or enabling HD.
    if main_path.read_bytes() != original_bytes:
        raise ValueError('The shared manifest changed during validation; rerun against its current state.')
    for source, destination in copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    publication = dict(schema=1, source=manifest['source'], actionScriptExecuted=False,
                       export='Direct static original SWF display-list raster at a 2048-pixel longest edge; lossless individual WebP frames.',
                       filterPolicy='Per-command FFDec boxBlurPixelsLimit=1000000000 retains source blur/glow radii.',
                       bitmapLimit='Embedded source bitmaps retain their native detail; no generated artwork or sharpening is applied.',
                       frameHashFormat='SHA-256 of UTF-8 lines: frameIndex:frameSha256 followed by a newline.',
                       runtimeBudget=dict(decodedFrames=3, maximumEdge=2048, decodedPixelsMiB=48,
                                          canvasPixelsMiB=16, compressedCacheMiB=16),
                       qualityReportSha256=sha(args.quality_report.read_bytes()),
                       visualReviewSha256=sha(args.review_report.read_bytes()),
                       effects=rows, summary=dict(effects=len(rows), frames=len(copies),
                                                 encodedBytes=sum(row['encodedBytes'] for row in rows.values())))
    (ROOT / 'public/battle-effects/hd/manifest.json').write_text(json.dumps(publication, indent=2) + '\n')
    main_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(publication['summary']))


if __name__ == '__main__':
    main()
