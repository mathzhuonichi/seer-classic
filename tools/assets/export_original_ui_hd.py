#!/usr/bin/env python3
"""Reproduce source-native UI vectors with the established PNG registration.

The pinned selection file records the exact official source and original crop.
Every selected source PNG must replay the checked-in baseline RGBA pixels before
its SVG can be published. Mixed source artwork keeps its original bitmap layers;
bitmap-only crops are reported, never relabeled as resolution-independent art.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/hd-ui-v44'
SPEC = ROOT / 'tools/assets/hd_ui_sources_v44.json'
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ffdec(args, *options):
    command = [args.java, '-Xmx768m', '-Dapple.awt.UIElement=true',
               '-Djava.awt.headless=true', '-jar', args.ffdec, '-cli', *map(str, options)]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)


def prepare_exports(args, spec):
    for group, source in spec['sources'].items():
        swf = ROOT / source['path']
        if not swf.exists():
            swf.parent.mkdir(parents=True, exist_ok=True)
            payload = urllib.request.urlopen(source['url'], timeout=40).read()
            if hashlib.sha256(payload).hexdigest() != source['sha256']:
                raise ValueError(f'{group}: official source changed; review before exporting')
            swf.write_bytes(payload)
        if sha(swf) != source['sha256']:
            raise ValueError(f'{group}: pinned source hash mismatch')
        if group == 'fight':
            xml = CACHE / 'xml/PetFightDLL-replay.xml'
            xml.parent.mkdir(parents=True, exist_ok=True)
            ffdec(args, '-swf2xml', swf, xml)
            tree = ET.parse(xml)
            for item in tree.getroot().iter('item'):
                sid = item.get('spriteId')
                removed_names = ({'hp_txt', 'name_txt', 'level_txt', 'txtMask'}
                                 if sid in ('764', '1021') else {'barMC'} if sid == '751'
                                 else {'escape_btn', 'item_btn', 'catch_btn', 'pet_btn', 'fight_btn'}
                                 if sid == '999' else set())
                if removed_names:
                    tags = item.find('subTags')
                    for node in list(tags):
                        if node.get('name') in removed_names:
                            tags.remove(node)
            selected = xml.with_name('PetFightDLL-replay-clean.xml')
            tree.write(selected, encoding='utf-8', xml_declaration=True)
            swf = selected.with_suffix('.swf')
            ffdec(args, '-xml2swf', selected, swf)
        ids = sorted({row['symbolId'] for row in spec['assets'] if row['sourceGroup'] == group})
        for kind in ('png', 'svg'):
            ffdec(args, '-selectid', ','.join(map(str, ids)),
                   '-select', ','.join(f'{sid}:1' for sid in ids), '-zoom', '2',
                   '-format', f'sprite:{kind},button:{kind},shape:{kind}',
                   '-export', 'sprite,button,shape', CACHE / f'replay-{group}-{kind}', swf)
        raster_ids = sorted({row['symbolId'] for row in spec['assets']
                             if row['sourceGroup'] == group and row.get('publishRaster4x')})
        if raster_ids:
            ffdec(args, '-selectid', ','.join(map(str, raster_ids)),
                   '-select', ','.join(f'{sid}:1' for sid in raster_ids), '-zoom', '4',
                   '-format', 'sprite:png', '-export', 'sprite', CACHE / f'replay-{group}-png4x', swf)


def exported(row, kind):
    replay = CACHE / f"replay-{row['sourceGroup']}-{kind}"
    if replay.exists():
        sid = row['symbolId']
        matches = [p for p in replay.rglob('*.' + kind)
                   if (p.stem == str(sid) or re.match(rf'Define(?:Sprite|Button2|Shape\d*)_{sid}(?:_|$)', p.parent.name))
                   and p.name in (f'{sid}.{kind}', f'1.{kind}', f'1_up.{kind}')]
        if len(matches) != 1:
            raise ValueError(f"{row['name']}: ambiguous or missing {kind} export")
        return matches[0]
    return ROOT / row['cachedExports'][kind]


def raster_export(row):
    directory = CACHE / f"replay-{row['sourceGroup']}-png4x"
    if not directory.exists():
        return ROOT / row['cachedExports']['png4x']
    sid = row['symbolId']
    matches = [path for path in directory.rglob('1.png')
               if re.match(rf'DefineSprite_{sid}(?:_|$)', path.parent.name)]
    if len(matches) != 1:
        raise ValueError(f"{row['name']}: ambiguous or missing 4x export")
    return matches[0]


def build(args, spec):
    destination = CACHE / 'ui-candidates'
    destination.mkdir(parents=True, exist_ok=True)
    preview = CACHE / 'ui-preview'
    preview.mkdir(parents=True, exist_ok=True)
    results = {}
    violations = []
    for row in spec['assets']:
        name = row['name']
        baseline = ROOT / 'public' / row['baselinePath'].lstrip('/')
        if sha(baseline) != row['baselineSha256']:
            raise ValueError(f'{name}: baseline changed; preserve and review it')
        original = Image.open(baseline).convert('RGBA')
        full = Image.open(exported(row, 'png')).convert('RGBA')
        selected = full.crop(row['crop'])
        if selected.size != original.size or selected.tobytes() != original.tobytes():
            raise ValueError(f'{name}: source RGBA replay does not match baseline')
        raw_svg = exported(row, 'svg')
        tree = ET.parse(raw_svg)
        root = tree.getroot()
        images = [node for node in root.iter() if node.tag == f'{{{SVG}}}image']
        paths = [node for node in root.iter() if node.tag == f'{{{SVG}}}path']
        source = spec['sources'][row['sourceGroup']]
        result = dict(baselinePath=row['baselinePath'], baselineSha256=row['baselineSha256'],
                      sourceUrl=source['url'], sourceSha256=source['sha256'],
                      sourceSymbol=row['symbolId'], sourceFrame=1, sourceZoom=2,
                      sourcePngSha256=sha(exported(row, 'png')), sourceSvgSha256=sha(raw_svg),
                      sourceCrop2x=row['crop'], sourceReplayRgbaIdentical=True,
                      vectorPathCount=len(paths), embeddedBitmapCount=len(images),
                      embeddedBitmapSizes=[[node.get('width'), node.get('height')] for node in images])
        if row.get('publishRaster4x'):
            source4x = raster_export(row)
            crop = [2 * value for value in row['crop']]
            raster = Image.open(source4x).convert('RGBA').crop(crop)
            reduced = raster.resize(original.size, Image.Resampling.LANCZOS)
            background = Image.new('RGBA', original.size, '#bbcbd5')
            before = Image.alpha_composite(background, original).convert('RGB')
            after = Image.alpha_composite(background, reduced).convert('RGB')
            error = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean) / 3
            if error > row['maxRasterMeanRgbError']:
                violations.append(f'{name}: direct 4x source replay changed too much ({error:.3f})')
            target = destination / f"{name.replace('/', '-')}-4x.png"
            raster.save(target)
            result.update(path='/ui/classic/hd/' + target.name, sha256=sha(target), bytes=target.stat().st_size,
                          status='exported', classification='source-rendered-mixed-4x',
                          logicalWidth=original.width / 2, logicalHeight=original.height / 2,
                          pixelWidth=raster.width, pixelHeight=raster.height,
                          nativeRenderingZoom=4, sourceCrop4x=crop, sourcePng4xSha256=sha(source4x),
                          comparisonMeanRgbError=round(error, 6),
                          method='Direct FFDec rendering at 4x from original curves, source filters and embedded bitmaps. No enlargement of the previous PNG; embedded bitmap detail remains source-limited.',
                          visibleVectorCoverageFraction=row['visibleVectorCoverageFraction'])
            results[name] = result
            continue
        if not row['publish']:
            result.update(classification='retained-bitmap-source', status='retained', reason=row['reason'])
            results[name] = result
            continue
        width, height = original.size
        sw = float(root.get('width').removesuffix('px'))
        sh = float(root.get('height').removesuffix('px'))
        # FFDec includes symmetric Flash-filter padding in PNG bounds but not
        # SVG bounds. Retain that padding inside the exact original crop.
        dx = (full.width - sw) / 2 if full.width - sw > 2 else 0
        dy = (full.height - sh) / 2 if full.height - sh > 2 else 0
        viewbox = [row['crop'][0] - dx, row['crop'][1] - dy, width, height]
        adjustment = row.get('viewBoxAdjustment2x', [0, 0])
        viewbox[0] += adjustment[0]
        viewbox[1] += adjustment[1]
        root.set('width', f'{width / 2:g}')
        root.set('height', f'{height / 2:g}')
        root.set('viewBox', ' '.join(f'{number:g}' for number in viewbox))
        # A frame drawn over boxes of any shape stretches instead of letterboxing.
        if row.get('preserveAspectRatio'):
            root.set('preserveAspectRatio', row['preserveAspectRatio'])
        target = destination / f"{name.replace('/', '-')}.svg"
        tree.write(target, encoding='utf-8', xml_declaration=True)
        rendered = preview / target.with_suffix('.png').name
        subprocess.run([args.rsvg, '-w', str(width), '-h', str(height), '-o', str(rendered), str(target)], check=True)
        new = Image.open(rendered).convert('RGBA')
        background = Image.new('RGBA', original.size, '#bbcbd5')
        before = Image.alpha_composite(background, original).convert('RGB')
        after = Image.alpha_composite(background, new).convert('RGB')
        error = sum(ImageStat.Stat(ImageChops.difference(before, after)).mean) / 3
        if error > row.get('maxMeanRgbError', 8):
            violations.append(f'{name}: SVG raster comparison changed too much ({error:.3f})')
        result.update(path='/ui/classic/hd/' + target.name, sha256=sha(target), bytes=target.stat().st_size,
                      logicalWidth=width / 2, logicalHeight=height / 2, viewBox2x=viewbox,
                      classification='mixed-source' if images else 'pure-vector', status='exported',
                      comparisonMeanRgbError=round(error, 6))
        results[name] = result
    manifest = dict(schemaVersion=1, exporter='JPEXS FFDec 26.3.0',
                    method='Original source first frame, unchanged curves/colors/bitmap layers; exact PNG crop replay and SVG viewport registration.',
                    assets=results)
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if violations:
        raise ValueError('\n'.join(violations))
    if args.publish:
        public = ROOT / 'public/ui/classic/hd'
        public.mkdir(parents=True, exist_ok=True)
        for result in results.values():
            if result['status'] == 'exported':
                name = Path(result['path']).name
                shutil.copyfile(destination / name, public / name)
        shutil.copyfile(destination / 'manifest.json', public / 'manifest.json')
    print(f"Replayed {len(results)} original assets; exported {sum(x['status'] == 'exported' for x in results.values())} source HD assets.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true', help='Download pinned sources if missing and re-export using FFDec')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--java', default=str(ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'))
    parser.add_argument('--ffdec', default=str(ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar'))
    parser.add_argument('--rsvg', default='rsvg-convert')
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    if args.export:
        prepare_exports(args, spec)
    build(args, spec)


if __name__ == '__main__':
    main()
