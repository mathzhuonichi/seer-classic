#!/usr/bin/env python3
"""Measure visible portrait bounds and derive a shared evolution size profile."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preserve-layout', action='store_true',
                        help='Retain existing evolution root, stage and physical scale while upgrading artwork.')
    args = parser.parse_args()
    target = ROOT / 'src/presentation/creature-art-data.json'
    previous = json.loads(target.read_text()) if args.preserve_layout and target.exists() else {}
    species = {int(p.stem): json.loads(p.read_text()) for p in (ROOT / 'data/monsters').glob('*.json')}
    manifest = json.loads((ROOT / 'public/portraits/manifest.json').read_text())
    vector_file = ROOT / 'public/portraits/vectors/manifest.json'
    vectors = {sid: item for sid, item in json.loads(vector_file.read_text())['portraits'].items()
               if not item.get('viewport_pending')} if vector_file.exists() else {}
    render_file = ROOT / 'public/portraits/source-renders/manifest.json'
    renders = {sid: item for sid, item in json.loads(render_file.read_text())['portraits'].items()
               if item.get('quality_verified')} if render_file.exists() else {}
    hd_file = ROOT / 'public/portraits/hd/manifest.json'
    hd = json.loads(hd_file.read_text()).get('assets', {}) if hd_file.exists() else {}
    for sid, item in hd.items():
        asset = ROOT / 'public' / item['path'].lstrip('/')
        if not item.get('review') or hashlib.sha256(asset.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError(f'Unreviewed or changed HD portrait override: {sid}')

    def ancestry(sid):
        chain, seen = [], set()
        while sid in species:
            if sid in seen:
                raise ValueError(f'Cycle in evolution ancestry: {sid}')
            seen.add(sid)
            chain.append(sid)
            sid = species[sid].get('evolves_from')
        return chain[::-1]

    chains = {sid: ancestry(sid) for sid in species}
    depths = {}
    for chain in chains.values():
        depths[chain[0]] = max(depths.get(chain[0], 0), len(chain) - 1)
    # Relative silhouette extent is an explicit remake art-direction choice,
    # not an assertion of canonical height. Starters grow distinctly at each stage.
    starter_scales = {1: .48, 2: .72, 3: .98, 4: .50, 5: .73, 6: .98, 7: .48, 8: .73, 9: 1.0}
    rows = {}
    for sid in sorted(species):
        source = manifest['portraits'][str(sid)]
        with Image.open(ROOT / 'public' / source['path'].lstrip('/')) as image:
            bounds = image.convert('RGBA').getchannel('A').getbbox()
            if bounds is None:
                raise ValueError(f'Empty portrait: {sid}')
            width, height = image.size
        x, y, right, bottom = bounds
        vector = vectors.get(str(sid))
        source_render = renders.get(str(sid))
        hd_override = hd.get(str(sid))
        if vector:
            width, height = vector['width'], vector['height']
            # The exported viewBox keeps one vector-unit of transparent padding.
            x, y, right, bottom = 1, 1, width-1, height-1
            if vector.get('alpha_bounds'):
                x, y, visible_width, visible_height = vector['alpha_bounds']
                right, bottom = x + visible_width, y + visible_height
        if source_render:
            width, height = source_render['width'], source_render['height']
            x, y, visible_width, visible_height = source_render['alpha_bounds']
            right, bottom = x + visible_width, y + visible_height
        if hd_override:
            with Image.open(ROOT / 'public' / hd_override['path'].lstrip('/')) as image:
                width, height = image.size
                x, y, right, bottom = image.convert('RGBA').getchannel('A').getbbox()
        chain = chains[sid]
        root, stage = chain[0], len(chain) - 1
        depth = depths[root]
        scale = starter_scales.get(sid, .84 if depth == 0 else .52 + .44 * stage / depth)
        rows[str(sid)] = [width, height, x, y, right-x, bottom-y, root, stage, round(scale, 4)]
        if str(sid) in previous:
            rows[str(sid)][6:9] = previous[str(sid)][6:9]
        if hd_override:
            rows[str(sid)].append(hd_override['path'])
        elif source_render:
            rows[str(sid)].append(source_render['path'])
        elif vector:
            rows[str(sid)].append(vector['path'])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(rows, separators=(',', ':')) + '\n')
    print(f'Measured {len(rows)} species; {len(vectors) - len(set(vectors) & set(renders))} original SVGs, {len(renders)} direct source renders and {len(hd)} reviewed HD overrides selected.')


if __name__ == '__main__':
    main()
