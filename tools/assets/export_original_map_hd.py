#!/usr/bin/env python3
"""Recover visually reviewed map vectors without changing the H5 viewport.

The source display list is never executed. A selected SWF keeps definitions,
the original bg_mc placement and one static frame. The SVG is then registered
to the existing H5 background's local viewport, so its proportions and actor
coordinates do not change. Nonmatching source snapshots are excluded explicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from restore_mystery_realm_floor import _Bits, _tags, _placement

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/hd-ui-v44'
SPEC = ROOT / 'tools/assets/hd_map_sources_v44.json'
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')
DEFINITIONS = {2, 6, 7, 8, 10, 11, 13, 14, 20, 21, 22, 32, 33, 34, 35, 36,
               37, 39, 46, 48, 60, 61, 62, 73, 75, 78, 83, 84, 87, 88, 90, 91}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tag(kind, payload):
    return struct.pack('<HI', kind << 6 | 63, len(payload)) + payload


def select_background(raw):
    if raw[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Unsupported SWF compression')
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    reader = _Bits(data)
    rect = reader.rect()
    reader.ui16()
    reader.ui16()
    start = reader.i // 8
    records = list(_tags(data, start))
    background = None
    for kind, payload in records:
        if kind == 1:
            break
        if kind in (26, 70):
            try:
                placed = _placement(kind, payload)
            except ValueError:
                continue
            if placed.get('name') == 'bg_mc':
                background = kind, payload, placed
    if background is None:
        raise ValueError('No supported static bg_mc placement')
    selected = (data[:start - 2] + struct.pack('<H', 1)
                + b''.join(tag(kind, payload) for kind, payload in records if kind in DEFINITIONS)
                + tag(background[0], background[1]) + tag(1, b'') + tag(0, b''))
    result = b'CWS' + raw[3:4] + struct.pack('<I', len(selected) + 8) + zlib.compress(selected)
    return result, background[2], rect


def export_sources(args, rows):
    stages = CACHE / 'map-hd-replay-stages'
    stages.mkdir(parents=True, exist_ok=True)
    for row in rows:
        source = ROOT / row['cachedSource']
        if not source.exists():
            payload = urllib.request.urlopen(row['sourceUrl'], timeout=40).read()
            if hashlib.sha256(payload).hexdigest() != row['sourceSha256']:
                raise ValueError(f"Map {row['mapId']}: official source changed")
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(payload)
        if sha(source) != row['sourceSha256']:
            raise ValueError(f"Map {row['mapId']}: pinned source hash mismatch")
        selected, placement, rect = select_background(source.read_bytes())
        if placement != row['sourcePlacement'] or rect != [0, 19200, 0, 11200]:
            raise ValueError(f"Map {row['mapId']}: source registration changed")
        (stages / f"{row['mapId']}.swf").write_bytes(selected)
    subprocess.run([args.java, '-Xmx768m', '-Dapple.awt.UIElement=true',
                    '-Djava.awt.headless=true', '-jar', args.ffdec, '-cli',
                    '-select', '1', '-format', 'frame:svg', '-export', 'frame',
                    str(CACHE / 'map-hd-replay-svg'), str(stages)], check=True,
                   stdout=subprocess.DEVNULL)


def register(row, original, raw):
    tree = ET.parse(raw)
    root = tree.getroot()
    if any(node.tag == f'{{{SVG}}}image' for node in root.iter()):
        raise ValueError(f"Map {row['mapId']}: unexpected embedded bitmap")
    a, b, c, d, tx, ty = row['sourcePlacement']['matrix']
    tx /= 20
    ty /= 20
    determinant = a * d - b * c
    inverse = [d / determinant, -b / determinant, -c / determinant, a / determinant,
               (c * ty - d * tx) / determinant, (b * tx - a * ty) / determinant]
    wrapper = ET.Element(f'{{{SVG}}}g', {'transform': 'matrix(' + ','.join(f'{v:g}' for v in inverse) + ')'})
    for child in list(root):
        if child.tag == f'{{{SVG}}}g':
            root.remove(child)
            wrapper.append(child)
    root.insert(0, wrapper)
    viewbox = row['localViewport']
    root.set('width', str(original.width))
    root.set('height', str(original.height))
    root.set('viewBox', ' '.join(f'{v:g}' for v in viewbox))
    if row.get('opaqueExterior'):
        # The baseline H5 JPG flattens the original empty exterior to black.
        # Retain that explicit color behind the unchanged source curves.
        x, y, width, height = viewbox
        root.insert(0, ET.Element(f'{{{SVG}}}rect', dict(
            x=str(x), y=str(y), width=str(width), height=str(height), fill=row['opaqueExterior'])))
    return tree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--java', default=str(ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'))
    parser.add_argument('--ffdec', default=str(ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar'))
    parser.add_argument('--rsvg', default='rsvg-convert')
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    rows = spec['maps']
    if args.export:
        export_sources(args, rows)
    staged = CACHE / 'map-hd-candidates'
    staged.mkdir(parents=True, exist_ok=True)
    results = {}
    for row in rows:
        mid = row['mapId']
        baseline = ROOT / 'public' / row['baselinePath'].lstrip('/')
        if sha(baseline) != row['baselineSha256']:
            raise ValueError(f'Map {mid}: baseline changed; preserve and review it')
        original = Image.open(baseline).convert('RGBA')
        replay = CACHE / 'map-hd-replay-svg' / f'{mid}.swf/1.svg'
        raw = replay if replay.exists() else ROOT / row['cachedSvg']
        tree = register(row, original, raw)
        target = staged / f'{mid}.svg'
        tree.write(target, encoding='utf-8', xml_declaration=True)
        png = staged / f'{mid}.png'
        subprocess.run([args.rsvg, '-w', str(original.width), '-h', str(original.height),
                        '-o', str(png), str(target)], check=True)
        rendered = Image.open(png).convert('RGBA')
        background = Image.new('RGBA', original.size, '#112538')
        before = Image.alpha_composite(background, original).convert('RGB')
        after = Image.alpha_composite(background, rendered).convert('RGB')
        error = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean) / 3
        if error > row['maxMeanRgbError']:
            raise ValueError(f'Map {mid}: registered source differs from the reviewed baseline ({error:.3f})')
        results[str(mid)] = dict(mapId=mid, path=f'/maps/original/{mid}.svg',
            sha256=sha(target), bytes=target.stat().st_size, classification='pure-vector',
            baselinePath=row['baselinePath'], baselineSha256=row['baselineSha256'],
            sourceUrl=row['sourceUrl'], sourceSha256=row['sourceSha256'],
            sourceSymbol=row['sourcePlacement']['character'], sourceFrame=1,
            exportedSvgSha256=sha(raw), logicalWidth=original.width, logicalHeight=original.height,
            localViewport=row['localViewport'], sourcePlacement=row['sourcePlacement'],
            coordinateSpace='original-H5-background-local-viewport',
            actorCoordinatePolicy='Keep the existing H5 background registration; the natural image viewport is unchanged.',
            opaqueExterior=row.get('opaqueExterior'), comparisonMeanRgbError=round(error, 6),
            visualReview=row['visualReview'])
    manifest = dict(schemaVersion=1, exporter='JPEXS FFDec 26.3.0', maps=results,
                    rejectedSourceSnapshotIds=spec['rejectedSourceSnapshotIds'],
                    method='Reviewed original background curves, exact source placement inverted into the preserved H5 local image viewport. No AI redrawing or raster tracing.')
    output = staged / 'manifest.json'
    output.write_text(json.dumps(manifest, indent=2) + '\n')
    if args.publish:
        public = ROOT / 'public/maps/original'
        for mid in results:
            shutil.copyfile(staged / f'{mid}.svg', public / f'{mid}.svg')
        shutil.copyfile(output, ROOT / 'public/maps/original-hd-manifest.json')
    print(f'Validated {len(results)} original vector maps against preserved native image viewports.')


if __name__ == '__main__':
    main()
