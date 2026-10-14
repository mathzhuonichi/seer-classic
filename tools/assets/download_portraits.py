#!/usr/bin/env python3
"""Download original Seer full-body PNG art from the official numeric resource path."""
import concurrent.futures, hashlib, json, pathlib, struct, time, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / 'public/portraits'
BASE = 'https://seerh5.61.com/resource/assets/fightResource/pet/'
PNG = b'\x89PNG\r\n\x1a\n'

def download(species_id):
    path = DEST / f'{species_id}.png'
    url = f'{BASE}{species_id}.png'
    for attempt in range(3):
        try:
            data = path.read_bytes() if path.exists() else urllib.request.urlopen(url, timeout=20).read()
            if not data.startswith(PNG) or len(data) < 24:
                raise ValueError('Response is not a PNG image')
            width, height = struct.unpack('>II', data[16:24])
            path.write_bytes(data)
            return str(species_id), {'path': f'/portraits/{species_id}.png', 'source': url,
                'width': width, 'height': height, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        except Exception as error:
            if attempt == 2:
                return str(species_id), {'error': str(error), 'source': url}
            time.sleep(0.5 * (attempt + 1))

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    catalog = ROOT / 'data/monsters'
    ids = sorted(int(p.stem) for p in catalog.glob('*.json')) if catalog.exists() else list(range(1,1488)) + [1498,1499]
    manifest = {'description': 'Original Seer full-body portraits downloaded from the official game static resource host.',
        'source_template': BASE + '{species_id}.png', 'discovery': 'https://www.bilibili.com/opus/697166788097474613',
        'portraits': {}, 'failures': {}}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for count, (species_id, item) in enumerate(pool.map(download, ids), 1):
            manifest['failures' if 'error' in item else 'portraits'][species_id] = item
            if count % 100 == 0:
                print(f'{count}/{len(ids)} checked; {len(manifest["portraits"])} downloaded', flush=True)
    (DEST/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(f'Complete: {len(manifest["portraits"])} portraits, {len(manifest["failures"])} failures', flush=True)

if __name__ == '__main__': main()
