#!/usr/bin/env python3
"""Stage original skill SWF frames at high resolution; never publish automatically.

The default Flash blur performance limit reduces filter radii on large renders.
The per-command override below retains source filter parameters without changing
saved FFDec settings. Review the staged frames against a source-scale reference
before publishing; embedded source bitmaps retain their original detail limit.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import argparse
import hashlib
import json
import math
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
FILTER_LIMIT = 1_000_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


def export(sid, effect, args):
    source = args.sources / f'{sid}.swf'
    if not source.exists():
        request = urllib.request.Request(effect['sourceUrl'], headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(request, timeout=30).read()
        if digest(data) != effect['sourceSha256']:
            raise ValueError(f'{sid}: official source hash changed')
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(data)
    if digest(source.read_bytes()) != effect['sourceSha256']:
        raise ValueError(f'{sid}: cached source hash changed')
    scale = args.source_scale or args.max_edge / max(effect['sourceViewport'])
    output = args.output / sid
    output.mkdir(parents=True, exist_ok=True)
    target = output / 'report.json'
    if target.exists():
        old = json.loads(target.read_text())
        if (old.get('sourceSha256') == effect['sourceSha256'] and old.get('scale') == scale
                and old.get('boxBlurPixelsLimit') == FILTER_LIMIT and len(old['frames']) == effect['frames']
                and old.get('viewportNormalization')
                and all((output / f"{frame['n']}.webp").exists()
                        and digest((output / f"{frame['n']}.webp").read_bytes()) == frame['sha256']
                        for frame in old['frames'])):
            return old
    command = [str(args.java), '-Dapple.awt.UIElement=true', '-Djava.awt.headless=true',
               '-Xmx384m', '-jar', str(args.ffdec), '-cli', '-config', f'boxBlurPixelsLimit={FILTER_LIMIT}',
               '-selectid', str(effect['sourceSymbol']), '-ignorebackground', '-format', 'sprite:png',
               '-zoom', str(scale), '-export', 'sprite', str(output / 'raw'), str(source)]
    started = time.monotonic()
    with (output / 'export.log').open('wb') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    pngs = sorted((output / 'raw').rglob('*.png'), key=lambda path: int(path.stem))
    if [int(path.stem) for path in pngs] != list(range(1, effect['frames'] + 1)):
        raise ValueError(f'{sid}: original frame sequence is incomplete')
    frames = []
    for png in pngs:
        index = int(png.stem) - 1
        with Image.open(png) as image:
            image = image.convert('RGBA')
            fixed_viewport = tuple(math.ceil(value * scale - 1e-8) for value in effect['sourceViewport'])
            if image.width > fixed_viewport[0] or image.height > fixed_viewport[1]:
                raise ValueError(f'{sid}: source render exceeds its scaled fixed viewport')
            if image.size != fixed_viewport:
                padded = Image.new('RGBA', fixed_viewport)
                padded.paste(image, (0, 0))
                image = padded
            destination = output / f'{index}.webp'
            image.save(destination, 'WEBP', lossless=True, quality=100, method=4, exact=True)
            data = destination.read_bytes()
            frames.append(dict(n=index, width=image.width, height=image.height,
                               bytes=len(data), sha256=digest(data)))
    if len({(frame['width'], frame['height']) for frame in frames}) != 1:
        raise ValueError(f'{sid}: frames do not share their original fixed viewport')
    if not args.source_scale and max(frames[0]['width'], frames[0]['height']) > args.max_edge:
        raise ValueError(f'{sid}: the export exceeded the selected pixel budget')
    record = dict(id=int(sid), sourceUrl=effect['sourceUrl'], sourceSha256=effect['sourceSha256'],
                  sourceSymbol=effect['sourceSymbol'], sourceViewport=effect['sourceViewport'],
                  scale=scale, boxBlurPixelsLimit=FILTER_LIMIT, fps=effect['fps'],
                  viewportNormalization='Transparent right/bottom padding to sourceViewport times scale; original pixels unchanged.',
                  originalFrames=effect['frames'], representativeFrame=effect['representativeFrame'],
                  frames=frames, encodedBytes=sum(frame['bytes'] for frame in frames),
                  maxFrameDecodedBytes=max(frame['width'] * frame['height'] * 4 for frame in frames),
                  exportSeconds=round(time.monotonic() - started, 3),
                  publicationStatus='candidate; independent source-scale and visual review required')
    target.write_text(json.dumps(record, indent=2) + '\n')
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*')
    parser.add_argument('--java', type=Path, required=True)
    parser.add_argument('--ffdec', type=Path, required=True)
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache/skill-effects-v44/sources')
    parser.add_argument('--output', type=Path, default=ROOT / '.cache/skill-effects-v44/candidates')
    parser.add_argument('--max-edge', type=int, default=2048)
    parser.add_argument('--source-scale', type=float, help='Render a source-scale reference instead of the HD candidate.')
    parser.add_argument('--jobs', type=int, choices=(1, 2), default=2)
    args = parser.parse_args()
    for name in ('java', 'ffdec', 'sources', 'output'):
        setattr(args, name, getattr(args, name).resolve())
    if args.max_edge < 1 or (args.source_scale is not None and args.source_scale <= 0):
        parser.error('Render dimensions and source scale must be positive.')
    effects = json.loads((ROOT / 'public/battle-effects/manifest.json').read_text())['effects']
    selected = args.ids or list(effects)
    if any(sid not in effects for sid in selected):
        parser.error('Only existing verified original skill IDs may be exported.')
    args.output.mkdir(parents=True, exist_ok=True)
    rows, failures = [], []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        jobs = {pool.submit(export, sid, effects[sid], args): sid for sid in selected}
        for future in as_completed(jobs):
            sid = jobs[future]
            try:
                row = future.result()
                rows.append(row)
                print(f'{sid}: {len(row["frames"])} original frames; {row["encodedBytes"]} bytes', flush=True)
            except Exception as error:
                failures.append(dict(id=sid, error=str(error)))
                print(f'{sid}: {error}', flush=True)
            (args.output / 'manifest.json').write_text(json.dumps(dict(
                effects=sorted(rows, key=lambda row: row['id']), failures=failures), indent=2) + '\n')
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
