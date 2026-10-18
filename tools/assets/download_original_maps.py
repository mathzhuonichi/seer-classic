#!/usr/bin/env python3
"""Recover original official H5 map backgrounds without altering the source art."""
import argparse
import concurrent.futures
import hashlib
import io
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/map-assets'
DEST = ROOT / 'public/maps/original'
RUNTIME_INDEX = ROOT / 'src/domain/world/map-art-assets.json'
HOST = 'https://seerh5.61.com/'
WORLD_SOURCES = ('classic-planets.ts', 'expansion.ts')
HABITAT_REGIONS = ROOT / 'data/habitat-regions.json'


def download(url, target):
    if target.exists():
        return target.read_bytes()
    try:
        data = urllib.request.urlopen(url, timeout=25).read()
    except urllib.error.HTTPError as error:
        raise ValueError(f'{url} returned HTTP {error.code}') from error
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return data


def by_map_id(table):
    """The table ordered by integer map ID, so a rerun writes the same bytes."""
    return dict(sorted(table.items(), key=lambda pair: int(pair[0])))


def write_new(path, data):
    """Writes a delivered file once; an existing file or link is never replaced or written through."""
    if path.is_symlink() or (path.exists() and path.read_bytes() != data):
        raise FileExistsError(f'{path.relative_to(ROOT)} already exists with other content')
    if not path.exists():
        path.write_bytes(data)


def recover(map_id, versions):
    directory = f'resource/assets/map/{map_id}/'
    version = versions.get(str(map_id), {})
    filename = version.get(f'map_{map_id}.json', f'map_{map_id}.json')
    resource_url = HOST + directory + filename
    resource_data = download(resource_url, CACHE / str(map_id) / filename)
    resources = json.loads(resource_data)['resources']
    candidates = [r for r in resources if r.get('type') == 'image' and re.search(r'_bg_mc\.(?:png|jpg)$', r['url'])]
    if not candidates:
        raise ValueError('The official resource table has no standalone bg_mc image.')
    resource = candidates[0]
    name = resource['url']
    url = HOST + directory + version.get(name, name)
    data = download(url, CACHE / str(map_id) / version.get(name, name))
    im = Image.open(io.BytesIO(data))
    im.load()
    path = DEST / f'{map_id}{Path(name).suffix}'
    write_new(path, data)
    record = dict(mapId=map_id, path=f'/maps/original/{path.name}', width=im.width, height=im.height,
                  sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), url=url,
                  source='Official Seer H5 standalone bg_mc background; original file bytes preserved.',
                  resourceManifestUrl=resource_url, resourceManifestSha256=hashlib.sha256(resource_data).hexdigest(),
                  sourceResourceName=resource['name'], format=im.format)
    road = next((r for r in resources if r.get('name') == f'road_{map_id}'), None)
    if road:
        road_filename = version.get(road['url'], road['url'])
        road_url = HOST + directory + road_filename
        road_data = download(road_url, CACHE / str(map_id) / road_filename)
        record['originalLayoutUrl'] = road_url
        record['originalLayoutSha256'] = hashlib.sha256(road_data).hexdigest()
        record['backgroundRegistration'] = json.loads(road_data).get('bg_mc', {})
    return record


def world_map_ids():
    """Map ids named by the world module's planets, regions and expansion destinations, and by the habitat regions
    except those whose own art data/habitat-regions.json records as unused."""
    regions = json.loads(HABITAT_REGIONS.read_text())['regions']
    ids = {region['originalMapId'] for region in regions if region.get('ownArtwork', {}).get('status') != 'unused'}
    for name in WORLD_SOURCES:
        text = (ROOT / 'src/domain/world' / name).read_text()
        ids.update(map(int, re.findall(r'originalMapId[\"\x27]?\s*:\s*(\d+)', text)))
        ids.update(map(int, re.findall(r'destination\([^\n]+?,\s*(\d+)\s*,\s*"[^\"]+"\s*,', text)))
    return ids


def project_runtime(maps, delivered):
    """Adds the offline path and cache identity of each newly delivered background to the game's projection."""
    index = json.loads(RUNTIME_INDEX.read_text())
    for key in delivered:
        index[key] = dict(path=maps[key]['path'], sha256=maps[key]['sha256'])
    RUNTIME_INDEX.write_text(json.dumps(by_map_id(index), ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*', type=int)
    args = parser.parse_args()
    ids = set(args.ids) or world_map_ids()
    DEST.mkdir(parents=True, exist_ok=True)
    version_url = HOST + 'version/version.json'
    version_bytes = download(version_url, CACHE / 'version.json')
    version_sha256 = hashlib.sha256(version_bytes).hexdigest()
    versions = json.loads(version_bytes)['files']['resource']['assets']['map']
    manifest_path = ROOT / 'public/maps/original-manifest.json'
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    maps, failures = previous.get('maps', {}), previous.get('failures', {})
    # The top-level table is the first delivery's; a record resolved from a later table names its own.
    manifest = dict(sourceVersionUrl=version_url, sourceVersionSha256=version_sha256) | previous
    later_table = dict(sourceVersionSha256=version_sha256) if manifest['sourceVersionSha256'] != version_sha256 else {}
    ids = {n for n in ids if str(n) not in maps}
    delivered = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(recover, n, versions): n for n in sorted(ids)}
        for future in concurrent.futures.as_completed(futures):
            n = futures[future]
            try:
                maps[str(n)] = future.result() | later_table
                failures.pop(str(n), None)
                delivered.append(str(n))
                print(f'{n}: {maps[str(n)]["width"]} x {maps[str(n)]["height"]}', flush=True)
            except Exception as error:
                failures[str(n)] = str(error)
                print(f'{n}: {error}', flush=True)
    manifest.update(maps=by_map_id(maps), failures=by_map_id(failures))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    project_runtime(maps, delivered)
    print(f'Delivered {len(maps)} official backgrounds; {len(failures)} unresolved IDs.')


if __name__ == '__main__':
    main()
