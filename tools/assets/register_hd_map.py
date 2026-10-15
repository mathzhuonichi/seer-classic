#!/usr/bin/env python3
"""Register an inspected built-in ImageGen restoration without altering its pixels."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('metadata', type=Path)
    args = parser.parse_args()
    data = json.loads(args.metadata.read_text())
    source = ROOT / 'public' / data['sourcePath'].lstrip('/')
    reference = Path(data.get('inputPath', source))
    generated = Path(data['generatedPath'])
    with Image.open(reference) as image:
        source_size = image.size
    with Image.open(generated) as image:
        size = image.size
        if image.format != 'PNG':
            raise ValueError('Preserve the generated PNG unchanged.')
        if min(size[0] / source_size[0], size[1] / source_size[1]) <= 1:
            raise ValueError('The restoration must exceed both original dimensions.')
        if abs(size[0] / size[1] / (source_size[0] / source_size[1]) - 1) > .002:
            raise ValueError('The restoration changed the scene aspect ratio.')
    output = ROOT / 'public/maps/hd'
    output.mkdir(parents=True, exist_ok=True)
    filename = data.get('outputFilename', f"{data['mapId']}-v44.png")
    if not re.fullmatch(rf"{int(data['mapId'])}-v44[a-z0-9-]*\.png", filename):
        raise ValueError('Use a map-specific v44 PNG filename without directories.')
    destination = output / filename
    if destination.exists() and digest(destination) != digest(generated):
        raise ValueError('A different restoration is already registered; version it explicitly.')
    shutil.copyfile(generated, destination)
    manifest_path = output / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        'schema': 1,
        'method': 'Built-in ImageGen conservative redraw of the existing scene bitmap.',
        'styleApproval': 'User approved the map 22 sample on 2026-10-15.',
        'fidelityLimit': 'AI redraws preserve the reviewed composition and style but are not pixel-identical original artwork.',
        'assets': {},
    }
    previous = manifest['assets'].get(str(data['mapId']))
    entry = {
        'path': f'/maps/hd/{destination.name}',
        'sha256': digest(destination), 'bytes': destination.stat().st_size,
        'width': size[0], 'height': size[1],
        'sourcePath': data['sourcePath'], 'sourceSha256': digest(source),
        'referenceSha256': digest(reference),
        'sourceWidth': source_size[0], 'sourceHeight': source_size[1],
        'prompt': data['prompt'], 'tool': 'built-in image_gen',
        'generatedFile': generated.name,
        'review': data['review'],
        'aspectError': abs(size[0] / size[1] / (source_size[0] / source_size[1]) - 1),
    }
    if previous and previous['path'] != entry['path']:
        entry['previousRestoration'] = previous
    elif previous and 'previousRestoration' in previous:
        entry['previousRestoration'] = previous['previousRestoration']
    if data.get('editReferencePath'):
        edit_reference = Path(data['editReferencePath'])
        entry['editReferenceSha256'] = digest(edit_reference)
        entry['editReferenceFile'] = edit_reference.name
    manifest['assets'][str(data['mapId'])] = entry
    manifest['assets'] = dict(sorted(manifest['assets'].items(), key=lambda item: int(item[0])))
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'mapId': data['mapId'], 'path': str(destination), 'dimensions': size}))


if __name__ == '__main__':
    main()
