#!/usr/bin/env python3
"""Export the first original combat pose from official Flash vectors to SVG.

Requires Pillow, a portable Java runtime and JPEXS FFDec. The game does not need
these tools. Flash bytecode is never executed: FFDec reads the display list.
"""
import argparse
import concurrent.futures
import hashlib
import json
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


def export(sid, java, ffdec):
    work = ROOT / '.cache/vector-export' / str(sid)
    work.mkdir(parents=True, exist_ok=True)
    url = f'{BASE}{sid}.swf'
    swf = work / f'{sid}.swf'
    if not swf.exists():
        swf.write_bytes(urllib.request.urlopen(url, timeout=20).read())
    data = swf.read_bytes()
    if data[:3] not in (b'CWS', b'FWS'):
        raise ValueError('Not a supported Flash file')
    character = pet_character(data)
    for kind in ('svg', 'png'):
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
    destination = ROOT / 'public/portraits/vectors' / f'{sid}.svg'
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
    args = parser.parse_args()
    target = ROOT / 'public/portraits/vectors/manifest.json'
    manifest = json.loads(target.read_text()) if target.exists() else {
        'description': 'Original official combat-pose vectors; no redraw or raster enlargement.',
        'portraits': {}, 'failures': {},
    }

    def attempt(sid):
        try:
            return export(sid, str(Path(args.java).resolve()), str(Path(args.ffdec).resolve()))
        except Exception as error:
            return str(sid), {'error': str(error), 'source': f'{BASE}{sid}.swf'}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for sid, result in pool.map(attempt, args.ids):
            manifest['failures' if 'error' in result else 'portraits'][sid] = result
            if 'error' not in result:
                manifest['failures'].pop(sid, None)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
            detail = result['error'] if 'error' in result else f'{result["width"]} x {result["height"]} vector units'
            print(sid, detail, flush=True)


if __name__ == '__main__':
    main()
