#!/usr/bin/env python3
"""Pin official per-ID item/engraving artwork, with explicit authored fallbacks.

Run with python3 (Pillow is required).
The existing read-only Nattsu39/seer_data@a00bcdd item table resolves essence
and soul-bead IDs; it is not evidence that the current PNG bytes are from 2013.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import subprocess
import time
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'public/item-icons'
CACHE = ROOT / '.cache/item-icons-v50'
SOURCE_TABLE = ROOT.parent / 'analysis/seer-data-a00bcdd/items.json'
PNG_BASE = 'https://seerh5.61.com/resource/assets/'
SWF_BASE = 'https://seer.61.com/resource/'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def classify(item: dict) -> str:
    if item['id'] == 'item_status_cure':
        return 'status'
    if item['id'].startswith('fusion_bead_'):
        return 'fusion'
    return item.get('kind') if item.get('kind') in {'capsule', 'battle', 'raising', 'essence'} else 'other'


def download(job: tuple[str, dict]) -> tuple[str, dict]:
    key, entry = job
    relative = f"{entry['resource']}{entry['sourceId']}.png"
    url = PNG_BASE + relative
    target = DEST / 'original' / f"{entry['sourceId']}.png"
    error = ''
    for attempt in range(3):
        try:
            data = target.read_bytes() if target.exists() else urllib.request.urlopen(url, timeout=20).read()
            with Image.open(io.BytesIO(data)) as image:
                if image.format != 'PNG':
                    raise ValueError('Not a PNG')
                image.load()
                width, height = image.size
                if width < 12 or height < 12 or not image.convert('RGBA').getbbox():
                    raise ValueError('Empty or unexpectedly small image')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            return key, {**entry, 'path':f'/item-icons/original/{target.name}', 'source':url,
                         'flashSource':SWF_BASE+f"{entry['resource']}{entry['sourceId']}.swf",
                         'sha256':sha(data), 'bytes':len(data), 'width':width, 'height':height,
                         'original':True, 'method':'Unmodified official PNG downloaded by exact numeric asset ID.'}
        except Exception as caught:
            error = str(caught)
            if attempt < 2:
                time.sleep(.25 * (attempt + 1))
    return key, {**entry, 'source':url, 'original':False, 'error':error}


def write_fallbacks() -> dict:
    # Deliberately generic UI symbols, never presented as original per-item art.
    drawings = {
        'capsule':'<path d="M16 48 48 16a14 14 0 0 1 20 20L36 68a14 14 0 0 1-20-20Z"/><path d="m29 35 20 20"/>',
        'battle':'<path d="M29 12h26v12H29zM34 24v8L22 46v19q0 7 7 7h26q7 0 7-7V46L50 32v-8"/><path d="M31 51h22M42 40v22"/>',
        'status':'<path d="M29 12h26v12H29zM34 24v8L22 46v19q0 7 7 7h26q7 0 7-7V46L50 32v-8"/><path d="m31 53 8 8 16-20"/>',
        'raising':'<path d="m42 10 10 22 24 3-18 17 5 24-21-12-21 12 5-24L8 35l24-3Z"/><path d="M42 49V28m-8 8 8-8 8 8"/>',
        'essence':'<path d="M42 10C26 24 16 42 17 56c1 23 49 23 50 0 1-14-9-32-25-46Z"/><path d="M29 48q7-19 14-23"/>',
        'fusion':'<circle cx="42" cy="42" r="28"/><path d="M23 46q8-24 24-24M27 60q17 5 31-17"/><circle cx="49" cy="34" r="7"/>',
        'ability':'<path d="m42 10 28 16v32L42 74 14 58V26Z"/><path d="m42 24 16 9v18l-16 9-16-9V33Z"/>',
        'skill':'<circle cx="42" cy="42" r="28"/><path d="m47 19-19 27h14l-5 20 20-29H43Z"/>',
        'other':'<rect x="17" y="17" width="50" height="50" rx="10"/><path d="M31 32q2-10 13-9 15 4 3 16-6 5-6 11M41 58v2"/>',
    }
    colors = {'capsule':'#4d9cc9','battle':'#d26a6a','status':'#52b79c','raising':'#c99e42','essence':'#78a8d7','fusion':'#b989d8','ability':'#cb6c57','skill':'#5e8bc7','other':'#8d9eaa'}
    result = {}
    for name, drawing in drawings.items():
        data = (f'<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84"><title>Authored {name} category fallback</title><g fill="{colors[name]}" fill-opacity=".18" stroke="{colors[name]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{drawing}</g></svg>\n').encode()
        target = DEST / 'fallback' / f'{name}.svg'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        result[name] = {'path':f'/item-icons/fallback/{name}.svg','original':False,'sha256':sha(data),'method':'Authored geometric category fallback; not original per-item artwork.'}
    return result


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    subprocess.run(['node',str(ROOT/'tools/assets/collect_item_icons_v50.mjs')],cwd=ROOT,check=True)
    runtime = json.loads((CACHE/'runtime-items.json').read_text())
    marks = json.loads((ROOT/'data/engravings.json').read_text())['engravings']
    table_bytes = SOURCE_TABLE.read_bytes()
    raw = json.loads(table_bytes)['Items']['Cat']
    entries = []
    for category in raw:
        if not category.get('url'):
            continue
        rows=category.get('Item',[])
        for row in rows if isinstance(rows,list) else [rows]:
            if 'ID' in row:
                entries.append({**row,'resource':category['url'].removeprefix('resource/')})
    by_id = {int(row['ID']):row for row in entries}
    essence = {}
    for row in entries:
        if str(row.get('BreedMonID','')).isdigit() and '精元' in row.get('Name',''):
            essence.setdefault(int(row['BreedMonID']),[]).append(row)
    beads = {row['Name']:row for row in entries if row['resource']=='soulBead/icon/'}
    beads_by_species = {int(row['TransmuteMon']):row for row in beads.values() if str(row.get('TransmuteMon','')).isdigit()}
    fusion_names = {f"fusion_bead_{row['species']}":row['beadName'] for row in runtime['fusionOutcomes']}
    jobs, bindings, unresolved = {}, {}, []

    def bind(key: str, row: dict, basis: str) -> None:
        asset_key=f"{row['resource']}{row['ID']}"
        jobs[asset_key]={'sourceId':int(row['ID']),'sourceName':row.get('Name',''),'resource':row['resource']}
        bindings[key]={'asset':asset_key,'binding':basis}

    for mark in marks:
        bind(f"engraving:{mark['id']}",{'ID':int(mark['id']),'Name':mark['name']['zh'],'resource':'countermark/icon/'},'Exact engraving ID.')
    for item in runtime['items']:
        row = by_id.get(int(item['seer_id'])) if item.get('seer_id') else None
        basis = 'Exact item seer_id in the installed catalog.'
        if row is None and item['id'] in fusion_names:
            row=beads.get(fusion_names[item['id']]);basis='Exact soul-bead color/name in the fusion recipe and official item table.'
            if row is None:
                row=beads_by_species.get(int(item['hatches']));basis='Exact soul-bead TransmuteMon matches the runtime hatch species; the reconstructed recipe color label differs.'
        if row is None and item.get('hatches'):
            options=essence.get(int(item['hatches']),[])
            normalized=item['name'].replace('的','')
            exact=[option for option in options if option.get('Name','').replace('的','')==normalized]
            row=(exact or sorted(options,key=lambda option:int(option['ID'])) or [None])[0]
            basis='Official essence BreedMonID equals this runtime item hatches species; exact name preferred.'
        if row is not None:
            bind(item['id'],row,basis)
        else:
            unresolved.append({'id':item['id'],'name':item['name'],'fallback':classify(item),'reason':'No exact original item identity recovered for this runtime definition.'})
    assets={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        for count,(key,asset) in enumerate(pool.map(download,sorted(jobs.items())),1):
            assets[key]=asset
            if count%100==0:
                print(f'{count}/{len(jobs)} official assets checked.',flush=True)
    fallbacks=write_fallbacks()
    compact={}
    for key,binding in bindings.items():
        asset=assets[binding['asset']]
        if asset['original']:
            compact[key]={'src':asset['path'],'original':True,'sha256':asset['sha256']}
        else:
            fallback='ability' if key.startswith('engraving:1') else 'skill' if key.startswith('engraving:') else classify(next(item for item in runtime['items'] if item['id']==key))
            unresolved.append({'id':key,'fallback':fallback,'reason':asset['error']})
    for item in unresolved:
        compact[item['id']]={'src':fallbacks[item['fallback']]['path'],'original':False,'fallback':item['fallback']}
    manifest={
        'description':'Per-ID official Seer item and engraving PNGs, downloaded without alteration; unknown identities use authored category symbols.',
        'version':50,'sourceDate':'Fetched current official assets; no claim that PNG bytes are archived 2013 artwork.',
        'itemTable':{'source':'https://github.com/Nattsu39/seer_data/blob/a00bcdd/items.json','sha256':sha(table_bytes)},
        'assets':assets,'bindings':bindings,'fallbacks':fallbacks,'unresolved':unresolved,
        'counts':{'runtimeItems':len(runtime['items']),'engravings':len(marks),'originalAssetFiles':sum(asset['original'] for asset in assets.values()),'originalBindings':sum(asset['original'] for asset in compact.values()),'fallbackBindings':len(unresolved)},
    }
    DEST.mkdir(parents=True,exist_ok=True)
    (DEST/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'src/presentation/item-icon-assets.json').write_text(json.dumps(compact,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(manifest['counts']),flush=True)


if __name__ == '__main__':
    main()
