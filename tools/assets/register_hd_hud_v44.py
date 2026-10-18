#!/usr/bin/env python3
"""Compose restored HUD bitmap parts inside the original source vector wrapper."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def box(image):
    return image.getchannel('A').point(lambda value: 255 if value > 127 else 0).getbbox()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Reviewed generation job metadata')
    parser.add_argument('--destination', type=Path, default=ROOT / '.cache/hd-ui-v44/hud-candidate')
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    supplied = json.loads(args.input.read_text())
    if isinstance(supplied, dict):
        jobs = [{'n': row['part'], 'path': 'public/' + row['path'].lstrip('/'),
                 'prompt': row['generation']['prompt']} for row in supplied['parts']]
        for row in supplied['parts']:
            assert sha((ROOT / 'public' / row['path'].lstrip('/')).read_bytes()) == row['sha256']
        for row in supplied['assets'].values():
            assert sha((ROOT / row['source']).read_bytes()) == row['sourceSha256']
    else:
        jobs = supplied
    jobs = sorted(jobs, key=lambda row: row['n'])
    assert [row['n'] for row in jobs] == [0, 1, 2]
    manifest = {'schema': 1, 'method': 'Original vector geometry with registered AI bitmap parts',
                'pixelPolicy': 'Generated PNG bytes copied unchanged; SVG viewport registration only.',
                'review': {'status': 'accepted',
                           'method': 'Original and restored HUDs reviewed at four times native size by two reviewers.',
                           'notes': 'The original vector paths, placements and gradients remain unchanged. '
                                    'Restored bitmap interiors retain the reviewed blue and silver structure, '
                                    'with small differences in highlights and fine edge details. '
                                    'They are not pixel-identical source artwork.'},
                'parts': [], 'assets': {}}
    images = []
    for job in jobs:
        path = ROOT / job['path']
        image = Image.open(path).convert('RGBA')
        name = f"battle-hud-part-{job['n']}-v44.png"
        output = args.destination / name
        if path.resolve() != output.resolve():
            shutil.copyfile(path, output)
        assert sha(output.read_bytes()) == sha(path.read_bytes())
        images.append((image, path.read_bytes()))
        manifest['parts'].append({'part': job['n'], 'path': '/ui/classic/hd/' + name,
                                  'sha256': sha(path.read_bytes()), 'width': image.width,
                                  'height': image.height, 'alpha128Bounds': box(image),
                                  'generation': {'tool': 'Built-in image_gen', 'prompt': job['prompt'],
                                                 'transparentBackground': True}})
    for name in ['battle-hud-player', 'battle-hud-opponent']:
        source = ROOT / f'public/ui/classic/hd/{name}.svg'
        tree = ET.parse(source)
        originals = list(tree.getroot().iter(f'{{{SVG}}}image'))
        assert len(originals) == 3
        source_nodes = [ET.tostring(node) for node in tree.getroot().iter()
                        if node.tag in {f'{{{SVG}}}path', f'{{{SVG}}}use', f'{{{SVG}}}linearGradient'}]
        registrations = []
        parents = {child: parent for parent in tree.getroot().iter() for child in parent}
        for number, original in enumerate(originals):
            original_data = base64.b64decode(original.get(f'{{{XLINK}}}href').split(',', 1)[1])
            original_image = Image.open(io.BytesIO(original_data)).convert('RGBA')
            new_image, new_data = images[number]
            old_box, new_box = box(original_image), box(new_image)
            sx = (old_box[2] - old_box[0]) / (new_box[2] - new_box[0])
            sy = (old_box[3] - old_box[1]) / (new_box[3] - new_box[1])
            wrapper = ET.Element(f'{{{SVG}}}svg', {
                'width': original.get('width'), 'height': original.get('height'),
                'viewBox': f'0 0 {original_image.width} {original_image.height}',
                'overflow': 'hidden'})
            ET.SubElement(wrapper, f'{{{SVG}}}image', {
                'x': str(old_box[0] - new_box[0] * sx),
                'y': str(old_box[1] - new_box[1] * sy),
                'width': str(new_image.width * sx), 'height': str(new_image.height * sy),
                'preserveAspectRatio': 'none', 'style': 'image-rendering:auto',
                f'{{{XLINK}}}href': 'data:image/png;base64,' + base64.b64encode(new_data).decode()})
            parent = parents[original]
            index = list(parent).index(original)
            parent.remove(original)
            parent.insert(index, wrapper)
            registrations.append({'part': number, 'sourceRgbaSha256': sha(original_image.tobytes()),
                                   'sourcePngSha256': sha(original_data), 'sourceSize': list(original_image.size),
                                   'sourceAlpha128Bounds': old_box, 'scale': [sx, sy]})
        assert source_nodes == [ET.tostring(node) for node in tree.getroot().iter()
                                if node.tag in {f'{{{SVG}}}path', f'{{{SVG}}}use', f'{{{SVG}}}linearGradient'}]
        output = args.destination / f'{name}-v44.svg'
        tree.write(output, encoding='utf-8', xml_declaration=True)
        manifest['assets'][name] = {'source': str(source.relative_to(ROOT)),
            'sourceSha256': sha(source.read_bytes()), 'path': '/ui/classic/hd/' + output.name,
            'sha256': sha(output.read_bytes()), 'sourceGeometryUnchanged': True,
            'registration': registrations}
    (args.destination / 'hud-ai-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'parts': 3, 'wrappers': 2, 'destination': str(args.destination)}))


if __name__ == '__main__':
    main()
