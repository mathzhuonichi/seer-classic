#!/usr/bin/env python3
"""Restore map 10032's original static animator layer from its pinned SWF.

This narrow decoder only supports the inspected source version. It retains the
source curves, colors, gradients, mask, first-frame depths and placements. It
does not execute ActionScript or include control_mc/top_mc interactive actors.
The input SVG must be the calibrated original bg_mc export. It may also be the
output path; validation and composition finish before any output is replaced.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile
import xml.etree.ElementTree as ET
import zlib


SOURCE_SHA256 = '657a73d6b79d5c03bce08f05bc92319854e080a2e87e5a4d06a80aae014f8920'
BACKGROUND_SHA256 = 'f5796507d290a74e84fcc8e837c24494f6a17d386ad1fb9b6fe8c8d94270e6f0'
BACKGROUND_JPEG_SHA256 = '965c1f069dbb13a1609ae8c898271d922856600623ff812365752eb413bde52f'
OVERLAY_ID = 'official-animator-19-frame-1'
SVG_NS = 'http://www.w3.org/2000/svg'
IDENTITY = [1, 0, 0, 1, 0, 0]


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(data):
    return hashlib.sha256(data).hexdigest()


class _Bits:
    def __init__(self, data, offset=0):
        self.data, self.i = data, offset * 8

    def u(self, n):
        _require(self.i + n <= len(self.data) * 8, 'Truncated SWF bit field')
        result = 0
        for _ in range(n):
            result = (result << 1) | ((self.data[self.i // 8] >> (7 - self.i % 8)) & 1)
            self.i += 1
        return result

    def s(self, n):
        value = self.u(n)
        return value - (1 << n) if n and value >> (n - 1) else value

    def align(self):
        self.i = (self.i + 7) // 8 * 8

    def byte(self):
        self.align()
        return self.u(8)

    def ui16(self):
        return self.byte() | (self.byte() << 8)

    def rect(self):
        n = self.u(5)
        result = [self.s(n) for _ in range(4)]
        self.align()
        return result

    def matrix(self):
        a = d = 1
        b = c = 0
        if self.u(1):
            n = self.u(5)
            a, d = self.s(n) / 65536, self.s(n) / 65536
        if self.u(1):
            n = self.u(5)
            b, c = self.s(n) / 65536, self.s(n) / 65536
        n = self.u(5)
        x, y = self.s(n), self.s(n)
        self.align()
        return [a, b, c, d, x, y]


def _tags(data, offset=0):
    while offset < len(data):
        _require(offset + 2 <= len(data), 'Truncated SWF tag header')
        header = struct.unpack_from('<H', data, offset)[0]
        offset += 2
        tag, size = header >> 6, header & 63
        if size == 63:
            _require(offset + 4 <= len(data), 'Truncated SWF tag length')
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
        _require(offset + size <= len(data), 'Truncated SWF tag body')
        yield tag, data[offset:offset + size]
        offset += size
        if tag == 0:
            break


def _placement(tag, body):
    r = _Bits(body)
    flags = r.byte()
    flags2 = r.byte() if tag == 70 else 0
    result = {'depth': r.ui16(), 'flags': flags, 'flags2': flags2}
    _require(not flags2 & (8 | 16), 'Unexpected class-name placement')
    if flags & 2:
        result['character'] = r.ui16()
    if flags & 4:
        result['matrix'] = r.matrix()
    if flags & 8:
        add, mult, n = r.u(1), r.u(1), r.u(4)
        result['multiply'] = [r.s(n) / 256 for _ in range(4)] if mult else [1] * 4
        result['add'] = [r.s(n) for _ in range(4)] if add else [0] * 4
        r.align()
    if flags & 16:
        result['ratio'] = r.ui16()
    if flags & 32:
        name = []
        while True:
            byte = r.byte()
            if not byte:
                break
            name.append(byte)
        result['name'] = bytes(name).decode('utf-8')
    if flags & 64:
        result['clipDepth'] = r.ui16()
    result['remainingBytes'] = body[r.i // 8:].hex()
    return result


def _read_source(raw):
    _require(_sha(raw) == SOURCE_SHA256, 'Unsupported map SWF SHA-256; expected the inspected map 10032 source')
    _require(raw[:3] == b'CWS', 'Expected the inspected compressed SWF')
    data = zlib.decompress(raw[8:])
    _require(struct.unpack_from('<I', raw, 4)[0] == len(data) + 8, 'SWF file length does not match its header')
    reader = _Bits(data)
    _require(reader.rect() == [0, 19200, 0, 11200], 'Expected the original 960 by 560 SWF stage')
    reader.ui16()  # Original frame rate; no animation is executed.
    root_frames = reader.ui16()
    _require(root_frames == 1, 'Expected one root frame')
    records = list(_tags(data, reader.i // 8))
    definitions = {struct.unpack_from('<H', body)[0]: (tag, body)
                   for tag, body in records if tag in (2, 22, 32, 83, 39)}
    placements = []
    for tag, body in records:
        if tag == 1:
            break
        if tag in (26, 70):
            placements.append(_placement(tag, body))
    named = {row.get('name'): row for row in placements if row.get('name')}
    for name, character, depth in [('bg_mc', 3, 1), ('animator_mc', 19, 3)]:
        row = named.get(name, {})
        _require(row.get('character') == character and row.get('depth') == depth
                 and row.get('matrix') == IDENTITY and row.get('flags') == 38
                 and not row.get('remainingBytes'), f'Unexpected original root placement for {name}')
    bitmap = next((body for tag, body in records if tag == 21 and body[:2] == b'\x01\x00'), None)
    _require(bitmap is not None and _sha(bitmap[2:]) == BACKGROUND_JPEG_SHA256,
             'The original background is not the expected opaque DefineBitsJPEG2 bitmap')
    return definitions, named


def _first_frame(definitions, character):
    tag, body = definitions[character]
    _require(tag == 39, f'Character {character} is not a sprite')
    result = []
    for tag, payload in _tags(body, 4):
        if tag == 1:
            return result
        _require(tag in (26, 70), f'Unexpected first-frame tag {tag} in sprite {character}')
        result.append(_placement(tag, payload))
    raise ValueError(f'Missing first frame in sprite {character}')


def _shape(definitions, character):
    tag, body = definitions[character]
    _require(tag in (2, 22, 32), f'Unsupported shape tag {tag} for character {character}')
    r = _Bits(body, 2)
    bounds = r.rect()
    rgba = tag == 32
    fills, lines, gradients = [None], [None], []

    def color():
        channels = [r.byte() for _ in range(4 if rgba else 3)]
        return '#%02x%02x%02x' % tuple(channels[:3]), channels[3] / 255 if rgba else 1

    def count():
        n = r.byte()
        return r.ui16() if n == 255 and tag != 2 else n

    for _ in range(count()):
        kind = r.byte()
        if kind == 0:
            fills.append(color())
        elif kind in (0x10, 0x12):
            matrix = r.matrix()
            flags = r.byte()
            spread, interpolate, n = flags >> 6, (flags >> 4) & 3, flags & 15
            _require(spread <= 2 and interpolate <= 1, 'Unsupported source gradient mode')
            stops = [(r.byte() / 255, color()) for _ in range(n)]
            ident = f'gradient-{character}-{len(fills)}'
            gradient = ET.Element('linearGradient' if kind == 0x10 else 'radialGradient', {
                'id': ident, 'gradientUnits': 'userSpaceOnUse',
                'gradientTransform': 'matrix(%s)' % ' '.join(map(str, matrix)),
                'spreadMethod': ['pad', 'reflect', 'repeat'][spread],
                'color-interpolation': 'linearRGB' if interpolate else 'sRGB',
                **({'x1': '-16384', 'y1': '0', 'x2': '16384', 'y2': '0'} if kind == 0x10
                   else {'cx': '0', 'cy': '0', 'r': '16384'}),
            })
            for ratio, (value, alpha) in stops:
                ET.SubElement(gradient, 'stop', {'offset': str(ratio), 'stop-color': value, 'stop-opacity': str(alpha)})
            gradients.append(gradient)
            fills.append((f'url(#{ident})', 1))
        else:
            raise ValueError(f'Unsupported fill kind {kind} in shape {character}')
    for _ in range(count()):
        lines.append((r.ui16(), color()))
    fill_bits, line_bits = r.u(4), r.u(4)
    x = y = fill0 = fill1 = line = 0
    by_fill, by_line = {}, {}
    while True:
        if r.u(1):
            straight, n = r.u(1), r.u(4) + 2
            origin = (x, y)
            if straight:
                if r.u(1):
                    x, y = x + r.s(n), y + r.s(n)
                elif r.u(1):
                    y += r.s(n)
                else:
                    x += r.s(n)
                edge = (origin, None, (x, y))
            else:
                cx, cy = x + r.s(n), y + r.s(n)
                x, y = cx + r.s(n), cy + r.s(n)
                edge = (origin, (cx, cy), (x, y))
            if fill0:
                by_fill.setdefault(fill0, []).append(edge)
            if fill1:
                by_fill.setdefault(fill1, []).append((edge[2], edge[1], edge[0]))
            if line:
                by_line.setdefault(line, []).append(edge)
        else:
            flags = r.u(5)
            if not flags:
                break
            if flags & 1:
                n = r.u(5)
                x, y = r.s(n), r.s(n)
            if flags & 2:
                fill0 = r.u(fill_bits)
            if flags & 4:
                fill1 = r.u(fill_bits)
            if flags & 8:
                line = r.u(line_bits)
            _require(not flags & 16, f'Unsupported new styles in shape {character}')

    def path(edges, close):
        remaining = list(edges)
        commands = []
        while remaining:
            start, control, end = remaining.pop(0)
            commands.append(f'M{start[0]} {start[1]}')
            while True:
                commands.append(f'L{end[0]} {end[1]}' if control is None
                                else f'Q{control[0]} {control[1]} {end[0]} {end[1]}')
                if end == start:
                    if close:
                        commands.append('Z')
                    break
                index = next((i for i, edge in enumerate(remaining) if edge[0] == end), None)
                if index is None:
                    _require(not close, f'Unclosed source fill contour in shape {character}')
                    break
                _, control, end = remaining.pop(index)
        return ' '.join(commands)

    group = ET.Element('g', {'id': f'shape-{character}', 'transform': 'scale(.05)'})
    if gradients:
        ET.SubElement(group, 'defs').extend(gradients)
    for index, edges in sorted(by_fill.items()):
        value, alpha = fills[index]
        ET.SubElement(group, 'path', {'d': path(edges, True), 'fill': value, 'fill-opacity': str(alpha), 'fill-rule': 'evenodd'})
    for index, edges in sorted(by_line.items()):
        width, (value, alpha) = lines[index]
        ET.SubElement(group, 'path', {'d': path(edges, False), 'fill': 'none', 'stroke': value,
                                    'stroke-opacity': str(alpha), 'stroke-width': str(width),
                                    'stroke-linecap': 'round', 'stroke-linejoin': 'round'})
    return group, {'character': character, 'bounds': [n / 20 for n in bounds],
                   'fills': len(by_fill), 'lines': len(by_line)}


def _overlay(definitions):
    animator = _first_frame(definitions, 19)
    energy = _first_frame(definitions, 12)
    _require([p.get('character') for p in animator] == [12, 16, 18]
             and [p['depth'] for p in animator] == [1, 9, 11], 'Unexpected animator first-frame layers')
    _require([p.get('character') for p in energy] == [4, 6, 8, 11]
             and [p['depth'] for p in energy] == [1, 2, 5, 7]
             and energy[0].get('clipDepth') == 4, 'Unexpected energy layer or mask depths')
    for sprite, character in [(6, 5), (8, 7), (16, 13), (18, 17)]:
        rows = _first_frame(definitions, sprite)
        _require(len(rows) == 1 and rows[0].get('character') == character
                 and rows[0].get('matrix') == IDENTITY and rows[0].get('flags') == 6
                 and not rows[0].get('remainingBytes'), f'Unexpected source wrapper sprite {sprite}')
    _require(energy[2]['flags2'] == 1
             and energy[2]['remainingBytes'] == '01021aaf73ff0000000000000000000021',
             'Expected one visually inert GlowFilter with zero blur and zero strength')
    _require(energy[3].get('multiply') == [1, 1, 1, 0]
             and energy[3].get('add') == [0, 0, 0, 0]
             and energy[3]['remainingBytes'] == '0202108153ff000000000000000000002101000000000000000008',
             'Expected invisible glow sprite with inert glow/blur filters in the source first frame')
    _require(animator[0]['matrix'] == [1, 0, 0, 1, 9639, 4900], 'Unexpected energy sprite registration')
    shapes = []

    def vector_node(character, matrix):
        group = ET.Element('g', {'transform': 'matrix(%s)' % ' '.join(
            f'{n:g}' for n in [*matrix[:4], matrix[4] / 20, matrix[5] / 20])})
        node, metadata = _shape(definitions, character)
        shapes.append(metadata)
        group.append(node)
        return group

    root = ET.Element('g', {'id': OVERLAY_ID})
    energy_group = ET.SubElement(root, 'g', {'id': 'official-energy-sprite-12',
                                           'transform': 'translate(481.95 245)'})
    clip = ET.SubElement(ET.SubElement(energy_group, 'defs'), 'clipPath', {
        'id': 'official-energy-mask-depth-1-to-4', 'clipPathUnits': 'userSpaceOnUse'})
    clip.append(vector_node(4, energy[0]['matrix']))
    clipped = ET.SubElement(energy_group, 'g', {'clip-path': 'url(#official-energy-mask-depth-1-to-4)'})
    clipped.append(vector_node(5, energy[1]['matrix']))
    energy_group.append(vector_node(7, energy[2]['matrix']))
    machine = vector_node(13, animator[1]['matrix'])
    machine.set('id', 'official-machine-sprite-16')
    root.append(machine)
    platform = vector_node(17, animator[2]['matrix'])
    platform.set('id', 'official-platform-sprite-18')
    root.append(platform)
    for node in root.iter():
        node.tag = '{' + SVG_NS + '}' + node.tag
    metadata = {
        'sourceInstance': 'animator_mc', 'sourceSymbol': 19, 'sourceFrame': 1,
        'sourceDepth': 3, 'matrix': IDENTITY, 'shapes': shapes,
        'matrixUnits': 'Linear coefficients are unitless; source translation values are SWF twips (20 per pixel).',
        'animatorFirstFrame': animator, 'energyFirstFrame': energy,
        'filterHandling': 'Sprite 8 has a zero-blur, zero-strength GlowFilter. Sprite 11 has zero blur/strength in its glow and blur filters and is fully transparent in frame 1. These filters are visually inert.',
        'scope': 'Original static decoration only; control_mc, top_mc and ActionScript are excluded.',
    }
    return root, metadata


def _write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        os.chmod(temporary, path.stat().st_mode & 0o777 if path.exists() else 0o644)
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def restore_floor(swf: Path, background: Path, output: Path, evidence: Path | None = None) -> dict:
    """Restore the pinned source layer and return manifest-ready metadata.

    ``background == output`` is supported. An existing recovered overlay is
    rejected explicitly; the caller must provide the original bg_mc export.
    """
    swf, background, output = map(Path, (swf, background, output))
    evidence = Path(evidence) if evidence is not None else None
    _require(output.resolve() != swf.resolve(), 'Output must not overwrite the source SWF')
    if evidence is not None:
        _require(evidence.resolve() not in {swf.resolve(), background.resolve(), output.resolve()},
                 'Evidence must use a separate output path')
    raw, original = swf.read_bytes(), background.read_bytes()
    definitions, placements = _read_source(raw)
    svg = ET.fromstring(original)
    _require(not any(node.get('id') == OVERLAY_ID for node in svg.iter()),
             'Background already contains the recovered animator layer; use the original bg_mc export')
    _require(_sha(original) == BACKGROUND_SHA256, 'Unsupported background SHA-256; expected the calibrated original bg_mc SVG')
    _require(svg.tag == '{' + SVG_NS + '}svg' and float(svg.get('width', '0')) == 960
             and float(svg.get('height', '0')) == 560
             and [float(n) for n in svg.get('viewBox', '').split()] == [0, 0, 960, 560],
             'Expected the calibrated 960 by 560 background viewport')
    overlay, metadata = _overlay(definitions)
    svg.append(overlay)
    ET.register_namespace('', SVG_NS)
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')
    result = ET.tostring(svg, encoding='utf-8', xml_declaration=True)
    manifest = {'sha256': _sha(result), 'bytes': len(result), 'staticOverlay': metadata}
    record = {
        'source': str(swf), 'sourceSha256': _sha(raw),
        'background': str(background), 'backgroundSha256': _sha(original),
        'backgroundJpegSha256': BACKGROUND_JPEG_SHA256,
        'backgroundPlacement': placements['bg_mc'], 'animatorPlacement': placements['animator_mc'],
        'output': str(output), **manifest,
    }
    evidence_bytes = (json.dumps(record, indent=2) + '\n').encode('utf-8')
    _write_atomic(output, result)
    if evidence is not None:
        _write_atomic(evidence, evidence_bytes)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--swf', required=True, type=Path)
    parser.add_argument('--background', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    try:
        result = restore_floor(args.swf, args.background, args.output, args.evidence)
    except (ValueError, OSError, ET.ParseError, zlib.error) as error:
        parser.exit(1, f'{parser.prog}: {error}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
