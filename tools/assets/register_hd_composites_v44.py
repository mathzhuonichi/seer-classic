#!/usr/bin/env python3
"""Register reviewed HD bitmap replacements while retaining source vector geometry."""
import base64
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SVG = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', XLINK)
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    jobs = json.loads((ROOT / '.cache/hd-ui-v44/root-art-final.json').read_text())
    atlas = {}
    for job in jobs:
        key = job['key']
        source = ROOT / job['input']
        generated = ROOT / job['resultPath']
        size = Image.open(generated).size
        original_size = Image.open(source).size
        if min(size[0] / original_size[0], size[1] / original_size[1]) <= 1:
            raise ValueError(f'{key}: no native resolution increase')
        metadata = {
            'tool': 'built-in image_gen', 'prompt': job['prompt'],
            'sourcePath': str(source.relative_to(ROOT)), 'sourceSha256': sha(source),
            'sourceWidth': original_size[0], 'sourceHeight': original_size[1],
            'width': size[0], 'height': size[1], 'sha256': sha(generated),
            'generatedFile': generated.name,
            'review': 'Original framing, contours, palette and flat Flash styling visually compared. Conservative AI redraw is not pixel-identical source art.',
        }
        if key == 'map10032':
            output = ROOT / 'public/maps/hd/10032-background-v44.png'
            shutil.copyfile(generated, output)
            wrapper_source = ROOT / 'public/maps/original/10032.svg'
            tree = ET.parse(wrapper_source)
            nodes = tree.findall(f'.//{{{SVG}}}image')
            assert len(nodes) == 1
            nodes[0].set(f'{{{XLINK}}}href', 'data:image/png;base64,' + base64.b64encode(generated.read_bytes()).decode())
            nodes[0].set('style', 'image-rendering:auto')
            wrapper = ROOT / 'public/maps/hd/10032-v44.svg'
            tree.write(wrapper, encoding='utf-8', xml_declaration=True)
            original = ET.parse(wrapper_source)
            before = original.find(f'.//{{{SVG}}}g[@id="official-animator-19-frame-1"]')
            after = tree.find(f'.//{{{SVG}}}g[@id="official-animator-19-frame-1"]')
            assert before is not None and ET.tostring(before) == ET.tostring(after)
            metadata.update(path='/maps/hd/10032-v44.svg', bitmapPath='/maps/hd/10032-background-v44.png', bitmapSha256=metadata['sha256'], sha256=sha(wrapper), sourcePath='/maps/original/10032.svg', sourceSha256=sha(wrapper_source), logicalViewBox=[0, 0, 960, 560], method='AI-restored embedded bitmap; exact original vector platform and transforms retained.')
            manifest_path = ROOT / 'public/maps/hd/manifest.json'
            manifest = json.loads(manifest_path.read_text())
            manifest['assets']['10032'] = metadata
            manifest['assets'] = dict(sorted(manifest['assets'].items(), key=lambda x:int(x[0])))
            manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        else:
            output = ROOT / f'public/ui/classic/maps/hd/{key}-v44.png'
            shutil.copyfile(generated, output)
            metadata['path'] = '/' + str(output.relative_to(ROOT / 'public'))
            if key == 'ship-blueprint':
                # Keep the original card alpha independently of generated RGB.
                # The generated PNG is copied byte-for-byte and never rewritten.
                wrapper = output.with_suffix('.svg')
                width, height = original_size
                bitmap_uri = 'data:image/png;base64,' + base64.b64encode(generated.read_bytes()).decode()
                alpha_uri = 'data:image/png;base64,' + base64.b64encode(source.read_bytes()).decode()
                wrapper.write_text(f'<svg xmlns="{SVG}" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><defs><filter id="opaque-color" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="table" tableValues="1 1"/></feComponentTransfer></filter><mask id="source-alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="{width}" height="{height}"><image href="{alpha_uri}" width="{width}" height="{height}"/></mask></defs><g mask="url(#source-alpha)"><image href="{bitmap_uri}" width="{width}" height="{height}" preserveAspectRatio="none" filter="url(#opaque-color)"/></g></svg>\n')
                metadata.update(bitmapPath=metadata['path'], bitmapSha256=metadata['sha256'], path='/' + str(wrapper.relative_to(ROOT / 'public')), sha256=sha(wrapper), alphaMethod='Original source PNG alpha mask; generated color alpha made opaque in SVG only. Generated PNG bytes unchanged.')
            atlas[key] = metadata
    (ROOT / 'public/ui/classic/maps/hd/independent-ai-manifest.json').write_text(json.dumps({'schema':1, 'assets':atlas}, indent=2) + '\n')
    print(json.dumps({'registered':list(atlas), 'map10032':'original vector platform retained'}))

if __name__ == '__main__':
    main()
