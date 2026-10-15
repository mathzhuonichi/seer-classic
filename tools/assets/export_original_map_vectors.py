#!/usr/bin/env python3
"""Export original map backgrounds and explicitly retained static scene layers."""
import argparse
import concurrent.futures
import hashlib
import json
import re
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from restore_mystery_realm_floor import restore_floor

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/map-assets'
OUT = ROOT / 'public/maps/original'
SVG = '{http://www.w3.org/2000/svg}'
ET.register_namespace('', SVG[1:-1])
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
ET.register_namespace('ffdec', 'https://www.free-decompiler.com/flash')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export(map_id, java, jar):
    swf, xml = CACHE / f'{map_id}.swf', CACHE / f'{map_id}.xml'
    if not swf.exists():
        swf.write_bytes(urllib.request.urlopen(f'https://seer.61.com/resource/map/{map_id}.swf', timeout=25).read())
    if not xml.exists():
        subprocess.run([java, '-Xmx384m', '-Dapple.awt.UIElement=true', '-Djava.awt.headless=true',
                        '-jar', jar, '-cli', '-swf2xml', str(swf), str(xml)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    source = ET.parse(xml).getroot()
    bg = next(node for node in source.findall('./tags/item') if node.get('name') == 'bg_mc')
    symbol = bg.get('characterId')
    matrix = bg.find('matrix')
    if matrix.get('hasScale') != 'false' or matrix.get('hasRotate') != 'false':
        raise ValueError('This background needs a separate placement calibration.')
    directory = CACHE / f'{map_id}-bg'
    subprocess.run([java, '-Xmx384m', '-Dapple.awt.UIElement=true', '-Djava.awt.headless=true',
                    '-jar', jar, '-cli', '-selectid', symbol, '-select', '1',
                    '-format', 'sprite:svg', '-export', 'sprite', str(directory), str(swf)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    exported = next(directory.rglob('1.svg'))
    svg = ET.parse(exported).getroot()
    transform = svg.find(SVG + 'g').get('transform')
    values = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', transform)]
    tx, ty = values[4], values[5]
    rect = source.find('displayRect')
    width = (int(rect.get('Xmax')) - int(rect.get('Xmin'))) / 20
    height = (int(rect.get('Ymax')) - int(rect.get('Ymin'))) / 20
    x = tx + (int(rect.get('Xmin')) - int(matrix.get('translateX', '0'))) / 20
    y = ty + (int(rect.get('Ymin')) - int(matrix.get('translateY', '0'))) / 20
    svg.set('viewBox', f'{x:g} {y:g} {width:g} {height:g}')
    svg.set('width', f'{width:g}')
    svg.set('height', f'{height:g}')
    destination = OUT / f'{map_id}.svg'
    staged = directory / 'registered-background.svg'
    ET.ElementTree(svg).write(staged, encoding='utf-8', xml_declaration=True)
    result = dict(mapId=map_id, path=f'/maps/original/{destination.name}', width=width, height=height,
                sha256=digest(staged), bytes=staged.stat().st_size,
                url=f'https://seer.61.com/resource/map/{map_id}.swf', swfSha256=digest(swf),
                source='Official Flash bg_mc first frame, statically exported with FFDec 26.3.0; original viewport registration retained.',
                format='SVG', sourceSymbol=int(symbol), sourceFrame=1,
                sourceXmlSha256=digest(xml), exportedSvgSha256=digest(exported),
                originalStage=dict(width=width, height=height), viewBox=[x,y,width,height],
                viewportMethod='FFDec normalization offset and original root placement matrix, clipped to the original SWF stage.')
    if map_id == 10032:
        result['backgroundOnlySha256'] = result['sha256']
        result.update(restore_floor(swf, staged, staged))
        result.update(
            source='Official Flash bg_mc and animator_mc first frames; the original platform, energy surface and machine vectors are restored in source placement and depth order.',
            sourceLayers=[dict(name='bg_mc', symbol=3, frame=1, depth=1),
                          dict(name='animator_mc', symbol=19, frame=1, depth=3)],
            restorationTool='tools/assets/restore_mystery_realm_floor.py',
            restorationScope='Static animator frame 1 only; control_mc, top_mc, scripted events and subsequent animation frames are excluded.')
    staged.replace(destination)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', required=True)
    parser.add_argument('--ffdec', required=True)
    parser.add_argument('ids', nargs='*', type=int)
    args = parser.parse_args()
    path = ROOT / 'public/maps/original-manifest.json'
    manifest = json.loads(path.read_text())
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    ids = args.ids or list(map(int, manifest['failures']))
    exported_ids = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(export,n,args.java,args.ffdec): n for n in ids}
        for job in concurrent.futures.as_completed(jobs):
            n = jobs[job]
            try:
                manifest['maps'][str(n)] = job.result()
                manifest['failures'].pop(str(n), None)
                exported_ids.append(str(n))
                print(f'{n}: exported original scene artwork', flush=True)
            except Exception as error:
                manifest['failures'][str(n)] = str(error)
                print(f'{n}: {error}', flush=True)
    manifest['maps'] = dict(sorted(manifest['maps'].items(), key=lambda pair:int(pair[0])))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    index_path = ROOT / 'src/presentation/map-art-assets.json'
    index = json.loads(index_path.read_text())
    for key in exported_ids:
        entry = manifest['maps'][key]
        index[key] = dict(path=entry['path'], sha256=entry['sha256'])
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
