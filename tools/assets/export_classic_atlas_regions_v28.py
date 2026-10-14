#!/usr/bin/env python3
"""Recover native region diagrams and their original display-list anchors."""
from pathlib import Path
from copy import deepcopy
import argparse
import csv
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from PIL import Image
from export_classic_atlas_v28 import ROOT, CACHE, OUT, ffdec, frames, transform, publish


class Source:
    def __init__(self, mid):
        self.mid = mid
        self.tree = ET.parse(CACHE / f'planet-{mid}.xml')
        self.tags = self.tree.getroot().find('tags')
        self.symbols = {}
        for tag in self.tags:
            for key in ('shapeId','spriteId','buttonId','characterID','characterId'):
                if tag.get(key) and tag.get('type','').startswith('Define'):
                    self.symbols[tag.get(key)] = tag
                    break
        rows = csv.reader((CACHE / f'planet-{mid}-symbols/symbols.csv').open(), delimiter=';')
        self.sid = next(row[0] for row in rows if row[1]=='map')
        self.map = self.symbols[self.sid]
        self.items = frames(self.map)[0]
        self.memo = {}

    def bounds(self, cid, trail=()):
        if cid in self.memo:
            return self.memo[cid]
        if cid not in self.symbols or cid in trail:
            return None
        tag = self.symbols[cid]
        for name in ('shapeBounds','bounds','startBounds'):
            rect = tag.find(name)
            if rect is not None:
                value = [int(rect.get(k))/20 for k in ('Xmin','Ymin','Xmax','Ymax')]
                self.memo[cid] = value
                return value
        if tag.get('type')=='DefineSpriteTag':
            states = frames(tag)
            children = [(x.get('characterId'),x.find('matrix')) for x in states[0]] if states else []
        elif tag.get('type','').startswith('DefineButton'):
            children = [(x.get('characterId'),x.find('placeMatrix')) for x in tag.findall('./characters/item') if x.get('buttonStateUp')=='true']
        else:
            children = []
        boxes = [transform(r,matrix) for child,matrix in children if (r:=self.bounds(child,trail+(cid,))) is not None]
        if not boxes:
            return None
        value = [min(r[0] for r in boxes),min(r[1] for r in boxes),max(r[2] for r in boxes),max(r[3] for r in boxes)]
        self.memo[cid] = value
        return value

    def placed(self, item):
        rect = self.bounds(item.get('characterId'))
        return transform(rect,item.find('matrix')) if rect is not None else None

    def viewport(self):
        if self.mid == 30:
            # The first large child is the inner well; it excludes the title
            # and close control. Keep the complete original shared chrome.
            return [0, 0, 661, 390]
        # Original chrome is among the first frame placements. The background
        # particle field can exceed it; exclude that field from the viewport.
        candidates = []
        for item in self.items[:8]:
            cid = item.get('characterId'); tag = self.symbols.get(cid)
            rect = self.placed(item)
            if rect and tag is not None:
                w,h=rect[2]-rect[0],rect[3]-rect[1]
                if 450<w<1050 and 260<h<700:
                    candidates.append((w*h,rect,cid))
        if candidates:
            return max(candidates,key=lambda v:v[0])[1]
        return self.bounds(self.sid)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', nargs='+', type=int)
    args = parser.parse_args()
    req = json.loads((CACHE/'runtime-destination-requirements.json').read_text())
    sources = json.loads((CACHE/'planet-source-index.json').read_text())
    special = {102:{'special_0':'brave-tower','special_5':'dark-arena'}}
    # Explicit remake ports without an original region ID retain the original
    # map drawing and use the game's shared GO navigation control.
    for entry in sources:
        if not entry['ok'] or args.ids and entry['mapId'] not in args.ids:
            continue
        mid=entry['mapId'];world=next(r for r in req if r['mapId']==mid)
        src=Source(mid);viewport=src.viewport()
        viewport=[math.floor(viewport[0]),math.floor(viewport[1]),math.ceil(viewport[2]),math.ceil(viewport[3])]
        width,height=viewport[2]-viewport[0],viewport[3]-viewport[1]
        regions=world['regions'];by_map={str(r.get('mapId')):r for r in regions if r.get('mapId') is not None}
        nodes=[];found=set();kept=[];title_plate=None
        for item in src.items:
            name=item.get('name','');region=None
            if name.startswith('scene_'):
                region=by_map.get(name.split('_')[1])
                if region is None:
                    continue
            current_room=mid==1 and item.get('characterId')=='146' and not name
            if current_room:
                region=next(r for r in regions if r['id']=='transport')
            if name.startswith('special_'):
                key=special.get(mid,{}).get(name)
                region=next((r for r in regions if r['id']==key),None)
                if region is None:
                    continue
            if name=='serverNameTxt':
                r=src.placed(item)
                if r is not None and r[1]-viewport[1]<50:
                    title_plate={'x':round(r[0]-viewport[0],3),'y':round(r[1]-viewport[1],3),
                                 'width':round(r[2]-r[0],3),'height':round(r[3]-r[1],3),'fontSize':14,'color':'#ffffff',
                                 'sourceInstance':name,'sourceSymbolId':int(item.get('characterId'))}
                continue
            if name=='flag' or (name=='ad' and mid!=1):
                continue
            rect=src.placed(item)
            if current_room:
                # Button 146 is the static current-room transmission drawing.
                # Its full glow bounds cross the adjacent laboratory label;
                # bind the visible room rectangle, excluding that glow.
                rect=[38.625+viewport[0],212+viewport[1],209.625+viewport[0],290+viewport[1]]
            if region is not None and rect:
                x,y,right,bottom=rect
                nodes.append({'targetKind':'region','targetId':region['id'],'mapId':region.get('mapId'),
                              'x':round(max(0,x-viewport[0]),3),'y':round(max(0,y-viewport[1]),3),
                              'width':round(min(width,right-viewport[0])-max(0,x-viewport[0]),3),
                              'height':round(min(height,bottom-viewport[1])-max(0,y-viewport[1]),3),
                              'sourceInstance':name,'sourceSymbolId':int(item.get('characterId'))})
                found.add(region['id'])
                if current_room:
                    nodes[-1]['sourceInstance']='static-current-room'
                    nodes[-1]['adaptation']='Canonical transport map 1 uses the original current-room transmission graphic (button146), with a hit area restricted to the room rectangle. Unmodeled scene_6 is the power room and is omitted.'
            if name=='close' and rect:
                x,y,right,bottom=rect
                nodes.append({'targetKind':'back','x':round(x-viewport[0],3),'y':round(y-viewport[1],3),
                              'width':round(right-x,3),'height':round(bottom-y,3),'sourceInstance':name,
                              'asset':'/ui/classic/maps/back-arrow.png',
                              'adaptation':'Original return-arrow artwork replaces the original close-X glyph at its existing hit area.'})
                continue
            kept.append(item)
        missing=[r for r in regions if r['id'] not in found]
        anchors=[(0.17,0.8),(0.36,0.84),(0.56,0.84),(0.77,0.8),(0.17,0.18),(0.77,0.18)]
        for i,r in enumerate(missing):
            if mid==1:
                x,y=[(120,390),(260,390),(555,390),(665,390)][i]
            else:
                ax,ay=anchors[i%len(anchors)];x=ax*width;y=ay*height
            nodes.append({'targetKind':'region','targetId':r['id'],'mapId':r.get('mapId'),
                          'x':round(x,3),'y':round(y,3),'width':34,'height':34,'asset':'/ui/classic/maps/region-go.png',
                          'drawLabel':True,'label':r['name'],'labelX':round(x+17,3),'labelY':round(y+40,3),
                          'adaptation':'Existing remake region uses original GO chrome; source did not provide its canonical leaf anchor.'})
        sub=src.map.find('subTags');sub.clear();src.map.set('frameCount','1')
        for item in kept:
            sub.append(item)
        ET.SubElement(sub,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'})
        for item in list(src.tags):
            if item.get('type','').startswith(('PlaceObject','RemoveObject')) or item.get('type')=='ShowFrameTag':src.tags.remove(item)
        place=ET.SubElement(src.tags,'item',{'type':'PlaceObject2Tag','characterId':src.sid,'depth':'1','forceWriteAsLong':'false',
            'placeFlagHasCharacter':'true','placeFlagHasMatrix':'true','placeFlagMove':'false'})
        ET.SubElement(place,'matrix',{'type':'MATRIX','hasRotate':'false','hasScale':'false','nRotateBits':'0','nScaleBits':'0',
            'nTranslateBits':'16','translateX':str(-viewport[0]*20),'translateY':str(-viewport[1]*20)})
        ET.SubElement(src.tags,'item',{'type':'ShowFrameTag','forceWriteAsLong':'false'})
        root=src.tree.getroot();root.set('frameCount','1');rect=root.find('displayRect');rect.set('Xmin','0');rect.set('Ymin','0');rect.set('Xmax',str(width*20));rect.set('Ymax',str(height*20));rect.set('nbits','16')
        xml=CACHE/f'native-planet-{mid}-clean.xml';swf=xml.with_suffix('.swf');src.tree.write(xml,encoding='utf-8',xml_declaration=True)
        ffdec('-xml2swf',xml,swf);export=CACHE/f'native-planet-{mid}-stage';ffdec('-select','1','-zoom','2','-format','frame:png','-export','frame',export,swf)
        image=Image.open(export/'1.png').convert('RGBA');target=OUT/f'planet-{mid}-diagram.png';image.save(target)
        page={'width':width,'height':height,'background':f'/ui/classic/maps/planet-{mid}-diagram.png','headingInArtwork':True,'nodes':nodes,
              'sourceUrl':entry['url'],'sourceSymbolId':int(src.sid),'sourceNativeViewport':viewport,
              'adaptedRegionIds':[r['id'] for r in missing],'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        if title_plate is not None:
            page['titlePlate']=title_plate
        if mid==1:
            page['retainedBodyIllustration']='Original placement named ad (symbol28) is the ship blueprint, not an advertisement; retained at exact original matrix.'
        publish('planet-'+str(mid),page);print('Published native',mid,'source leaves',len(found),'adapted',len(missing),'viewport',viewport,flush=True)


if __name__=='__main__':
    main()
