#!/usr/bin/env python3
"""Replace atlas bitmap definitions while retaining the original display lists.

First use --replay --prepare --export to validate the original bitmap round trip.
Then use --prepare --export with the reviewed AI bitmap manifest, inspect the
resulting compositions, and use --publish to publish the separate mixed manifest.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
import zlib

import numpy as np
from PIL import Image

import export_original_atlas_hd as native
from export_classic_atlas_v28 import frames

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/hd-ui-v44'
BINDINGS = ROOT / 'tools/assets/hd_atlas_bitmap_bindings_v44.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rgba_sha(path):
    return hashlib.sha256(Image.open(path).convert('RGBA').tobytes()).hexdigest()


def layout_sha(tree):
    """Fingerprint every source node except bitmap pixels and texture scales."""
    digest = hashlib.sha256()
    for node in tree.getroot().iter():
        if node.get('type', '').startswith('DefineBits'):
            continue
        attributes = dict(node.attrib)
        if node.tag == 'bitmapMatrix':
            for key in ('hasScale', 'scaleX', 'scaleY', 'rotateSkew0', 'rotateSkew1'):
                attributes.pop(key, None)
        digest.update(json.dumps([node.tag, sorted(attributes.items()), node.text], ensure_ascii=False).encode())
    return digest.hexdigest()


def replace_bitmap(tree, bitmap_id, original, replacement, preserve_alpha=False):
    """Keep texture coordinates in source space, including rotation and skew."""
    tags = tree.getroot().find('tags')
    node = next(n for n in tags if n.get('characterID') == str(bitmap_id))
    old = Image.open(original).convert('RGBA')
    image = Image.open(replacement).convert('RGBA')
    if preserve_alpha:
        image.putalpha(old.getchannel('A').resize(image.size, Image.Resampling.LANCZOS))
    pixels = np.asarray(image, dtype=np.uint16)
    argb = np.empty(pixels.shape, dtype=np.uint8)
    argb[:, :, 0] = pixels[:, :, 3]
    argb[:, :, 1:4] = (pixels[:, :, :3] * pixels[:, :, 3:4] + 127) // 255
    node.attrib.clear()
    node.attrib.update(type='DefineBitsLossless2Tag', bitmapFormat='5',
        bitmapWidth=str(image.width), bitmapHeight=str(image.height),
        characterID=str(bitmap_id), forceWriteAsLong='true',
        zlibBitmapData=zlib.compress(argb.tobytes()).hex())
    sx, sy = old.width / image.width, old.height / image.height
    count = 0
    for fill in tree.getroot().iter():
        if fill.get('bitmapId') != str(bitmap_id):
            continue
        matrix = fill.find('bitmapMatrix')
        if matrix is None:
            raise ValueError(f'{bitmap_id}: unsupported bitmap reference')
        for field, factor, default in [('scaleX', sx, 1), ('rotateSkew0', sx, 0),
                                       ('rotateSkew1', sy, 0), ('scaleY', sy, 1)]:
            if field in matrix.attrib or field.startswith('scale'):
                matrix.set(field, f'{float(matrix.get(field, default)) * factor:.12g}')
        matrix.set('hasScale', 'true')
        count += 1
    if not count:
        raise ValueError(f'{bitmap_id}: no texture matrix was found')
    return dict(bitmapId=bitmap_id, originalSize=list(old.size), replacementSize=list(image.size),
                textureMatrixCount=count, originalAlphaMaskRetained=preserve_alpha, sourceRgbaSha256=rgba_sha(original),
                replacementSha256=sha(replacement))


def prepare(args, mode, rows, selected, sources):
    xml_dir = mode / 'xml'
    xml_dir.mkdir(parents=True, exist_ok=True)
    layouts = {}
    for group in sorted({row['sourceGroup'] for row in rows}):
        source = ROOT / sources[group]['path']
        if sha(source) != sources[group]['sha256']:
            raise ValueError(f'{group}: pinned source changed')
        source_xml = mode / 'source.xml'
        native.ffdec(args, '-swf2xml', source, source_xml)
        tree = ET.parse(source_xml)
        before = layout_sha(tree)
        applied = []
        for row in rows:
            if row['sourceGroup'] == group:
                item = selected[row['key']]
                applied.append(replace_bitmap(tree, row['bitmapId'], item['original'], item['replacement'], row.get('preserveOriginalAlpha', False)))
        after = layout_sha(tree)
        if before != after:
            raise ValueError(f'{group}: source geometry or display-list data changed')
        layouts[group] = dict(beforeSha256=before, afterSha256=after, equal=True, bitmapReplacements=applied)
        xml = xml_dir / f'{group}.xml'
        tree.write(xml, encoding='utf-8', xml_declaration=True)
        print(group, 'replaced', len(applied), 'bitmap definitions', flush=True)
    (mode / 'source-layout.json').write_text(json.dumps(layouts, indent=2) + '\n')
    pages = json.loads((ROOT / 'public/ui/classic/maps/manifest.json').read_text())['pages']
    wanted = {item['asset'] for row in rows for item in row['occurrences']}
    pages = {key: value for key, value in pages.items() if key in wanted}
    native.CACHE = mode
    native.prepare(args, pages)
    tree = ET.parse(xml_dir / 'NewWorldMap2020Panel.xml')
    tags = tree.getroot().find('tags')
    original = next(n for n in tags if n.get('spriteId') == '2718')
    position = list(tags).index(original)
    placements = [n for n in frames(original)[0] if int(n.get('depth', 0)) in (1, 2, 11, 20, 117)]
    tags.remove(original)
    tags.insert(position, native.select_sprite(original, placements))
    for node in list(tags):
        if node.get('name') == 'left' and node.get('type', '').startswith('PlaceObject'):
            tags.remove(node)
    native.write_swf(args, tree, 'space-backdrop')
    native.ffdec(args, '-xml2swf', xml_dir / 'NewWorldMap2020Panel.xml', mode / 'selectors.swf')


def export(args, mode):
    zooms = [2] if args.replay else [4]
    for zoom in zooms:
        native.ffdec(args, '-select', '1', '-zoom', zoom, '-format', 'frame:png',
            '-export', 'frame', mode / f'pages-png{zoom}x', mode / 'atlas-native-stages')
        native.ffdec(args, '-selectid', '2819', '-select', '2819:1-5', '-zoom', zoom,
            '-format', 'sprite:png', '-export', 'sprite', mode / f'selectors-png{zoom}x', mode / 'selectors.swf')


def source_render(mode, row, zoom):
    if row['name'].startswith('selector-'):
        directory = mode / f'selectors-png{zoom}x'
        matches = [p for p in directory.rglob(f'{row["frame"]}.png') if p.parent.name == 'DefineSprite_2819']
        if len(matches) != 1:
            raise ValueError(f'{row["name"]}: missing selector render')
        return matches[0]
    return mode / f'pages-png{zoom}x' / f'{row["name"]}.swf/1.png'


def register_svg(row, replacements, target):
    source = CACHE / 'atlas-native-svg' / f'{row["name"]}.swf/1.svg'
    tree = ET.parse(source)
    root = tree.getroot()
    replaced = 0
    for node in list(root.iter()):
        if not node.tag.endswith('}image'):
            continue
        href_key = next(k for k in node.attrib if k.endswith('}href') or k == 'href')
        payload = base64.b64decode(node.get(href_key).split(',', 1)[1])
        import io
        image = Image.open(io.BytesIO(payload)).convert('RGBA')
        digest = hashlib.sha256(image.tobytes()).hexdigest()
        replacement = replacements[digest]['replacement']
        node.set(href_key, 'data:image/png;base64,' + base64.b64encode(replacement.read_bytes()).decode())
        node.set('preserveAspectRatio', 'none')
        node.set('style', 'image-rendering:auto')
        if replacements[digest]['preserveOriginalAlpha']:
            ns = '{http://www.w3.org/2000/svg}'
            defs = ET.SubElement(root, ns + 'defs')
            opacity = ET.SubElement(defs, ns + 'filter', dict(id='restore-region-opacity',
                x='0', y='0', width='100%', height='100%', **{'color-interpolation-filters': 'sRGB'}))
            transfer = ET.SubElement(opacity, ns + 'feComponentTransfer')
            ET.SubElement(transfer, ns + 'feFuncA', dict(type='table', tableValues='1 1'))
            mask = ET.SubElement(defs, ns + 'mask', dict(id='original-region-alpha',
                maskUnits='userSpaceOnUse', maskContentUnits='userSpaceOnUse', x='0', y='0',
                width=node.get('width'), height=node.get('height'), style='mask-type:alpha'))
            original = replacements[digest]['original']
            ET.SubElement(mask, ns + 'image', {href_key: 'data:image/png;base64,' + base64.b64encode(original.read_bytes()).decode(),
                'width': node.get('width'), 'height': node.get('height'), 'preserveAspectRatio': 'none'})
            node.set('filter', 'url(#restore-region-opacity)')
            node.set('mask', 'url(#original-region-alpha)')
        replaced += 1
    if replaced != 1:
        raise ValueError(f'{row["name"]}: expected exactly one region bitmap')
    x, y, right, bottom = row['crop']
    root.set('width', f'{(right - x) / 2:g}')
    root.set('height', f'{(bottom - y) / 2:g}')
    root.set('viewBox', f'{x} {y} {right - x} {bottom - y}')
    tree.write(target, encoding='utf-8', xml_declaration=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay', action='store_true')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--ai-manifest', type=Path, default=CACHE / 'atlas-ai/manifest.json')
    parser.add_argument('--java', default=str(ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'))
    parser.add_argument('--ffdec', default=str(ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar'))
    args = parser.parse_args()
    if args.replay and args.publish:
        parser.error('Original round-trip verification is never published as enhanced art.')
    bindings = json.loads(BINDINGS.read_text())['bitmaps']
    spec = json.loads(native.SPEC.read_text())
    enhanced = {} if args.replay else json.loads(args.ai_manifest.read_text())['assets']
    for group in sorted({row['sourceGroup'] for row in bindings}):
        source = spec['sources'][group]
        swf = ROOT / source['path']
        if sha(swf) != source['sha256']:
            raise ValueError(f'{group}: pinned source changed')
        group_rows = [row for row in bindings if row['sourceGroup'] == group]
        if any(not (ROOT / row['originalPath']).exists() for row in group_rows):
            native.ffdec(args, '-selectid', ','.join(str(row['bitmapId']) for row in group_rows),
                '-format', 'image:png', '-export', 'image', CACHE / 'atlas-raw-bitmaps' / group, swf)
    selected = {}
    for row in bindings:
        original = ROOT / row['originalPath']
        if rgba_sha(original) != row['rgbaSha256']:
            raise ValueError(f'{row["key"]}: original bitmap changed')
        ai = None if args.replay else enhanced[row['rgbaSha256']]
        replacement = original if args.replay else ROOT / ai['outputPath']
        if not args.replay and sha(replacement) != ai['outputSha256']:
            raise ValueError(f'{row["key"]}: reviewed output changed')
        selected[row['key']] = dict(original=original, replacement=replacement, metadata=ai)
    mode = CACHE / ('atlas-bitmap-roundtrip' if args.replay else 'atlas-bitmap-enhanced')
    mode.mkdir(parents=True, exist_ok=True)
    if args.prepare:
        prepare(args, mode, bindings, selected, spec['sources'])
    if args.export:
        export(args, mode)
    wanted = {item['asset'] for row in bindings for item in row['occurrences']}
    rows = [row for row in spec['assets'] if row['name'] in wanted]
    backdrop = next(row for row in spec['retained'] if row['name'] == 'space-backdrop')
    rows.append(dict(backdrop, method='png4x', crop=[0, 0, 1920, 1120], sourceGroup='NewWorldMap2020Panel'))
    destination = mode / 'publish'
    destination.mkdir(exist_ok=True)
    outcomes = {}
    replacements = {row['rgbaSha256']: dict(original=selected[row['key']]['original'],
        replacement=selected[row['key']]['replacement'], preserveOriginalAlpha=row.get('preserveOriginalAlpha', False)) for row in bindings}
    replay_path = CACHE / 'atlas-bitmap-roundtrip/report.json'
    replay_report = {} if args.replay else json.loads(replay_path.read_text())['assets']
    layouts = None if args.replay else json.loads((mode / 'source-layout.json').read_text())
    for row in rows:
        name = row['name']
        baseline = ROOT / 'public' / row['baselinePath'].lstrip('/')
        if sha(baseline) != row['baselineSha256']:
            raise ValueError(f'{name}: baseline changed')
        original = Image.open(baseline).convert('RGBA')
        if args.replay:
            replay = Image.open(source_render(mode, row, 2)).convert('RGBA').crop(row['crop'])
            equal = original.size == replay.size and original.tobytes() == replay.tobytes()
            difference = np.abs(np.asarray(original, dtype=np.int16) - np.asarray(replay, dtype=np.int16))
            error = np.mean(difference, axis=(0, 1)).tolist()
            maximum = np.max(difference, axis=(0, 1)).tolist()
            # The premultiplied, partly transparent ship drawing loses up to
            # seven RGB levels in the straight-alpha PNG round trip; alpha,
            # geometry and all other atlas pixels remain exact.
            ship_rounding = name == 'planet-1' and max(error[:3]) < 0.009 and max(maximum[:3]) <= 7 and maximum[3] == 0
            if not equal and not ship_rounding:
                raise ValueError(f'{name}: bitmap round-trip was not exact: {error}')
            outcomes[name] = dict(passed=True, rgbaIdentical=equal, alphaIdentical=maximum[3] == 0,
                meanRgbaError=error, maximumRgbaError=maximum, size=list(original.size),
                baselineSha256=sha(baseline), replaySha256=sha(source_render(mode, row, 2)))
        else:
            if not replay_report[name]['passed']:
                raise ValueError(f'{name}: original round trip did not pass')
            suffix = '.svg' if row['method'] == 'svg' else '.png'
            target = destination / f'{name}-mixed-v44{suffix}'
            if row['method'] == 'svg':
                register_svg(row, replacements, target)
            else:
                image = Image.open(source_render(mode, row, 4)).convert('RGBA')
                image.crop([2 * n for n in row['crop']]).save(target)
            used = [b for b in bindings if any(o['asset'] == name for o in b['occurrences'])]
            outcomes[name] = dict(status='exported', baselinePath=row['baselinePath'], baselineSha256=sha(baseline),
                path='/ui/classic/maps/hd/' + target.name, sha256=sha(target), bytes=target.stat().st_size,
                classification='original-vectors-with-enhanced-bitmaps',
                method='original-svg-with-enhanced-bitmaps' if suffix == '.svg' else 'original-display-list-render-4x-with-enhanced-bitmaps',
                logicalWidth=original.width / 2, logicalHeight=original.height / 2,
                sourceUrl=spec['sources'][row['sourceGroup']]['url'], sourceSha256=spec['sources'][row['sourceGroup']]['sha256'],
                sourceBitmapRoundTrip=replay_report[name], sourceGeometryAndDisplayListPreserved=True,
                sourceLayoutSha256=layouts[row['sourceGroup']]['afterSha256'],
                originalSourceCrop2x=row['crop'], bitmapInputs=[dict(key=b['key'], sourceBitmapId=b['bitmapId'],
                    sourceRgbaSha256=b['rgbaSha256'], enhancedSha256=sha(selected[b['key']]['replacement']),
                    enhancedSize=list(Image.open(selected[b['key']]['replacement']).size),
                    originalAlphaMaskRetained=b.get('preserveOriginalAlpha', False)) for b in used],
                limitation='Bitmap pixels were AI restored and may contain minor detail differences; original vector paths, text, transforms and layer ordering are retained.')
            if suffix == '.png':
                outcomes[name].update(pixelWidth=original.width * 2, pixelHeight=original.height * 2)
        print(name, ('original bitmap round trip exact' if outcomes[name]['rgbaIdentical'] else 'original bitmap round trip within documented alpha-conversion bound') if args.replay else 'composition staged', flush=True)
    manifest = dict(schemaVersion=1, assets=outcomes,
        method='Original pinned Flash bitmap definitions replaced; all texture matrices compensate for bitmap dimensions. Original display lists, paths, text, color transforms, layer order, and crops are retained.')
    if not args.replay:
        manifest['bitmaps'] = {row['key']: dict(sourceGroup=row['sourceGroup'],
            sourceBitmapId=row['bitmapId'], sourceRgbaSha256=row['rgbaSha256'],
            originalSize=row['originalSize'], enhancedSha256=sha(selected[row['key']]['replacement']),
            originalAlphaMaskRetained=row.get('preserveOriginalAlpha', False),
            enhancedSize=selected[row['key']]['metadata']['outputSize'],
            generationMode=selected[row['key']]['metadata']['generationMode'],
            generatedInputCopiedWithoutModification=selected[row['key']]['metadata']['copiedWithoutModification'],
            prompt=selected[row['key']]['metadata']['prompt'],
            review=selected[row['key']]['metadata']['review'],
            rejectedCandidates=[{k: v for k, v in rejected.items() if k in ('outputSha256', 'reason')}
                for rejected in selected[row['key']]['metadata'].get('rejectedCandidates', [])])
            for row in bindings}
    (mode / 'report.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if args.publish:
        public = ROOT / 'public/ui/classic/maps/hd'
        for row in outcomes.values():
            name = Path(row['path']).name
            shutil.copyfile(destination / name, public / name)
        shutil.copyfile(mode / 'report.json', public / 'mixed-manifest.json')


if __name__ == '__main__':
    main()
