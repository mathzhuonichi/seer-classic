#!/usr/bin/env python3
"""Pure single-page atlas packing and UV remapping for original battle meshes.

Coordinates use the installed renderer's pixel-center convention: UV * (size-1).
Source bounds are normalized UV bounds, not rounded pixel crops. The caller owns
image rendering/orientation and must put each image's first pixel at placement x/y.
Extrude each image's edge RGBA into its two-pixel padding, including corner pixels.
Preserve edge alpha exactly; opaque backgrounds and RGB-only extrusion are wrong.
Do not pre-inset UVs: the installed renderer applies its own half-texel inset.
Packing never rotates, rescales, mutates inputs, or silently creates another page.
"""
from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct


def _integer(value, label, minimum=1):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f'{label} must be an integer >= {minimum}')
    return value


def _inside(a, b):
    return a[0] >= b[0] and a[1] >= b[1] and a[0]+a[2] <= b[0]+b[2] and a[1]+a[3] <= b[1]+b[3]


def _overlap(a, b):
    return a[0] < b[0]+b[2] and a[0]+a[2] > b[0] and a[1] < b[1]+b[3] and a[1]+a[3] > b[1]


def _pack(rows, width, height, padding):
    """MaxRects best-short-side-fit, without rotation."""
    free = [(0, 0, width, height)]
    placements = []
    for row in rows:
        w, h = row['width']+2*padding, row['height']+2*padding
        fits = [(min(f[2]-w, f[3]-h), max(f[2]-w, f[3]-h), f[1], f[0], i)
                for i, f in enumerate(free) if w <= f[2] and h <= f[3]]
        if not fits:
            return None
        chosen = free[min(fits)[-1]]
        used = (chosen[0], chosen[1], w, h)
        split = []
        for f in free:
            if not _overlap(f, used):
                split.append(f)
                continue
            fx, fy, fw, fh = f
            x, y, uw, uh = used
            if x > fx:
                split.append((fx, fy, x-fx, fh))
            if x+uw < fx+fw:
                split.append((x+uw, fy, fx+fw-x-uw, fh))
            if y > fy:
                split.append((fx, fy, fw, y-fy))
            if y+uh < fy+fh:
                split.append((fx, y+uh, fw, fy+fh-y-uh))
        unique = sorted(set(split))
        free = [f for i, f in enumerate(unique) if not any(i != j and _inside(f, other) for j, other in enumerate(unique))]
        placements.append({**row, 'x': used[0]+padding, 'y': used[1]+padding, 'allocation': list(used)})
    used_width = max(p['allocation'][0]+p['allocation'][2] for p in placements)
    used_height = max(p['allocation'][1]+p['allocation'][3] for p in placements)
    return {'width': used_width, 'height': used_height, 'rgbaBytes': used_width*used_height*4,
            'padding': padding, 'paddingMode': 'extrude-edge-rgba', 'uvMapping': 'pixel-boundaries-over-size-minus-one',
            'placements': sorted(placements, key=lambda p: p['id'])}


def layout_atlas(rectangles, max_side=8192, padding=2, max_rgba_bytes=None):
    """Pack {id,width,height,sourceUvBounds:[minU,minV,maxU,maxV]} on one page.

    Raises ValueError when this deterministic heuristic cannot meet the budget;
    failure is not a proof that no possible packing exists. A caller may reduce
    rendered sizes explicitly, then retry. The caller must review that policy.
    """
    _integer(max_side, 'max_side', 2)
    _integer(padding, 'padding', 2)
    if max_rgba_bytes is not None:
        _integer(max_rgba_bytes, 'max_rgba_bytes')
    rows = copy.deepcopy(list(rectangles))
    if not rows:
        raise ValueError('At least one rectangle is required')
    ids, bounds = set(), set()
    for row in rows:
        if not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids:
            raise ValueError('Rectangle IDs must be unique nonempty strings')
        ids.add(row['id'])
        w, h = _integer(row.get('width'), 'width'), _integer(row.get('height'), 'height')
        if max(w, h)+2*padding > max_side:
            raise ValueError(f"Rectangle {row['id']} exceeds the single-page size limit")
        b = row.get('sourceUvBounds')
        if not isinstance(b, (list, tuple)) or len(b) != 4 or not all(isinstance(v, (float, int)) and math.isfinite(v) for v in b):
            raise ValueError(f"Rectangle {row['id']} has invalid UV bounds")
        if not (0 <= b[0] < b[2] <= 1 and 0 <= b[1] < b[3] <= 1) or tuple(b) in bounds:
            raise ValueError(f"Rectangle {row['id']} has degenerate, duplicate, or out-of-range UV bounds")
        bounds.add(tuple(b))
    area = sum((r['width']+2*padding)*(r['height']+2*padding) for r in rows)
    if area > max_side*max_side or (max_rgba_bytes is not None and area*4 > max_rgba_bytes):
        raise ValueError('Rectangle area alone exceeds the single-page memory/size budget')
    minimum = max(max(r['width']+2*padding for r in rows), math.ceil(area/max_side))
    widths = sorted({minimum, max_side, *range(math.ceil(minimum/256)*256, max_side+1, 256)})
    orderings = [sorted(rows, key=lambda r: (-max(r['width'], r['height']), -r['width']*r['height'], r['id'])),
                 sorted(rows, key=lambda r: (-r['width']*r['height'], -max(r['width'], r['height']), r['id']))]
    best = None
    for ordered in orderings:
        for width in widths:
            result = _pack(ordered, width, max_side, padding)
            if result is None or (max_rgba_bytes is not None and result['rgbaBytes'] > max_rgba_bytes):
                continue
            score = (result['rgbaBytes'], max(result['width'], result['height']), result['width'])
            if best is None or score < best[0]:
                best = score, result
    if best is None:
        raise ValueError('No single-page packing found within the requested memory/size budget')
    return best[1]


def _quad_bounds(quad):
    if len(quad) != 8 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in quad):
        raise ValueError('Each quad must have eight finite UV coordinates')
    return [min(quad[::2]), min(quad[1::2]), max(quad[::2]), max(quad[1::2])]


def remap_uvs(uvs, layout, tolerance=1e-7):
    """Remap consecutive quads, preserving each original vertex's UV orientation.

    New endpoints refer to content pixel boundaries (x-.5 through x+width-.5).
    Non-tiled renderer inset then samples approximately the first/last centers;
    tiled sampling uses the RGBA-extruded padding at its uninset boundary edges.
    Renderer half-texel inset remains renderer-owned. Multi-page is unsupported.
    """
    if len(uvs) % 8:
        raise ValueError('UV array must contain consecutive complete quads')
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError('Invalid matching tolerance')
    width, height = layout['width'], layout['height']
    _integer(width, 'atlas width', 2)
    _integer(height, 'atlas height', 2)
    result = []
    for offset in range(0, len(uvs), 8):
        quad = uvs[offset:offset+8]
        b = _quad_bounds(quad)
        matches = [p for p in layout['placements'] if all(abs(a-c) <= tolerance for a, c in zip(b, p['sourceUvBounds']))]
        if len(matches) != 1:
            raise ValueError(f'Quad at offset {offset} has {len(matches)} source rectangle matches')
        p = matches[0]
        lo_u, lo_v, hi_u, hi_v = p['sourceUvBounds']
        for u, v in zip(quad[::2], quad[1::2]):
            if min(abs(u-lo_u), abs(u-hi_u)) > tolerance or min(abs(v-lo_v), abs(v-hi_v)) > tolerance:
                raise ValueError('The installed renderer requires axis-aligned UV rectangle corners')
            x = p['x']-.5 + (u-lo_u)/(hi_u-lo_u)*p['width']
            y = p['y']-.5 + (v-lo_v)/(hi_v-lo_v)*p['height']
            result.extend((x/(width-1), y/(height-1)))
    return result


def remap_clip(meta, layout):
    """Copy the source; change only atlas dimensions and per-frame UV arrays."""
    result = copy.deepcopy(meta)
    result['atlasWidth'], result['atlasHeight'] = layout['width'], layout['height']
    for sequence in result['sequences']:
        for frame in sequence['frames']:
            frame['uvs'] = remap_uvs(frame['uvs'], layout)
    return result


def _verify(meta, layout):
    before = copy.deepcopy(meta)
    remapped = remap_clip(meta, layout)
    assert meta == before, 'Input metadata must remain immutable'
    for i, p in enumerate(layout['placements']):
        assert p['allocation'][0] >= 0 and p['allocation'][1] >= 0
        assert p['allocation'][0]+p['allocation'][2] <= layout['width']
        assert p['allocation'][1]+p['allocation'][3] <= layout['height']
        assert all(not _overlap(p['allocation'], q['allocation']) for q in layout['placements'][i+1:])
    occurrences, max_error = 0, 0.0
    for old_sequence, new_sequence in zip(meta['sequences'], remapped['sequences']):
        for old_frame, new_frame in zip(old_sequence['frames'], new_sequence['frames']):
            assert {k: v for k, v in old_frame.items() if k != 'uvs'} == {k: v for k, v in new_frame.items() if k != 'uvs'}
            for start in range(0, len(old_frame['uvs']), 8):
                b = _quad_bounds(old_frame['uvs'][start:start+8])
                p = next(p for p in layout['placements'] if p['sourceUvBounds'] == b)
                for axis, value in enumerate(new_frame['uvs'][start:start+8]):
                    size = layout['width'] if axis % 2 == 0 else layout['height']
                    quantized = struct.unpack('f', struct.pack('f', value))[0]
                    max_error = max(max_error, abs(quantized-value)*(size-1))
                    actual = value*(size-1)
                    begin = (p['x'] if axis % 2 == 0 else p['y'])-.5
                    end = begin+(p['width'] if axis % 2 == 0 else p['height'])
                    assert min(abs(actual-begin), abs(actual-end)) < 1e-7
                occurrences += 1
    restored = copy.deepcopy(remapped)
    restored['atlasWidth'], restored['atlasHeight'] = meta['atlasWidth'], meta['atlasHeight']
    for old_sequence, new_sequence in zip(meta['sequences'], restored['sequences']):
        for old_frame, new_frame in zip(old_sequence['frames'], new_sequence['frames']):
            new_frame['uvs'] = old_frame['uvs']
    assert restored == meta, 'No pose, sequence, label, mesh, material, or color changes are allowed'
    assert max_error < .001, 'Float32 quantization must stay below 0.001 pixel'
    return {'quadOccurrences': occurrences, 'uniqueRectangles': len(layout['placements']),
            'nonUvMetadataUnchanged': True, 'inputUnchanged': True, 'allocationsDisjoint': True,
            'maxFloat32PixelError': max_error}


def main():
    parser = argparse.ArgumentParser(description='Dry-pack and verify real clip UVs; no image generation or publication.')
    parser.add_argument('meta', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--remapped-output', type=Path)
    parser.add_argument('--small-max', type=int, default=256)
    parser.add_argument('--small-scale', type=int, default=4)
    parser.add_argument('--large-scale', type=int, default=2)
    parser.add_argument('--max-side', type=int, default=8192)
    parser.add_argument('--max-rgba-mib', type=int, default=128)
    args = parser.parse_args()
    data = args.meta.read_bytes()
    meta = json.loads(gzip.decompress(data) if args.meta.suffix == '.gz' else data)
    bounds = sorted({tuple(_quad_bounds(f['uvs'][i:i+8])) for s in meta['sequences'] for f in s['frames'] for i in range(0, len(f['uvs']), 8)})
    rows = []
    for index, b in enumerate(bounds):
        # These sizes are a packing estimate only. Production callers must pass
        # their actual source-rendered dimensions instead of these estimates.
        w, h = max(1, round((b[2]-b[0])*meta['atlasWidth'])), max(1, round((b[3]-b[1])*meta['atlasHeight']))
        scale = args.small_scale if max(w, h) <= args.small_max else args.large_scale
        rows.append({'id': str(index), 'width': w*scale, 'height': h*scale, 'sourceUvBounds': list(b)})
    layout = layout_atlas(rows, args.max_side, max_rgba_bytes=args.max_rgba_mib*1024**2)
    result = {'scope': 'Packing estimate and UV/metadata invariants only; target images, source matching, visual fidelity, and browser GPU behavior are not verified.',
              'sourceSha256': hashlib.sha256(data).hexdigest(), 'sourcePixels': [meta['atlasWidth'], meta['atlasHeight']],
              'verification': _verify(meta, layout), 'layout': layout}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    if args.remapped_output:
        args.remapped_output.parent.mkdir(parents=True, exist_ok=True)
        args.remapped_output.write_text(json.dumps(remap_clip(meta, layout), separators=(',', ':'))+'\n')
    print(json.dumps({'pixels': [layout['width'], layout['height']], 'rgbaMiB': layout['rgbaBytes']/1024**2, **result['verification']}))


if __name__ == '__main__':
    main()
