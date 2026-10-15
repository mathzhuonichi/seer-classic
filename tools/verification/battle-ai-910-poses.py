#!/usr/bin/env python3
"""Render diagnostic 910 poses from unchanged mesh quads; no browser claim.

Only normal/simple, untinted, affine quads are supported. These software images
make part seams reviewable while the actual WebGL acceptance remains separate.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[2]


def load(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_cells(report):
    with Image.open(ROOT/'public'/report['atlas'].lstrip('/')) as image:
        atlas = image.convert('RGBA')
    result = {}
    for p in report['layout']['placements']:
        tile = ImageOps.flip(atlas.crop((p['x'], p['y'], p['x']+p['width'], p['y']+p['height'])))
        buffer = io.BytesIO()
        tile.save(buffer, format='PNG')
        result[p['id']] = 'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()
    return result


def main():
    trial_path = ROOT/'.cache/battle-ai-910/composition/report.json'
    trial = load(trial_path)
    frozen = load(Path(trial['sourceOnlyReportPath']))
    if sha(Path(trial['sourceOnlyReportPath'])) != trial['sourceOnlyReportSha256']:
        raise ValueError('Frozen source report changed')
    for report in (frozen, trial):
        if sha(ROOT/'public'/report['atlas'].lstrip('/')) != report['atlasSha256']:
            raise ValueError('Reviewed atlas changed')
    index = load(ROOT/'public/battle-animations/runtime-index.json')['species']['910']
    original = load(ROOT/'public'/index['meta'].lstrip('/'))
    old, new = read_cells(frozen), read_cells(trial)
    by_bounds = {tuple(c['sourceUvBounds']): c['id'] for c in frozen['cells']}
    out = ROOT/'artifacts/battle-ai-910/poses'
    out.mkdir(parents=True, exist_ok=True)
    requested = [('standby', 0), ('attack', 10), ('attack', 28), ('sa', 30), ('cp', 27), ('hited', 4)]
    tasks, records = [], []
    for name, number in requested:
        frame = next(s for s in original['sequences'] if s['name'] == name)['frames'][number]
        if any(s['material'].get('blendMode') != 'normal' or s['material'].get('shaderKind') != 'simple' for s in frame['subMeshes']):
            raise ValueError('Diagnostic refuses unsupported material semantics')
        if any(v != 1 for v in frame['mulColors']) or any(frame['addColors']):
            raise ValueError('Diagnostic refuses unsupported tint semantics')
        positions = frame['positions']
        xs, ys = positions[::2], positions[1::2]
        left, top, width, height = min(xs), -max(ys), max(xs)-min(xs), max(ys)-min(ys)
        scale = 440/max(width, height)
        offset_x, offset_y = (512-width*scale)/2-left*scale, (512-height*scale)/2-top*scale
        quads, quad_cells = [], []
        max_affine_error = 0
        for i in range(0, len(frame['uvs']), 8):
            uv = frame['uvs'][i:i+8]
            cid = by_bounds[(min(uv[::2]), min(uv[1::2]), max(uv[::2]), max(uv[1::2]))]
            p = [(positions[i+j]*scale+offset_x, -positions[i+j+1]*scale+offset_y) for j in range(0, 8, 2)]
            residual = max(abs(p[2][axis]-(p[1][axis]+p[3][axis]-p[0][axis])) for axis in (0, 1))
            max_affine_error = max(max_affine_error, residual)
            if residual > .001:
                raise ValueError('Diagnostic refuses a non-affine quad')
            matrix = [p[1][0]-p[0][0], p[1][1]-p[0][1], p[3][0]-p[0][0], p[3][1]-p[0][1], *p[0]]
            quads.append((cid, matrix))
            quad_cells.append(cid)
        # Original submesh indices enumerate quads in order, so SVG paint order
        # preserves the normal-alpha stacking for these selected frames.
        expected = [value for q in range(len(quads)) for value in (q*4+2, q*4+1, q*4, q*4, q*4+3, q*4+2)]
        if frame['indices'] != expected:
            raise ValueError('Diagnostic refuses an unexpected draw order')
        for variant in ('source-only', 'head-only', 'three-ai'):
            elements = []
            for cid, matrix in quads:
                use_ai = variant == 'three-ai' or (variant == 'head-only' and cid == '3')
                href = new[cid] if use_ai else old[cid]
                elements.append(f'<image width="1" height="1" preserveAspectRatio="none" transform="matrix({" ".join(map(str,matrix))})" href="{href}"/>')
            svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">'+''.join(elements)+'</svg>'
            stem = f'{name}-{number}-{variant}'
            svg_path, png_path = out/(stem+'.svg'), out/(stem+'.png')
            svg_path.write_text(svg)
            tasks.append({'svg': str(svg_path), 'png': str(png_path)})
        records.append({'action': name, 'frameIndex': number, 'quadCells': quad_cells,
                        'maximumAffineApproximationPixelError': max_affine_error})
    tasks_path = out/'tasks.json'
    tasks_path.write_text(json.dumps(tasks))
    code = "import fs from 'node:fs';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {Resvg}=require(process.argv[1]);for(const t of JSON.parse(fs.readFileSync(process.argv[2],'utf8')))fs.writeFileSync(t.png,new Resvg(fs.readFileSync(t.svg,'utf8'),{font:{loadSystemFonts:false}}).render().asPng());"
    subprocess.run(['node', '--input-type=module', '-e', code,
                    str(ROOT/'.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js'), str(tasks_path)], check=True)
    sheet = Image.new('RGB', (1536, len(records)*548), '#e4e9ed')
    draw = ImageDraw.Draw(sheet)
    for row, record in enumerate(records):
        prefix = f'{record["action"]}-{record["frameIndex"]}'
        source = Image.open(out/(prefix+'-source-only.png')).convert('RGBA')
        alpha = np.asarray(source)[:, :, 3]
        mask = Image.fromarray((alpha >= 240).astype('uint8')*255)
        # A 5-by-5 erosion excludes normal outer-contour changes from the
        # interior loss diagnostic; this is not a semantic joint detector.
        interior = np.asarray(mask.filter(ImageFilter.MinFilter(5))) > 0
        record['comparisons'] = []
        for col, variant in enumerate(('source-only', 'head-only', 'three-ai')):
            image = Image.open(out/(prefix+'-'+variant+'.png')).convert('RGBA')
            y = row*548
            sheet.paste(image, (col*512, y+32), image)
            draw.text((col*512+12, y+9), f'{record["action"]} frame {record["frameIndex"]} / {variant}', fill='black')
            if variant != 'source-only':
                current = np.asarray(image)[:, :, 3]
                a, b = alpha > 16, current > 16
                record['comparisons'].append({'variant': variant,
                    'fullPoseAlphaIoU16': float((a & b).sum()/max(1, (a | b).sum())),
                    'lostOpaqueInteriorPixels': int((interior & (current < 16)).sum()),
                    'sourceOpaqueInteriorPixels': int(interior.sum()),
                    'meaning': 'Lost fully opaque interior at this diagnostic scale; outer contours excluded, not a semantic joint/seam detector.'})
    sheet_path = out/'comparison.png'
    sheet.save(sheet_path)
    report = {'species': 910, 'trialReportSha256': sha(trial_path),
              'sourceOnlyReportSha256': trial['sourceOnlyReportSha256'],
              'comparison': str(sheet_path), 'frames': records,
              'scope': 'Original frame poses, draw order, and normal alpha compositing in software. Does not reproduce WebGL atlas sampling or certify visual fidelity; actual-browser acceptance remains required.'}
    (out/'metrics.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'comparison': str(sheet_path), 'metrics': str(out/'metrics.json'),
                      'frames': len(records), 'variants': 3}, indent=2))


if __name__ == '__main__':
    main()
