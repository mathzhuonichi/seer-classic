#!/usr/bin/env python3
"""Export pinned official battle shapes for source-faithful atlas reconstruction.

The cache is resumable and all Java processes remain headless. This command does
not execute Flash, publish runtime assets, or change the active animation index.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import time
import xml.etree.ElementTree as ET
import zlib

from restore_mystery_realm_floor import _Bits, _tags

ROOT = Path(__file__).resolve().parents[2]
REVISION = 1


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def inspect_source(raw):
    if raw[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Expected a supported official Flash source')
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    reader = _Bits(data)
    reader.rect()
    reader.ui16()
    reader.ui16()
    rows, morphs, bitmaps = [], [], []
    for tag, body in _tags(data, reader.i // 8):
        if tag in (2, 22, 32, 83):
            character = struct.unpack_from('<H', body)[0]
            bounds = _Bits(body, 2).rect()
            rows.append({'character': character, 'tag': tag, 'boundsTwips': bounds,
                         'nativeSize': [(bounds[1]-bounds[0])/20, (bounds[3]-bounds[2])/20]})
        elif tag in (46, 84):
            morphs.append(struct.unpack_from('<H', body)[0])
        elif tag in (6, 20, 21, 35, 36, 90):
            bitmaps.append(struct.unpack_from('<H', body)[0])
    return {'shapes': rows, 'morphCharacters': morphs, 'bitmapCharacters': bitmaps}


def export_species(sid, args):
    started = time.monotonic()
    source = args.sources / f'{sid}.swf'
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    work = args.cache / 'species' / str(sid)
    manifest = work / 'source.json'
    if manifest.exists():
        prior = json.loads(manifest.read_text())
        if (prior.get('revision') == REVISION and prior.get('sourceSha256') == digest
                and all((work / row['svgPath']).exists() for row in prior['shapes'])):
            return str(sid), {**prior, 'cacheReused': True}
    data = inspect_source(raw)
    directory = work / 'shapes'
    directory.mkdir(parents=True, exist_ok=True)
    if data['shapes']:
        result = subprocess.run([
            str(args.java), '-Xmx512m', '-Djava.awt.headless=true', '-Dapple.awt.UIElement=true',
            '-jar', str(args.ffdec), '-cli', '-format', 'shape:svg', '-zoom', '1',
            '-export', 'shape', str(directory), str(source),
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
        (work / 'export.log').write_bytes(result.stdout)
        if result.returncode:
            raise RuntimeError(f'Headless shape export exited {result.returncode}; see {work / "export.log"}')
    files = {int(p.stem): p for p in directory.rglob('*.svg') if p.stem.isdigit()}
    for row in data['shapes']:
        path = files.get(row['character'])
        if path is None:
            raise ValueError(f'Missing exported source shape {row["character"]}')
        tree = ET.parse(path)
        for element in tree.iter():
            if element.tag.rsplit('}', 1)[-1] in ('script', 'foreignObject'):
                raise ValueError('Unexpected active content in exported shape')
        contents = path.read_bytes()
        row.update({'svgPath': str(path.relative_to(work)), 'svgSha256': hashlib.sha256(contents).hexdigest(),
                    'hasBitmap': any(e.tag.rsplit('}', 1)[-1] in ('image', 'feImage') for e in tree.iter())})
    data.update({'revision': REVISION, 'species': int(sid), 'sourcePath': os.path.relpath(source, ROOT),
                 'sourceSha256': digest, 'sourceBytes': len(raw),
                 'exporter': 'JPEXS FFDec 26.3.0, static shape SVG export, no Flash execution',
                 'elapsedSeconds': round(time.monotonic()-started, 3)})
    save(manifest, data)
    return str(sid), data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species IDs; omitted means every runtime species')
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache/portrait-v44/sources')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/battle-hd-v44')
    parser.add_argument('--java', type=Path, required=True)
    parser.add_argument('--ffdec', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=2)
    args = parser.parse_args()
    args.sources, args.cache = args.sources.resolve(), args.cache.resolve()
    args.java, args.ffdec = args.java.resolve(), args.ffdec.resolve()
    available = json.loads((ROOT / 'public/battle-animations/runtime-index.json').read_text())['species']
    ids = sorted(set(args.ids.split(',')) if args.ids else available, key=int)
    if any(sid not in available for sid in ids):
        parser.error('Requested species is absent from the runtime index')
    target = args.cache / 'source-manifest.json'
    state = json.loads(target.read_text()) if target.exists() else {'revision': REVISION, 'species': {}, 'failures': {}}
    started = time.monotonic()
    def attempt(sid):
        try:
            return export_species(sid, args)
        except Exception as error:
            return str(sid), {'error': str(error)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(2, args.jobs))) as pool:
        for number, (sid, item) in enumerate(pool.map(attempt, ids), 1):
            if 'error' in item:
                state['failures'][sid] = item
            else:
                state['species'][sid] = {'sourceSha256': item['sourceSha256'], 'shapes': len(item['shapes']),
                                         'morphs': len(item['morphCharacters']), 'bitmaps': len(item['bitmapCharacters'])}
                state['failures'].pop(sid, None)
            state['lastRunCompleted'] = number
            state['lastRunRequested'] = len(ids)
            save(target, state)
            if number % 25 == 0 or number == len(ids):
                print(f'{number}/{len(ids)} source exports; {len(state["failures"])} failures', flush=True)
    state['lastRunSeconds'] = round(time.monotonic()-started, 3)
    save(target, state)


if __name__ == '__main__':
    main()
