#!/usr/bin/env python3
"""Render original UI icon curves at 4x, preserving original logical boxes."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
NAMES = ['spt', 'new-spt', 'mission', 'profile', 'map', 'bag', 'creatures', 'dex', 'restore', 'close']
manifest_path = ROOT / 'public/ui/classic/manifest.json'
manifest = json.loads(manifest_path.read_text())
ids = [manifest['assets'][name]['symbolId'] for name in NAMES] + [5584]
cache = ROOT / '.cache/classic-ui-v27/png4x'
subprocess.run([str(ROOT / '.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'),
                '-Xmx2g', '-Djava.awt.headless=true', '-jar', str(ROOT / '.cache/vector-export/ffdec/ffdec.jar'),
                '-selectid', ','.join(map(str, ids)), '-select', ','.join(f'{sid}:1' for sid in ids),
                '-zoom', '4', '-format', 'sprite:png,button:png', '-export', 'sprite,button',
                str(cache), str(ROOT / '.cache/classic-robots/UI.swf')], check=True)
for name in NAMES:
    asset = manifest['assets'][name]
    sid = asset['symbolId']
    source = next(p for p in cache.rglob('*.png')
                  if p.parent.name.startswith((f'DefineSprite_{sid}_', f'DefineButton2_{sid}_'))
                  or p.parent.name in (f'DefineSprite_{sid}', f'DefineButton2_{sid}'))
    # Select only standing/up render rather than arbitrary filesystem state order.
    candidates = [p for p in cache.rglob('*.png')
                  if (p.parent.name.startswith((f'DefineSprite_{sid}_', f'DefineButton2_{sid}_'))
                      or p.parent.name in (f'DefineSprite_{sid}', f'DefineButton2_{sid}'))
                  and p.name in ('1.png', '1_up.png')]
    source = candidates[0]
    image = Image.open(source).convert('RGBA')
    bounds = image.getbbox()
    content = image.crop(bounds)
    size = (asset['width'] * 2, asset['height'] * 2)
    if content.width > size[0] or content.height > size[1]:
        raise ValueError(f'{name}: source alpha exceeds exact original logical viewport')
    canvas = Image.new('RGBA', size)
    offset = ((size[0] - content.width) // 2, (size[1] - content.height) // 2)
    canvas.paste(content, offset)
    target = ROOT / 'public/ui/classic' / f'{name}-4x.png'
    canvas.save(target)
    asset['highResolutionPath'] = f'/ui/classic/{name}-4x.png'
    asset['highResolutionSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    asset['highResolutionSourceExport'] = str(source.relative_to(ROOT))
    asset['highResolutionAlphaCrop'] = bounds
    asset['highResolutionPlacement'] = offset
    asset['highResolutionSize'] = size
    asset['highResolutionMethod'] = 'Direct FFDec 4x rendering of original display list; no raster resize. Alpha centered in exact original logical viewport.'
for state, filename in [('over', '2_over.png'), ('down', '3_down.png')]:
    source = next(p for p in cache.rglob(filename) if p.parent.name == 'DefineButton2_5584')
    image = Image.open(source).convert('RGBA')
    bounds = image.getbbox()
    box = (max(0, bounds[0]-4), max(0, bounds[1]-4), min(image.width, bounds[2]+4), min(image.height, bounds[3]+4))
    image = image.crop(box)
    target = ROOT / 'public/ui/classic' / f'new-spt-{state}-4x.png'
    image.save(target)
    manifest['assets']['new-spt'].setdefault('vectorStates', {}).setdefault(state, {}).update({
        'highResolutionPath': f'/ui/classic/new-spt-{state}-4x.png',
        'highResolutionSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'highResolutionSourceExport': str(source.relative_to(ROOT)), 'highResolutionSize': image.size,
        'highResolutionMethod': 'Direct original button-state 4x rendering, alpha crop only; no raster resize.'})
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Verified {len(NAMES)} direct 4x renderer exports; map bitmap content retains its original resolution.')
