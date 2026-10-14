#!/usr/bin/env python3
"""Recover original named skill display timelines without executing ActionScript."""
import argparse
import concurrent.futures
import time
import hashlib
import json
import re
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/gamefeel-resources/official'
OUT = ROOT / 'public/battle-effects'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export(skill_id, java, jar, skills):
    url = f'https://seer.61.com/resource/fightResource/skill/swf/{skill_id}.swf'
    swf = CACHE / f'fightResource/skill/swf/{skill_id}.swf'
    swf.parent.mkdir(parents=True, exist_ok=True)
    if not swf.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(request, timeout=25).read()
        if data[:3] not in (b'FWS', b'CWS', b'ZWS'):
            raise ValueError('Official response is not a SWF')
        swf.write_bytes(data)
    xml = CACHE / f'skill{skill_id}.xml'
    run = lambda args: subprocess.run([java, '-Xmx512m', '-jar', jar] + args,
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
    if not xml.exists():
        run(['-swf2xml', str(swf), str(xml)])
    root = ET.parse(xml).getroot()
    symbol = None
    for node in root.findall('./tags/item'):
        if node.get('type') == 'SymbolClassTag':
            for name, tag in zip(node.findall('./names/item'), node.findall('./tags/item')):
                if name.text == 'skill':
                    symbol = int(tag.text)
        elif node.get('type') == 'ExportAssetsTag':
            for name, tag in zip(node.findall('./names/item'), node.findall('./tags/item')):
                if name.text == 'skill':
                    symbol = int(tag.text)
    if symbol is None:
        raise ValueError('No named skill symbol; no guessed root timeline is used')
    sprite = next(n for n in root.findall('./tags/item') if n.get('spriteId') == str(symbol))
    frame_count = int(sprite.get('frameCount'))
    if frame_count > 180:
        raise ValueError('Timeline exceeds bounded export limit of 180 frames')
    directory = ROOT / f'.cache/gamefeel-resources/skill-exports/{skill_id}'
    run(['-selectid', str(symbol), '-ignorebackground', '-format', 'sprite:png',
         '-export', 'sprite', str(directory), str(swf)])
    frames = sorted(directory.rglob('*.png'), key=lambda p: int(p.stem))
    if len(frames) != frame_count:
        raise ValueError(f'Expected {frame_count} frames, exported {len(frames)}')
    images = [Image.open(p).convert('RGBA') for p in frames]
    sizes = {im.size for im in images}
    if len(sizes) != 1:
        raise ValueError('Exported frames do not share a fixed viewport')
    source_width, source_height = images[0].size
    if not any(im.getbbox() for im in images):
        raise ValueError('All exported frames are empty')
    # One fixed scale for the entire timeline retains all per-frame placement.
    scale = min(1, 512 / max(source_width, source_height))
    width, height = round(source_width * scale), round(source_height * scale)
    columns = 5
    rows = (frame_count + columns - 1) // columns
    sheet = Image.new('RGBA', (width * columns, height * rows))
    for i, im in enumerate(images):
        if im.size != (width, height):
            im = im.resize((width, height), Image.Resampling.LANCZOS)
        sheet.paste(im, ((i % columns) * width, (i // columns) * height))
    destination = OUT / f'{skill_id}.webp'
    sheet.save(destination, 'WEBP', lossless=True, exact=True, method=6)
    skill = skills[skill_id]
    return dict(skillId=skill_id, name=skill['name']['zh'], category=skill['category'],
        path=f'/battle-effects/{destination.name}', width=width, height=height,
        columns=columns, rows=rows, frames=frame_count, fps=float(root.get('frameRate')),
        representativeFrame=max(range(frame_count), key=lambda i: sum(images[i].getchannel('A').histogram()[1:])),
        bytes=destination.stat().st_size, sha256=digest(destination), sourceUrl=url,
        sourceBytes=swf.stat().st_size, sourceSha256=digest(swf), sourceXmlSha256=digest(xml),
        sourceSymbol=symbol, sourceViewport=[source_width, source_height],
        export='FFDec 26.3.0 named skill sprite PNG frames; transparent fixed viewport; lossless WebP sheet',
        placement='actor' if skill['category'] == 'status' else 'target')


def registration(skill_id, java, jar, effect):
    directory = ROOT / f'.cache/gamefeel-resources/skill-registration/{skill_id}'
    files = list(directory.rglob('1.svg'))
    if not files:
        subprocess.run([java, '-Xmx384m', '-jar', jar, '-selectid', str(effect['sourceSymbol']),
            '-select', f"{effect['sourceSymbol']}:1", '-format', 'sprite:svg', '-export', 'sprite',
            str(directory), str(CACHE / f'fightResource/skill/swf/{skill_id}.swf')],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
        files = list(directory.rglob('1.svg'))
    svg = ET.parse(files[0]).getroot()
    g = svg.find('{http://www.w3.org/2000/svg}g')
    matrix = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', g.get('transform'))]
    width = float(svg.get('width').removesuffix('px'))
    height = float(svg.get('height').removesuffix('px'))
    effect['sourceVectorBounds'] = [-matrix[4], -matrix[5], width, height]
    effect['sourceSvgSha256'] = digest(files[0])
    effect['registration'] = 'Original sprite bounds from FFDec SVG normalization. PNG viewport includes filter padding; UI centers the full raster viewport at the actual target.'
    return effect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', required=True)
    parser.add_argument('--ffdec', required=True)
    parser.add_argument('ids', nargs='+', type=int)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'manifest.json'
    manifest = json.loads(path.read_text()) if path.exists() else dict(
        schema=1, source='Official seer.61.com skill SWFs; original BefLoad skill-ID route',
        actionScriptExecuted=False, effects={}, unsupported={})
    skills = {s['id']: s for s in json.loads((ROOT / 'data/gamedata.json').read_text())['skills']}
    manifest['catalogSkills'] = len(skills)
    manifest['unexportedPolicy'] = 'No borrowed or generated effect. Retain creature action and normal battle feedback for unexported IDs.'
    def timed_export(skill_id):
        started = time.monotonic()
        effect = export(skill_id, args.java, args.ffdec, skills)
        effect['exportSeconds'] = round(time.monotonic() - started, 3)
        return effect

    pending = [n for n in args.ids if str(n) not in manifest['effects']
               or not (ROOT / 'public' / manifest['effects'][str(n)]['path'].lstrip('/')).exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(timed_export, n): n for n in pending}
        for job in concurrent.futures.as_completed(jobs):
            skill_id = jobs[job]
            try:
                manifest['effects'][str(skill_id)] = job.result()
                manifest['unsupported'].pop(str(skill_id), None)
                effect = manifest['effects'][str(skill_id)]
                print(f'{skill_id}: {effect["frames"]} frames; {effect["exportSeconds"]} s; {effect["bytes"]} bytes', flush=True)
            except Exception as error:
                manifest['unsupported'][str(skill_id)] = str(error)
                print(f'{skill_id}: {error}', flush=True)
            path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(registration, int(n), args.java, args.ffdec, effect): n
                for n, effect in manifest['effects'].items() if 'sourceVectorBounds' not in effect}
        for job in concurrent.futures.as_completed(jobs):
            n = jobs[job]
            try:
                manifest['effects'][n] = job.result()
            except Exception as error:
                manifest['effects'][n]['registrationLimit'] = str(error)
    manifest['effects'] = dict(sorted(manifest['effects'].items(), key=lambda p:int(p[0])))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
