#!/usr/bin/env python3
"""Export the first original combat pose from official Flash vectors to SVG.

Requires Pillow, a portable Java runtime and JPEXS FFDec. The game does not need
these tools. Flash bytecode is never executed: FFDec reads the display list.
"""
import argparse
import concurrent.futures
import hashlib
import json
import shutil
import struct
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://seer.61.com/resource/fightResource/pet/swf/'


def pet_character(data):
    body = zlib.decompress(data[8:]) if data[:3] == b'CWS' else data[8:]
    rect_bits = body[0] >> 3
    offset = (5 + 4 * rect_bits + 7) // 8 + 4
    while offset < len(body):
        tag = struct.unpack_from('<H', body, offset)[0]
        offset += 2
        code, length = tag >> 6, tag & 63
        if length == 63:
            length = struct.unpack_from('<I', body, offset)[0]
            offset += 4
        payload = body[offset:offset+length]
        offset += length
        if code == 76:  # SymbolClass
            count = struct.unpack_from('<H', payload)[0]
            cursor = 2
            for _ in range(count):
                character = struct.unpack_from('<H', payload, cursor)[0]
                end = payload.index(0, cursor + 2)
                name = payload[cursor+2:end].decode('utf8')
                cursor = end + 1
                if name == 'pet' and character:
                    return character
    raise ValueError('No named pet display-list symbol')


def export(sid, java, ffdec, *, cache_dir=None, output_dir=None, source_dir=None):
    work = (cache_dir or ROOT / '.cache/vector-export') / str(sid)
    work.mkdir(parents=True, exist_ok=True)
    url = f'{BASE}{sid}.swf'
    swf = work / f'{sid}.swf'
    if not swf.exists():
        cached_source = source_dir / f'{sid}.swf' if source_dir else None
        if cached_source and cached_source.exists():
            shutil.copyfile(cached_source, swf)
        else:
            swf.write_bytes(urllib.request.urlopen(url, timeout=20).read())
    data = swf.read_bytes()
    if data[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Not a supported Flash file')
    character = pet_character(data)
    for kind in ('svg', 'png'):
        cached = list((work / kind).rglob(f'1.{kind}'))
        if len(cached) == 1:
            try:
                if kind == 'svg':
                    ET.parse(cached[0])
                else:
                    with Image.open(cached[0]) as image:
                        image.verify()
                continue
            except (OSError, ValueError, ET.ParseError):
                pass
        subprocess.run([
            java, '-Xmx512m', '-Djava.awt.headless=true',
            '-Dapple.awt.UIElement=true', '-jar', ffdec, '-cli',
            '-selectid', str(character), '-select', f'{character}:1',
            '-format', f'sprite:{kind}', '-zoom', '2', '-export', 'sprite',
            str(work / kind), str(swf),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
    source_svg = next((work / 'svg').rglob('1.svg'))
    source_png = next((work / 'png').rglob('1.png'))
    with Image.open(source_png) as image:
        bounds = image.getchannel('A').getbbox()
        if not bounds:
            raise ValueError('The first pose is empty')
        # Retain a one-unit transparent border to avoid cutting antialiased edges.
        x, y, right, bottom = (value / 2 for value in bounds)
        x, y, right, bottom = x-1, y-1, right+1, bottom+1
        image.crop(tuple(round(value * 2) for value in (x, y, right, bottom))).save(work / 'preview.png')
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    tree = ET.parse(source_svg)
    svg = tree.getroot()
    # These selected assets must contain genuine vector shapes, not bitmap embeds.
    if any(element.tag.rsplit('}', 1)[-1] in ('image', 'script', 'foreignObject') for element in svg.iter()):
        raise ValueError('Unexpected bitmap or active content in vector export')
    for element in svg.iter():
        for key in list(element.attrib):
            if key.startswith('{https://www.free-decompiler.com/flash}'):
                del element.attrib[key]
    width, height = right-x, bottom-y
    # FFDec applies -zoom to the SVG's root matrix too. The measured crop is
    # expressed in unzoomed units; viewBox must stay in the exported coordinates.
    svg.set('viewBox', f'{x*2:g} {y*2:g} {width*2:g} {height*2:g}')
    svg.set('width', f'{width:g}')
    svg.set('height', f'{height:g}')
    destination = (output_dir or ROOT / 'public/portraits/vectors') / f'{sid}.svg'
    destination.parent.mkdir(parents=True, exist_ok=True)
    tree.write(destination, encoding='utf-8', xml_declaration=True)
    return str(sid), {
        'path': f'/portraits/vectors/{sid}.svg', 'source': url,
        'source_sha256': hashlib.sha256(data).hexdigest(),
        'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'width': width, 'height': height, 'bytes': destination.stat().st_size,
        'format': 'SVG vector paths', 'symbol': character, 'frame': 1,
        'viewport_pending': True,
        'exporter': 'JPEXS FFDec 26.3.0; static sprite display-list export',
        'bounds_method': 'Provisional SWF/PNG bounds; run calibrate_vector_viewports.mjs before using this export.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='+', type=int)
    parser.add_argument('--java', required=True)
    parser.add_argument('--ffdec', required=True)
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.cache/vector-export')
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/portraits/vectors')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    target = args.manifest or args.output_dir / 'manifest.json'
    manifest = json.loads(target.read_text()) if target.exists() else {
        'description': 'Original official combat-pose vectors; no redraw or raster enlargement.',
        'portraits': {}, 'failures': {},
    }

    def attempt(sid):
        try:
            return export(sid, str(Path(args.java).resolve()), str(Path(args.ffdec).resolve()),
                          cache_dir=args.cache_dir, output_dir=args.output_dir, source_dir=args.source_dir)
        except Exception as error:
            return str(sid), {'error': str(error), 'source': f'{BASE}{sid}.swf'}

    ids = args.ids
    if args.resume:
        ids = [sid for sid in ids if str(sid) not in manifest['portraits'] or not (args.output_dir / f'{sid}.svg').exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 3))) as pool:
        futures = [pool.submit(attempt, sid) for sid in ids]
        for future in concurrent.futures.as_completed(futures):
            sid, result = future.result()
            manifest['failures' if 'error' in result else 'portraits'][sid] = result
            if 'error' not in result:
                manifest['failures'].pop(sid, None)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.with_suffix('.tmp').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
            target.with_suffix('.tmp').replace(target)
            detail = result['error'] if 'error' in result else f'{result["width"]} x {result["height"]} vector units'
            print(sid, detail, flush=True)


if __name__ == '__main__':
    main()
