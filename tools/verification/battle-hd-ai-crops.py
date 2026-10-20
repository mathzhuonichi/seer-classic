#!/usr/bin/env python3
"""Before/after device-pixel crops of V60 AI-upscaled or V61 redrawn battle cells, rendered in software.

Usage: battle-hd-ai-crops.py <species>[,<species>...] [--frames standby:0,attack:auto] [--version v60|v61]

For each species it renders the same frame from the published base atlas (before) and the V60 atlas (after) at the
reference display of audit_battle_hd_density.py (280 CSS px box x zoom 1.5 x DPR 2), one output pixel per device
pixel. The renderer follows the battle shader (swf-renderer): straight bilinear texel fetch at UV x (size - 1), then
the vertex multiply and add colours, premultiply, and premultiplied "over" compositing in quad order. Only normal
blending is supported; other materials are drawn as normal and reported. `attack:auto` picks the attack frame that
shows the most changed (AI-upscaled or redrawn) cell area. Writes artifacts/battle-hd-ai-v60/crops/ or
artifacts/battle-hd-redraw-v61/crops/. Status `tool`: a diagnostic, not a gate; browser evidence is battle-hd-display.mjs.
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/assets'))
from audit_battle_hd_density import (DEFAULT_PHYSICAL_SCALE, original_magnification, physical_scales,  # noqa: E402
                                     reference_box_device_pixels, uv_key)

VERSIONS = {'v60': (ROOT/'.cache/battle-hd-v60', ROOT/'artifacts/battle-hd-ai-v60/crops', 'aiUpscaledCellIds'),
            'v61': (ROOT/'.cache/battle-hd-v61', ROOT/'artifacts/battle-hd-redraw-v61/crops', 'redrawnCellIds')}


def load_meta(url):
    return json.loads(gzip.decompress((ROOT/'public'/url.lstrip('/')).read_bytes()))


def load_atlas(url):
    with Image.open(ROOT/'public'/url.lstrip('/')) as image:
        return np.asarray(image.convert('RGBA'), dtype=np.float32)/255


def sample(atlas, u, v):
    """The shader's straight bilinear fetch at atlas UV x (size - 1)."""
    height, width = atlas.shape[:2]
    x, y = u*(width-1), v*(height-1)
    x0, y0 = np.floor(x), np.floor(y)
    x1, y1 = np.minimum(x0+1, width-1), np.minimum(y0+1, height-1)
    tx, ty = (x-x0)[:, None], (y-y0)[:, None]
    x0, y0, x1, y1 = (np.clip(a, 0, n-1).astype(np.int64) for a, n in ((x0, width), (y0, height), (x1, width), (y1, height)))
    top = atlas[y0, x0]*(1-tx)+atlas[y0, x1]*tx
    bottom = atlas[y1, x0]*(1-tx)+atlas[y1, x1]*tx
    return top*(1-ty)+bottom*ty


def render(atlas, frame, scale, origin, size):
    """Premultiplied RGBA float canvas of one frame; scale is device pixels per clip unit."""
    width, height = size
    canvas = np.zeros((height, width, 4), dtype=np.float32)
    positions, uvs, mul, add = frame['positions'], frame['uvs'], frame['mulColors'], frame['addColors']
    for q in range(len(uvs)//8):
        p = np.array([((positions[q*8+i*2]-origin[0])*scale, (origin[1]-positions[q*8+i*2+1])*scale) for i in range(4)])
        t = np.array([(uvs[q*8+i*2], uvs[q*8+i*2+1]) for i in range(4)])
        m, a = np.array(mul[q*16:q*16+4], dtype=np.float32), np.array(add[q*16:q*16+4], dtype=np.float32)
        x0, y0 = np.floor(p.min(0)).astype(int)
        x1, y1 = np.ceil(p.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, width), min(y1, height)
        if x1 <= x0 or y1 <= y0:
            continue
        ys, xs = np.mgrid[y0:y1, x0:x1]
        points = np.stack((xs.ravel()+.5, ys.ravel()+.5), axis=1)-p[0]
        basis = np.stack((p[1]-p[0], p[3]-p[0]), axis=1)
        if abs(np.linalg.det(basis)) < 1e-9:
            continue
        s, r = np.linalg.solve(basis, points.T)
        inside = (s >= 0) & (s <= 1) & (r >= 0) & (r <= 1)
        if not inside.any():
            continue
        uv = t[0]+np.outer(s[inside], t[1]-t[0])+np.outer(r[inside], t[3]-t[0])
        colour = sample(atlas, uv[:, 0], uv[:, 1])*m
        colour = colour+(colour[:, 3:] >= .01)*a
        colour = np.clip(colour, 0, 1)
        colour[:, :3] *= colour[:, 3:]
        target = canvas[ys.ravel()[inside], xs.ravel()[inside]]
        canvas[ys.ravel()[inside], xs.ravel()[inside]] = colour+target*(1-colour[:, 3:])
    return canvas


def to_image(canvas, background):
    rgb = canvas[:, :, :3]+np.array(background, dtype=np.float32)/255*(1-canvas[:, :, 3:])
    return Image.fromarray(np.clip(np.rint(rgb*255), 0, 255).astype(np.uint8))


def ai_area(frame, cells):
    """Clip-space area of AI-upscaled quads in a frame, weighted by their alpha multiplier."""
    total = 0.0
    for q in range(len(frame['uvs'])//8):
        uv = frame['uvs'][q*8:q*8+8]
        key = uv_key((min(uv[::2]), min(uv[1::2]), max(uv[::2]), max(uv[1::2])))
        if key in cells:
            p = frame['positions'][q*8:q*8+8]
            edge1, edge2 = (p[2]-p[0], p[3]-p[1]), (p[6]-p[0], p[7]-p[1])
            total += abs(edge1[0]*edge2[1]-edge1[1]*edge2[0])*frame['mulColors'][q*16+3]
    return total


def species_crops(sid, frames, version):
    cache, out, changed = VERSIONS[version]
    report = json.loads((cache/'species'/sid/'report.json').read_text())
    before_meta, after_meta = load_meta(report['base']['meta']), load_meta(report['meta'])
    before_atlas, after_atlas = load_atlas(report['base']['atlas']), load_atlas(report['atlas'])
    original = json.loads((ROOT/'public/battle-animations/runtime-index.json').read_text())['species'][sid]
    original_meta = load_meta(original['meta'])
    with Image.open(ROOT/'public'/original['atlas'].lstrip('/')) as image:
        alpha = np.asarray(image.convert('RGBA'))[:, :, 3]
    scale, box, _ = original_magnification(original_meta, alpha, physical_scales().get(sid, DEFAULT_PHYSICAL_SCALE),
                                           reference_box_device_pixels())
    placements = {p['id']: p for p in report['layout']['placements']}
    ai_cells = {uv_key(placements[c]['sourceUvBounds']) for c in report[changed]}
    sequences = {s['name']: s for s in after_meta['sequences']}
    originals = {s['name']: s for s in original_meta['sequences']}
    results = []
    for name, number in frames:
        sequence = sequences[name]
        if number == 'auto':
            number = max(range(len(sequence['frames'])), key=lambda i: (ai_area(originals[name]['frames'][i], ai_cells), -i))
        number = int(number)
        before_frame = next(s for s in before_meta['sequences'] if s['name'] == name)['frames'][number]
        after_frame = sequence['frames'][number]
        xs, ys = after_frame['positions'][::2], after_frame['positions'][1::2]
        margin = 8/scale
        origin = (min(xs)-margin, max(ys)+margin)
        size = (int(np.ceil((max(xs)-min(xs))*scale+16)), int(np.ceil((max(ys)-min(ys))*scale+16)))
        images = {}
        for label, meta_frame, atlas in (('before', before_frame, before_atlas), ('after', after_frame, after_atlas)):
            canvas = render(atlas, meta_frame, scale, origin, size)
            for background, colour in (('dark', (32, 34, 52)), ('light', (236, 236, 236))):
                image = to_image(canvas, colour)
                path = out/f'{sid}-{name}-{number}-{label}-{background}.png'
                image.save(path)
                images[(label, background)] = image
        sheet = Image.new('RGB', (size[0]*2+12, size[1]*2+12), (255, 255, 255))
        for col, label in enumerate(('before', 'after')):
            for row, background in enumerate(('dark', 'light')):
                sheet.paste(images[(label, background)], (col*(size[0]+12), row*(size[1]+12)))
        sheet_path = out/f'{sid}-{name}-{number}-sheet.png'
        sheet.save(sheet_path)
        results.append({'species': int(sid), 'sequence': name, 'frame': number, 'devicePixelsPerClipUnit': scale,
                        'size': list(size), 'sheet': str(sheet_path.relative_to(ROOT)),
                        'aiQuadArea': ai_area(originals[name]['frames'][number], ai_cells)})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids')
    parser.add_argument('--frames', default='standby:0,attack:auto')
    parser.add_argument('--version', choices=sorted(VERSIONS), default='v60')
    args = parser.parse_args()
    out = VERSIONS[args.version][1]
    out.mkdir(parents=True, exist_ok=True)
    frames = [tuple(item.split(':')) for item in args.frames.split(',')]
    results = [row for sid in args.ids.split(',') for row in species_crops(sid, frames, args.version)]
    (out/'crops.json').write_text(json.dumps(results, indent=1)+'\n')
    print(json.dumps(results))


if __name__ == '__main__':
    main()
