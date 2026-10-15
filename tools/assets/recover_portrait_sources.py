#!/usr/bin/env python3
"""Resume pinned official combat sources and prepare isolated portrait candidates."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from export_vector_portraits import BASE, export, pet_character

ROOT = Path(__file__).resolve().parents[2]


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix('.tmp').write_text(json.dumps(value, indent=2) + '\n')
    path.with_suffix('.tmp').replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=('download', 'export', 'prepare'), required=True)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/portrait-v44')
    parser.add_argument('--java', type=Path)
    parser.add_argument('--ffdec', type=Path)
    parser.add_argument('--jobs', type=int, default=3)
    parser.add_argument('--baseline-revision', default='00a93ec')
    parser.add_argument('--mixed-vector-ids', default='', help='Comma-separated IDs whose bitmap layers were visually confirmed to be effects.')
    args = parser.parse_args()
    cache = args.cache.resolve()
    baseline = json.loads(subprocess.check_output(['git', 'show', f'{args.baseline_revision}:public/portraits/vectors/manifest.json'], cwd=ROOT))['portraits']
    original = json.loads((ROOT / 'public/portraits/manifest.json').read_text())['portraits']
    ids = sorted(set(original) - set(baseline), key=int)
    source_file = cache / 'sources.json'
    if args.phase == 'download':
        state = json.loads(source_file.read_text()) if source_file.exists() else {'sources': {}}
        started = time.monotonic()
        def fetch(sid):
            path = cache / 'sources' / f'{sid}.swf'
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                data = urllib.request.urlopen(f'{BASE}{sid}.swf', timeout=30).read()
                if data[:3] not in (b'CWS', b'FWS'):
                    raise ValueError(f'Invalid official SWF: {sid}')
                path.write_bytes(data)
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            item = {'source': f'{BASE}{sid}.swf', 'bytes': len(data), 'sha256': digest, 'symbol': pet_character(data)}
            if sid in baseline:
                item['matchesRetainedVectorSource'] = digest == baseline[sid]['source_sha256']
            return sid, item
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for sid, item in pool.map(fetch, sorted(original, key=int)):
                state['sources'][sid] = item
                if len(state['sources']) % 100 == 0:
                    save(source_file, state)
        state['elapsedSeconds'] = round(time.monotonic() - started, 3)
        save(source_file, state)
        print(f'{len(state["sources"])} pinned official sources available.')
    elif args.phase == 'export':
        if not args.java or not args.ffdec:
            parser.error('--java and --ffdec are required for export')
        target = cache / 'full-export.json'
        state = json.loads(target.read_text()) if target.exists() else {'requested': len(ids), 'portraits': {}}
        pending = [sid for sid in ids if sid not in state['portraits']]
        started = time.monotonic()
        def attempt(sid):
            try:
                return export(int(sid), str(args.java.resolve()), str(args.ffdec.resolve()),
                              cache_dir=cache / 'full/.cache/vector-export', source_dir=cache / 'sources',
                              output_dir=cache / 'full/public/portraits/vectors')
            except Exception as error:
                return sid, {'error': str(error), 'source': f'{BASE}{sid}.swf'}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 3))) as pool:
            futures = [pool.submit(attempt, sid) for sid in pending]
            for future in concurrent.futures.as_completed(futures):
                sid, item = future.result()
                state['portraits'][sid] = item
                state['completed'] = len(state['portraits'])
                save(target, state)
                if state['completed'] % 25 == 0:
                    print(f'{state["completed"]}/{len(ids)} export records', flush=True)
        state['lastResumeSeconds'] = round(time.monotonic() - started, 3)
        save(target, state)
    else:
        exports = json.loads((cache / 'full-export.json').read_text())['portraits']
        target = cache / 'calibrated-candidates.json'
        state = json.loads(target.read_text()) if target.exists() else {'portraits': {}}
        for sid, item in exports.items():
            if 'error' not in item:
                state['portraits'].setdefault(sid, item)
        save(target, state)
        target = cache / 'mixed-candidates.json'
        mixed = json.loads(target.read_text()) if target.exists() else {'portraits': {}}
        sources = json.loads(source_file.read_text())['sources']
        classification = json.loads((cache / 'mixed-classification/report.json').read_text()) if args.mixed_vector_ids else {}
        for sid in filter(None, args.mixed_vector_ids.split(',')):
            if sid in mixed['portraits']:
                continue
            item = classification[sid]
            if item['vectorAlphaCoverage'] < .5:
                raise ValueError(f'Main-body bitmap source cannot be accepted as a vector body: {sid}')
            source_svg = next((cache / 'full/.cache/vector-export' / sid / 'svg').rglob('1.svg'))
            svg = ET.parse(source_svg).getroot()
            mixed['portraits'][sid] = {
                'path': f'/portraits/vectors/{sid}.svg', 'source': sources[sid]['source'], 'source_sha256': sources[sid]['sha256'],
                'symbol': sources[sid]['symbol'], 'frame': 1, 'width': float(svg.get('width').replace('px', '')) / 2,
                'height': float(svg.get('height').replace('px', '')) / 2, 'viewport_pending': True,
                'format': 'SVG vector body with original bitmap effects', 'embedded_bitmap_sizes': item['nativeSizes'],
                'vector_alpha_coverage_without_bitmaps': item['vectorAlphaCoverage'],
                'exporter': 'JPEXS FFDec 26.3.0; static sprite display-list export',
                'resolution_statement': 'Original vector body; original embedded bitmap flash effects retain their native resolution.',
            }
        save(target, mixed)
        print(f'{len(state["portraits"])} pure and {len(mixed["portraits"])} reviewed mixed candidates ready.')


if __name__ == '__main__':
    main()
