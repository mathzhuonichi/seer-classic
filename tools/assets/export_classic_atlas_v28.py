#!/usr/bin/env python3
"""Export original atlas diagrams in their 960x560 stage, with supported nodes."""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/classic-ui-v28'
OUT = ROOT / 'public/ui/classic/maps'
JAVA = ROOT / '.cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java'
FFDEC = ROOT / '.cache/vector-export/ffdec/ffdec.jar'
RUNTIME = ROOT / 'src/presentation/atlas-graph-assets.json'


def ffdec(*args):
    result = subprocess.run([str(JAVA), '-Xmx2g', '-Dapple.awt.UIElement=true', '-Djava.awt.headless=true',
                             '-jar', str(FFDEC), '-cli', *map(str, args)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-1000:])


def frames(sprite):
    slots = {}
    result = []
    for item in sprite.find('subTags'):
        kind = item.get('type', '')
        depth = item.get('depth')
        if kind.startswith('PlaceObject'):
            prior = slots.get(depth)
            node = deepcopy(item)
            if prior is not None and item.get('placeFlagMove') == 'true':
                merged = deepcopy(prior)
                merged.attrib.update(item.attrib)
                for child in item:
                    old = merged.find(child.tag)
                    if old is not None:
                        merged.remove(old)
                    merged.append(deepcopy(child))
                node = merged
            if node.get('characterId'):
                slots[depth] = node
        elif kind.startswith('RemoveObject'):
            slots.pop(depth, None)
        elif kind == 'ShowFrameTag':
            result.append([deepcopy(slots[d]) for d in sorted(slots, key=int)])
    return result


def transform(rect, matrix):
    if matrix is None:
        return rect
    a = float(matrix.get('scaleX', 1)); d = float(matrix.get('scaleY', 1))
    b = float(matrix.get('rotateSkew0', 0)); c = float(matrix.get('rotateSkew1', 0))
    tx = float(matrix.get('translateX', 0))/20; ty = float(matrix.get('translateY', 0))/20
    points = [(a*x+c*y+tx, b*x+d*y+ty) for x in (rect[0], rect[2]) for y in (rect[1], rect[3])]
    return [min(x for x,y in points), min(y for x,y in points), max(x for x,y in points), max(y for x,y in points)]


def publish(page_key, page):
    OUT.mkdir(parents=True, exist_ok=True)
    public_path = OUT / 'manifest.json'
    manifest = json.loads(public_path.read_text()) if public_path.exists() else {'pages': {}}
    runtime = json.loads(RUNTIME.read_text()) if RUNTIME.exists() else {'pages': {}}
    runtime.setdefault('pages', {})[page_key] = page
    adapted = CACHE / 'adapted-runtime-pages.json'
    if adapted.exists():
        runtime['pages'].update(json.loads(adapted.read_text()))
    overview = CACHE / 'overview-runtime-page.json'
    if overview.exists():
        runtime['pages']['overview'] = json.loads(overview.read_text())
    extra_route = CACHE / 'helix-route-adaptation.json'
    if extra_route.exists() and 'galaxy-helix' in runtime['pages']:
        route = json.loads(extra_route.read_text())
        nodes = runtime['pages']['galaxy-helix']['nodes']
        runtime['pages']['galaxy-helix']['nodes'] = [node for node in nodes if node.get('targetId') != route['targetId']] + [route]
    if (OUT / 'back-arrow.png').exists():
        runtime['backArrow'] = '/ui/classic/maps/back-arrow.png'
    manifest['pages'] = deepcopy(runtime['pages'])
    public_path.write_text(json.dumps(manifest, indent=2)+'\n')
    tmp = RUNTIME.with_suffix('.tmp.json')
    tmp.write_text(json.dumps(runtime, indent=2)+'\n')
    tmp.replace(RUNTIME)


def main():
    requirements = json.loads((CACHE / 'runtime-destination-requirements.json').read_text())
    world_by_map = {str(item['mapId']): item for item in requirements if item.get('mapId') is not None}
    tree = ET.parse(CACHE / 'known-ui.xml')
    tags = tree.getroot().find('tags')
    by_id = {}
    for tag in tags:
        for key in ('shapeId', 'spriteId', 'buttonId', 'characterID', 'characterId'):
            if tag.get(key) and tag.get('type', '').startswith('Define'):
                by_id[tag.get(key)] = tag
                break
    rect_cache = {}

    def bounds(cid, trail=()):
        if cid in rect_cache:
            return rect_cache[cid]
        if cid in trail or cid not in by_id:
            return None
        tag = by_id[cid]
        for name in ('shapeBounds', 'bounds', 'startBounds'):
            rect = tag.find(name)
            if rect is not None:
                value = [int(rect.get(k))/20 for k in ('Xmin','Ymin','Xmax','Ymax')]
                rect_cache[cid] = value
                return value
        kind = tag.get('type', '')
        items = []
        if kind == 'DefineSpriteTag':
            f = frames(tag)
            if f:
                items = [(x.get('characterId'), x.find('matrix')) for x in f[0]]
        elif kind.startswith('DefineButton'):
            items = [(x.get('characterId'), x.find('placeMatrix')) for x in tag.findall('./characters/item') if x.get('buttonStateUp') == 'true']
        rects = [transform(r, matrix) for child, matrix in items if (r := bounds(child, trail+(cid,))) is not None]
        if not rects:
            return None
        value = [min(x[0] for x in rects), min(x[1] for x in rects), max(x[2] for x in rects), max(x[3] for x in rects)]
        rect_cache[cid] = value
        return value

    original_sprite = by_id['2718']
    snapshots = frames(original_sprite)
    names = ['pano', 'kalan', 'rogue', 'likong', 'helix']
    for index, galaxy in enumerate(names):
        nodes = []
        kept = []
        for item in snapshots[index]:
            name = item.get('name', '')
            if name == 'close':
                rect = bounds(item.get('characterId'))
                if rect is not None:
                    x,y,right,bottom = transform(rect, item.find('matrix'))
                    nodes.append({'targetKind':'back','x':round(max(0,x),3),'y':round(max(0,y),3),
                                  'width':round(min(960,right)-max(0,x),3),'height':round(min(560,bottom)-max(0,y),3),
                                  'sourceSymbolId':int(item.get('characterId')),'sourceInstance':'close'})
            if name.startswith('map_'):
                map_id = name.split('_')[1]
                destination = world_by_map.get(map_id)
                if destination is None or destination['galaxy'] != galaxy:
                    continue
                rect = bounds(item.get('characterId'))
                if rect is None:
                    continue
                x,y,right,bottom = transform(rect, item.find('matrix'))
                x,y,right,bottom = max(0,x),max(0,y),min(960,right),min(560,bottom)
                nodes.append({'targetKind':'planet','targetId':destination['id'],'mapId':int(map_id),
                              'x':round(x,3),'y':round(y,3),'width':round(right-x,3),'height':round(bottom-y,3),
                              'sourceSymbolId':int(item.get('characterId')),'sourceInstance':name})
            kept.append(item)
        destination_png = OUT / f'galaxy-{galaxy}.png'
        if '--metadata-only' in sys.argv:
            page = {'width':960,'height':560,'background':f'/ui/classic/maps/galaxy-{galaxy}.png','headingInArtwork':True,
                    'nodes':nodes,'sourceUrl':'https://seer.61.com/resource/appRes/update/worldMap/NewWorldMap2020Panel.swf',
                    'sourceSpriteId':2718,'sourceFrame':index+1,'sourceStageCrop':[0,0,960,560],
                    'selection':'Original native galaxy diagram, ancestor list excluded; unmodeled planet placements excluded.',
                    'sha256':hashlib.sha256(destination_png.read_bytes()).hexdigest()}
            publish('galaxy-'+galaxy, page)
            print('Published native back hit area',galaxy,flush=True)
            continue
        selected = deepcopy(original_sprite)
        selected.set('frameCount', '1')
        sub = selected.find('subTags')
        sub.clear()
        for item in kept:
            sub.append(item)
        ET.SubElement(sub, 'item', {'type':'ShowFrameTag','forceWriteAsLong':'false'})
        position = list(tags).index(original_sprite)
        tags.remove(original_sprite)
        tags.insert(position, selected)
        removed = []
        for item in list(tags):
            if item.get('name') == 'left' and item.get('type','').startswith('PlaceObject'):
                removed.append((list(tags).index(item), item)); tags.remove(item)
        xml = CACHE / f'galaxy-{galaxy}-clean.xml'
        swf = xml.with_suffix('.swf')
        tree.write(xml, encoding='utf-8', xml_declaration=True)
        ffdec('-xml2swf', xml, swf)
        export = CACHE / f'galaxy-{galaxy}-stage'
        ffdec('-select', '1', '-zoom', '2', '-format', 'frame:png', '-export', 'frame', export, swf)
        source_png = export / '1.png'
        image = Image.open(source_png).convert('RGBA')
        assert image.size == (1920,1120), image.size
        destination_png = OUT / f'galaxy-{galaxy}.png'
        OUT.mkdir(parents=True, exist_ok=True)
        image.save(destination_png)
        page = {'width':960,'height':560,'background':f'/ui/classic/maps/galaxy-{galaxy}.png','headingInArtwork':True,
                'nodes':nodes,'sourceUrl':'https://seer.61.com/resource/appRes/update/worldMap/NewWorldMap2020Panel.swf',
                'sourceSpriteId':2718,'sourceFrame':index+1,'sourceStageCrop':[0,0,960,560],
                'selection':'Original native galaxy diagram, ancestor list excluded; unmodeled planet placements excluded.',
                'sha256':hashlib.sha256(destination_png.read_bytes()).hexdigest()}
        publish('galaxy-'+galaxy, page)
        print('Published',galaxy,len(nodes),'native nodes',flush=True)
        tags.remove(selected); tags.insert(position, original_sprite)
        for pos,item in removed:
            tags.insert(pos,item)
    (CACHE/'galaxy-native-bounds.json').write_text(json.dumps(rect_cache,indent=2)+'\n')


if __name__ == '__main__':
    main()
