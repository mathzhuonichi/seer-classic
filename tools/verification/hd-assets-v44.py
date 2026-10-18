#!/usr/bin/env python3
"""Static V44 asset integrity audit; no rendering, generation, or runtime edits."""
from __future__ import annotations

import argparse
import ast
from collections import Counter
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public'
SVG = 'http://www.w3.org/2000/svg'
PUBLIC_ROOT_NAMES = {path.name for path in PUBLIC.iterdir()}
AUTHORIZED_BASELINE_MANIFEST_CHANGES = {
    'public/battle-effects/manifest.json',
    'public/portraits/vectors/manifest.json',
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', default='00a93ec')
parser.add_argument('--skip-atlas', action='store_true')
parser.add_argument('--allow-pending-map', action='store_true')
parser.add_argument('--skill-sources', type=Path, default=ROOT.parent / 'analysis/codex-takeover-2026-10-14/skill-effects-hd-v44/sources')
parser.add_argument('--report', type=Path, default=ROOT / 'artifacts/hd-original-v44/verification.json')
args = parser.parse_args()
report = {'baseline': args.baseline, 'scope': 'Static byte, provenance, registration, runtime-reference and Git-policy consistency. No new visual-fidelity or gameplay certification.',
          'checks': {}, 'failures': [], 'pending': [], 'limitations': [
              'Available pinned source files are checked by hash; source rendering and visual fidelity are covered by the separate source reviews.',
              'Trackable new source and metadata files remain unstaged until the parent task integrates the complete change.',
          ]}
section = ''


def git(*arguments, binary=False):
    return subprocess.check_output(['git', *arguments], cwd=ROOT, text=not binary)


def require(condition, message):
    if not condition:
        report['failures'].append({'section': section, 'message': message})
    return bool(condition)


def local(value):
    value = str(value).split('?', 1)[0]
    if value.startswith('/') and value.split('/', 2)[1] in PUBLIC_ROOT_NAMES:
        return PUBLIC / value.lstrip('/')
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def relative(path):
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


@lru_cache(maxsize=None)
def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load(name):
    return json.loads(local(name).read_text())


def asset(value, sha=None, size=None):
    path = local(value)
    if not require(path.is_file(), f'Missing asset: {relative(path)}'):
        return None
    if sha is not None:
        require(bool(re.fullmatch('[0-9a-f]{64}', sha)), f'Invalid SHA-256: {value}')
        require(digest(path) == sha, f'Asset SHA-256 differs: {relative(path)}')
    if size is not None:
        require(path.stat().st_size == size, f'Asset byte count differs: {relative(path)}')
    return path


def manifest_row(row):
    return asset(row['path'], row.get('sha256'), row.get('bytes'))


def baseline_json(name):
    return json.loads(git('show', f'{args.baseline}:{name}'))


def dimensions(path):
    with Image.open(path) as image:
        return image.size


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def validate_svg(path):
    root = ET.parse(path).getroot()
    require(root.tag.endswith('svg'), f'Invalid SVG root: {relative(path)}')
    for element in root.iter():
        require(element.tag.rsplit('}', 1)[-1] not in ('script', 'foreignObject'), f'Active content in SVG: {relative(path)}')
        for key, value in element.attrib.items():
            if key.rsplit('}', 1)[-1] != 'href' or value.startswith(('#', 'data:')):
                continue
            require(not value.startswith(('http:', 'https:', '//')), f'External SVG dependency: {relative(path)}')
            if value.startswith('/'):
                asset(value)
            elif not re.match(r'[a-z]+:', value):
                require((path.parent / value).is_file(), f'Missing relative SVG dependency: {relative(path)} -> {value}')


def ignored(paths):
    names = sorted(set(paths))
    result = subprocess.run(['git', 'check-ignore', '--no-index', '--stdin', '-z'], cwd=ROOT,
                            input='\0'.join(names) + '\0', text=True, capture_output=True)
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr)
    return set(result.stdout.rstrip('\0').split('\0')) if result.stdout else set()


def run(name, operation):
    global section
    section = name
    before = len(report['failures'])
    try:
        details = operation()
    except Exception as error:
        require(False, f'{type(error).__name__}: {error}')
        details = {}
    report['checks'][name] = {'passed': len(report['failures']) == before, **(details or {})}


baseline_tree = {}
for record in git('ls-tree', '-r', '-z', args.baseline, 'public', binary=True).split(b'\0'):
    if record:
        metadata, name = record.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        baseline_tree[name.decode()] = {'mode': mode, 'kind': kind, 'oid': oid}
runtime_assets = set()


def original_assets():
    checked = 0
    for name, record in baseline_tree.items():
        if name in AUTHORIZED_BASELINE_MANIFEST_CHANGES:
            continue
        path = ROOT / name
        if not require(path.is_file(), f'Original tracked file missing: {name}'):
            continue
        with path.open('rb') as stream:
            hasher = hashlib.sha1(f'blob {path.stat().st_size}\0'.encode())
            while chunk := stream.read(1024 * 1024):
                hasher.update(chunk)
        require(hasher.hexdigest() == record['oid'], f'Original tracked bytes changed: {name}')
        checked += 1
    references = {}
    for name in baseline_tree:
        if 'manifest' not in Path(name).name or not name.endswith('.json'):
            continue
        for row in walk(baseline_json(name)):
            if isinstance(row.get('path'), str) and row.get('sha256') and row['path'].startswith('/'):
                if row['path'] in references:
                    require(references[row['path']] == row['sha256'], f'Baseline manifests disagree on the asset hash: {row["path"]}')
                references[row['path']] = row['sha256']
    for name, sha in references.items():
        asset(name, sha)
    return {'trackedFilesComparedToGitBlobs': checked, 'authorizedManifestExceptions': sorted(AUTHORIZED_BASELINE_MANIFEST_CHANGES),
            'baselineManifestAssetHashesChecked': len(references)}


def portraits():
    current = load('src/presentation/creature-art-data.json')
    previous = baseline_json('src/presentation/creature-art-data.json')
    require(set(current) == set(previous) and len(current) == 1483, 'Creature inventory must remain exactly the baseline 1483 IDs')
    registry = {}
    for name, key in [('public/portraits/vectors/manifest.json', 'portraits'),
                      ('public/portraits/source-renders/manifest.json', 'portraits'),
                      ('public/portraits/hd/manifest.json', 'assets')]:
        for sid, row in load(name)[key].items():
            manifest_row(row)
            registry[row['path']] = row
            if row.get('generatedPath'):
                # The generated image is an external id that was never transferred; `path` holds its unchanged bytes.
                asset(row['sourcePath'])
    counts = Counter()
    for sid, row in current.items():
        require(row[6:9] == previous[sid][6:9], f'Root/stage/physicalScale changed for creature {sid}')
        require(len(row) > 9 and row[9] in registry, f'Creature {sid} runtime path has no provenance row')
        if len(row) <= 9 or row[9] not in registry:
            continue
        entry = registry[row[9]]
        require([row[0], row[1]] == [entry['width'], entry['height']], f'Creature {sid} profile viewport differs from the asset metadata')
        require(row[4] > 0 and row[5] > 0 and row[2] >= 0 and row[3] >= 0, f'Creature {sid} alpha bounds are invalid')
        runtime_assets.add(row[9])
        counts[Path(row[9]).parent.name] += 1
    require(dict(counts) == {'vectors': 1343, 'source-renders': 139, 'hd': 1}, f'Unexpected portrait representation counts: {dict(counts)}')
    audit = load('public/portraits/source-audit.json')
    require(audit['source_count'] == audit['selected_count'] == len(current), 'Portrait audit count mismatch')
    return {'profileCount': len(current), 'unchangedFields': ['root', 'stage', 'physicalScale'], 'runtimeRepresentations': dict(counts),
            'provenanceAssetsCheckedIncludingRetainedAlternatives': len(registry)}


def maps():
    original = load('public/maps/original-manifest.json')['maps']
    source_hd = load('public/maps/original-hd-manifest.json')['maps']
    generated = load('public/maps/hd/manifest.json')['assets']
    native_runtime = load('src/presentation/map-art-assets.json')
    hd_runtime = load('src/presentation/map-hd-assets.json')
    require(len(native_runtime) == 134 and set(native_runtime) == set(original), 'Base map identity inventory changed')
    require(set(generated) == set(hd_runtime), 'AI map manifest and runtime IDs differ')
    for sid, row in source_hd.items():
        manifest_row(row)
        asset(row['baselinePath'], row['baselineSha256'])
        require(row['baselineSha256'] == original[sid]['sha256'], f'Map {sid} source baseline is inconsistent')
    for sid, row in generated.items():
        path = manifest_row(row)
        asset(row['sourcePath'], row['sourceSha256'])
        require(hd_runtime[sid] == {'path': row['path'], 'sha256': row['sha256']}, f'Map {sid} runtime projection differs')
        bitmap = asset(row['bitmapPath'], row['bitmapSha256']) if row.get('bitmapPath') else path
        if bitmap:
            require(dimensions(bitmap) == (row['width'], row['height']), f'Map {sid} generated pixel dimensions differ')
        require(bool(row.get('review')) and bool(row.get('prompt')), f'Map {sid} lacks generation/review provenance')
        if row.get('bitmapPath'):
            runtime_assets.add(row['bitmapPath'])
    combined = native_runtime | hd_runtime
    composition = Counter()
    native_rasters = []
    for sid, row in combined.items():
        path = manifest_row(row)
        runtime_assets.add(row['path'])
        if sid in hd_runtime:
            composition['ai'] += 1
        elif path and path.suffix == '.svg':
            composition['sourceSvg'] += 1
        else:
            composition['nativeRaster'] += 1
            native_rasters.append({'mapId': sid, 'path': row['path'], 'pixels': dimensions(path)})
        evidence = generated.get(sid) or source_hd.get(sid) or original[sid]
        require(row['path'] == evidence['path'] and row['sha256'] == evidence['sha256'], f'Map {sid} runtime has no matching source manifest')
        if path and path.suffix == '.svg':
            validate_svg(path)
    require(composition['sourceSvg'] == 22, f'Expected 22 original source SVG maps: {dict(composition)}')
    if args.allow_pending_map and composition['ai'] != 112:
        report['pending'].append('Map 1 conservative AI replacement is still pending; actual native dimensions are reported.')
    else:
        require(composition['ai'] == 112 and composition['nativeRaster'] == 0, f'Expected final 112 AI and 22 source SVG maps: {dict(composition)}')
    require(combined['10032']['path'].endswith('.svg'), 'Map 10032 must retain its original-vector composite wrapper')
    return {'maps': len(combined), 'composition': dict(composition), 'nativeRasters': native_rasters,
            'newSourceSvgMaps': len(source_hd), 'aiWrappers': [sid for sid, row in generated.items() if row.get('bitmapPath')]}


def source_assets(name):
    rows = load(name)['assets']
    for key, row in rows.items():
        asset(row['baselinePath'], row['baselineSha256'])
        if row.get('path'):
            path = manifest_row(row)
            runtime_assets.add(row['path'])
            require(row.get('sourceReplayRgbaIdentical') is True, f'Missing source replay provenance: {name}/{key}')
            if path and path.suffix == '.svg':
                validate_svg(path)
            if path and row.get('pixelWidth'):
                require(dimensions(path) == (row['pixelWidth'], row['pixelHeight']), f'Pixel metadata differs: {key}')
    return rows


def interface():
    rows = source_assets('public/ui/classic/hd/manifest.json')
    require(sum(bool(row.get('path')) for row in rows.values()) == 47, 'Expected 47 published native UI assets')
    ai = load('public/ui/classic/hd/ai-manifest.json')
    require(len(ai['assets']) == 7, 'Expected seven generated UI images')
    for key, row in ai['assets'].items():
        asset(row['source'], row['sourceImage']['sha256'], row['sourceImage']['bytes'])
        image = asset(row['path'], row['generatedImage']['sha256'], row['generatedImage']['bytes'])
        if image:
            require(dimensions(image) == (row['generatedImage']['width'], row['generatedImage']['height']), f'UI {key} generated dimensions differ')
        runtime = asset(row['runtimePath'], row['runtimeSha256'])
        if runtime and runtime.suffix == '.svg':
            validate_svg(runtime)
        require(row['review']['status'] == 'accepted', f'UI {key} not accepted')
        runtime_assets.update((row['path'], row['runtimePath']))
    asset(ai['originalMapWrapper']['path'], ai['originalMapWrapper']['sha256'])
    hud = load('public/ui/classic/hd/hud-ai-manifest.json')
    require(len(hud['parts']) == 3 and len(hud['assets']) == 2, 'Expected three shared restored HUD bitmap parts and two wrappers')
    require(hud['review']['status'] == 'accepted', 'HUD bitmap restoration lacks an accepted review')
    for part in hud['parts']:
        image = asset(part['path'], part['sha256'])
        require(dimensions(image) == (part['width'], part['height']), 'HUD part dimensions differ from generation metadata')
        require(bool(part['generation']['prompt']), 'HUD part lacks a generation prompt')
        runtime_assets.add(part['path'])
    for key, row in hud['assets'].items():
        source = asset(row['source'], row['sourceSha256'])
        runtime = asset(row['path'], row['sha256'])
        validate_svg(runtime)
        source_root, runtime_root = ET.parse(source).getroot(), ET.parse(runtime).getroot()
        geometry_tags = {f'{{{SVG}}}path', f'{{{SVG}}}use', f'{{{SVG}}}linearGradient'}
        original_geometry = [ET.tostring(node) for node in source_root.iter() if node.tag in geometry_tags]
        restored_geometry = [ET.tostring(node) for node in runtime_root.iter() if node.tag in geometry_tags]
        require(source_root.attrib == runtime_root.attrib and original_geometry == restored_geometry, f'HUD {key} source vector geometry changed')
        require(row['path'] in (ROOT / 'src/battle.css').read_text(), f'HUD {key} is not connected to the battle interface')
        runtime_assets.add(row['path'])
    return {'nativePublished': 47, 'nativeRetainedRecords': len(rows) - 47, 'generatedImages': len(ai['assets']),
            'generatedRuntimeAssets': len({row['runtimePath'] for row in ai['assets'].values()}),
            'hudRestoredSharedParts': len(hud['parts']), 'hudMixedWrappers': len(hud['assets'])}


def skills():
    baseline = baseline_json('public/battle-effects/manifest.json')['effects']
    runtime = load('public/battle-effects/manifest.json')['effects']
    hd = load('public/battle-effects/hd/manifest.json')['effects']
    require(set(runtime) == set(hd) == set(baseline) and len(hd) == 67, 'Skill effect inventory must remain 67')
    frame_total = 0
    encoded = 0
    for sid, row in hd.items():
        main = runtime[sid]
        require({key: value for key, value in main.items() if key != 'hd'} == baseline[sid], f'Skill {sid} native fallback or source timeline changed')
        require(row['sourceSha256'] == main['sourceSha256'] and row['fps'] == main['fps'], f'Skill {sid} source hash/fps mismatch')
        require(row['originalFrames'] == main['frames'] == len(row['frames']), f'Skill {sid} frame count differs')
        require([frame['n'] for frame in row['frames']] == list(range(main['frames'])), f'Skill {sid} frame ordering differs')
        require(main['hd']['path'] == row['path'] and main['hd']['sha256'] == row['sha256'], f'Skill {sid} runtime HD projection differs')
        aggregate = hashlib.sha256(''.join(f"{frame['n']}:{frame['sha256']}\n" for frame in row['frames']).encode()).hexdigest()
        require(aggregate == row['sha256'], f'Skill {sid} aggregate frame hash differs')
        for frame in row['frames']:
            name = f"{row['path']}/{frame['n']}.webp"
            asset(name, frame['sha256'], frame['bytes'])
            require(frame['width'] == main['hd']['width'] and frame['height'] == main['hd']['height'], f'Skill {sid}/{frame["n"]} viewport metadata differs')
            runtime_assets.add(name)
            frame_total += 1
            encoded += frame['bytes']
    require(frame_total == 2128, f'Expected 2128 skill frame references, found {frame_total}')
    return {'effects': len(hd), 'frameReferencesAndHashes': frame_total, 'encodedBytes': encoded,
            'verification': 'Static manifest and byte consistency only; the completed 13-group skill suite was not rerun.'}


def atlas():
    rows = source_assets('public/ui/classic/maps/hd/manifest.json')
    supplemental = {}
    mixed = load('public/ui/classic/maps/hd/mixed-manifest.json')['assets']
    require(len(mixed) == 17, f'Expected 17 final atlas bitmap composites, found {len(mixed)}')
    selected = load('.cache/hd-ui-v44/atlas-ai/manifest.json')['assets']
    require(len(selected) == 12, 'Expected 12 unique restored atlas bitmaps')
    for key, row in selected.items():
        asset(row['outputPath'], row['outputSha256'])
        with Image.open(local(row['inputPath'])) as image:
            require(hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest() == key, f'Atlas bitmap native RGBA hash differs: {row["key"]}')
    for name, row in mixed.items():
        asset(row['baselinePath'], row['baselineSha256'])
        require(row['sourceGeometryAndDisplayListPreserved'] is True and row['sourceBitmapRoundTrip']['passed'] is True,
                f'Atlas composite {name} lacks source registration evidence')
        for bitmap in row['bitmapInputs']:
            chosen = selected[bitmap['sourceRgbaSha256']]
            require(bitmap['enhancedSha256'] == chosen['outputSha256'], f'Atlas composite {name} uses a different reviewed bitmap')
            require(list(dimensions(local(chosen['outputPath']))) == bitmap['enhancedSize'], f'Atlas composite {name} bitmap dimensions differ')
    for file in (PUBLIC / 'ui/classic/maps/hd').glob('*manifest.json'):
        if file.name == 'manifest.json':
            continue
        for key, row in load(str(file)).get('assets', {}).items():
            if not isinstance(row, dict) or not row.get('path'):
                continue
            path = manifest_row(row)
            if row.get('sourcePath') and row.get('sourceSha256'):
                asset(row['sourcePath'], row['sourceSha256'])
            if row.get('bitmapPath'):
                asset(row['bitmapPath'], row['bitmapSha256'])
                runtime_assets.add(row['bitmapPath'])
            if path and path.suffix == '.svg':
                validate_svg(path)
            runtime_assets.add(row['path'])
            supplemental[key] = row
    registry = {row['path']: row for row in rows.values() if row.get('path')}
    registry.update({row['path']: row for row in supplemental.values()})
    effective = {key: row for key, row in rows.items() if row.get('path')} | supplemental
    require(len(effective) == 59, f'Expected 59 final atlas assets, found {len(effective)}')
    graph = load('src/presentation/atlas-graph-assets.json')
    baseline_graph = baseline_json('src/presentation/atlas-graph-assets.json')
    require(set(graph['pages']) == set(baseline_graph['pages']), 'Atlas page identities changed')
    def geometry(value):
        if isinstance(value, dict):
            return {key: '<artwork>' if key in ('background', 'asset', 'backArrow') else geometry(child) for key, child in value.items()}
        if isinstance(value, list):
            return [geometry(child) for child in value]
        return value
    require(geometry(graph) == geometry(baseline_graph), 'Atlas source nodes, labels, links, stacking or geometry changed')
    pages = 0
    for key, page in graph['pages'].items():
        require(page['background'] in registry, f'Atlas {key} runtime background is not represented by an HD manifest')
        asset(page['background'])
        runtime_assets.add(page['background'])
        pages += 1
    require(graph['backArrow'] in registry, 'Atlas back arrow has no source manifest')
    for node in walk(graph):
        if isinstance(node.get('asset'), str):
            require(node['asset'] in registry, f'Atlas node asset has no HD manifest: {node["asset"]}')
            runtime_assets.add(node['asset'])
    require(len(supplemental) == 19, 'Expected 17 atlas composites and two independent AI assets')
    return {'nativeManifestRows': len(rows), 'nativePublished': sum(bool(row.get('path')) for row in rows.values()),
            'supplementalAssets': len(supplemental), 'mixedComposites': len(mixed), 'uniqueEnhancedBitmaps': len(selected),
            'finalAssets': len(effective), 'runtimePages': pages, 'nodeGeometryUnchanged': True}


def cached_sources():
    sources = load('.cache/portrait-v44/sources.json')['sources']
    require(len(sources) == 1483, 'Pinned portrait SWF inventory must contain 1483 IDs')
    source_count = 0
    for sid, row in sources.items():
        asset(f'.cache/portrait-v44/sources/{sid}.swf', row['sha256'], row['bytes'])
        source_count += 1
    for name, key in [('public/portraits/vectors/manifest.json', 'portraits'),
                      ('public/portraits/source-renders/manifest.json', 'portraits')]:
        for sid, row in load(name)[key].items():
            require(row['source_sha256'] == sources[sid]['sha256'], f'Portrait {sid} provenance differs from the pinned SWF')
    for row in load('tools/assets/hd_map_sources_v44.json')['maps']:
        asset(row['cachedSource'], row['sourceSha256'])
        source_count += 1
    configs = [('tools/assets/hd_ui_sources_v44.json', 'public/ui/classic/hd/manifest.json')]
    if not args.skip_atlas:
        configs.append(('tools/assets/hd_atlas_sources_v44.json', 'public/ui/classic/maps/hd/manifest.json'))
    for config_name, manifest_name in configs:
        config = load(config_name)
        manifest = load(manifest_name)['assets']
        pinned = {row['url']: row for row in config['sources'].values()}
        for row in pinned.values():
            asset(row['path'], row['sha256'])
            source_count += 1
        for name, row in manifest.items():
            if row.get('sourceUrl'):
                require(row['sourceUrl'] in pinned and row['sourceSha256'] == pinned[row['sourceUrl']]['sha256'], f'{name} source SWF metadata differs from its pinned input')
    for sid, row in load('public/battle-effects/hd/manifest.json')['effects'].items():
        asset(args.skill_sources / f'{sid}.swf', row['sourceSha256'])
        source_count += 1
    return {'pinnedSwfReferences': source_count, 'portraitSources': len(sources)}


def launchers():
    changed = set(git('diff', '--name-only', args.baseline, '--', 'tools/assets').splitlines())
    changed.update(name for name in git('ls-files', '--others', '--exclude-standard').splitlines() if name.startswith('tools/assets/'))
    commands = []
    for name in sorted(changed):
        path = ROOT / name
        if path.suffix != '.py' or not path.is_file():
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, (ast.List, ast.Tuple)):
                continue
            strings = [part.value for part in node.elts if isinstance(part, ast.Constant) and isinstance(part.value, str)]
            if '-jar' not in strings:
                continue
            for flag in ('-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-cli'):
                require(flag in strings, f'Java launcher missing {flag}: {name}:{node.lineno}')
            commands.append({'file': name, 'line': node.lineno})
    require(bool(commands), 'No changed Java launcher was found')
    return {'checkedCommandLists': len(commands), 'commands': commands,
            'requiredFlags': ['-Djava.awt.headless=true', '-Dapple.awt.UIElement=true', '-cli']}


def runtime_references():
    references = {}
    roots = ('/maps/', '/portraits/', '/ui/classic/hd/', '/ui/classic/maps/hd/', '/battle-effects/hd/')
    for path in (ROOT / 'src').rglob('*'):
        if path.suffix not in ('.ts', '.tsx', '.css', '.json'):
            continue
        for value in re.findall(r'''["'`](/[^"'`\s<>]+)["'`]''', path.read_text()):
            if not value.startswith(roots) or '${' in value or value.endswith('/'):
                continue
            # Template suffixes and directory prefixes are checked through their
            # finite manifest inventories, rather than treated as literal files.
            if not Path(value.split('?', 1)[0]).suffix:
                continue
            references.setdefault(value, []).append(relative(path))
    for value in references:
        asset(value)
        if '/hd/' in value or '/source-renders/' in value or '/vectors/' in value:
            require(value.split('?', 1)[0] in runtime_assets, f'Runtime HD path has no audited manifest row: {value}')
    return {'literalAssetPaths': len(references), 'sourceFiles': len({name for names in references.values() for name in names}),
            'dynamicPaths': 'Finite map, portrait, skill-frame and UI inventories checked in their corresponding manifest sections.'}


def git_policy():
    protected = set(git('diff', '--name-only', args.baseline).splitlines())
    protected.update(git('ls-files', '--others', '--exclude-standard').splitlines())
    protected = {name for name in protected if (ROOT / name).is_file() and
                 (name.startswith(('src/', 'tools/', 'design/')) or (name.startswith('public/') and name.endswith('.json')))}
    # Include ignored candidates too: an accidentally ignored new manifest or
    # source file must not disappear from the audit's own inventory.
    for directory in ('src', 'tools', 'design'):
        for path in (ROOT / directory).rglob('*'):
            if path.is_file() and path.suffix in ('.ts', '.tsx', '.js', '.mjs', '.py', '.json', '.md', '.css', '.html', '.sh', '.yml', '.yaml'):
                protected.add(relative(path))
    protected.update(relative(path) for path in PUBLIC.rglob('*.json'))
    protected.add('tools/verification/hd-assets-v44.py')
    require(not ignored(protected), f'Source/tools/metadata unexpectedly ignored: {sorted(ignored(protected))}')
    blobs = []
    for name in runtime_assets:
        path = local(name)
        rel = relative(path)
        if not path.is_file() or rel in baseline_tree or path.stat().st_size <= 500000:
            continue
        if path.suffix in ('.png', '.jpg', '.jpeg', '.webp') or (path.suffix == '.svg' and re.search(r'<(?:\w+:)?image\b', path.read_text())):
            blobs.append(rel)
    ignored_blobs = ignored(blobs)
    require(set(blobs) <= ignored_blobs, f'Large generated bitmap blobs need ignore rules: {sorted(set(blobs) - ignored_blobs)}')
    tracked = set(git('ls-files').splitlines())
    return {'largeGeneratedBitmapThresholdBytes': 500000, 'largeGeneratedBitmapBlobs': len(blobs),
            'ignoredLargeGeneratedBitmapBlobs': len(ignored_blobs), 'protectedSourceToolMetadataFiles': len(protected),
            'trackableNewSourceToolMetadataFiles': sorted(protected - tracked)}


run('baselineOriginalBytes', original_assets)
run('portraitProfilesAndAssets', portraits)
run('mapRuntimeAndProvenance', maps)
run('nativeAndGeneratedUI', interface)
run('skillReferences', skills)
if args.skip_atlas:
    report['pending'].append('Atlas final composites are still being integrated; atlas verification was explicitly deferred.')
else:
    run('atlasRuntimeAndProvenance', atlas)
run('cachedSourceHashes', cached_sources)
if not args.skip_atlas:
    run('runtimeLiteralReferences', runtime_references)
run('javaLaunchers', launchers)
run('gitAssetPolicy', git_policy)
report['summary'] = {'passedChecks': sum(row['passed'] for row in report['checks'].values()),
                     'totalChecks': len(report['checks']), 'failures': len(report['failures']),
                     'pending': len(report['pending']), 'uniqueSha256FilesRead': digest.cache_info().currsize}
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report['summary']))
for failure in report['failures'][:30]:
    print(f"FAIL {failure['section']}: {failure['message']}")
raise SystemExit(bool(report['failures']))
