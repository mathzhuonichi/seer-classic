#!/usr/bin/env python3
"""Extract classic base traits and retain original client effect parameters."""
import json,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
rows=json.loads((root/'tools/assets/new_se.source.json').read_text())['NewSe']['NewSeIdx']
source='https://github.com/Nattsu39/seer_data/blob/a00bcdd5800e3bae5df881b4994a170a87541115/resource/config/xml/new_se.json'
types=['grass','water','fire','flying','electric','steel','ground','normal','ice','psychic','fighting','light','dark','mystery','dragon']
result=[]
for row in rows:
 if row.get('StarLevel')!=0 or row['Idx']>=1100: continue
 eid=row['Eid']; args=[int(a) for a in row['Args'].split()]; hooks=[]
 if eid==28:hooks=[{'on':'modify_damage_dealt','multiplier':1+args[1]/100,'when':{'skill_type':types[args[0]-1]},'kinds':['attack']}]
 if eid==65:hooks=[{'on':'modify_damage_dealt','multiplier':1+args[1]/100,'when':{'category':'physical' if args[0]==1 else 'special'},'kinds':['attack']}]
 if row['Idx']==1024:hooks=[{'on':'modify_damage_taken','multiplier':0.95,'kinds':['attack']}]
 if row['Idx']==1022:hooks=[{'on':'modify_accuracy','add_percent':5,'target':'self'}]
 if row['Idx']==1025:hooks=[{'on':'modify_accuracy','add_percent':-5,'target':'opponent'}]
 entry={'id':str(row['Idx']),'name':{'zh':row['Desc']},'description':{'zh':row['Intro']},'star_level':0,'source':source,'raw':row,'hooks':hooks,'implemented':bool(hooks),'era':'classic_base','levels':[r for r in rows if r.get('Desc')==row['Desc'] and r.get('StarLevel',99)<=3]}
 if not hooks:entry['unsupported_reason']='The original client effect is retained; an equivalent battle-engine hook is required.'
 result.append(entry)
(root/'data/traits.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'{len(result)} base traits extracted; {sum(r["implemented"] for r in result)} have initial condition-hook mappings')
