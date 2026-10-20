#!/usr/bin/env python3
"""Contact sheets of V62 thin-stroke redraws for their visual review, at game size and zoomed.

Usage: battle-hd-stroke-sheets.py [--ids <species>,...] [--reference 166:39,40,56,58]

For every cell of a V62 report (.cache/battle-hd-v62) whose published tile was accepted under the stroke gate, and for
the reference cells (by default the four V61 speed lines of 闪光波克尔, 166), one sheet shows the original runtime
pixels and the published tile:
  game size  each drawn at its largest on-screen size at the reference display (audit_battle_hd_density.py), with the
             shader's straight bilinear fetch, on a dark and a light ground; long cells as windows at both ends;
  overview   the whole cell at game size, reduced to fit when larger;
  zoomed     the densest window enlarged 4x (nearest), and an overlay (original alpha magenta, redraw green).
Beside each sheet the record holds measurements against the original pixels at native size: centroid offset and
alpha-box differences (position and ends), the ratio of coverage per skeleton length (thickness) and the mean colour
difference of the visible pixels. Compact dark-ground panels of three cells each make the review mosaics. Writes
artifacts/battle-hd-v62/stroke-review/. Status `tool`: evidence for a person reviewing the cells, not a gate.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/assets'))
import battle_hd_ai_upscale as ai  # noqa: E402
from build_battle_hd_ai_atlases import HD_INDEX, HD_MANIFEST, read_json  # noqa: E402
from build_battle_hd_priority_atlases import cell_infos  # noqa: E402
from build_battle_hd_redraw_atlases import flip, load_base  # noqa: E402

CACHE = ROOT/'.cache/battle-hd-v62'
OUT = ROOT/'artifacts/battle-hd-v62/stroke-review'
WINDOW, ZOOM_WINDOW, ZOOM = (560, 200), (110, 36), 4
GROUNDS = {'dark': (32, 34, 52), 'light': (236, 236, 236)}


def game_size(tile, size):
    """A straight RGBA tile drawn at `size` device pixels with the shader's bilinear fetch (premultiplied result)."""
    height, width = tile.shape[:2]
    xs = (np.arange(size[0])+.5)/size[0]*width-.5
    ys = (np.arange(size[1])+.5)/size[1]*height-.5
    x0, y0 = np.clip(np.floor(xs), 0, width-1).astype(int), np.clip(np.floor(ys), 0, height-1).astype(int)
    x1, y1 = np.minimum(x0+1, width-1), np.minimum(y0+1, height-1)
    tx, ty = np.clip(xs-x0, 0, 1)[None, :, None], np.clip(ys-y0, 0, 1)[:, None, None]
    values = tile.astype(np.float32)/255
    top = values[y0][:, x0]*(1-tx)+values[y0][:, x1]*tx
    bottom = values[y1][:, x0]*(1-tx)+values[y1][:, x1]*tx
    colour = top*(1-ty)+bottom*ty
    colour[:, :, :3] *= colour[:, :, 3:]
    return colour


def on_ground(colour, ground):
    rgb = colour[:, :, :3]+np.array(ground, dtype=np.float32)/255*(1-colour[:, :, 3:])
    return Image.fromarray(np.clip(np.rint(rgb*255), 0, 255).astype(np.uint8))


def windows(alpha, window):
    """Up to two windows (x, y) of `window` size: at the first and the last end of the visible content along its
    longer axis, each centred across that axis on the content near its end."""
    ys, xs = np.nonzero(alpha > 16/255)
    if not len(xs):
        return [(0, 0)]
    height, width = alpha.shape
    def clamp(x, y):
        return int(np.clip(x, 0, max(width-window[0], 0))), int(np.clip(y, 0, max(height-window[1], 0)))
    if xs.max()-xs.min() >= ys.max()-ys.min():
        near_first, near_last = xs < xs.min()+window[0]/2, xs > xs.max()-window[0]/2
        first = clamp(xs.min()-8, ys[near_first].mean()-window[1]/2)
        last = clamp(xs.max()+8-window[0], ys[near_last].mean()-window[1]/2)
    else:
        near_first, near_last = ys < ys.min()+window[1]/2, ys > ys.max()-window[1]/2
        first = clamp(xs[near_first].mean()-window[0]/2, ys.min()-8)
        last = clamp(xs[near_last].mean()-window[0]/2, ys.max()+8-window[1])
    return [first] if first == last else [first, last]


def measurements(native, tile, scale):
    """Position, ends, thickness and colour of the published tile against the original pixels, at native size."""
    reduced = ai.reduce_premultiplied(tile, scale) if scale > 1 else tile
    a, b = native[:, :, 3].astype(float)/255, reduced[:, :, 3].astype(float)/255
    def centroid(alpha):
        ys, xs = np.mgrid[:alpha.shape[0], :alpha.shape[1]]
        return np.array([(xs*alpha).sum(), (ys*alpha).sum()])/max(alpha.sum(), 1e-9)
    def box(alpha):
        ys, xs = np.nonzero(alpha > 16/255)
        return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else [0, 0, 0, 0]
    def thickness(alpha):
        return float(alpha.sum()/max(skeletonize(alpha > .25).sum(), 1))
    visible = (a > 16/255) | (b > 16/255)
    pa, pb = ai.premultiplied(native), ai.premultiplied(reduced)
    return {'centroidOffset': round(float(np.linalg.norm(centroid(a)-centroid(b))), 3),
            'boxDifference': [y-x for x, y in zip(box(a), box(b))],
            'thicknessRatio': round(thickness(b)/max(thickness(a), 1e-9), 3),
            'coverageRatio': round(float(b.sum()/max(a.sum(), 1e-9)), 3),
            'meanColourDifference': round(float(np.abs(pa-pb)[visible][:, :3].mean()), 3) if visible.any() else 0.0}


def crops(views, size, window, grounds):
    """Rows [original, published] of game-size windows at both ends, one row per window and ground."""
    window = window if size[0] >= size[1] else window[::-1]
    w, h = min(window[0], size[0]), min(window[1], size[1])
    return [[on_ground(views[k][y:y+h, x:x+w], ground) for k in ('before', 'after')]
            for x, y in windows(views['before'][:, :, 3], (w, h)) for ground in grounds]


def densest(alpha, window):
    """The window (x, y) holding the most original alpha."""
    weight = ndimage.uniform_filter(alpha.astype(np.float64), size=(window[1], window[0]), mode='constant')
    cy, cx = np.unravel_index(np.argmax(weight), weight.shape)
    return (int(np.clip(cx-window[0]//2, 0, max(alpha.shape[1]-window[0], 0))),
            int(np.clip(cy-window[1]//2, 0, max(alpha.shape[0]-window[1], 0))))


def overview(views, size, fit=(600, 260)):
    """The whole cell at game size on the dark ground, reduced (Lanczos) to fit `fit` when larger: [original, published]."""
    factor = min(1.0, fit[0]/size[0], fit[1]/size[1])
    target = (max(1, round(size[0]*factor)), max(1, round(size[1]*factor)))
    return [on_ground(views[k], GROUNDS['dark']).resize(target, Image.Resampling.LANCZOS) for k in ('before', 'after')]


def zoomed(views, size):
    """The densest part enlarged ZOOM times (nearest): original, published, and the overlay of their alphas."""
    window = ZOOM_WINDOW if size[0] >= size[1] else ZOOM_WINDOW[::-1]
    zw, zh = min(window[0], size[0]), min(window[1], size[1])
    zx, zy = densest(views['before'][:, :, 3], (zw, zh))
    images = [on_ground(views[k][zy:zy+zh, zx:zx+zw], GROUNDS['dark']) for k in ('before', 'after')]
    overlay = np.zeros((zh, zw, 3), dtype=np.uint8)
    overlay[:, :, 0] = overlay[:, :, 2] = np.rint(views['before'][zy:zy+zh, zx:zx+zw, 3]*255)
    overlay[:, :, 1] = np.rint(views['after'][zy:zy+zh, zx:zx+zw, 3]*255)
    return [image.resize((zw*ZOOM, zh*ZOOM), Image.Resampling.NEAREST) for image in (*images, Image.fromarray(overlay))]


def page(title, rows, zoom):
    """Rows of image pairs above a row of zoomed images, on white, with a title line."""
    pair_width = max((a.width+b.width+12 for a, b in rows), default=0)
    width = max(pair_width, sum(z.width for z in zoom)+24)
    image = Image.new('RGB', (width, 22+sum(max(a.height, b.height)+6 for a, b in rows)+max(z.height for z in zoom)+6), (255, 255, 255))
    ImageDraw.Draw(image).text((4, 4), title, fill=(0, 0, 0))
    top = 22
    for a, b in rows:
        image.paste(a, (0, top))
        image.paste(b, (a.width+12, top))
        top += max(a.height, b.height)+6
    left = 0
    for z in zoom:
        image.paste(z, (left, top))
        left += z.width+12
    return image


def sheet(sid, cid, native, before, after, density, scale, label):
    """One review sheet (game size at both ends on two grounds, zoomed first end, overlay), a compact dark-ground panel
    for the review mosaics, and the measurements."""
    size = (max(1, round(native.shape[1]/density)), max(1, round(native.shape[0]/density)))
    views = {'before': game_size(before, size), 'after': game_size(after, size)}
    title = (f'{label}  species {sid} cell {cid}  native {native.shape[1]}x{native.shape[0]}  {scale}x  game size {size[0]}x{size[1]}  '
             f'(left: original, right: published)')
    zoom = zoomed(views, size)
    path = OUT/f'{sid}-{cid}.png'
    page(title, [overview(views, size), *crops(views, size, WINDOW, GROUNDS.values())], zoom).save(path)
    panel = page(title, [overview(views, size), *crops(views, size, (420, 120), [GROUNDS['dark']])], zoom)
    return {'species': sid, 'cell': cid, 'label': label, 'scale': scale, 'gameSize': list(size), 'sheet': str(path.relative_to(ROOT)),
            **measurements(native, after, scale)}, panel


def mosaics(panels, per_page=3):
    """Review pages of a few compact panels each, stacked."""
    paths = []
    for start in range(0, len(panels), per_page):
        group = panels[start:start+per_page]
        image = Image.new('RGB', (max(p.width for p in group), sum(p.height+16 for p in group)), (200, 200, 200))
        top = 0
        for p in group:
            image.paste(p, (0, top))
            top += p.height+16
        path = OUT/f'mosaic-{start//per_page:02d}.png'
        image.save(path)
        paths.append(str(path.relative_to(ROOT)))
    return paths


def v62_cells(ids):
    """(species, cell, native, published tile, density, scale, label) of every stroke-gate cell in the V62 reports."""
    for path in sorted((CACHE/'species').glob('*/report.json'), key=lambda p: int(p.parent.name)):
        sid, report = path.parent.name, read_json(path)
        if ids and sid not in ids or not report.get('strokeGateCells'):
            continue
        base = load_base(sid, {k: report['base'][k] for k in ('meta', 'atlas', 'metaSha256', 'atlasSha256')}, report['base']['reportPath'])
        with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
            atlas = np.asarray(image.convert('RGBA'))
        placements = {p['id']: p for p in report['layout']['placements']}
        cells, items = {c['id']: c for c in report['cells']}, {i['id']: i for i in base['cells']}
        for cid in report['strokeGateCells']:
            p, plan = placements[cid], cells[cid]['priority']
            tile = flip(atlas[p['y']:p['y']+p['height'], p['x']:p['x']+p['width']])
            yield sid, cid, items[cid]['native'], tile, plan['referenceDensity']['anyFrame'], plan['scale'], f'stroke gate ({plan["tier"]})'


def reference_cells(spec):
    """The reference cells (published V61 redraws) as (species, cell, native, tile, density, scale, label)."""
    sid, cids = spec.split(':')
    published, manifest = read_json(HD_INDEX)['species'], read_json(HD_MANIFEST)['species']
    base = load_base(sid, published[sid], manifest[sid]['reportPath'])
    infos = cell_infos(base)
    for item in base['cells']:
        if item['id'] in cids.split(','):
            yield sid, item['id'], item['native'], flip(item['tile']), infos[item['id']]['anyFrame'], item['scale'], 'reference (published)'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', help='Comma-separated species; omitted means every V62 report')
    parser.add_argument('--reference', default='166:39,40,56,58')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ids = set(args.ids.split(',')) if args.ids else None
    results = [sheet(sid, cid, native, native, tile, density, scale, label)
               for sid, cid, native, tile, density, scale, label in [*reference_cells(args.reference), *v62_cells(ids)]]
    rows = [row for row, _ in results]
    pages = mosaics([panel for _, panel in results])
    (OUT/'sheets.json').write_text(json.dumps({'cells': rows, 'mosaics': pages}, indent=1)+'\n')
    for row in rows:
        print(json.dumps(row))


if __name__ == '__main__':
    main()
