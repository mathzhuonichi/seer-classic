#!/usr/bin/env python3
"""Reconstruct original standing display lists and clothing order without Flash execution.

Cached FFDec SVGs provide leaf vector geometry. Original SWF XML provides every
registration, scale, skew and depth. Nested movement clips are explicitly stopped
at frame 1, matching SkeletonClothPreview.stop()/ChangeClothAction.goOver().
Requires the cached XML/SVG exports, Pillow and rsvg-convert.
"""
from pathlib import Path
import copy
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/classic-robots'
OUT = ROOT / 'public/robots/classic'
SVG = '{http://www.w3.org/2000/svg}'
XLINK = '{http://www.w3.org/1999/xlink}'
FFDEC = '{https://www.free-decompiler.com/flash}'
ET.register_namespace('', SVG[1:-1])
ET.register_namespace('xlink', XLINK[1:-1])
POSE_LABELS = {'front':'down','front-left':'leftdown','left':'left','back-left':'leftup',
               'back':'up','back-right':'rightup','right':'right','front-right':'rightdown'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def matrix(node):
    if node is None:
        return [1,0,0,1,0,0]
    return [float(node.get('scaleX','1')),float(node.get('rotateSkew0','0')),
            float(node.get('rotateSkew1','0')),float(node.get('scaleY','1')),
            float(node.get('translateX','0'))/20,float(node.get('translateY','0'))/20]


def matrix_text(values):
    return 'matrix(' + ' '.join(f'{value:.9g}' for value in values) + ')'


class Source:
    def __init__(self, name, xml, exports):
        self.name, self.sprites, self.types, self.symbols, self.leaves = name, {}, {}, {}, {}
        # Discard large shape XML records after recording their type. Leaf paths
        # already exist in the static FFDec exports; retain only display lists.
        stack=[]
        for event,element in ET.iterparse(xml,events=('start','end')):
            if event=='start':
                stack.append(element)
                continue
            if len(stack)==3 and stack[-2].tag=='tags':
                kind=element.get('type','')
                cid=element.get('spriteId') or element.get('shapeId')
                if cid:
                    self.types[int(cid)]=kind
                if kind=='DefineSpriteTag':
                    self.sprites[int(cid)]=copy.deepcopy(element)
                elif kind in ('SymbolClassTag','ExportAssetsTag'):
                    self.symbols.update(zip((a.text for a in element.find('names')),
                                            (int(a.text) for a in element.find('tags'))))
                element.clear()
            stack.pop()
        for file in exports:
            root=ET.parse(file).getroot()
            svg_defs=root.find(SVG+'defs')
            if svg_defs is None:continue
            definitions={e.get('id'):e for e in svg_defs}
            for use in root.iter(SVG+'use'):
                cid=use.get(FFDEC+'characterId')
                target=use.get(XLINK+'href','').lstrip('#')
                if cid and self.types.get(int(cid),'').startswith('DefineShape'):
                    if int(cid) not in self.leaves:
                        self.leaves[int(cid)]=(target,definitions)

    def labels(self, sid):
        frame,labels=1,{}
        for tag in self.sprites[sid].find('subTags'):
            if tag.get('type')=='FrameLabelTag':labels[tag.get('name')]=frame
            elif tag.get('type')=='ShowFrameTag':frame+=1
        return labels

    def display(self, sid, target=1):
        state,frame={},1
        for tag in self.sprites[sid].find('subTags'):
            kind=tag.get('type','')
            if kind.startswith('PlaceObject'):
                depth=int(tag.get('depth'))
                if tag.get('placeFlagMove')=='true':entry=dict(state.get(depth,{}))
                else:entry={}
                if tag.get('characterId'):entry['character']=int(tag.get('characterId'))
                if tag.get('name'):entry['name']=tag.get('name')
                if tag.find('matrix') is not None:entry['matrix']=matrix(tag.find('matrix'))
                if tag.get('clipDepth'):raise ValueError(f'Unsupported source mask in {self.name}:{sid}')
                if tag.get('placeFlagHasColorTransform')=='true':
                    raise ValueError(f'Unreviewed source colour transform in {self.name}:{sid}')
                state[depth]=entry
            elif kind.startswith('RemoveObject'):state.pop(int(tag.get('depth')),None)
            elif kind=='ShowFrameTag':
                if frame==target:break
                frame+=1
        return [(depth,state[depth]) for depth in sorted(state)]

    def leaf(self, cid, defs):
        target,definitions=self.leaves[cid]
        prefix=f'{self.name}-shape{cid}-'
        pending=[target]
        visited=set()
        while pending:
            current=pending.pop()
            if current in visited:continue
            visited.add(current)
            node=copy.deepcopy(definitions[current])
            text=ET.tostring(node,encoding='unicode')
            refs=re.findall(r'(?:href="|url\()#([^"\)]+)',text)
            pending.extend(ref for ref in refs if ref in definitions)
            for item in node.iter():
                for key,value in list(item.attrib.items()):
                    if key.startswith(FFDEC):del item.attrib[key]
                    elif key=='id':item.set(key,prefix+value)
                    elif key==XLINK+'href' and value.startswith('#'):item.set(key,'#'+prefix+value[1:])
                    else:item.set(key,re.sub(r'url\(#([^\)]+)\)',lambda match:'url(#'+prefix+match[1]+')',value))
            node_id=node.get('id')
            if defs.find(f"*[@id='{node_id}']") is None:defs.append(node)
        return ET.Element(SVG+'use',{XLINK+'href':'#'+prefix+target})

    def render(self, cid, frame, defs, audit):
        if cid not in self.sprites:
            if not self.types.get(cid,'').startswith('DefineShape'):
                raise ValueError(f'Unsupported non-vector leaf {self.name}:{cid}')
            return self.leaf(cid,defs)
        group=ET.Element(SVG+'g',{'data-source-symbol':f'{self.name}:{cid}','data-source-frame':str(frame)})
        for depth,entry in self.display(cid,frame):
            transform=entry.get('matrix',[1,0,0,1,0,0])
            layer=ET.SubElement(group,SVG+'g',{'transform':matrix_text(transform),'data-source-depth':str(depth)})
            audit.append({'source':self.name,'symbol':cid,'frame':frame,'depth':depth,
                          'character':entry['character'],'matrix':transform})
            # Direction-label clips select their child; inner walking clips stay
            # at their original standing frame, rather than an elapsed export frame.
            layer.append(self.render(entry['character'],1,defs,audit))
        return group


def render_order(label, slots, source):
    orders={name:re.findall(r'FLAG_([A-Z_1]+)',values) for name,values in
            re.findall(r'const\s+(\w+)RenderOrder:Array\s*=\s*\[([^]]+)\]',source)}
    flags={'CLOTH':'cloth','HAND_1':'hand1','HAND':'hand','HEAD':'head','TOP':'top','EYE':'eye'}
    order=list(slots)
    for flag in orders[label]:
        name=flags[flag]
        order.remove(name)
        order.append(name)
    return order


def write(root,path):
    ET.ElementTree(root).write(path,encoding='utf-8',xml_declaration=True)


def bounds(path,rsvg):
    raster=CACHE/'assembly-audit'/f'{path.stem}-uncropped.png'
    subprocess.run([rsvg,'-w','1000','-h','1000',str(path),'-o',str(raster)],check=True)
    with Image.open(raster) as image:
        box=image.getchannel('A').getbbox()
    if box is None:raise ValueError(f'Empty composite: {path}')
    if min(box[:2])<=0 or max(box[2:])>=1000:
        raise ValueError(f'Composite exceeds the uncropped measurement stage: {path}')
    # The initial 200 by 200 viewport uses five pixels per logical unit.
    return [box[0]/5-100-2,box[1]/5-100-2,(box[2]-box[0])/5+4,(box[3]-box[1])/5+4]


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    (CACHE/'assembly-audit').mkdir(exist_ok=True)
    rsvg=shutil.which('rsvg-convert')
    if not rsvg:raise RuntimeError('rsvg-convert is required for measured, uncropped viewports')
    ui_exports=[]
    for folder in ['color-svg/DefineSprite_4435*','ui-svg/DefineSprite_6508*']:
        directory=next(CACHE.glob(folder))
        ui_exports.extend(directory.glob('*.svg'))
    ui=Source('ui',CACHE/'UI.xml',ui_exports)
    body=int(ui.symbols['empty_body']);details=int(ui.symbols['defaultCloth'])
    body_compose=next(entry for _,entry in ui.display(body) if entry.get('name')=='compose')
    compose=body_compose['character']
    slots={entry['name']:{**entry,'depth':depth} for depth,entry in ui.display(compose) if entry.get('name')}
    color=slots['color']['character']
    core=CACHE/'core-script/scripts/com/robot/core/skeleton'
    order_source=(core/'ClothPreview.as').read_text()
    metadata=json.loads((CACHE/'npc-cloth-metadata.json').read_text())
    default_ids=[100001,100002,100003]
    npc_root=ET.parse(CACHE/'npc.xml').getroot()
    npc_roles={role:next(node for node in npc_root.iter('npc') if node.get('id')==nid)
               for role,nid in [('captain','1'),('scientist','3')]}
    item_ids=default_ids+sorted({int(cid) for node in npc_roles.values() for cid in node.get('cloths').split('|')})
    items={cid:Source(f'item{cid}',CACHE/f'{cid}.xml',list((CACHE/f'item-{cid}').rglob('*.svg'))) for cid in item_ids}
    npc_source=(CACHE/'core-script/scripts/com/robot/core/mode/NpcModel.as').read_text()
    npc_scale=float(re.search(r'getBodyMC\(\)\.scaleY\s*=\s*([0-9.]+)',npc_source)[1])
    manifest={'source':'https://seer.61.com/dll/UI.swf','sourceSha256':sha(CACHE/'UI.swf'),
              'method':'Source display-list reconstruction: exact full MATRIX, direction-labelled outer frames, nested standing frame 1, and original direction-specific layer order. Leaf paths are original FFDec exports; Flash bytecode is not executed.',
              'skeletonSymbols':{'emptyBody':body,'compose':compose,'color':color,'defaultCloth':details},
              'slotRegistrations':slots,'poses':{},'sourceAudits':{file.name:sha(file) for file in
              [core/'ClothPreview.as',core/'SkeletonClothPreview.as',core/'ChangeClothAction.as']}}
    manifest['sourceDisplayList']={'path':'.cache/classic-robots/UI.xml','sha256':sha(CACHE/'UI.xml')}
    manifest['sourceNpcConfig']={'source':'https://seer.61.com/resource/xml/npc.xml','sha256':sha(CACHE/'npc.xml')}
    manifest['viewportMethod']='Offline librsvg alpha bounds of the reconstructed display list, with two logical units of padding; player views share the union viewport.'
    all_boxes,all_placements={},{}
    for name in [*POSE_LABELS,'captain','scientist']:
        npc=name in npc_roles
        pose='front-left' if npc else name
        label=POSE_LABELS[pose]
        rgb=int(npc_roles[name].get('color'),16) if npc else 0x2e78db
        ids=[int(cid) for cid in npc_roles[name].get('cloths').split('|')] if npc else default_ids
        equipment={metadata[str(cid)]['type']:cid for cid in ids}
        root=ET.Element(SVG+'svg',{'viewBox':'-100 -100 200 200','width':'200','height':'200','role':'img'})
        defs=ET.SubElement(root,SVG+'defs')
        f=ET.SubElement(defs,SVG+'filter',{'id':'body-colour','color-interpolation-filters':'sRGB'})
        r,g,b=((rgb>>16)/255,((rgb>>8)&255)/255,(rgb&255)/255)
        ET.SubElement(f,SVG+'feColorMatrix',{'type':'matrix','values':f'0 0 0 0 {r} 0 0 0 0 {g} 0 0 0 0 {b} 0 0 0 1 0'})
        parent_matrix=list(body_compose['matrix'])
        if npc:parent_matrix[0]=parent_matrix[3]=npc_scale
        parent=ET.SubElement(root,SVG+'g',{'transform':matrix_text(parent_matrix)})
        order=render_order(label,slots,order_source)
        audit=[]
        for slot in order:
            if slot=='color':source,cid=ui,color
            elif slot=='cloth':source,cid=ui,details
            elif slot in equipment:source=items[equipment[slot]];cid=source.symbols['item']
            else:continue
            frame=source.labels(cid)[label]
            node=ET.SubElement(parent,SVG+'g',{'transform':matrix_text(slots[slot]['matrix']),'data-slot':slot})
            if slot=='color':node.set('filter','url(#body-colour)')
            node.append(source.render(cid,frame,defs,audit))
        path=OUT/(name+'.svg' if npc else f'player-{name}.svg')
        write(root,path)
        all_boxes[name]=bounds(path,rsvg)
        record={'path':'/robots/classic/'+path.name,'direction':pose,'label':label,
                'frame':ui.labels(color)[label],'nestedFrame':1,'renderOrder':order,
                'equippedSlots':equipment,'bodyMatrix':parent_matrix,'colour':f'#{rgb:06x}',
                'placementCount':len(audit),'placementAuditPath':'.cache/classic-robots/assembly-audit/placements.json'}
        all_placements[name]=audit
        if npc:manifest[name]=record
        else:manifest['poses'][name]=record
    boxes=[all_boxes[name] for name in POSE_LABELS]
    x=min(b[0] for b in boxes);y=min(b[1] for b in boxes)
    common=[x,y,max(b[0]+b[2] for b in boxes)-x,max(b[1]+b[3] for b in boxes)-y]
    manifest['commonPlayerViewport']=common
    for name,box in all_boxes.items():
        path=OUT/(name+'.svg' if name in npc_roles else f'player-{name}.svg')
        root=ET.parse(path).getroot();viewport=box if name in npc_roles else common
        root.set('viewBox',' '.join(f'{value:.9g}' for value in viewport))
        root.set('width',f'{viewport[2]:.9g}');root.set('height',f'{viewport[3]:.9g}')
        write(root,path)
        record=manifest[name] if name in npc_roles else manifest['poses'][name]
        record.update({'viewBox':viewport,'measuredBounds':box,'sha256':sha(path)})
        subprocess.run([rsvg,'-w','320',str(path),'-o',str(CACHE/'assembly-audit'/f'{name}.png')],check=True)
    manifest['sourceEquipment']=[{'id':cid,'slot':metadata[str(cid)]['type'],
      'source':f'https://seer.61.com/resource/item/cloth/swf/{cid}.swf','sourceSha256':sha(CACHE/f'{cid}.swf')} for cid in item_ids]
    audit_file=CACHE/'assembly-audit/placements.json'
    audit_file.write_text(json.dumps(all_placements,indent=2)+'\n')
    manifest['placementAudit']={'path':'.cache/classic-robots/assembly-audit/placements.json',
      'sha256':sha(audit_file),'placementCount':sum(len(audit) for audit in all_placements.values())}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Reconstructed {len(POSE_LABELS)} player standing views and {len(npc_roles)} NPCs from source matrices and depths.')


if __name__=='__main__':main()
