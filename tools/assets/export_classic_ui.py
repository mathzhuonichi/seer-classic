#!/usr/bin/env python3
"""Reproduce selected original-client UI skins without executing ActionScript.

Run with a Python environment containing Pillow. FFDec 26.3.0 and the original
official SWFs are cached locally; pass --java and --ffdec to override tools.
The checked-in manifest is the exact selection/crop specification. Bulk exports
remain in ignored .cache/classic-ui-v26; public contains only selected skins.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', default=str(ROOT / '.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'))
    parser.add_argument('--ffdec', default=str(ROOT / '.cache/vector-export/ffdec/ffdec.jar'))
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'public/ui/classic/manifest.json'
    manifest = json.loads(path.read_text())
    if not args.verify_only:
        clean = ROOT / '.cache/classic-ui-v26/fight-current-clean.swf'
        if any(asset.get('sourceSwf') == str(clean.relative_to(ROOT)) for asset in manifest['assets'].values()):
            source = ROOT / '.cache/capture-official-v25/PetFightDLL-live.swf'
            xml_path = ROOT / '.cache/classic-ui-v26/fight-current.xml'
            subprocess.run([args.java, '-Xmx1g', '-Djava.awt.headless=true', '-jar', args.ffdec,
                            '-swf2xml', str(source), str(xml_path)], check=True)
            tree = ET.parse(xml_path)
            for item in tree.getroot().iter('item'):
                sid = item.get('spriteId')
                names = ({'hp_txt', 'name_txt', 'level_txt', 'txtMask'} if sid in ('764', '1021')
                         else {'barMC'} if sid == '751'
                         else {'escape_btn', 'item_btn', 'catch_btn', 'pet_btn', 'fight_btn'} if sid == '999'
                         else set())
                if names:
                    tags = item.find('subTags')
                    for child in list(tags):
                        if child.get('name') in names:
                            tags.remove(child)
            selected_xml = clean.with_suffix('.xml')
            tree.write(selected_xml, encoding='utf-8', xml_declaration=True)
            subprocess.run([args.java, '-Xmx1g', '-Djava.awt.headless=true', '-jar', args.ffdec,
                            '-xml2swf', str(selected_xml), str(clean)], check=True)
    groups = {}
    for name, asset in manifest['assets'].items():
        if 'aliasOf' in asset:
            continue
        export = ROOT / asset['sourceExport']
        group = export.relative_to(ROOT / '.cache/classic-ui-v26').parts[0]
        source = asset.get('sourceSwf', '.cache/breeding-v24/PetBreedPanel.swf' if group == 'breeding' else '.cache/classic-robots/UI.swf')
        groups.setdefault((group, source), set()).add(asset['symbolId'])
    for (group, source_path), ids in ([] if args.verify_only else groups.items()):
        source = ROOT / source_path
        subprocess.run([args.java, '-Xmx2g', '-Djava.awt.headless=true', '-jar', args.ffdec,
                        '-selectid', ','.join(map(str, sorted(ids))),
                        '-select', ','.join(f'{sid}:1' for sid in sorted(ids)),
                        '-zoom', '2', '-format', 'sprite:png,button:png,shape:png,image:png',
                        '-export', 'sprite,button,shape,image', str(ROOT / '.cache/classic-ui-v26' / group), str(source)], check=True)
    for name, asset in manifest['assets'].items():
        target = ROOT / 'public' / asset['path'].lstrip('/')
        if args.verify_only:
            image = Image.open(target)
            assert image.size == (asset['width'], asset['height'])
        elif 'aliasOf' in asset:
            shutil.copyfile(ROOT / 'public' / manifest['assets'][asset['aliasOf']]['path'].lstrip('/'), target)
        else:
            image = Image.open(ROOT / asset['sourceExport']).convert('RGBA').crop(asset['crop'])
            image.save(target)
            assert image.size == (asset['width'], asset['height'])
        assert hashlib.sha256(target.read_bytes()).hexdigest() == asset['sha256'], name
    print(f"Verified {len(manifest['assets'])} exact source-derived PNGs.")


if __name__ == '__main__':
    main()
