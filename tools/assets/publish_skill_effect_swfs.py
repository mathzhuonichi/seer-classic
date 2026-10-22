#!/usr/bin/env python3
"""Publish the original skill-effect SWFs for runtime playback with Ruffle, with their index and provenance.

Every in-scope skill ID (`skill_effect_sources.mjs --scope`) must have its cached official SWF (`probe.json` beside the
sources, written by the same tool). Each SWF is checked and read without running ActionScript:

- its `skill` class (SymbolClass) names a sprite, whose frame count is the effect's timeline;
- the class's frame scripts (`frameN` methods, N counted from 1) tell which frames set `hit` and `isEnd`, and whether
  frame 1 calls `stop()` (the host's gotoAndPlay(2) runs those, as the original client did);
- PlaceObject3 blend modes overlay (13) and hardlight (14) are rewritten to normal (1). On the transparent host canvas they
  have no backdrop to blend with and Ruffle draws them black; normal matches the FFDec reference in all 16 such effects.

Unpatched SWFs are hard-linked from the cache when possible, so publication does not duplicate their bytes. Outputs:
- `public/battle-effects/swf/<skillId>.swf` (ignored by Git; the asset archive carries them);
- `public/battle-effects/swf/index.json`, the runtime index: skillId -> [end frame, version];
- `public/battle-effects/swf/manifest.json`, the provenance: source hashes, stage, frame rate, frames and script facts, and
  the published hash of the patched ones.
Nothing is written unless every in-scope SWF passes.
"""
from pathlib import Path
import argparse
import hashlib
import json
import lzma
import os
import struct
import subprocess
import zlib

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/battle-effects/swf'
SOURCE_ROUTE = 'https://seer.61.com/resource/fightResource/skill/swf/<skillId>.swf'
RUNTIME_PATH = '/battle-effects/swf/<skillId>.swf'
SKILL_CLASS = 'skill'
TRANSPARENT_UNSAFE_BLENDS = {13: 'overlay', 14: 'hardlight'}
NORMAL_BLEND = 1
VERSION_CHARS = 8
DEFINE_SPRITE, SYMBOL_CLASS, DO_ABC, PLACE_OBJECT3, DO_ABC1 = 39, 76, 82, 70, 72

# AVM2 operand layouts: u = u30, b = u8, s = s24, L = lookupswitch; every other opcode has no operands.
OPERANDS = {op: 'u' for op in (0x04, 0x05, 0x06, 0x08, 0x25, 0x2C, 0x2D, 0x2E, 0x2F, 0x31, 0x40, 0x41, 0x42, 0x49, 0x53, 0x55,
                               0x56, 0x58, 0x59, 0x5A, 0x5D, 0x5E, 0x5F, 0x60, 0x61, 0x62, 0x63, 0x66, 0x68, 0x6A, 0x6C, 0x6D,
                               0x6E, 0x6F, 0x80, 0x86, 0x92, 0x94, 0xB2, 0xC2, 0xC3, 0xF0, 0xF1, 0xF2)}
OPERANDS.update({op: 'uu' for op in (0x32, 0x43, 0x44, 0x45, 0x46, 0x4A, 0x4C, 0x4E, 0x4F)})
OPERANDS.update({op: 's' for op in range(0x0C, 0x1B)})
OPERANDS.update({0x1B: 'L', 0x24: 'b', 0x65: 'b', 0xEF: 'bubu'})
SET_PROPERTY, INIT_PROPERTY, CALL_PROP_VOID, CALL_PROPERTY = 0x61, 0x68, 0x4F, 0x46


def sha(data):
    return hashlib.sha256(data).hexdigest()


def swf_body(data):
    """The uncompressed bytes after the 8-byte header."""
    kind = data[:3]
    if kind == b'FWS':
        return bytearray(data[8:])
    if kind == b'CWS':
        return bytearray(zlib.decompress(data[8:]))
    if kind == b'ZWS':
        props = [lzma._decode_filter_properties(lzma.FILTER_LZMA1, data[12:17])]
        return bytearray(lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=props).decompress(data[17:]))
    raise ValueError('not a SWF')


class Bits:
    def __init__(self, data, byte):
        self.data, self.bit = data, byte * 8

    def u(self, n):
        value = 0
        for _ in range(n):
            value = value << 1 | (self.data[self.bit >> 3] >> (7 - (self.bit & 7)) & 1)
            self.bit += 1
        return value

    def s(self, n):
        value = self.u(n)
        return value - (1 << n) if n and value >> (n - 1) else value

    def end(self):
        return (self.bit + 7) // 8


def header(body):
    """Stage size in px, frame rate and the offset of the first tag."""
    bits = Bits(body, 0)
    n = bits.u(5)
    xmin, xmax, ymin, ymax = (bits.s(n) for _ in range(4))
    at = bits.end()
    rate, = struct.unpack_from('<H', body, at)
    return [(xmax - xmin) / 20, (ymax - ymin) / 20], rate / 256, at + 4


def tags(body, at, end=None):
    """(code, body offset, length) of each tag up to and including End."""
    end = len(body) if end is None else end
    while at + 2 <= end:
        head, = struct.unpack_from('<H', body, at)
        at += 2
        code, length = head >> 6, head & 0x3F
        if length == 0x3F:
            length, = struct.unpack_from('<I', body, at)
            at += 4
        yield code, at, length
        at += length
        if code == 0:
            return


def skip_matrix(body, at):
    bits = Bits(body, at)
    for _ in range(2):
        if bits.u(1):
            n = bits.u(5)
            bits.u(2 * n)
    n = bits.u(5)
    bits.u(2 * n)
    return bits.end()


def skip_cxform(body, at):
    bits = Bits(body, at)
    has_add, has_mult, n = bits.u(1), bits.u(1), bits.u(4)
    bits.u(4 * n * (has_add + has_mult))
    return bits.end()


def skip_filters(body, at):
    count = body[at]
    at += 1
    for _ in range(count):
        kind = body[at]
        at += 1
        if kind in (4, 7):  # gradient glow, gradient bevel
            at += 1 + 5 * body[at] + 19
        elif kind == 5:  # convolution
            at += 2 + 8 + 4 * body[at] * body[at + 1] + 5
        else:
            at += {0: 23, 1: 9, 2: 15, 3: 27, 6: 80}[kind]
    return at


def blend_offset(body, at):
    """Offset of a PlaceObject3's blend mode byte, or None."""
    flags, flags2 = body[at], body[at + 1]
    at += 4
    if flags2 & 0x08 or (flags2 & 0x10 and flags & 0x02):
        at = body.index(0, at) + 1
    if flags & 0x02:
        at += 2
    if flags & 0x04:
        at = skip_matrix(body, at)
    if flags & 0x08:
        at = skip_cxform(body, at)
    if flags & 0x10:
        at += 2
    if flags & 0x20:
        at = body.index(0, at) + 1
    if flags & 0x40:
        at += 2
    if flags2 & 0x01:
        at = skip_filters(body, at)
    return at if flags2 & 0x02 else None


def patch_blends(body, at, end, patched):
    """Rewrites transparency-unsafe blend modes in place, in this timeline and every sprite's."""
    for code, start, length in tags(body, at, end):
        if code == PLACE_OBJECT3:
            offset = blend_offset(body, start)
            if offset is not None and body[offset] in TRANSPARENT_UNSAFE_BLENDS:
                name = TRANSPARENT_UNSAFE_BLENDS[body[offset]]
                patched[name] = patched.get(name, 0) + 1
                body[offset] = NORMAL_BLEND
        elif code == DEFINE_SPRITE:
            patch_blends(body, start + 4, start + length, patched)


class Reader:
    def __init__(self, data, at=0):
        self.data, self.at = data, at

    def u8(self):
        self.at += 1
        return self.data[self.at - 1]

    def u30(self):
        value = shift = 0
        while True:
            byte = self.u8()
            value |= (byte & 0x7F) << shift
            shift += 7
            if not byte & 0x80 or shift >= 35:
                return value

    def skip(self, count):
        for _ in range(count):
            self.u30()


def constant_pool(r):
    """The ABC string pool and multiname names (None for runtime names)."""
    for _ in range(2):  # int and uint pools
        r.skip(max(0, r.u30() - 1))
    doubles = max(0, r.u30() - 1)
    r.at += 8 * doubles
    strings = ['']
    for _ in range(max(0, r.u30() - 1)):
        length = r.u30()
        strings.append(bytes(r.data[r.at:r.at + length]).decode('utf-8', 'replace'))
        r.at += length
    for _ in range(max(0, r.u30() - 1)):
        r.u8()
        r.u30()
    for _ in range(max(0, r.u30() - 1)):
        r.skip(r.u30())
    names = [None]
    for _ in range(max(0, r.u30() - 1)):
        kind = r.u8()
        if kind in (0x07, 0x0D):
            r.u30()
            names.append(strings[r.u30()])
        elif kind in (0x0F, 0x10):
            names.append(strings[r.u30()])
        elif kind in (0x09, 0x0E):
            names.append(strings[r.u30()])
            r.u30()
        elif kind in (0x11, 0x12):
            names.append(None)
        elif kind in (0x1B, 0x1C):
            r.u30()
            names.append(None)
        elif kind == 0x1D:
            r.u30()
            r.skip(r.u30())
            names.append(None)
        else:
            raise ValueError(f'multiname kind {kind:#x}')
    return names


def traits(r, names):
    """(name, method index or None) of each trait."""
    out = []
    for _ in range(r.u30()):
        name = names[r.u30()]
        kind_byte = r.u8()
        kind = kind_byte & 0x0F
        if kind in (0, 6):
            r.u30()
            r.u30()
            if r.u30():
                r.u8()
            out.append((name, None))
        else:
            r.u30()
            index = r.u30()
            out.append((name, index if kind in (1, 2, 3) else None))
        if kind_byte >> 4 & 0x04:
            r.skip(r.u30())
    return out


def skill_frame_scripts(abc):
    """{frame number: code} of the `skill` class's frameN methods, and the multiname names."""
    r = Reader(abc, 4)
    names = constant_pool(r)
    for _ in range(r.u30()):  # method signatures
        params = r.u30()
        r.u30()
        r.skip(params)
        r.u30()
        flags = r.u8()
        if flags & 0x08:
            for _ in range(r.u30()):
                r.u30()
                r.u8()
        if flags & 0x80:
            r.skip(params)
    for _ in range(r.u30()):  # metadata
        r.u30()
        r.skip(2 * r.u30())
    instances = []
    for _ in range(class_count := r.u30()):
        name = names[r.u30()]
        r.u30()
        if r.u8() & 0x08:
            r.u30()
        r.skip(r.u30())
        r.u30()
        instances.append((name, traits(r, names)))
    for _ in range(class_count):
        r.u30()
        traits(r, names)
    for _ in range(r.u30()):  # scripts
        r.u30()
        traits(r, names)
    bodies = {}
    for _ in range(r.u30()):
        method = r.u30()
        r.skip(4)
        length = r.u30()
        bodies[method] = bytes(abc[r.at:r.at + length])
        r.at += length
        r.skip(5 * r.u30())
        traits(r, names)
    frames = {}
    for name, members in instances:
        if name != SKILL_CLASS:
            continue
        for member, method in members:
            if member and member.startswith('frame') and member[5:].isdigit() and method in bodies:
                frames[int(member[5:])] = bodies[method]
    return frames, names


def instructions(code):
    """(opcode, operands) of each AVM2 instruction."""
    r = Reader(code)
    while r.at < len(code):
        op = r.u8()
        layout = OPERANDS.get(op, '')
        if layout == 'L':
            r.at += 3
            cases = r.u30() + 1
            r.at += 3 * cases
            yield op, ()
            continue
        values = []
        for kind in layout:
            if kind == 'u':
                values.append(r.u30())
            elif kind == 'b':
                values.append(r.u8())
            else:
                r.at += 3
        yield op, tuple(values)


def script_facts(frames, names):
    """Frames setting hit and isEnd, and whether frame 1 calls stop()."""
    def touches(code, property_name, ops):
        return any(op in ops and names[values[0]] == property_name for op, values in instructions(code))
    sets = lambda name: sorted(frame for frame, code in frames.items() if touches(code, name, (SET_PROPERTY, INIT_PROPERTY)))
    stops = 1 in frames and any(op in (CALL_PROP_VOID, CALL_PROPERTY) and names[values[0]] == 'stop' and values[1] == 0
                                for op, values in instructions(frames[1]))
    return sets('hit'), sets('isEnd'), stops


def read_effect(data):
    """Everything the index and manifest record about one source SWF, and its bytes to publish."""
    body = swf_body(data)
    stage, fps, first = header(body)
    classes, sprites, abc = {}, {}, None
    for code, start, length in tags(body, first):
        if code == SYMBOL_CLASS:
            count, = struct.unpack_from('<H', body, start)
            at = start + 2
            for _ in range(count):
                tag_id, = struct.unpack_from('<H', body, at)
                end = body.index(0, at + 2)
                classes[bytes(body[at + 2:end]).decode('utf-8', 'replace')] = tag_id
                at = end + 1
        elif code == DEFINE_SPRITE:
            sprite, frame_count = struct.unpack_from('<HH', body, start)
            sprites[sprite] = frame_count
        elif code == DO_ABC:
            if abc is not None:
                raise ValueError('more than one DoABC tag')
            abc = bytes(body[body.index(0, start + 4) + 1:start + length])
        elif code == DO_ABC1:
            raise ValueError('a DoABC1 tag')
    if SKILL_CLASS not in classes or classes[SKILL_CLASS] not in sprites:
        raise ValueError('no `skill` class bound to a sprite')
    if abc is None:
        raise ValueError('no DoABC tag')
    frames = sprites[classes[SKILL_CLASS]]
    hit, end, stops = script_facts(*skill_frame_scripts(abc))
    if not end or end[-1] > frames:
        raise ValueError(f'isEnd is never set within the {frames} frames')
    patched = {}
    patch_blends(body, first, len(body), patched)
    published = data
    if patched:
        published = b'CWS' + data[3:4] + struct.pack('<I', 8 + len(body)) + zlib.compress(bytes(body), 9)
    facts = dict(stage=stage, fps=fps, frames=frames, hitFrame=hit[0] if hit else None, endFrame=end[-1], stopsOnFrame1=stops)
    return facts, patched, published


def lines(header_fields, key, rows):
    """Pretty header with one compact row per line, so a regeneration diffs by effect."""
    head = json.dumps(header_fields, ensure_ascii=False, indent=2)[:-2]
    body = ',\n'.join(f'    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in rows.items())
    return f'{head},\n  {json.dumps(key)}: {{\n{body}\n  }}\n}}\n'


def collect(sources, scope):
    probe = {row['id']: row for row in json.loads((sources / 'probe.json').read_text())['rows']}
    effects, failures = {}, []
    for skill_id in scope:
        row = probe.get(skill_id)
        if not row or row['status'] != 'swf':
            failures.append(f"{skill_id}: no official SWF ({row['status'] if row else 'not probed'})")
            continue
        data = (sources / f'{skill_id}.swf').read_bytes()
        if sha(data) != row['sha256']:
            failures.append(f'{skill_id}: the cached SWF differs from the probed official response')
            continue
        try:
            effects[skill_id] = (data, *read_effect(data))
        except (ValueError, IndexError, KeyError, struct.error, zlib.error) as error:
            failures.append(f'{skill_id}: {error}')
    return effects, failures


def publish(sources, effects):
    OUT.mkdir(parents=True, exist_ok=True)
    keep = {f'{skill_id}.swf' for skill_id in effects}
    for stale in OUT.glob('*.swf'):
        if stale.name not in keep:
            stale.unlink()
    index, manifest = {}, {}
    for skill_id, (source, facts, patched, published) in effects.items():
        target = OUT / f'{skill_id}.swf'
        target.unlink(missing_ok=True)
        if published is source:
            try:
                os.link(sources / f'{skill_id}.swf', target)
            except OSError:
                target.write_bytes(published)
        else:
            target.write_bytes(published)
        digest = sha(published)
        index[str(skill_id)] = [facts['endFrame'], digest[:VERSION_CHARS]]
        changed = {'bytes': len(published), 'sha256': digest, 'blendsToNormal': patched} if patched else {}
        manifest[str(skill_id)] = dict(sourceBytes=len(source), sourceSha256=sha(source), **facts, **changed)
    return index, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache/skill-effects/sources')
    args = parser.parse_args()
    sources = args.sources.resolve()
    scope = json.loads(subprocess.check_output(['node', str(ROOT / 'tools/assets/skill_effect_sources.mjs'), '--scope']))
    effects, failures = collect(sources, scope)
    if failures:
        raise SystemExit('Not published:\n  ' + '\n  '.join(failures))
    index, manifest = publish(sources, effects)
    (OUT / 'index.json').write_text(lines({'schema': 1, 'path': RUNTIME_PATH, 'row': ['end frame', 'version']}, 'effects', index))
    fps = sorted({row['fps'] for row in manifest.values()})
    summary = dict(effects=len(manifest), sourceBytes=sum(row['sourceBytes'] for row in manifest.values()),
                   bytes=sum(row.get('bytes', row['sourceBytes']) for row in manifest.values()), fps=fps,
                   stopsOnFrame1=sum(row['stopsOnFrame1'] for row in manifest.values()),
                   blendPatched=sorted(int(k) for k, row in manifest.items() if 'blendsToNormal' in row))
    (OUT / 'manifest.json').write_text(lines({
        'schema': 1, 'source': 'Official seer.61.com skill SWFs; original BefLoad skill-ID route', 'route': SOURCE_ROUTE,
        'scope': 'tools/assets/skill_effect_sources.mjs --scope', 'actionScriptExecuted': 'at runtime, by Ruffle (stop/hit/isEnd only)',
        'patch': 'PlaceObject3 blend modes overlay/hardlight rewritten to normal; every other byte is the official file.',
        'summary': summary}, 'effects', manifest))
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
