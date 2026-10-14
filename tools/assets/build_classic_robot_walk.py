#!/usr/bin/env python3
"""Reconstruct the original player walking cycle into eight SVG strips.

Requires the standing compositor's cached XML, its leaf exports, and additional
leaf exports of each direction's nested movement clip under walking-exports.
Only immutable vector leaves are read from FFDec exports. Source display lists
supply every transform and layer order; no Flash bytecode is executed.
"""
from pathlib import Path
import copy
import json
import shutil
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image
from build_classic_robots import CACHE, OUT, SVG, Source, matrix_text, render_order, sha, write


def render_cycle(source, cid, direction_frame, movement_frame, defs, audit):
    """Advance the first child movement clip, as SkeletonClothPreview does."""
    group = ET.Element(SVG + 'g', {
        'data-source-symbol': f'{source.name}:{cid}',
        'data-source-frame': str(direction_frame),
    })
    for depth, entry in source.display(cid, direction_frame):
        transform = entry.get('matrix', [1, 0, 0, 1, 0, 0])
        layer = ET.SubElement(group, SVG + 'g', {
            'transform': matrix_text(transform), 'data-source-depth': str(depth),
        })
        audit.append({'source': source.name, 'symbol': cid, 'frame': direction_frame,
                      'depth': depth, 'character': entry['character'], 'matrix': transform})
        layer.append(source.render(entry['character'], movement_frame, defs, audit))
    return group


def main():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    exports = list(CACHE.glob('color-svg/DefineSprite_4435*/*.svg'))
    exports += list(CACHE.glob('ui-svg/DefineSprite_6508*/*.svg'))
    exports += list((CACHE / 'walking-exports/ui').rglob('*.svg'))
    ui = Source('ui', CACHE / 'UI.xml', exports)
    items = {cid: Source(f'item{cid}', CACHE / f'{cid}.xml',
                        list((CACHE / f'item-{cid}').rglob('*.svg')) +
                        list((CACHE / f'walking-exports/{cid}').rglob('*.svg')))
             for cid in [100001, 100002, 100003]}
    slots = manifest['slotRegistrations']
    order_source = (CACHE / 'core-script/scripts/com/robot/core/skeleton/ClothPreview.as').read_text()
    audit_dir = CACHE / 'walking-audit'
    audit_dir.mkdir(exist_ok=True)
    rsvg = shutil.which('rsvg-convert')
    if not rsvg:
        raise RuntimeError('rsvg-convert is required to verify walking bounds')
    frames, boxes, placements = {}, [], {}
    for direction, pose in manifest['poses'].items():
        frames[direction] = []
        for movement_frame in range(1, 14):
            root = ET.Element(SVG + 'svg', {'viewBox': '-100 -100 200 200'})
            defs = ET.SubElement(root, SVG + 'defs')
            standing = ET.parse(OUT / f'player-{direction}.svg').getroot()
            defs.append(copy.deepcopy(standing.find(SVG + 'defs/' + SVG + 'filter')))
            body = ET.SubElement(root, SVG + 'g', {'transform': matrix_text(pose['bodyMatrix'])})
            audit = []
            for slot in render_order(pose['label'], slots, order_source):
                if slot == 'color':
                    source, cid = ui, manifest['skeletonSymbols']['color']
                elif slot == 'cloth':
                    source, cid = ui, manifest['skeletonSymbols']['defaultCloth']
                elif slot in pose['equippedSlots']:
                    source = items[pose['equippedSlots'][slot]]
                    cid = source.symbols['item']
                else:
                    continue
                node = ET.SubElement(body, SVG + 'g', {
                    'transform': matrix_text(slots[slot]['matrix']), 'data-slot': slot,
                })
                if slot == 'color':
                    node.set('filter', 'url(#body-colour)')
                node.append(render_cycle(source, cid, source.labels(cid)[pose['label']],
                                         movement_frame, defs, audit))
            path = audit_dir / f'{direction}-{movement_frame:02d}.svg'
            write(root, path)
            png = path.with_suffix('.png')
            subprocess.run([rsvg, '-w', '1000', '-h', '1000', str(path), '-o', str(png)], check=True)
            with Image.open(png) as image:
                box = image.getchannel('A').getbbox()
            if box is None or min(box[:2]) <= 0 or max(box[2:]) >= 1000:
                raise ValueError(f'Invalid or clipped frame: {path}')
            boxes.append([box[0] / 5 - 102, box[1] / 5 - 102,
                          (box[2] - box[0]) / 5 + 4, (box[3] - box[1]) / 5 + 4])
            frames[direction].append(root)
            placements[f'{direction}-{movement_frame}'] = audit
    x, y = min(b[0] for b in boxes), min(b[1] for b in boxes)
    width = max(b[0] + b[2] for b in boxes) - x
    height = max(b[1] + b[3] for b in boxes) - y
    walking = {'method': 'Exact source nested movement frames 2-13, idle frame 1; original direction-specific layer order and complete source MATRIX values.',
               'sourceManifestSha256': sha(OUT / 'manifest.json'),
               'sourceScripts': manifest['sourceAudits'],
               'sourceFrameRate': 24, 'cycleDurationSeconds': 0.5,
               'frameCount': 13, 'idleFrame': 1, 'walkingFrames': list(range(2, 14)),
               'commonViewport': [x, y, width, height], 'poses': {}}
    for direction, roots in frames.items():
        strip = ET.Element(SVG + 'svg', {'viewBox': f'0 0 {width * 13:.9g} {height:.9g}',
                                        'width': f'{width * 13:.9g}', 'height': f'{height:.9g}'})
        defs = ET.SubElement(strip, SVG + 'defs')
        seen = set()
        for index, root in enumerate(roots):
            for definition in root.find(SVG + 'defs'):
                if definition.get('id') not in seen:
                    defs.append(copy.deepcopy(definition))
                    seen.add(definition.get('id'))
            cell = ET.SubElement(strip, SVG + 'g', {
                'transform': f'translate({index * width - x:.9g} {-y:.9g})',
                'data-movement-frame': str(index + 1),
            })
            cell.append(copy.deepcopy(root.find(SVG + 'g')))
        path = OUT / f'player-{direction}-walk.svg'
        write(strip, path)
        walking['poses'][direction] = {'path': f'/robots/classic/{path.name}',
                                       'sha256': sha(path), 'directionFrame': manifest['poses'][direction]['frame'],
                                       'renderOrder': manifest['poses'][direction]['renderOrder']}
    audit_file = audit_dir / 'placements.json'
    audit_file.write_text(json.dumps(placements, indent=2) + '\n')
    walking['placementAudit'] = {'path': str(audit_file.relative_to(OUT.parents[2])),
                                 'sha256': sha(audit_file)}
    (OUT / 'walking-manifest.json').write_text(json.dumps(walking, indent=2) + '\n')
    print(f'Reconstructed 104 source frames; shared viewport: {walking["commonViewport"]}')


if __name__ == '__main__':
    main()
