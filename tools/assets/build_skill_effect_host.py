#!/usr/bin/env python3
"""Build src/features/battle/skill-effect-host.swf, the skill-effect stage Ruffle runs in battle, from skill-effect-host/FxHost.as.

FFDec's AS3 compiler (`-replace`, against the playerglobal it bundles) needs a SWF that already holds a script to replace:
1. a one-frame base SWF takes a donor skill SWF's DoABC, with the root bound to the donor's `skill` class;
2. FFDec replaces that script with FxHost.as;
3. the root (SymbolClass id 0) is rebound to FxHost.
Any other class in the donor's ABC would stay but never be created (10001 has none). The stage rate in the header is the effects'
playback rate: a loaded SWF plays at its host's rate, and the skill SWFs were authored at 25 fps (5,271 of 5,273 headers).
The built SWF is tracked and the battle imports it as an asset. Rebuild it only when FxHost.as changes: FFDec 26.3.0
labels its compiler experimental.
"""
from pathlib import Path
import argparse
import struct
import subprocess
import tempfile
import zlib

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent / 'skill-effect-host/FxHost.as'
HOST_CLASS = 'FxHost'
DONOR_CLASS = 'skill'
# The original fight stage, recorded for reference: the host scales nothing (noScale), so its stage is its element.
STAGE = (960, 560)
EFFECT_FPS = 25
FILE_ATTRIBUTES_AS3 = 0x09
SYMBOL_CLASS, DO_ABC, SET_BACKGROUND, FILE_ATTRIBUTES, SHOW_FRAME, END = 76, 82, 9, 69, 1, 0


def tag(code, body):
    if len(body) < 0x3F:
        return struct.pack('<H', code << 6 | len(body)) + body
    return struct.pack('<HI', code << 6 | 0x3F, len(body)) + body


def rect(width, height):
    bits = max(width.bit_length(), height.bit_length()) + 1
    value, total = bits, 5
    for field in (0, width, 0, height):
        value, total = value << bits | field, total + bits
    pad = -total % 8
    return (value << pad).to_bytes((total + pad) // 8, 'big')


def body_tags(data):
    """(code, body) of each top-level tag of an FWS or CWS file."""
    body = zlib.decompress(data[8:]) if data[:3] == b'CWS' else data[8:]
    at = ((5 + 4 * (body[0] >> 3) + 7) // 8) + 4
    while at + 2 <= len(body):
        head, = struct.unpack_from('<H', body, at)
        at += 2
        code, length = head >> 6, head & 0x3F
        if length == 0x3F:
            length, = struct.unpack_from('<I', body, at)
            at += 4
        yield code, body[at:at + length]
        at += length
        if code == END:
            return


def swf(version, fps, tags_bytes):
    body = rect(STAGE[0] * 20, STAGE[1] * 20) + struct.pack('<HH', round(fps * 256), 1) + tags_bytes
    return b'FWS' + bytes([version]) + struct.pack('<I', 8 + len(body)) + body


def root_class(name):
    return tag(SYMBOL_CLASS, struct.pack('<HH', 1, 0) + name.encode() + b'\0')


def base(donor, fps):
    abc = next(body for code, body in body_tags(donor) if code == DO_ABC)
    tags_bytes = (tag(FILE_ATTRIBUTES, struct.pack('<I', FILE_ATTRIBUTES_AS3)) + tag(SET_BACKGROUND, b'\0\0\0') + tag(DO_ABC, abc)
                  + root_class(DONOR_CLASS) + tag(SHOW_FRAME, b'') + tag(END, b''))
    return swf(donor[3], fps, tags_bytes)


def rebind(compiled, fps):
    kept = b''.join(root_class(HOST_CLASS) if code == SYMBOL_CLASS else tag(code, body) for code, body in body_tags(compiled))
    return swf(compiled[3], fps, kept)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--java', type=Path, default=ROOT / '.cache/tools/jre/jdk-21.0.12.1+1-jre/Contents/Home/bin/java')
    parser.add_argument('--ffdec', type=Path, default=ROOT / '.cache/tools/ffdec/ffdec-cli.jar')
    parser.add_argument('--donor', type=Path, default=ROOT / '.cache/skill-effects/sources/10001.swf',
                        help='any skill SWF; 10001 has the smallest ABC')
    parser.add_argument('--fps', type=float, default=EFFECT_FPS)
    parser.add_argument('--out', type=Path, default=ROOT / 'src/features/battle/skill-effect-host.swf')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as work:
        base_swf, compiled = Path(work) / 'base.swf', Path(work) / 'compiled.swf'
        base_swf.write_bytes(base(args.donor.read_bytes(), args.fps))
        subprocess.run([str(args.java), '-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-jar', str(args.ffdec), '-cli',
                        '-replace', str(base_swf), str(compiled), DONOR_CLASS, str(SOURCE)], check=True)
        args.out.write_bytes(rebind(compiled.read_bytes(), args.fps))
    print(args.out, args.out.stat().st_size)


if __name__ == '__main__':
    main()
