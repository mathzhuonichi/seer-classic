#!/usr/bin/env python3
"""Prepare an installed classic Chinese face for local development previews.

The font remains in ignored .cache and is not installed globally or copied into
public assets. Pass --source for another locally available TTF of the same family.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct

ROOT = Path(__file__).resolve().parents[2]
FAMILIES = {'SimSun': ('SimSun', '宋体'), 'SimHei': ('SimHei', '黑体')}


def metadata(data, family):
    count = struct.unpack_from('>H', data, 4)[0]
    tables = {}
    for index in range(count):
        tag, _, offset, length = struct.unpack_from('>4sIII', data, 12 + index * 16)
        tables[tag] = (offset, length)
    offset, _ = tables[b'name']
    _, records, strings = struct.unpack_from('>HHH', data, offset)
    names = []
    for index in range(records):
        platform, _, _, name_id, length, relative = struct.unpack_from('>6H', data, offset + 6 + index * 12)
        if name_id == 1 and platform in (0, 3):
            value = data[offset + strings + relative:offset + strings + relative + length]
            names.append(value.decode('utf-16-be'))
    if not any(name in FAMILIES[family] for name in names):
        raise ValueError('The supplied TTF is not the recovered UI font family.')
    return {'families': sorted(set(names)),
            'rawFsType': struct.unpack_from('>H', data, tables[b'OS/2'][0] + 8)[0],
            'glyphCount': struct.unpack_from('>H', data, tables[b'maxp'][0] + 4)[0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--family', choices=FAMILIES, default='SimSun')
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    candidates = [Path(f'/Applications/Microsoft {app}.app/Contents/Resources/DFonts/{args.family}.ttf')
                  for app in ('Word', 'Excel')]
    source = args.source or next((path for path in candidates if path.is_file()), None)
    if source is None:
        raise SystemExit(f'No installed {args.family} TTF found. Supply a local font with --source; the preview otherwise uses its installed-font fallback.')
    data = source.read_bytes()
    record = metadata(data, args.family)
    filename = f'local-{args.family.lower()}'
    output = ROOT / f'.cache/classic-ui-v27/{filename}.ttf'
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, output)
    record.update({'sourcePath': str(source), 'bytes': len(data),
                   'sha256': hashlib.sha256(data).hexdigest(),
                   'cachePath': str(output.relative_to(ROOT)), 'developmentOnly': True})
    (output.parent / f'{filename}-audit.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(record, ensure_ascii=False))


if __name__ == '__main__':
    main()
