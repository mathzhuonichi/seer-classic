#!/usr/bin/env python3
"""Encode original atlases as exact lossless WebP and independently replay RGBA hashes.

Use the same Pillow environment as the Unity source extraction. Manifest replacement
is atomic, and original generated PNGs are removed only after every comparison passes.
Source Unity bundles and their source hashes remain unchanged.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import gc
import json
from pathlib import Path
import time
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
manifest_path = Path('public/battle-animations/manifest.json')
manifest = json.loads(manifest_path.read_text())
if args.verify:
    for species, entry in manifest['species'].items():
        image = Image.open('public' + entry['atlas']).convert('RGBA')
        assert image.size == (entry['atlasWidth'], entry['atlasHeight']), species
        if entry.get('atlasRgbaSha256'):
            assert hashlib.sha256(image.tobytes()).hexdigest() == entry['atlasRgbaSha256'], species
    print(f"Verified decoded atlas dimensions and recorded RGBA hashes for {len(manifest['species'])} species.")
else:
    original_bytes = optimized_bytes = 0
    generated = []
    started = time.monotonic()
    for index, (species, entry) in enumerate(manifest['species'].items()):
        source = Path('public' + entry['atlas'])
        if source.suffix != '.png':
            continue
        image = Image.open(source).convert('RGBA')
        rgba_hash = hashlib.sha256(image.tobytes()).hexdigest()
        assert not entry.get('atlasRgbaSha256') or rgba_hash == entry['atlasRgbaSha256'], species
        output = io.BytesIO()
        image.save(output, format='WEBP', lossless=True, exact=True, method=2)
        payload = output.getvalue()
        replay = Image.open(io.BytesIO(payload)).convert('RGBA')
        assert replay.size == image.size, species
        assert hashlib.sha256(replay.tobytes()).hexdigest() == rgba_hash, species
        original_bytes += source.stat().st_size
        entry['atlasRgbaSha256'] = rgba_hash
        if len(payload) < source.stat().st_size:
            target = source.with_suffix('.webp')
            temporary_atlas = target.with_suffix('.webp.tmp')
            temporary_atlas.write_bytes(payload)
            temporary_atlas.replace(target)
            generated.append((source, target))
            entry['atlas'] = '/' + str(target.relative_to('public'))
            entry['atlasSha256'] = hashlib.sha256(payload).hexdigest()
            optimized_bytes += len(payload)
        else:
            optimized_bytes += source.stat().st_size
        image.close()
        replay.close()
        del image, replay, payload, output
        gc.collect()
        if (index + 1) % 25 == 0:
            print(f"Compared {index + 1} atlases, elapsed {time.monotonic() - started:.1f}s.", flush=True)
    if original_bytes:
        saving = 1 - optimized_bytes / original_bytes
        print(f"Atlas bytes {original_bytes} -> {optimized_bytes}, saving {saving:.2%}.", flush=True)
        manifest['atlasEncoding'] = {'codec': 'exact-lossless-WebP-when-smaller', 'pillow': Image.__version__, 'method': 2, 'lastPassOriginalBytes': original_bytes, 'lastPassOptimizedBytes': optimized_bytes}
        temporary = manifest_path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(manifest, indent=2) + '\n')
        temporary.replace(manifest_path)
        runtime_index = manifest_path.with_name('runtime-index.json')
        keys = ('meta', 'atlas', 'frameRate', 'atlasWidth', 'atlasHeight', 'sequences', 'standbySize')
        runtime_payload = {'species': {species: {key: entry[key] for key in keys if key in entry} for species, entry in manifest['species'].items()}}
        temporary_index = runtime_index.with_suffix('.json.tmp')
        temporary_index.write_text(json.dumps(runtime_payload, separators=(',', ':')) + '\n')
        temporary_index.replace(runtime_index)
        for source, _ in generated:
            source.unlink()
        print(f"Published {len(generated)} exact WebP atlases; source bundle provenance retained.")
