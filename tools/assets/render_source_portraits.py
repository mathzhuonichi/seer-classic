#!/usr/bin/env python3
"""Render original SWF display lists directly at 4x for faithful filter handling.

This does not enlarge the H5 PNG. Embedded source bitmaps retain their original
information limit and are reported separately from source vector geometry.
All outputs are candidates until the publication step accepts their validation.
"""
import argparse
import concurrent.futures
import hashlib
import json
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from export_vector_portraits import pet_character, BASE
from validate_source_portraits import compare

ROOT = Path(__file__).resolve().parents[2]


def render(sid, args, reason):
    source = args.cache / 'sources' / f'{sid}.swf'
    data = source.read_bytes()
    symbol = pet_character(data)
    work = args.cache / 'source-render-work' / sid
    work.mkdir(parents=True, exist_ok=True)
    raw = args.cache / 'full/.cache/vector-export' / sid
    outputs = list((raw / 'png').rglob('1.png')) if args.scale == 2 else list((work / 'png4x').rglob('1.png'))
    if not outputs:
        subprocess.run([str(args.java), '-Xmx512m', '-Djava.awt.headless=true',
                        '-Dapple.awt.UIElement=true', '-jar', str(args.ffdec), '-cli',
                        '-selectid', str(symbol), '-select', f'{symbol}:1', '-format', 'sprite:png',
                        '-zoom', str(args.scale), '-export', 'sprite', str(work / f'png{args.scale}x'), str(source)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        outputs = list((work / f'png{args.scale}x').rglob('1.png'))
    if len(outputs) != 1:
        raise ValueError('Missing or ambiguous direct source render')
    with Image.open(outputs[0]) as image:
        image = image.convert('RGBA')
        bounds = image.getchannel('A').getbbox()
        if not bounds:
            raise ValueError('Empty original first-pose render')
        left, top, right, bottom = bounds
        cropped = image.crop((left - args.scale, top - args.scale, right + args.scale, bottom + args.scale))
    source_png = list((raw / 'png').rglob('1.png'))
    comparison = None
    if source_png:
        with Image.open(source_png[0]) as original:
            comparison = compare(original, cropped)
        if not (comparison['aspect_error'] <= .025 and comparison['alpha_iou_16'] >= .965
                and max(comparison['rgb_mae_white'], comparison['rgb_mae_black']) <= 10):
            raise ValueError(f'2x/4x source renderer comparison failed: {comparison}')
    bitmap_sizes = []
    source_svgs = list((raw / 'svg').rglob('1.svg'))
    if source_svgs:
        for element in ET.parse(source_svgs[0]).getroot().iter():
            if element.tag.rsplit('}', 1)[-1] == 'image':
                bitmap_sizes.append([element.get('width'), element.get('height')])
    destination = args.cache / 'source-render-candidates' / f'{sid}.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(destination, optimize=True)
    return {
        'path': f'/portraits/source-renders/{sid}.png', 'source': f'{BASE}{sid}.swf',
        'source_sha256': hashlib.sha256(data).hexdigest(),
        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'bytes': destination.stat().st_size, 'width': cropped.width, 'height': cropped.height,
        'alpha_bounds': [args.scale, args.scale, cropped.width - args.scale * 2, cropped.height - args.scale * 2],
        'symbol': symbol, 'frame': 1, 'source_render_scale': args.scale,
        'format': 'Original mixed-source display-list render' if bitmap_sizes else 'Original vector display-list render',
        'embedded_bitmap_sizes': bitmap_sizes, 'selection_reason': reason,
        'resolution_statement': (f'Original bitmap fills retain their native detail; source vector layers are rendered directly at {args.scale}x.'
                                 if bitmap_sizes else f'Original vector display list rendered directly at {args.scale}x; no H5 raster enlargement.'),
        'exporter': 'JPEXS FFDec 26.3.0; static sprite display-list export',
        'quality_verified': comparison is not None, 'source_scale_comparison': comparison,
        'comparison_basis': ('Direct original 2x export pixel preservation; 4x rejected for scale-sensitive effects.'
                             if args.scale == 2 else 'Direct 2x versus direct 4x original display-list render.'),
        'bounds_method': f'Direct {args.scale}x source PNG alpha, cropped with {args.scale} pixels (one source unit) of transparent padding.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/portrait-v44')
    parser.add_argument('--java', type=Path, required=True)
    parser.add_argument('--ffdec', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=1)
    parser.add_argument('--scale', type=int, choices=(2, 4), default=4)
    parser.add_argument('--quality-report', type=Path)
    args = parser.parse_args()
    args.cache, args.java, args.ffdec = [value.resolve() for value in (args.cache, args.java, args.ffdec)]
    decisions = json.loads(args.quality_report.read_text())['portraits'] if args.quality_report else {}
    ids = args.ids or [sid for sid, row in decisions.items() if row['decision'] == 'source-render']
    manifest_path = args.cache / 'source-render-candidates/manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'portraits': {}, 'failures': {}}
    ids = [sid for sid in ids if sid not in manifest['portraits']]
    started = time.monotonic()
    def attempt(sid):
        try:
            return sid, render(sid, args, decisions.get(sid, {}).get('reason', 'Explicit source-filter validation.'))
        except Exception as error:
            return sid, {'error': str(error)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 3))) as pool:
        for sid, item in pool.map(attempt, ids):
            group = 'failures' if 'error' in item else 'portraits'
            manifest[group][sid] = item
            if group == 'portraits':
                manifest['failures'].pop(sid, None)
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.with_suffix('.tmp').write_text(json.dumps(manifest, indent=2) + '\n')
            manifest_path.with_suffix('.tmp').replace(manifest_path)
            print(f'{sid}: {group}; {time.monotonic() - started:.1f}s', flush=True)
    print(f'{len(manifest["portraits"])} direct source renders; {len(manifest["failures"])} failures')


if __name__ == '__main__':
    main()
