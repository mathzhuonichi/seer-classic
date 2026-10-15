#!/usr/bin/env python3
"""Replay and validate the atlas selections from their pinned Flash sources.

Use --prepare --export to rebuild the source renders, and --publish to copy
validated artwork and its manifest. Navigation and baseline assets are unchanged.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageStat
from export_classic_atlas_v28 import frames

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/hd-ui-v44'
SPEC = ROOT / 'tools/assets/hd_atlas_sources_v44.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_sources(args, spec):
    for key, source in spec['sources'].items():
        path = ROOT / source['path']
        if not path.exists() and args.prepare:
            payload = urllib.request.urlopen(source['url'], timeout=40).read()
            if hashlib.sha256(payload).hexdigest() != source['sha256']:
                raise ValueError(f'{key}: source changed; review before exporting')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
        if not path.exists() or sha(path) != source['sha256']:
            raise ValueError(f'{key}: pinned original source missing or changed')
        if args.prepare:
            xml = CACHE / 'xml' / f'{key}.xml'
            xml.parent.mkdir(parents=True, exist_ok=True)
            ffdec(args, '-swf2xml', path, xml)


def icon_export(row, kind):
    group, sid, frame = row['sourceGroup'], row['symbolId'], row['frame']
    directory = CACHE / f'atlas-icons-{group}-{kind}'
    if group == 'UI' and kind != 'png4x' and not directory.exists():
        directory = CACHE / f'ui-more-{kind}'
    suffix = 'png' if kind == 'png4x' else kind
    matches = [path for path in directory.rglob('*.' + suffix)
               if ((path.stem == str(sid) and path.parent.name == 'shapes')
                   or re.match(rf'Define(?:Sprite|Button2|Shape\d*)_{sid}(?:_|$)', path.parent.name))
               and path.name in (f'{sid}.{suffix}', f'{frame}.{suffix}', f'{frame}_up.{suffix}')]
    if len(matches) != 1:
        raise ValueError(f'{row["name"]}: missing or ambiguous {kind} source export')
    return matches[0]


def export_icons(args, spec):
    for group in sorted({row['sourceGroup'] for row in spec['assets'] if row['kind'] == 'icon'}):
        rows = [row for row in spec['assets'] if row['kind'] == 'icon' and row['sourceGroup'] == group]
        ids = sorted({row['symbolId'] for row in rows})
        selections = []
        for sid in ids:
            frames_used = sorted({row['frame'] for row in rows if row['symbolId'] == sid})
            value = str(frames_used[0]) if len(frames_used) == 1 else f'{frames_used[0]}-{frames_used[-1]}'
            selections.append(f'{sid}:{value}')
        selection = ','.join(selections)
        for kind, zoom in [('png', 2), ('svg', 2), ('png4x', 4)]:
            suffix = 'png' if kind == 'png4x' else kind
            ffdec(args, '-selectid', ','.join(map(str, ids)), '-select', selection, '-zoom', zoom,
                   '-format', f'sprite:{suffix},button:{suffix},shape:{suffix}',
                   '-export', 'sprite,button,shape', CACHE / f'atlas-icons-{group}-{kind}',
                   ROOT / spec['sources'][group]['path'])


def publish_artwork(args, spec):
    destination = CACHE / 'atlas-publish'
    destination.mkdir(parents=True, exist_ok=True)
    assets = {}
    for row in spec['assets']:
        name = row['name']
        baseline = ROOT / 'public' / row['baselinePath'].lstrip('/')
        if sha(baseline) != row['baselineSha256']:
            raise ValueError(f'{name}: baseline changed')
        original = Image.open(baseline).convert('RGBA')
        if row['kind'] == 'page':
            raw = {kind: CACHE / f'atlas-native-{kind}' / f'{name}.swf' / f'1.{"png" if kind == "png4x" else kind}'
                   for kind in ('png', 'svg', 'png4x')}
        else:
            raw = {kind: icon_export(row, kind) for kind in ('png', 'svg', 'png4x')}
        full = Image.open(raw['png']).convert('RGBA')
        replay = full.crop(row['crop'])
        if replay.size != original.size or replay.tobytes() != original.tobytes():
            raise ValueError(f'{name}: original PNG replay differs')
        tree = ET.parse(raw['svg'])
        root = tree.getroot()
        images = [node for node in root.iter() if node.tag.endswith('}image')]
        paths = [node for node in root.iter() if node.tag.endswith('}path')]
        w, h = original.size
        if row['method'] == 'png4x':
            raster = Image.open(raw['png4x']).convert('RGBA').crop([2 * n for n in row['crop']])
            target = destination / f'{name}-4x.png'
            raster.save(target)
            comparison = raster.resize(original.size, Image.Resampling.LANCZOS)
        else:
            sw = float(root.get('width').removesuffix('px'))
            sh = float(root.get('height').removesuffix('px'))
            dx = (full.width - sw) / 2 if full.width - sw > 2 else 0
            dy = (full.height - sh) / 2 if full.height - sh > 2 else 0
            root.set('width', f'{w / 2:g}')
            root.set('height', f'{h / 2:g}')
            root.set('viewBox', ' '.join(map(str, [row['crop'][0] - dx, row['crop'][1] - dy, w, h])))
            target = destination / f'{name}.svg'
            tree.write(target, encoding='utf-8', xml_declaration=True)
            preview = destination / f'{name}-preview.png'
            subprocess.run([args.rsvg, '-w', str(w), '-h', str(h), '-o', str(preview), str(target)], check=True)
            comparison = Image.open(preview).convert('RGBA')
        bg = Image.new('RGBA', original.size, '#bbcbd5')
        before = Image.alpha_composite(bg, original).convert('RGB')
        after = Image.alpha_composite(bg, comparison).convert('RGB')
        error = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean) / 3
        if error > row['maxMeanRgbError']:
            raise ValueError(f'{name}: source fidelity comparison failed ({error:.3f})')
        source = spec['sources'][row['sourceGroup']]
        assets[name] = dict(status='exported', baselinePath=row['baselinePath'], baselineSha256=sha(baseline),
            path='/ui/classic/maps/hd/' + target.name, sha256=sha(target), bytes=target.stat().st_size,
            sourceUrl=source['url'], sourceSha256=source['sha256'], sourceSymbol=row.get('symbolId'),
            sourceFrame=row.get('frame', 1), sourceCrop2x=row['crop'], sourceReplayRgbaIdentical=True,
            sourcePngSha256=sha(raw['png']), sourceSvgSha256=sha(raw['svg']),
            method='native-svg' if row['method'] == 'svg' else 'direct-source-render-4x',
            classification='mixed-source' if images else 'pure-vector-source',
            vectorPathCount=len(paths), embeddedBitmapCount=len(images),
            embeddedBitmapSizes=[[node.get('width'), node.get('height')] for node in images],
            logicalWidth=w / 2, logicalHeight=h / 2, comparisonMeanRgbError=round(error, 6),
            limitation='Embedded bitmap detail remains source-limited.' if images else None)
        if row['method'] == 'png4x':
            assets[name].update(pixelWidth=2 * w, pixelHeight=2 * h, sourcePng4xSha256=sha(raw['png4x']))
    for row in spec['retained']:
        baseline = ROOT / 'public' / row['baselinePath'].lstrip('/')
        if sha(baseline) != row['baselineSha256']:
            raise ValueError(f'{row["name"]}: retained baseline changed')
        assets[row['name']] = dict(row, status='retained', classification='bitmap-pending-enhancement')
    manifest = dict(schemaVersion=1, exporter='JPEXS FFDec 26.3.0',
        method='Verified identical original PNG replay; unchanged source geometry, filters and crop. SVG used only where visual comparison passed.', assets=assets)
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if args.publish:
        public = ROOT / 'public/ui/classic/maps/hd'
        public.mkdir(parents=True, exist_ok=True)
        for asset in assets.values():
            if asset['status'] == 'exported':
                name = Path(asset['path']).name
                shutil.copyfile(destination / name, public / name)
        shutil.copyfile(destination / 'manifest.json', public / 'manifest.json')
    print(f'Validated {len(spec["assets"])} source atlas assets; {len(spec["retained"])} retained bitmap assets.', flush=True)


def ffdec(args, *options):
    subprocess.run([args.java, '-Xmx768m', '-Dapple.awt.UIElement=true',
                    '-Djava.awt.headless=true', '-jar', args.ffdec, '-cli',
                    *map(str, options)], check=True, stdout=subprocess.DEVNULL)


def select_sprite(sprite, placements):
    result = deepcopy(sprite)
    result.set('frameCount', '1')
    tags = result.find('subTags')
    tags.clear()
    for placement in placements:
        tags.append(deepcopy(placement))
    ET.SubElement(tags, 'item', {'type': 'ShowFrameTag', 'forceWriteAsLong': 'false'})
    return result


def write_swf(args, tree, key):
    xml = CACHE / 'atlas-selected.xml'
    tree.write(xml, encoding='utf-8', xml_declaration=True)
    output = CACHE / 'atlas-native-stages' / f'{key}.swf'
    output.parent.mkdir(parents=True, exist_ok=True)
    ffdec(args, '-xml2swf', xml, output)


def prepare(args, pages):
    tree = ET.parse(CACHE / 'xml/NewWorldMap2020Panel.xml')
    tags = tree.getroot().find('tags')
    original = next(node for node in tags if node.get('spriteId') == '2718')
    position = list(tags).index(original)
    snapshots = frames(original)
    sidebar = [(index, node) for index, node in enumerate(list(tags))
               if node.get('name') == 'left' and node.get('type', '').startswith('PlaceObject')]
    for _, node in sidebar:
        tags.remove(node)
    for key, page in pages.items():
        if not key.startswith('galaxy-'):
            continue
        allowed = {node.get('sourceInstance') for node in page['nodes'] if node.get('targetKind') == 'planet'}
        selected = [node for node in snapshots[page['sourceFrame'] - 1]
                    if not node.get('name', '').startswith('map_') or node.get('name') in allowed]
        replacement = select_sprite(original, selected)
        tags.remove(original)
        tags.insert(position, replacement)
        write_swf(args, tree, key)
        tags.remove(replacement)
        tags.insert(position, original)
        print(key, 'staged original selection', flush=True)
    del tree, tags, original, snapshots
    for key, page in pages.items():
        if 'sourceNativeViewport' not in page:
            continue
        mid = int(key.split('-')[1])
        tree = ET.parse(CACHE / 'xml' / f'StarMap-{mid}.xml')
        root = tree.getroot()
        tags = root.find('tags')
        sid = str(page['sourceSymbolId'])
        original = next(node for node in tags if node.get('spriteId') == sid)
        allowed = {node.get('sourceInstance') for node in page['nodes']}
        selected = []
        for node in frames(original)[0]:
            name = node.get('name', '')
            if name.startswith(('scene_', 'special_')) and name not in allowed:
                continue
            if name in ('serverNameTxt', 'flag', 'close') or name == 'ad' and mid != 1:
                continue
            selected.append(node)
        position = list(tags).index(original)
        tags.remove(original)
        tags.insert(position, select_sprite(original, selected))
        for node in list(tags):
            kind = node.get('type', '')
            if kind.startswith(('PlaceObject', 'RemoveObject')) or kind == 'ShowFrameTag':
                tags.remove(node)
        x0, y0, x1, y1 = page['sourceNativeViewport']
        place = ET.SubElement(tags, 'item', dict(type='PlaceObject2Tag', characterId=sid,
            depth='1', forceWriteAsLong='false', placeFlagHasCharacter='true',
            placeFlagHasMatrix='true', placeFlagMove='false'))
        ET.SubElement(place, 'matrix', dict(type='MATRIX', hasRotate='false', hasScale='false',
            nRotateBits='0', nScaleBits='0', nTranslateBits='16',
            translateX=str(-x0 * 20), translateY=str(-y0 * 20)))
        ET.SubElement(tags, 'item', dict(type='ShowFrameTag', forceWriteAsLong='false'))
        root.set('frameCount', '1')
        rect = root.find('displayRect')
        rect.attrib.update(Xmin='0', Ymin='0', Xmax=str((x1 - x0) * 20),
                           Ymax=str((y1 - y0) * 20), nbits='16')
        write_swf(args, tree, key)
        print(key, 'staged original selection', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--rsvg', default='rsvg-convert')
    parser.add_argument('--java', default=str(ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'))
    parser.add_argument('--ffdec', default=str(ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar'))
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    check_sources(args, spec)
    pages = json.loads((ROOT / 'public/ui/classic/maps/manifest.json').read_text())['pages']
    if args.prepare:
        prepare(args, pages)
    if args.export:
        for kind in ('png', 'svg'):
            ffdec(args, '-select', '1', '-zoom', '2', '-format', f'frame:{kind}',
                   '-export', 'frame', CACHE / f'atlas-native-{kind}', CACHE / 'atlas-native-stages')
        ffdec(args, '-select', '1', '-zoom', '4', '-format', 'frame:png',
               '-export', 'frame', CACHE / 'atlas-native-png4x', CACHE / 'atlas-native-stages')
        export_icons(args, spec)
    results = []
    for key, page in pages.items():
        source = CACHE / 'atlas-native-png' / f'{key}.swf/1.png'
        if not source.exists():
            continue
        baseline = ROOT / 'public' / page['background'].lstrip('/')
        old = Image.open(baseline).convert('RGBA')
        new = Image.open(source).convert('RGBA')
        svg = CACHE / 'atlas-native-svg' / f'{key}.swf/1.svg'
        root = ET.parse(svg).getroot()
        images = [node for node in root.iter() if node.tag.endswith('}image')]
        result = dict(key=key, baselinePath=page['background'],
                      baselineSha256=hashlib.sha256(baseline.read_bytes()).hexdigest(),
                      sourcePng=str(source.relative_to(ROOT)), sourceSvg=str(svg.relative_to(ROOT)),
                      sourceUrl=page['sourceUrl'], rgbaIdentical=old.size == new.size and old.tobytes() == new.tobytes(),
                      baselineSize=old.size, replaySize=new.size,
                      bitmapCount=len(images), bitmapSizes=[[node.get('width'), node.get('height')] for node in images],
                      pathCount=sum(node.tag.endswith('}path') for node in root.iter()))
        results.append(result)
        print(key, 'exact source replay', result['rgbaIdentical'], 'bitmap layers', len(images), flush=True)
    (CACHE / 'atlas-native-replay.json').write_text(json.dumps(results, indent=2) + '\n')
    publish_artwork(args, spec)


if __name__ == '__main__':
    main()
