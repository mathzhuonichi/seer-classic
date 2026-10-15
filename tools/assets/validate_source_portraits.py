#!/usr/bin/env python3
"""Compare calibrated SVG pixels with direct original-SWF first-frame pixels.

Resizing is used only for comparison, never for delivered artwork. A filtered or
mixed-bitmap source is routed to a direct high-resolution SWF display-list render.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]


def silhouette(image):
    image = image.convert('RGBA')
    box = image.getchannel('A').getbbox()
    if not box:
        raise ValueError('Empty source silhouette')
    return image.crop(box)


def compare(first, second):
    first, second = silhouette(first), silhouette(second)
    aspect_error = abs((first.width / first.height) / (second.width / second.height) - 1)
    first, second = [image.resize((320, 320), Image.Resampling.LANCZOS) for image in (first, second)]
    masks = [image.getchannel('A').point(lambda p: 255 if p >= 16 else 0).convert('1') for image in (first, second)]
    intersection = sum(ImageChops.logical_and(*masks).histogram()[1:])
    union = sum(ImageChops.logical_or(*masks).histogram()[1:])
    errors = []
    for background in ((255, 255, 255), (0, 0, 0)):
        composites = []
        for image in (first, second):
            canvas = Image.new('RGB', image.size, background)
            canvas.paste(image, mask=image.getchannel('A'))
            composites.append(canvas)
        errors.append(sum(ImageStat.Stat(ImageChops.difference(*composites)).mean) / 3)
    return {'aspect_error': round(aspect_error, 5), 'alpha_iou_16': round(intersection / union, 5),
            'rgb_mae_white': round(errors[0], 4), 'rgb_mae_black': round(errors[1], 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/portrait-v44')
    args = parser.parse_args()
    cache = args.cache.resolve()
    target = cache / 'source-quality-report.json'
    previous = json.loads(target.read_text())['portraits'] if target.exists() else {}
    candidates = json.loads((cache / 'calibrated-candidates.json').read_text())['portraits']
    mixed_file = cache / 'mixed-candidates.json'
    if mixed_file.exists():
        candidates.update(json.loads(mixed_file.read_text())['portraits'])
    independent_file = cache / 'mixed-source-independent.json'
    independent = json.loads(independent_file.read_text()) if independent_file.exists() else {}
    classified_file = cache / 'mixed-classification/report.json'
    classified = json.loads(classified_file.read_text()) if classified_file.exists() else {}
    exports = json.loads((cache / 'full-export.json').read_text())['portraits']
    report = {'method': 'Independent FFDec raster versus resvg SVG; first named pet frame; crops normalized for comparison only.',
              'thresholds': {'aspect_error_max': .025, 'alpha_iou_16_min': .965, 'rgb_mae_max': 7.5}, 'portraits': {}}
    for sid, exported in exports.items():
        item = candidates.get(sid)
        old = previous.get(sid, {})
        candidate_sha = item.get('sha256') if item and not item.get('viewport_pending') else None
        if old.get('decision') not in (None, 'pending') and old.get('candidate_sha256') == candidate_sha and old.get('validation_revision') == 2:
            report['portraits'][sid] = old
            continue
        record = {'candidate_sha256': candidate_sha, 'validation_revision': 2}
        try:
            raw = cache / 'full/.cache/vector-export' / sid
            svg = next((raw / 'svg').rglob('1.svg')).read_text()
            record['source_filter_count'] = svg.count('<filter ')
            record['source_bitmap_count'] = svg.count('<image ')
            source_pngs = list((raw / 'png').rglob('1.png'))
            source = Image.open(source_pngs[0]).convert('RGBA') if source_pngs else None
            if classified.get(sid, {}).get('vectorAlphaCoverage', 1) < .5:
                record.update(decision='source-raster', reason='Original main-body layers are bitmaps; retain their native limit pending separately approved reconstruction.')
            elif not item or item.get('viewport_pending'):
                record.update(decision='source-render' if record['source_filter_count'] else 'pending',
                              reason='Preserve Flash filter appearance with a direct source render.' if record['source_filter_count'] else 'Native SVG calibration has not completed.')
            else:
                rendered = Image.open(cache / 'calibrated-renders' / f'{sid}.png').convert('RGBA')
                metrics = compare(source, rendered) if source else independent.get(sid)
                if not metrics:
                    raise ValueError('No independent source comparison available.')
                record['source_comparison'] = metrics
                passed = (metrics['aspect_error'] <= .025 and metrics['alpha_iou_16'] >= .965
                          and max(metrics['rgb_mae_white'], metrics['rgb_mae_black']) <= 7.5)
                record.update(decision=('mixed-vector' if record['source_bitmap_count'] else 'vector') if passed else 'source-render',
                              reason='Independent source raster and SVG agreement passed.' if passed else 'SVG rasterization differs from the original display-list renderer.')
            if old.get('h5_snapshot_comparison'):
                record['h5_snapshot_comparison'] = old['h5_snapshot_comparison']
            elif source:
                with Image.open(ROOT / 'public/portraits' / f'{sid}.png') as original:
                    record['h5_snapshot_comparison'] = compare(source, original)
        except Exception as error:
            record.update(decision='pending', reason=str(error))
        report['portraits'][sid] = record
    counts = {}
    for item in report['portraits'].values():
        counts[item['decision']] = counts.get(item['decision'], 0) + 1
    report['counts'] = counts
    target.with_suffix('.tmp').write_text(json.dumps(report, indent=2) + '\n')
    target.with_suffix('.tmp').replace(target)
    print(json.dumps(counts))


if __name__ == '__main__':
    main()
