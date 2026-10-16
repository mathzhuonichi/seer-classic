#!/usr/bin/env python3
"""Export the six original map 500 floor frames without assigning game floors."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
SOURCE_SHA256 = '3752cfe0cb2fc22693ff825d4b87d2faa7af268f1fad9f577d7dfe6d7749928f'
SVG_NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ffdec(args, *options):
    subprocess.run([str(args.java), '-Xmx768m', '-Dapple.awt.UIElement=true',
                    '-Djava.awt.headless=true', '-jar', str(args.ffdec), '-cli',
                    *map(str, options)], check=True, stdout=subprocess.DEVNULL)


def display_frames(sprite):
    slots, frames = {}, []
    for tag in sprite.find('subTags'):
        kind, depth = tag.get('type', ''), tag.get('depth')
        if kind.startswith('PlaceObject'):
            if tag.get('placeFlagMove') == 'true':
                raise ValueError('Unexpected moving placement in the pinned floor timeline')
            slots[depth] = deepcopy(tag)
        elif kind.startswith('RemoveObject'):
            slots.pop(depth, None)
        elif kind == 'ShowFrameTag':
            frames.append([deepcopy(slots[d]) for d in sorted(slots, key=int)])
    return frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.cache/hd-ui-v44/map-sources/500.swf')
    parser.add_argument('--java', type=Path, default=ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java')
    parser.add_argument('--ffdec', type=Path, default=ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/tower-v54')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/tower-v54/source-floor-frames')
    args = parser.parse_args()
    if sha(args.source) != SOURCE_SHA256:
        raise ValueError('The source map changed; inspect it before exporting')
    args.cache.mkdir(parents=True, exist_ok=True)
    source_xml = args.cache / '500.xml'
    ffdec(args, '-swf2xml', args.source, source_xml)
    tree = ET.parse(source_xml)
    root, tags = tree.getroot(), tree.getroot().find('tags')
    rect = root.find('displayRect')
    if [rect.get(k) for k in ('Xmin', 'Ymin', 'Xmax', 'Ymax')] != ['0', '0', '19200', '11200']:
        raise ValueError('Unexpected source stage rectangle')
    sprites = {t.get('spriteId'): t for t in tags if t.get('type') == 'DefineSpriteTag'}
    frames = display_frames(sprites['70'])
    expected_children = ['59', '61', '63', '65', '67', '69']
    if len(frames) != 6 or [f[1].get('characterId') for f in frames] != expected_children:
        raise ValueError('Unexpected source floor frames')
    source_placement = next(t for t in sprites['71'].find('subTags') if t.get('name') == 'floorMc')
    matrix = source_placement.find('matrix')
    if matrix.get('translateX') != '4531' or matrix.get('translateY') != '3843':
        raise ValueError('Unexpected source floor position')

    # Only the inspected floor is placed on the stage. Definitions are copied
    # without changing source shape paths, colors, masks or frame-six offset.
    for tag in list(tags):
        if not tag.get('type', '').startswith('Define') and tag.get('type') not in ('FileAttributesTag', 'SetBackgroundColorTag'):
            tags.remove(tag)
    for index, frame in enumerate(frames, 1):
        sprite = ET.SubElement(tags, 'item', {'type': 'DefineSpriteTag', 'forceWriteAsLong': 'true',
            'frameCount': '1', 'hasEndTag': 'true', 'spriteId': str(3000 + index)})
        sub = ET.SubElement(sprite, 'subTags')
        sub.extend(frame)
        ET.SubElement(sub, 'item', {'type': 'ShowFrameTag', 'forceWriteAsLong': 'false'})
    for index in range(1, 7):
        if index > 1:
            ET.SubElement(tags, 'item', {'type': 'RemoveObject2Tag', 'forceWriteAsLong': 'false', 'depth': '1'})
        placement = deepcopy(source_placement)
        placement.set('characterId', str(3000 + index))
        placement.set('depth', '1')
        tags.append(placement)
        ET.SubElement(tags, 'item', {'type': 'ShowFrameTag', 'forceWriteAsLong': 'false'})
    root.set('frameCount', '6')
    staged_xml, staged_swf = args.cache / 'floor-stages.xml', args.cache / 'floor-stages.swf'
    tree.write(staged_xml, encoding='utf-8', xml_declaration=True)
    ffdec(args, '-xml2swf', staged_xml, staged_swf)
    exported = args.cache / 'floor-svg'
    ffdec(args, '-select', '1-6', '-format', 'frame:svg', '-export', 'frame', exported, staged_swf)

    colors = ['#3cecff', '#a7fc50', '#03c952', '#5e9eff', '#e6e6e6', '#f5ad5c']
    args.output.mkdir(parents=True, exist_ok=True)
    assets = []
    for index, color in enumerate(colors, 1):
        svg = ET.parse(exported / f'{index}.svg')
        node = svg.getroot()
        if node.get('width') != '960.0px' or node.get('height') != '560.0px':
            raise ValueError('Unexpected exported stage dimensions')
        group = node.find(f'{{{SVG_NS}}}g')
        backdrop = group.find(f'{{{SVG_NS}}}rect')
        if backdrop is None or backdrop.attrib != {'fill': '#ffffff', 'height': '560.0px', 'width': '960.0px'}:
            raise ValueError('Unexpected exporter backdrop')
        group.remove(backdrop)  # Exporter stage backdrop, not original artwork.
        node.set('width', '960')
        node.set('height', '560')
        node.set('viewBox', '0 0 960 560')
        for child in node.iter():
            if child.tag.rsplit('}', 1)[-1] in ('image', 'script', 'foreignObject'):
                raise ValueError('Unexpected non-vector content')
            for key, value in child.attrib.items():
                if key.rsplit('}', 1)[-1] == 'href' and not value.startswith('#'):
                    raise ValueError('Unexpected external reference')
        path = args.output / f'floor-frame-{index}.svg'
        svg.write(path, encoding='utf-8', xml_declaration=True)
        assets.append({'file': path.name, 'sourceFrame': index, 'sourceSprite': 70,
                       'sourceChildSprite': int(expected_children[index - 1]),
                       'sourceFill': color, 'sha256': sha(path)})
    manifest = {
        'schemaVersion': 1,
        'source': {'url': 'https://seer.61.com/resource/map/500.swf', 'sha256': SOURCE_SHA256,
                   'createdInMetadata': '2009-07-30T14:37:13+08:00',
                   'modifiedInMetadata': '2016-01-19T10:58:13+08:00'},
        'exporter': 'JPEXS FFDec 26.3.0',
        'stageViewBox': [0, 0, 960, 560],
        'sourcePlacement': {'path': 'animator_mc.floorMc', 'sprite': 70,
                            'matrix': [1, 0, 0, 1, 226.55, 192.15], 'maskShape': 57},
        'sourceMaskBounds': [227.5, 193.5, 750.45, 417.5],
        'background': {'path': '/maps/original/500.svg',
                       'sha256': '63c4434300b7ed89b89c5792a3babd89a62a1585c56767ce50d9c458acc66a65',
                       'viewBox': [182.05, 120.35, 960, 560],
                       'matchingRootTranslation': [182.05, 120.35]},
        'gameFloorToFrameMapping': None,
        'mappingStatus': 'No recovered controller mapping. Asset frame numbers are not game-floor numbers.',
        'method': 'Original masked vector display lists, placed at their original stage coordinates. Only the exporter white stage backdrop is removed.',
        'assets': assets,
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Exported six original transparent floor layers at their original 960 x 560 stage coordinates.')


if __name__ == '__main__':
    main()
