#!/usr/bin/env python3
"""Publish only source-backed, verified portrait candidates and preserve layout."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def geometry(path):
    root = ET.parse(path).getroot()
    for key in ('width', 'height', 'viewBox'):
        root.attrib.pop(key, None)
    for element in root.iter():
        name = element.tag.rsplit('}', 1)[-1]
        if name in ('script', 'foreignObject'):
            raise ValueError(f'Active SVG content: {path}')
        for key in list(element.attrib):
            if key.startswith('{https://www.free-decompiler.com/flash}'):
                del element.attrib[key]
            elif key.rsplit('}', 1)[-1].lower().startswith('on'):
                raise ValueError(f'SVG event handler: {path}')
            elif key.rsplit('}', 1)[-1] == 'href' and not element.attrib[key].startswith(('#', 'data:image/')):
                raise ValueError(f'External SVG reference: {path}')
    return hashlib.sha256(ET.tostring(root)).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix('.tmp').write_text(json.dumps(value, indent=2) + '\n')
    path.with_suffix('.tmp').replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/portrait-v44')
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--baseline-revision', default='00a93ec', help='Revision containing the 143 retained original SVGs.')
    args = parser.parse_args()
    cache = args.cache.resolve()
    original = json.loads((ROOT / 'public/portraits/manifest.json').read_text())['portraits']
    vector_file = ROOT / 'public/portraits/vectors/manifest.json'
    vectors = json.loads(vector_file.read_text())
    retained = json.loads(subprocess.check_output(['git', 'show', f'{args.baseline_revision}:public/portraits/vectors/manifest.json'], cwd=ROOT))['portraits']
    sources = json.loads((cache / 'sources.json').read_text())['sources']
    candidates = json.loads((cache / 'calibrated-candidates.json').read_text())['portraits']
    candidates.update(json.loads((cache / 'mixed-candidates.json').read_text())['portraits'])
    quality = json.loads((cache / 'source-quality-report.json').read_text())['portraits']
    raster_candidates = json.loads((cache / 'source-render-candidates/manifest.json').read_text())['portraits']
    retained_choices = json.loads((cache / 'retained-filter-selection.json').read_text())
    published_renders = {'description': 'Direct original SWF display-list renders; actual source scale and embedded bitmap limits are recorded per asset.', 'portraits': {}}
    if set(sources) != set(original) or set(quality) != set(original) - set(retained):
        raise ValueError('Incomplete source or quality ID coverage')
    for sid, item in retained.items():
        if digest(ROOT / 'public' / item['path'].lstrip('/')) != item['sha256']:
            raise ValueError(f'Retained SVG bytes changed: {sid}')
        if sources[sid]['sha256'] != item['source_sha256']:
            raise ValueError(f'Retained source version changed: {sid}')
    plan, selected, pending = [], {}, {}
    for sid in sorted(original, key=int):
        if sid in retained:
            decision = retained_choices.get(sid, {}).get('selection', 'retained-svg')
        else:
            decision = quality[sid]['decision']
        if decision in ('vector', 'mixed-vector'):
            item = dict(candidates[sid])
            source_svg = next((cache / 'full/.cache/vector-export' / sid / 'svg').rglob('1.svg'))
            candidate = cache / 'full/public' / item['path'].lstrip('/')
            if item.get('viewport_pending') or digest(candidate) != item['sha256']:
                raise ValueError(f'Uncalibrated or changed vector candidate: {sid}')
            if item['source_sha256'] != sources[sid]['sha256'] or geometry(source_svg) != geometry(candidate):
                raise ValueError(f'Original source geometry changed: {sid}')
            item['quality_verified'] = True
            item['source_comparison'] = quality[sid].get('source_comparison')
            item['geometry_preserved_sha256'] = geometry(candidate)
            item['classification'] = 'vector-body-with-bitmap-effects' if decision == 'mixed-vector' else 'pure-vector'
            vectors['portraits'][sid] = item
            vectors.setdefault('failures', {}).pop(sid, None)
            plan.append((candidate, ROOT / 'public' / item['path'].lstrip('/')))
            selected[sid] = {'representation': item['classification'], 'path': item['path']}
        elif decision == 'source-render':
            item = raster_candidates.get(sid)
            if not item or not item.get('quality_verified'):
                pending[sid] = 'No validated direct source render'
                continue
            candidate = cache / 'source-render-candidates' / f'{sid}.png'
            if digest(candidate) != item['sha256'] or item['source_sha256'] != sources[sid]['sha256']:
                raise ValueError(f'Changed source-render candidate: {sid}')
            published_renders['portraits'][sid] = item
            plan.append((candidate, ROOT / 'public' / item['path'].lstrip('/')))
            selected[sid] = {'representation': f'direct-source-{item["source_render_scale"]}x', 'path': item['path'],
                             'embedded_bitmap_sizes': item['embedded_bitmap_sizes']}
        elif decision == 'retained-svg':
            selected[sid] = {'representation': 'retained-vector', 'path': retained[sid]['path']}
        elif decision == 'source-raster':
            selected[sid] = {'representation': 'original-raster-body', 'path': original[sid]['path'], 'reason': quality[sid]['reason']}
        else:
            pending[sid] = quality.get(sid, {}).get('reason', decision)
    if pending:
        raise ValueError(f'Candidates still pending: {pending}')
    counts = dict(Counter(item['representation'] for item in selected.values()))
    hd_file = ROOT / 'public/portraits/hd/manifest.json'
    hd = json.loads(hd_file.read_text()).get('assets', {}) if hd_file.exists() else {}
    runtime_selected = dict(selected)
    for sid, item in hd.items():
        if sid not in selected or not item.get('review') or digest(ROOT / 'public' / item['path'].lstrip('/')) != item['sha256']:
            raise ValueError(f'Invalid reviewed HD override: {sid}')
        runtime_selected[sid] = {'representation': 'conservative-ai-redraw', 'path': item['path']}
    audit = {'description': 'Static original first-pose source recovery; no ActionScript execution, AI redraw, or H5 raster enlargement in this pipeline.',
             'source_count': len(sources), 'selected_count': len(selected), 'counts': counts,
             'retained_svg_files_unchanged': len(retained), 'source_swf_bytes': sum(item['bytes'] for item in sources.values()),
             'validation': 'Exact source geometry preservation, expanded alpha bounds, independent raster comparisons; source-scale-sensitive effects retain direct 2x pixels.',
             'retained_filter_selection': retained_choices, 'portraits': selected,
             'runtime_counts': dict(Counter(item['representation'] for item in runtime_selected.values())),
             'runtime_overrides': {sid: runtime_selected[sid] for sid in hd}}
    write_json(cache / 'publication-plan.json', audit)
    print(json.dumps(counts, indent=2))
    if args.check_only:
        print(f'Validated {len(plan)} publication files without changing public assets.')
        return
    for source, destination in plan:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    vectors['description'] = 'Original official combat-pose vector geometry; mixed bitmap effects are explicitly identified. No redraw or raster enlargement.'
    write_json(vector_file, vectors)
    write_json(ROOT / 'public/portraits/source-renders/manifest.json', published_renders)
    write_json(ROOT / 'public/portraits/source-audit.json', audit)
    profile_file = ROOT / 'src/shared/creature-art-data.json'
    before = json.loads(profile_file.read_text())
    subprocess.run([sys.executable, str(ROOT / 'tools/assets/build_art_profiles.py'), '--preserve-layout'], check=True)
    after = json.loads(profile_file.read_text())
    if set(before) != set(after) or any(before[sid][6:9] != after[sid][6:9] for sid in before):
        raise ValueError('Evolution layout or physical scale changed during publication')
    if any((after[sid][9] if len(after[sid]) > 9 else original[sid]['path']) != runtime_selected[sid]['path'] for sid in after):
        raise ValueError('Published runtime path differs from the reviewed source selection')
    audit['preserved_layout_sha256'] = hashlib.sha256(json.dumps({sid: before[sid][6:9] for sid in sorted(before, key=int)}, separators=(',', ':')).encode()).hexdigest()
    write_json(ROOT / 'public/portraits/source-audit.json', audit)
    print(f'Published {len(plan)} validated source assets; preserved all {len(after)} evolution and physical-scale profiles.')


if __name__ == '__main__':
    main()
