#!/usr/bin/env python3
"""Recover static vector candidates at morph ratios used by official timelines.

Source morph and bitmap tag payloads are copied without modification into a
minimal static display list. JPEXS evaluates each recorded ratio and exports
its vector frame; ActionScript and original sprite timelines are not executed.
This study never modifies public assets or the runtime animation index.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import xml.etree.ElementTree as ET
import zlib

from restore_mystery_realm_floor import _Bits, _placement, _tags

ROOT = Path(__file__).resolve().parents[2]
MORPHS = (46, 84)
BITMAPS = (6, 8, 20, 21, 35, 36, 90)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def bits(fields):
    values = ''.join(format(value & ((1 << count) - 1), f'0{count}b')
                     for value, count in fields if count)
    values += '0' * (-len(values) % 8)
    return int(values, 2).to_bytes(len(values) // 8, 'big')


def rect(bounds):
    size = max(abs(value).bit_length() + 1 for value in bounds)
    return bits([(size, 5), *((value, size) for value in bounds)])


def matrix(x, y):
    size = max(abs(x).bit_length() + 1, abs(y).bit_length() + 1)
    return bits([(0, 1), (0, 1), (size, 5), (x, size), (y, size)])


def tag(kind, payload=b''):
    if len(payload) < 63:
        return struct.pack('<H', kind * 64 + len(payload)) + payload
    return struct.pack('<HI', kind * 64 + 63, len(payload)) + payload


def records(raw):
    if raw[:3] not in (b'FWS', b'CWS'):
        raise ValueError('Unsupported SWF signature')
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    if len(data) + 8 != struct.unpack_from('<I', raw, 4)[0]:
        raise ValueError('SWF length mismatch')
    reader = _Bits(data)
    reader.rect()
    frame_rate = reader.ui16()
    reader.ui16()
    return list(_tags(data, reader.i // 8)), frame_rate


def collect_ratios(tree, morph_ids):
    result = {identifier: set() for identifier in morph_ids}
    occurrences = []
    timelines = [(0, tree.getroot().find('tags'))]
    timelines += [(int(item.attrib['spriteId']), item.find('subTags'))
                  for item in tree.iter('item') if item.get('type') == 'DefineSpriteTag']
    for timeline, children in timelines:
        if children is None:
            continue
        depths, frame = {}, 1
        for item in children:
            kind = item.get('type', '')
            if kind in ('PlaceObjectTag', 'PlaceObject2Tag', 'PlaceObject3Tag', 'PlaceObject4Tag'):
                depth = int(item.attrib['depth'])
                previous = depths.get(depth, {})
                moving = item.get('placeFlagMove') == 'true'
                current = dict(previous) if moving else {'ratio': 0}
                if 'characterId' in item.attrib:
                    current['character'] = int(item.attrib['characterId'])
                if item.get('placeFlagHasRatio') == 'true':
                    current['ratio'] = int(item.attrib['ratio'])
                depths[depth] = current
            elif kind in ('RemoveObjectTag', 'RemoveObject2Tag'):
                depths.pop(int(item.attrib['depth']), None)
            elif kind == 'ShowFrameTag':
                for depth, current in depths.items():
                    character = current.get('character')
                    if character in morph_ids:
                        ratio = current.get('ratio', 0)
                        if not 0 <= ratio <= 65535:
                            raise ValueError('Invalid morph ratio')
                        result[character].add(ratio)
                        occurrences.append({'timeline': timeline, 'frame': frame, 'depth': depth,
                                            'character': character, 'ratio': ratio})
                frame += 1
    return result, occurrences


def static_swf(raw, source_records, frame_rate, character, ratios):
    kind, payload = next((kind, body) for kind, body in source_records
                         if kind in MORPHS and struct.unpack_from('<H', body)[0] == character)
    reader = _Bits(payload, 2)
    start, end = reader.rect(), reader.rect()
    bounds = [min(start[0], end[0]), max(start[1], end[1]),
              min(start[2], end[2]), max(start[3], end[3])]
    margin = 40
    width, height = bounds[1] - bounds[0] + margin * 2, bounds[3] - bounds[2] + margin * 2
    body = rect([0, width, 0, height]) + struct.pack('<HH', frame_rate, len(ratios))
    body += b''.join(tag(t, p) for t, p in source_records if t in BITMAPS)
    body += tag(kind, payload)
    for index, ratio in enumerate(ratios):
        if index == 0:
            placement = bytes([0x16]) + struct.pack('<HH', 1, character)
            placement += matrix(margin - bounds[0], margin - bounds[2])
        else:
            placement = bytes([0x11]) + struct.pack('<H', 1)
        body += tag(26, placement + struct.pack('<H', ratio)) + tag(1)
    body += tag(0)
    return b'FWS' + raw[3:4] + struct.pack('<I', len(body) + 8) + body, bounds


def run_java(args, arguments, log_path):
    command = [str(args.java), '-Xmx512m', '-Djava.awt.headless=true',
               '-Dapple.awt.UIElement=true', '-jar', str(args.ffdec), '-cli', *arguments]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
    log_path.write_bytes(result.stdout)
    if result.returncode:
        raise RuntimeError(f'Headless export failed; see {log_path}')


def inventory_bitmaps(args):
    """Decode source bitmap payloads and distinguish reused originals by hash."""
    import numpy as np
    from PIL import Image
    inventory = json.loads((ROOT / '.cache/battle-vector-prototype-346/all-source-inventory.json').read_text())
    destination = args.cache / 'bitmap-originals'
    destination.mkdir(parents=True, exist_ok=True)
    species, unique = [], {}
    for sid, entry in sorted(inventory['species'].items(), key=lambda pair: int(pair[0])):
        if not entry['bitmaps']:
            continue
        raw = (args.sources / f'{sid}.swf').read_bytes()
        source_records, _ = records(raw)
        rows = []
        for kind, payload in source_records:
            if kind not in BITMAPS or kind == 8:
                continue
            character = struct.unpack_from('<H', payload)[0]
            digest = sha(bytes([kind]) + payload[2:])
            reference = {'species': int(sid), 'character': character, 'sourceSha256': sha(raw)}
            if digest not in unique:
                if kind in (20, 36):
                    bitmap_format, width, height = struct.unpack_from('<BHH', payload, 2)
                    if bitmap_format != 5:
                        raise ValueError(f'Unsupported lossless format {bitmap_format}')
                    samples = np.frombuffer(zlib.decompress(payload[7:]), dtype=np.uint8).reshape(height, width, 4)
                    alpha = samples[:, :, 0].astype(np.float64) if kind == 36 else np.full((height, width), 255.)
                    colors = samples[:, :, 1:].astype(np.float64)
                    if kind == 36:
                        colors = np.divide(colors * 255., alpha[:, :, None], out=np.zeros_like(colors),
                                           where=alpha[:, :, None] > 0)
                    rgba = np.concatenate((np.clip(np.rint(colors), 0, 255).astype(np.uint8),
                                           alpha[:, :, None].astype(np.uint8)), axis=2)
                    image = Image.fromarray(rgba)
                else:
                    offset = struct.unpack_from('<I', payload, 2)[0] if kind in (35, 90) else len(payload) - 2
                    start = 8 if kind == 90 else 6 if kind == 35 else 2
                    encoded = payload[start:start + offset]
                    if encoded.startswith(b'\xff\xd9\xff\xd8'):
                        encoded = encoded[2:]
                    image = Image.open(io.BytesIO(encoded)).convert('RGBA')
                    if kind in (35, 90):
                        image.putalpha(Image.frombytes('L', image.size, zlib.decompress(payload[start + offset:])))
                path = destination / f'{sid}-{character}.png'
                image.save(path)
                unique[digest] = {'payloadSha256': digest, 'hashExcludesCharacterId': True, 'tag': kind,
                                  'size': list(image.size), 'path': os.path.relpath(path, ROOT),
                                  'pngSha256': sha(path.read_bytes()), 'references': []}
            unique[digest]['references'].append(reference)
            rows.append({'character': character, 'tag': kind, 'sourcePayloadBytes': len(payload),
                         'size': unique[digest]['size'], 'payloadSha256': digest})
        species.append({'species': int(sid), 'sourceSha256': sha(raw), 'bitmapCount': len(rows), 'bitmaps': rows})
    (args.cache / 'bitmap-inventory.json').write_text(json.dumps(species, indent=2) + '\n')
    (args.cache / 'unique-bitmaps.json').write_text(json.dumps(list(unique.values()), indent=2) + '\n')
    print(f'{len(species)} bitmap species; {sum(len(row["bitmaps"]) for row in species)} references; {len(unique)} unique payloads')


def verify_payloads(args):
    results = []
    for path in sorted(args.cache.glob('*/manifest.json'), key=lambda p: int(p.parent.name)):
        report = json.loads(path.read_text())
        raw = (ROOT / report['sourcePath']).read_bytes()
        if sha(raw) != report['sourceSha256']:
            raise ValueError('Source changed after morph recovery')
        source_records, _ = records(raw)
        morphs = {struct.unpack_from('<H', body)[0]: (kind, body)
                  for kind, body in source_records if kind in MORPHS}
        bitmap_records = [(kind, body) for kind, body in source_records if kind in BITMAPS]
        count = 0
        for swf in path.parent.glob('*/static-ratios.swf'):
            character = int(swf.parent.name)
            output, _ = records(swf.read_bytes())
            if [(kind, body) for kind, body in output if kind in MORPHS] != [morphs[character]]:
                raise ValueError('A source morph payload changed')
            if [(kind, body) for kind, body in output if kind in BITMAPS] != bitmap_records:
                raise ValueError('A source bitmap payload changed')
            if not {kind for kind, _ in output}.issubset({0, 1, 26, *MORPHS, *BITMAPS}):
                raise ValueError('Unexpected tag in the static morph display list')
            ratios = [_placement(kind, body)['ratio'] for kind, body in output if kind == 26]
            expected = sorted({entry['ratio'] for entry in report['occurrences'] if entry['character'] == character})
            if ratios != expected:
                raise ValueError('Static frames differ from the recorded source ratios')
            count += len(ratios)
        if count != len(report['candidates']):
            raise ValueError('Candidate and source-ratio counts differ')
        for candidate in report['candidates']:
            if sha((path.parent / candidate['svgPath']).read_bytes()) != candidate['svgSha256']:
                raise ValueError('A recovered static source SVG changed')
        results.append({'species': report['species'], 'morphs': len(morphs), 'ratios': count,
                        'morphPayloadsUnchanged': True, 'bitmapPayloadsUnchanged': True,
                        'noExecutableTags': True, 'staticSvgHashesVerified': True})
    (args.cache / 'payload-integrity.json').write_text(json.dumps(results, indent=2) + '\n')
    print(f'Payload integrity passed: {len(results)} species, {sum(row["ratios"] for row in results)} source ratios')


def study(sid, args):
    source = args.sources / f'{sid}.swf'
    raw = source.read_bytes()
    source_records, frame_rate = records(raw)
    morph_ids = {struct.unpack_from('<H', p)[0] for t, p in source_records if t in MORPHS}
    work = args.cache / str(sid)
    work.mkdir(parents=True, exist_ok=True)
    manifest_path = work / 'manifest.json'
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        if (previous.get('sourceSha256') == sha(raw)
                and all(sha((work / row['svgPath']).read_bytes()) == row['svgSha256']
                        for row in previous['candidates'] if (work / row['svgPath']).exists())
                and all((work / row['svgPath']).exists() for row in previous['candidates'])):
            return previous
    xml = work / 'source.xml'
    run_java(args, ['-swf2xml', str(source), str(xml)], work / 'xml-export.log')
    ratio_sets, occurrences = collect_ratios(ET.parse(xml), morph_ids)
    candidates, unused = [], []
    for character in sorted(morph_ids):
        ratios = sorted(ratio_sets[character])
        if not ratios:
            unused.append(character)
            continue
        output = work / str(character)
        output.mkdir(exist_ok=True)
        synthetic, bounds = static_swf(raw, source_records, frame_rate, character, ratios)
        swf = output / 'static-ratios.swf'
        swf.write_bytes(synthetic)
        run_java(args, ['-format', 'frame:svg', '-ignorebackground', '-zoom', '1',
                        '-export', 'frame', str(output), str(swf)], output / 'frame-export.log')
        files = {int(p.stem): p for p in output.rglob('*.svg') if p.stem.isdigit()}
        for index, ratio in enumerate(ratios, 1):
            path = files.get(index)
            if path is None:
                raise RuntimeError(f'Missing morph frame {character}:{ratio}')
            tree = ET.parse(path)
            if any(e.tag.rsplit('}', 1)[-1] in ('animate', 'animateTransform', 'script', 'foreignObject')
                   for e in tree.iter()):
                raise ValueError('Expected a static, inactive SVG')
            candidates.append({'key': f'morph-{character}-ratio-{ratio}', 'character': character,
                               'ratio': ratio, 'sourceUnionBoundsTwips': bounds,
                               'svgPath': str(path.relative_to(work)), 'svgSha256': sha(path.read_bytes())})
    report = {'species': int(sid), 'sourcePath': os.path.relpath(source, ROOT), 'sourceSha256': sha(raw),
              'sourceBytes': len(raw), 'morphCharacters': sorted(morph_ids),
              'bitmapCharacters': [struct.unpack_from('<H', p)[0] for t, p in source_records
                                   if t in BITMAPS and t != 8],
              'method': 'Original morph tag payload, recorded timeline ratio, JPEXS static frame SVG',
              'candidates': candidates, 'occurrences': occurrences, 'unusedMorphCharacters': unused}
    manifest_path.write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', default='1249', help='Comma-separated species IDs or all-morph')
    parser.add_argument('--bitmap-inventory', action='store_true', help='Decode original bitmap definitions without morph exports')
    parser.add_argument('--verify-payloads', action='store_true', help='Verify exact original payloads and recorded ratios')
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache/portrait-v44/sources')
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/battle-hd-v44/morph-study')
    parser.add_argument('--java', type=Path, default=ROOT / '.cache/portrait-v44/toolchain/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java')
    parser.add_argument('--ffdec', type=Path, default=ROOT / '.cache/portrait-v44/toolchain/ffdec/ffdec.jar')
    args = parser.parse_args()
    if args.bitmap_inventory:
        inventory_bitmaps(args)
        return
    if args.verify_payloads:
        verify_payloads(args)
        return
    ids = args.ids.split(',')
    if args.ids == 'all-morph':
        inventory = json.loads((ROOT / '.cache/battle-vector-prototype-346/all-source-inventory.json').read_text())
        ids = sorted((sid for sid, row in inventory['species'].items() if row['morphs']), key=int)
    args.cache.mkdir(parents=True, exist_ok=True)
    summary = {'requested': len(ids), 'species': {}, 'failures': {}}
    for sid in ids:
        try:
            report = study(int(sid), args)
            row = {'morphs': len(report['morphCharacters']), 'candidates': len(report['candidates']),
                   'unused': len(report['unusedMorphCharacters'])}
            summary['species'][str(sid)] = row
            print(f'{sid}: {row["morphs"]} morphs, {row["candidates"]} source ratio candidates', flush=True)
        except Exception as error:
            summary['failures'][str(sid)] = str(error)
            print(f'{sid}: FAILED {error}', flush=True)
        (args.cache / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    if summary['failures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
