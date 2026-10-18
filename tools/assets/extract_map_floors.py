#!/usr/bin/env python3
"""Compute ORIGINAL_FLOORS rectangles from the official H5 road masks.

The official MapModel uses 10-unit cells in x-major arrays, where 1 marks an open position. A floor is the
largest-area block of open positions inside the stage window below, inset by eight units and projected onto
the shipped image through its recorded bg_mc registration. Run with map IDs to print rows for
src/features/world/map-sources.ts; this reproduces every source-derived row there except map 12's, whose
background is registered 192 units above the stage. Layouts come from the downloader's cache.
"""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/map-assets'
MANIFEST = ROOT / 'public/maps/original-manifest.json'
CELL = 10
INSET = 8
# Grid positions [left, top, right, bottom], inclusive: clear of the stage edges and the upper scenery.
WINDOW = (7, 21, 89, 52)


def layout(map_id, record):
    """The cached official layout, fetched once and checked against the manifest digest."""
    url = record['originalLayoutUrl']
    target = CACHE / str(map_id) / url.rsplit('/', 1)[1]
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(urllib.request.urlopen(url, timeout=25).read())
    data = target.read_bytes()
    if hashlib.sha256(data).hexdigest() != record['originalLayoutSha256']:
        raise ValueError(f'{target} does not match the manifest digest')
    return json.loads(data)


def largest_open_block(road):
    """(area, left, top, right, bottom) of the largest all-open block of positions inside WINDOW."""
    left, top, right, bottom = WINDOW
    right, bottom = min(right, len(road) - 1), min(bottom, len(road[0]) - 1)
    heights, best = {x: 0 for x in range(left, right + 1)}, None
    for y in range(top, bottom + 1):
        for x in heights:
            heights[x] = heights[x] + 1 if road[x][y] == 1 else 0
        stack = []
        for x in range(left, right + 2):
            height, start = heights.get(x, 0), x
            while stack and stack[-1][1] >= height:
                start, run = stack.pop()
                area = run * (x - start)
                if run and (best is None or area > best[0]):
                    best = (area, start, y - run + 1, x - 1, y)
            stack.append((start, height))
    return best


def floor(map_id, record):
    """The inset block in percentages of the shipped image: [left, top, right, bottom]."""
    data = layout(map_id, record)
    block = largest_open_block(data['road'])
    if block is None:
        raise ValueError(f'map {map_id} has no open position inside the window')
    _, left, top, right, bottom = block
    bg = data.get('bg_mc', {})
    x0, y0 = bg.get('x', 0) + bg.get('offx', 0), bg.get('y', 0) + bg.get('offy', 0)
    width, height = record['width'], record['height']
    return [round((left * CELL + INSET - x0) / width * 100, 1), round((top * CELL + INSET - y0) / height * 100, 1),
            round((right * CELL - INSET - x0) / width * 100, 1), round((bottom * CELL - INSET - y0) / height * 100, 1)]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('ids', nargs='+', type=int)
    args = parser.parse_args()
    maps = json.loads(MANIFEST.read_text())['maps']
    for map_id in args.ids:
        record = maps[str(map_id)]
        if 'originalLayoutUrl' not in record:
            raise SystemExit(f'map {map_id} has no official layout')
        print(f'  {map_id}:[{",".join(f"{value:.1f}" for value in floor(map_id, record))}],')


if __name__ == '__main__':
    main()
