#!/usr/bin/env python3
"""Local redraw of retained raster battle cells (V61): traced regions, fitted strokes and smooth fields.

No model and no network: every redraw is computed from the cell's own native pixels. The class of a cell comes from
the width of its alpha transitions: a hard (antialiased) edge changes within about one pixel, a glow over several.

  vector  hard-edged art. Each native pixel is unmixed into at most two palette colours (palette alpha included, so a
          faint part keeps its faintness) and transparency.
          - Regions (parts at least three pixels wide): the membership fields are interpolated (cubic spline) to an
            analysis grid; the silhouette is the iso-contour whose area equals the native coverage of each connected
            part, and colour regions are where one membership dominates. Each region is traced to closed polygons
            (marching squares) and written as an SVG path. Regions are disjoint, so their coverages add (no seam).
          - Strokes (thinner parts): the skeleton of each thin part is traced to polylines, refined to the
            membership centroid and smoothed; the stroke keeps the part's native coverage at a width of at least one
            native pixel (a sub-pixel line becomes fainter, never thinner and brighter) and is drawn over the regions.
          All paths are rendered by the pipeline's resvg. Flat cells take the palette colours; shaded cells (palette
          residual above FLAT_RESIDUAL) take the smooth colour field below.
  glow    soft art: a smooth premultiplied field (bilinear, then Gaussian) corrected by a few rounds of back-projection
          towards the native pixels. No detail is invented and no edge is hardened.

Every tile is finally clamped, per channel, to the range of each native pixel's 3x3 neighbourhood (bled colour and
alpha), as V60 does: a redraw may sharpen a transition but not overshoot it, so it cannot add a line, ring, halo or
brighter stroke. The tile is in image orientation (row 0 at the top), straight RGBA; a texel under zero alpha keeps the
interpolated colour of the art beside it (the battle shader interpolates straight RGBA).
"""
from __future__ import annotations

import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure
from skimage.morphology import skeletonize

import battle_hd_ai_upscale as ai

ROOT = Path(__file__).resolve().parents[2]
KIND = 'redrawn-raster-override'
REDRAW_MODE = 'redrawn'
RENDERER = ROOT/'tools/assets/render_battle_redraw_svgs.mjs'
# Native pixels of edge replication around a cell before interpolation (the atlas extrudes two).
PAD = 3
# Analysis grid for tracing, in samples per native pixel, and its size limit for large cells.
ANALYSIS_SCALE, ANALYSIS_PIXEL_LIMIT = 8, 4_000_000
# Palette: colours of stable pixels (3x3 range at most PALETTE_STABLE per channel, alpha at least PALETTE_PEAK of the
# part's peak), merged within PALETTE_MERGE; at most PALETTE_SIZE colours.
PALETTE_STABLE, PALETTE_PEAK, PALETTE_MERGE, PALETTE_SIZE = 24, .85, 20, 16
# Silhouette threshold limits (fraction of a membership) for the per-part area rule.
THRESHOLD_RANGE = (.2, .8)
# A part is a region where a 3x3 opening keeps it, else a stroke; strokes are at least STROKE_MIN_WIDTH wide.
STROKE_MIN_WIDTH = 1.0
# Stroke centrelines are resampled every STROKE_SPACING native pixels; widths are smoothed along them (Gaussian sigma).
STROKE_SPACING, STROKE_SMOOTHING = .5, 1.5
# Centreline simplification tolerance and region-boundary smoothing (Gaussian sigma), in native pixels; traced loops
# smaller than MINIMUM_LOOP_AREA (native px^2) are dropped, and palette colours with less membership than
# MINIMUM_COLOUR_PIXELS are merged into the others.
STROKE_TOLERANCE, BOUNDARY_SIGMA, MINIMUM_LOOP_AREA, MINIMUM_COLOUR_PIXELS = .3, .35, .25, 4.0
# Cells with a side below SMALL_SIDE get the wider SMALL_BOUNDARY_SIGMA: a few pixels give no reliable corner.
SMALL_SIDE, SMALL_BOUNDARY_SIGMA = 16, .6
# Boundaries between two colours are smoothed more (Gaussian sigma, native px): their antialiasing is noisier.
SHARE_SIGMA = .6
# Smoothing (native px) of the opacity correction that fades a vector where the native art is fainter.
OPACITY_SIGMA = .75
# Premultiplied alpha (0-255) the native art must exceed the drawn vector by to enter the soft remainder.
REMAINDER_MINIMUM = 8
# The remainder is a smoother field (two back-projection rounds), so it does not bring back the native pixel steps.
REMAINDER_ROUNDS, REMAINDER_SIGMA = 2, .6
# Glow field: Gaussian sigma in native pixels and back-projection rounds.
GLOW_SIGMA, GLOW_ROUNDS = .5, 8
# Classification: mean alpha-transition width (transition pixels per pixel of contour) above which a cell is a glow;
# shaded when the mean premultiplied palette residual (0-255) of visible pixels exceeds FLAT_RESIDUAL.
EDGE_WIDTH_GLOW, EDGE_WIDTH_SOFT, FLAT_RESIDUAL, COMPLEX_COLOURS = 1.2, 2.0, 2.5, 8
# Flat palette colours need a cell at least FLAT_SIDE pixels on its shorter side; smaller cells take the smooth colour.
FLAT_SIDE = 8
NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))
SOFT_CLASSES = ('glow', 'tiny')
# The native gate of a redraw, per class: V60's gate (battle_hd_ai_upscale.GATE, calibrated on 360 known-good vector
# cells) for every class.
GATE = {'default': {key: value for key, value in ai.GATE.items()}}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def method():
    """Everything that determines a redraw besides the cell's own pixels: code digests, library and renderer versions,
    and the parameters. A report built with another method is not reused or published."""
    libraries = {name: metadata.version(name) for name in ('numpy', 'scipy', 'scikit-image', 'pillow')}
    renderer = json.loads((ROOT/'.cache/portrait-v44/runtime/node_modules/@resvg/resvg-js/package.json').read_text())['version']
    names = ('battle_hd_redraw.py', 'render_battle_redraw_svgs.mjs', 'battle_hd_ai_upscale.py', 'battle_hd_local_fidelity.py')
    return {'tool': 'battle_hd_redraw.py', 'code': {name: sha((ROOT/'tools/assets'/name).read_bytes()) for name in names},
            'libraries': libraries, 'renderer': f'@resvg/resvg-js {renderer}', 'parameters': {
                'pad': PAD, 'analysisScale': ANALYSIS_SCALE, 'analysisPixelLimit': ANALYSIS_PIXEL_LIMIT,
                'palette': [PALETTE_STABLE, PALETTE_PEAK, PALETTE_MERGE, PALETTE_SIZE], 'thresholdRange': list(THRESHOLD_RANGE),
                'strokeMinimumWidth': STROKE_MIN_WIDTH, 'strokeSpacing': STROKE_SPACING, 'strokeSmoothing': STROKE_SMOOTHING,
                'strokeTolerance': STROKE_TOLERANCE, 'boundarySigma': BOUNDARY_SIGMA, 'minimumLoopArea': MINIMUM_LOOP_AREA,
                'minimumColourPixels': MINIMUM_COLOUR_PIXELS, 'smallSide': SMALL_SIDE, 'smallBoundarySigma': SMALL_BOUNDARY_SIGMA,
                'opacitySigma': OPACITY_SIGMA, 'remainderMinimum': REMAINDER_MINIMUM, 'glow': [GLOW_SIGMA, GLOW_ROUNDS],
                'remainder': [REMAINDER_SIGMA, REMAINDER_ROUNDS], 'shareSigma': SHARE_SIGMA,
                'edgeWidthGlow': EDGE_WIDTH_GLOW, 'edgeWidthSoft': EDGE_WIDTH_SOFT, 'flatResidual': FLAT_RESIDUAL,
                'complexColours': COMPLEX_COLOURS, 'flatSide': FLAT_SIDE, 'sourceRangeClamp': '3x3 native neighbourhood, bilinear'}}


def gate_passes(metrics, cell_class):
    return ai.gate_passes(metrics, GATE.get(cell_class, GATE['default']))


def premultiplied(native):
    """Premultiplied float RGBA in 0..1."""
    alpha = native[:, :, 3:].astype(np.float64)/255
    return np.concatenate((native[:, :, :3]/255*alpha, alpha), axis=2)


def windows(values):
    """The nine 3x3-neighbourhood shifts of an HxWxC array (edge replicated)."""
    height, width = values.shape[:2]
    padded = np.pad(values, ((1, 1), (1, 1), (0, 0)), mode='edge')
    return np.stack([padded[dy:dy+height, dx:dx+width] for dy in range(3) for dx in range(3)])


def upsample(field, factor, order=3):
    """Pixel-centre aligned interpolation of an HxW(xC) field, padded by PAD replicated pixels on each side."""
    pad = ((PAD, PAD), (PAD, PAD)) + ((0, 0),)*(field.ndim-2)
    zoom = (factor, factor) + (1,)*(field.ndim-2)
    return ndimage.zoom(np.pad(field, pad, mode='edge'), zoom, order=order, mode='nearest', grid_mode=True)


def crop(field, factor):
    margin = PAD*factor
    return field[margin:-margin, margin:-margin]


def box_down(values, factor):
    height, width = values.shape[:2]
    return values.reshape(height//factor, factor, width//factor, factor, -1).mean(axis=(1, 3))


def edge_width(native):
    """Alpha-transition pixels (10-90% of the 5x5 peak) per native pixel of the half-peak contour."""
    alpha = native[:, :, 3].astype(np.float64)/255
    peak = ndimage.maximum_filter(alpha, size=5, mode='nearest')
    ratio = alpha/np.maximum(peak, 1e-6)
    transition = (alpha >= 16/255) & (ratio > .1) & (ratio < .9)
    field = np.pad(ratio*(peak >= 16/255), 1)
    length = sum(float(np.linalg.norm(np.diff(c, axis=0), axis=1).sum()) for c in measure.find_contours(field, .5))
    return int(transition.sum()), round(length, 3), round(float(transition.sum()/max(length, 1)), 4)


def classify(native):
    """The cell's class, its features, and for a vector cell its palette, memberships and unmixing residual.

    tiny     a side under 4 or fewer than 64 pixels (V60's minimum): no reliable outline; smooth field.
    glow     alpha transitions wider than EDGE_WIDTH_GLOW pixels on average: smooth field.
    complex  hard-edged art in COMPLEX_COLOURS or more flat colours (a creature's body): not redrawn here.
    flat     hard-edged, a few flat colours (unmixing residual at most FLAT_RESIDUAL, shorter side >= FLAT_SIDE).
    shaded   hard-edged otherwise: traced outline over the smooth colour field.
    """
    transition, length, width = edge_width(native)
    features = {'transitionPixels': transition, 'contourLength': length, 'edgeWidth': width}
    if ai.too_small(list(native.shape[1::-1])):
        return 'tiny', features, None
    if width > EDGE_WIDTH_SOFT:
        return 'glow', features, None
    colours = palette(native)
    if not len(colours):
        return 'glow', features, None
    colours, memberships, residual = clean_palette(native, colours)
    visible = native[:, :, 3] >= 16
    features.update(paletteColours=len(colours), unmixResidual=round(float(residual[visible].mean()) if visible.any() else 0.0, 4))
    if len(colours) >= COMPLEX_COLOURS:
        return 'complex', features, None
    if width > EDGE_WIDTH_GLOW:
        return 'glow', features, None
    flat = features['unmixResidual'] <= FLAT_RESIDUAL and min(native.shape[:2]) >= FLAT_SIDE
    return ('flat' if flat else 'shaded'), features, (colours, memberships)


def parts(mask):
    """Connected parts (8-connected) of a mask and, for every pixel, the part nearest to it."""
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count == 0:
        return labels, labels, 0
    _, (rows, cols) = ndimage.distance_transform_edt(labels == 0, return_indices=True)
    return labels, labels[rows, cols], count


def palette(native):
    """Flat colours (straight RGBA 0-255) of the stable near-peak pixels of each part, most frequent first."""
    rgba = native.astype(np.int64)
    shifted = windows(rgba)
    stable = ((shifted.max(0)-shifted.min(0)) <= PALETTE_STABLE).all(axis=2)
    labels, _, count = parts(rgba[:, :, 3] >= 16)
    keep = np.zeros(stable.shape, dtype=bool)
    if count:
        for index, value in enumerate(ndimage.maximum(rgba[:, :, 3], labels, index=np.arange(1, count+1)), start=1):
            keep |= (labels == index) & (rgba[:, :, 3] >= PALETTE_PEAK*value)
    candidates = rgba[keep & stable] if (keep & stable).any() else rgba[keep]
    clusters = []
    if len(candidates):
        values, counts = np.unique(candidates, axis=0, return_counts=True)
        for index in np.argsort(-counts, kind='stable'):
            colour = values[index].astype(np.float64)
            for cluster in clusters:
                if np.abs(cluster['sum']/cluster['count']-colour).max() <= PALETTE_MERGE:
                    cluster['sum'] += colour*counts[index]
                    cluster['count'] += int(counts[index])
                    break
            else:
                clusters.append({'sum': colour*counts[index], 'count': int(counts[index])})
    clusters.sort(key=lambda c: -c['count'])
    return np.array([np.rint(c['sum']/c['count']) for c in clusters[:PALETTE_SIZE]], dtype=np.float64).reshape(-1, 4)


def unmix(native, colours):
    """Memberships (HxWxK) of each pixel in at most two palette colours plus transparency, and the residual (0-255)."""
    pixels = premultiplied(native).reshape(-1, 4)
    palette_pm = premultiplied(colours.reshape(1, -1, 4).astype(np.uint8)).reshape(-1, 4)
    count = len(palette_pm)
    best = np.linalg.norm(pixels, axis=1)
    weights = np.zeros((len(pixels), count))
    for i in range(count):
        q = palette_pm[i]
        m = np.clip(pixels@q/max(q@q, 1e-12), 0, 1)
        error = np.linalg.norm(pixels-m[:, None]*q, axis=1)
        better = error < best-1e-9
        best = np.where(better, error, best)
        weights[better] = 0
        weights[better, i] = m[better]
    for i in range(count):
        for j in range(i+1, count):
            q = np.stack((palette_pm[i], palette_pm[j]), axis=1)
            gram = q.T@q
            if abs(np.linalg.det(gram)) < 1e-9:
                continue
            m = np.linalg.solve(gram, q.T@pixels.T).T
            valid = (m >= 0).all(axis=1) & (m.sum(axis=1) <= 1+1e-6)
            error = np.linalg.norm(pixels-m@q.T, axis=1)
            better = valid & (error < best-1/255)
            best = np.where(better, error, best)
            weights[better] = 0
            weights[better, i], weights[better, j] = m[better, 0], m[better, 1]
    height, width = native.shape[:2]
    return weights.reshape(height, width, count), best.reshape(height, width)*255


def analysis_scale(shape):
    scale = ANALYSIS_SCALE
    while scale > 2 and (shape[0]+2*PAD)*(shape[1]+2*PAD)*scale*scale > ANALYSIS_PIXEL_LIMIT:
        scale //= 2
    return scale


def split_strokes(coverage):
    """Region mask (parts a 3x3 opening keeps, with their antialiased ring) and the labelled thin parts."""
    solid = coverage >= .5
    core = ndimage.binary_opening(solid, structure=np.ones((3, 3)))
    zone = ndimage.binary_dilation(core, structure=np.ones((3, 3))) & (coverage > 0)
    thin, count = ndimage.label((coverage >= 8/255) & ~zone, structure=np.ones((3, 3)))
    return zone, thin, count


def silhouette_threshold(coverage, coverage_up, factor):
    """Per-part threshold field: each part's traced area equals its native coverage (pixels nearest to it)."""
    _, nearest, count = parts(coverage >= 1/255)
    nearest_up = np.kron(np.pad(nearest, PAD, mode='edge'), np.ones((factor, factor), dtype=nearest.dtype))
    interior = np.zeros(coverage_up.shape, dtype=bool)
    interior[PAD*factor:-PAD*factor, PAD*factor:-PAD*factor] = True
    threshold = np.full(coverage_up.shape, .5)
    for index in range(1, count+1):
        region = nearest_up == index
        target = int(round(coverage[nearest == index].sum()*factor*factor))
        values = np.sort(coverage_up[region & interior])[::-1]
        if target > 0 and len(values):
            threshold[region] = float(np.clip(values[min(target, len(values))-1], *THRESHOLD_RANGE))
    return threshold


def trace(field, factor):
    """Closed polygons (native units, cell origin) of the region where `field` > 0 on the padded analysis grid."""
    loops = []
    for contour in measure.find_contours(np.pad(field, 1, constant_values=-1), 0.0):
        contour = measure.approximate_polygon(contour, tolerance=.25)
        loop = (contour[:, ::-1]-.5)/factor-PAD
        area = .5*abs(np.dot(loop[:, 0], np.roll(loop[:, 1], 1))-np.dot(loop[:, 1], np.roll(loop[:, 0], 1)))
        if len(contour) >= 4 and area >= MINIMUM_LOOP_AREA:
            loops.append(loop)
    return loops


def region_layers(memberships, boundary_sigma):
    """[(palette index, polygons)] of the region parts: one layer per colour, disjoint."""
    coverage = np.clip(memberships.sum(axis=2), 0, 1)
    if not (coverage > 0).any():
        return []
    factor = analysis_scale(coverage.shape)
    sigma = boundary_sigma*factor
    coverage_up = ndimage.gaussian_filter(upsample(coverage, factor), sigma, mode='nearest')
    inside = coverage_up-silhouette_threshold(coverage, coverage_up, factor)
    share_sigma = max(boundary_sigma, SHARE_SIGMA)*factor
    shares = ndimage.gaussian_filter(upsample(memberships/np.maximum(coverage, 1e-6)[:, :, None], factor),
                                     (share_sigma, share_sigma, 0), mode='nearest')
    layers = []
    for index in range(memberships.shape[2]):
        others = np.delete(shares, index, axis=2).max(axis=2) if memberships.shape[2] > 1 else np.full(inside.shape, -1.0)
        loops = trace(np.minimum(inside, shares[:, :, index]-others), factor)
        if loops:
            layers.append((index, loops))
    return layers


def skeleton_paths(mask):
    """Pixel polylines [(row, col), ...] of a mask's skeleton, split at its ends and junctions."""
    skeleton = skeletonize(mask)
    points = {(int(row), int(col)) for row, col in zip(*np.nonzero(skeleton))}
    def neighbours(p):
        found = []
        for dy, dx in NEIGHBOURS:
            q = (p[0]+dy, p[1]+dx)
            # A diagonal link is redundant when both pixels share a 4-neighbour in the skeleton.
            if q in points and not (dy and dx and ((p[0]+dy, p[1]) in points or (p[0], p[1]+dx) in points)):
                found.append(q)
        return found
    links = {p: neighbours(p) for p in points}
    nodes = sorted(p for p in points if len(links[p]) != 2)
    used, paths = set(), []
    def walk(start, step):
        path, previous, current = [start, step], start, step
        used.add(frozenset((start, step)))
        while len(links[current]) == 2 and current != start:
            following = next((q for q in links[current] if q != previous and frozenset((current, q)) not in used), None)
            if following is None:
                break
            used.add(frozenset((current, following)))
            path.append(following)
            previous, current = current, following
        return path
    for node in nodes:
        if not links[node]:
            paths.append([node])
        for step in links[node]:
            if frozenset((node, step)) not in used:
                paths.append(walk(node, step))
    for point in sorted(points):
        for step in links[point]:
            if frozenset((point, step)) not in used:
                paths.append(walk(point, step))
    return paths


def refine(path, weight):
    """Sub-pixel centreline: each skeleton pixel moves to the weighted centroid of its 3x3 neighbourhood, smoothed."""
    height, width = weight.shape
    points = []
    for row, col in path:
        y0, y1, x0, x1 = max(row-1, 0), min(row+2, height), max(col-1, 0), min(col+2, width)
        block = weight[y0:y1, x0:x1]
        total = block.sum()
        if total <= 0:
            points.append((col+.5, row+.5))
            continue
        ys, xs = np.mgrid[y0:y1, x0:x1]
        points.append((float((xs*block).sum()/total)+.5, float((ys*block).sum()/total)+.5))
    points = np.array(points)
    # Douglas-Peucker straightens the pixel staircase of a straight line but keeps a real corner (a lightning zig-zag).
    return measure.approximate_polygon(points, tolerance=STROKE_TOLERANCE) if len(points) >= 3 else points


def resample(points, spacing):
    """A polyline resampled at about `spacing` native pixels (a single point stays one point)."""
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    total = float(lengths.sum())
    if len(points) < 2 or total == 0:
        return points[:1]
    along = np.concatenate(([0], np.cumsum(lengths)))
    steps = np.linspace(0, total, max(2, int(np.ceil(total/spacing))+1))
    return np.stack((np.interp(steps, along, points[:, 0]), np.interp(steps, along, points[:, 1])), axis=1)


def width_profiles(polylines, weight):
    """Per resampled centreline, its width: the native coverage of the pixels nearest to each sample per unit length.

    End samples take their neighbour's width (their pixels beyond the end belong to the round cap); the profile is
    smoothed along the line and is at least STROKE_MIN_WIDTH. A single point is a dot of the part's area."""
    lines = [resample(line, STROKE_SPACING) for line in polylines]
    samples = np.vstack(lines)
    rows, cols = np.nonzero(weight > 0)
    _, nearest = cKDTree(samples).query(np.stack((cols+.5, rows+.5), axis=1))
    collected = np.bincount(nearest, weights=weight[rows, cols], minlength=len(samples))
    profiles, offset = [], 0
    for line in lines:
        values = collected[offset:offset+len(line)]
        offset += len(line)
        if len(line) == 1:
            profiles.append(np.array([max(STROKE_MIN_WIDTH, 2*np.sqrt(values[0]/np.pi))]))
            continue
        widths = values/np.linalg.norm(np.diff(line, axis=0), axis=1).mean()
        widths[0], widths[-1] = widths[min(1, len(widths)-1)], widths[max(len(widths)-2, 0)]
        profiles.append(np.maximum(STROKE_MIN_WIDTH, ndimage.gaussian_filter1d(widths, STROKE_SMOOTHING/STROKE_SPACING, mode='nearest')))
    return lines, profiles


def disc(centre, radius, sides=16):
    angles = np.linspace(0, 2*np.pi, sides, endpoint=False)
    return np.stack((centre[0]+radius*np.cos(angles), centre[1]+radius*np.sin(angles)), axis=1)


def counterclockwise(polygon):
    area = np.dot(polygon[:, 0], np.roll(polygon[:, 1], -1))-np.dot(polygon[:, 1], np.roll(polygon[:, 0], -1))
    return polygon if area >= 0 else polygon[::-1]


def stroke_outline(line, widths):
    """A variable-width stroke as convex pieces of one orientation: a disc at every sample and a quadrilateral
    between neighbours. Drawn as one nonzero path, the pieces form their union (round joins and caps, no seams)."""
    pieces = [disc(point, width/2) for point, width in zip(line, widths)]
    for (a, b), (wa, wb) in zip(zip(line[:-1], line[1:]), zip(widths[:-1], widths[1:])):
        direction = b-a
        length = np.linalg.norm(direction)
        if length == 0:
            continue
        normal = np.array([-direction[1], direction[0]])/length
        pieces.append(np.array([a+normal*wa/2, b+normal*wb/2, b-normal*wb/2, a-normal*wa/2]))
    return [counterclockwise(piece) for piece in pieces]


def stroke_layers(memberships, thin, count):
    """[(palette index, stroke pieces, mean width)] for each thin part: a variable-width stroke along its skeleton
    whose width follows the part's native coverage (at full opacity, at least STROKE_MIN_WIDTH: a fainter line keeps
    its width and is faded by opacity_correction)."""
    coverage = np.clip(memberships.sum(axis=2), 0, 1)
    layers = []
    for index in range(1, count+1):
        part = thin == index
        weight = np.where(part, coverage, 0)
        if weight.sum() <= 0:
            continue
        polylines = [refine(path, weight) for path in skeleton_paths(part)]
        lines, profiles = width_profiles(polylines, weight)
        pieces = [piece for line, widths in zip(lines, profiles) for piece in stroke_outline(line, widths)]
        colour = int(np.argmax((memberships*part[:, :, None]).sum(axis=(0, 1))))
        layers.append((colour, pieces, float(np.mean(np.concatenate(profiles)))))
    return layers


def path_data(loops, closed=True):
    def points(loop):
        loop = loop if len(loop) > 1 else np.vstack((loop, loop+[1e-3, 0]))
        return 'M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in loop) + (' Z' if closed else '')
    return ' '.join(points(loop) for loop in loops)


def svg_document(width, height, scale, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width*scale}" height="{height*scale}" '
            f'viewBox="0 0 {width} {height}">{body}</svg>')


def region_path(loops, fill='#000', opacity=1.0):
    return f'<path fill="{fill}" fill-opacity="{opacity:.4f}" fill-rule="evenodd" d="{path_data(loops)}"/>'


def stroke_path(pieces, fill='#000', opacity=1.0):
    return f'<path fill="{fill}" fill-opacity="{opacity:.4f}" fill-rule="nonzero" d="{path_data(pieces)}"/>'


def rgb(colour):
    return f'rgb({int(colour[0])},{int(colour[1])},{int(colour[2])})'


def render(svgs, work):
    """Coverage (HxW float 0..1) of each SVG, rendered by the pipeline's resvg, and the renderer's name."""
    work.mkdir(parents=True, exist_ok=True)
    jobs = [{'svg': svg, 'out': str(work/f'{index}.png')} for index, svg in enumerate(svgs)]
    (work/'jobs.json').write_text(json.dumps({'jobs': jobs}))
    result = subprocess.run(['node', str(RENDERER), str(work/'jobs.json')], check=True, capture_output=True, text=True)
    coverages = []
    for job in jobs:
        with Image.open(job['out']) as image:
            coverages.append(np.asarray(image.convert('RGBA'))[:, :, 3].astype(np.float64)/255)
        Path(job['out']).unlink()
    (work/'jobs.json').unlink()
    return coverages, json.loads(result.stdout)['renderer']


def source_range(native, scale):
    """Per-channel minimum and maximum of each native pixel's 3x3 neighbourhood (bled colour and alpha), at `scale`."""
    values = np.concatenate((ai.bleed(native), native[:, :, 3:]), axis=2).astype(np.float64)
    shifted = windows(values)
    # Bilinear between native pixel centres, so the bound itself draws no pixel blocks at a large multiplier.
    return crop(upsample(shifted.min(0), scale, order=1), scale), crop(upsample(shifted.max(0), scale, order=1), scale)


def smooth_colour(native, scale):
    """Straight colour at `scale` (0-255): the cubic interpolation of the bled native colour."""
    return crop(upsample(ai.bleed(native).astype(np.float64), scale), scale)


def straight_tile(premultiplied_tile, fallback, low, high):
    """Clamped uint8 straight RGBA from premultiplied 0..1 floats; zero-alpha texels take the fallback colour."""
    alpha = np.clip(premultiplied_tile[:, :, 3:], 0, 1)
    colour = np.where(alpha > 0, premultiplied_tile[:, :, :3]/np.maximum(alpha, 1e-12)*255, fallback)
    tile = np.concatenate((colour, alpha*255), axis=2)
    tile = np.clip(tile, low, high)
    tile = np.rint(tile)
    tile[:, :, :3] = np.where(tile[:, :, 3:] > 0, tile[:, :, :3], np.clip(np.rint(fallback), low[:, :, :3], high[:, :, :3]))
    return tile.astype(np.uint8)


def glow_field(native, scale, target=None, rounds=None, sigma=None):
    """Smooth premultiplied field, pulled towards the native pixels (or a premultiplied `target`) by a few rounds of
    back-projection."""
    target = premultiplied(native) if target is None else target
    rounds, sigma = (GLOW_ROUNDS if rounds is None else rounds), (GLOW_SIGMA if sigma is None else sigma)
    def smooth(values):
        up = crop(upsample(values, scale, order=1), scale)
        return ndimage.gaussian_filter(up, sigma=(sigma*scale, sigma*scale, 0), mode='nearest')
    field = smooth(target)
    for _ in range(rounds):
        field = np.clip(field+smooth(target-box_down(field, scale)), 0, 1)
        field[:, :, :3] = np.minimum(field[:, :, :3], field[:, :, 3:])
    return field


def vector_layers(colours, memberships, boundary_sigma=BOUNDARY_SIGMA):
    """Coverage path bodies of the region and stroke layers, their paint, and the colour preview body."""
    coverage = np.clip(memberships.sum(axis=2), 0, 1)
    zone, thin, count = split_strokes(coverage)
    bodies, layers, preview = [], [], []
    for index, loops in region_layers(memberships*zone[:, :, None], boundary_sigma):
        bodies.append(region_path(loops))
        layers.append({'kind': 'region', 'colour': colours[index]})
        preview.append(region_path(loops, rgb(colours[index]), colours[index][3]/255))
    for index, pieces, mean_width in stroke_layers(memberships, thin, count):
        bodies.append(stroke_path(pieces))
        layers.append({'kind': 'stroke', 'colour': colours[index], 'meanWidth': round(mean_width, 4)})
        preview.append(stroke_path(pieces, rgb(colours[index]), colours[index][3]/255))
    return bodies, layers, ''.join(preview)


def compose(layers, coverages):
    """Premultiplied tile: region layers add (they are disjoint), stroke layers are drawn over them."""
    total = np.zeros(coverages[0].shape+(4,))
    for layer, coverage in zip(layers, coverages):
        colour = layer['colour']
        alpha = colour[3]/255
        paint = coverage[:, :, None]*np.array([colour[0]/255*alpha, colour[1]/255*alpha, colour[2]/255*alpha, alpha])
        total = total+paint if layer['kind'] == 'region' else paint+total*(1-paint[:, :, 3:])
    total[:, :, 3] = np.minimum(total[:, :, 3], 1)
    total[:, :, :3] = np.minimum(total[:, :, :3], total[:, :, 3:])
    return total


def opacity_correction(native, drawn, scale):
    """Smooth factor (<= 1) that fades the vector where the native art is fainter than drawn (a fading stroke).

    Measured where the native-size render covers at least half a pixel, carried to the rest from the nearest such
    pixel, smoothed by OPACITY_SIGMA and interpolated bilinearly to `scale`."""
    expected = drawn[:, :, 3]
    valid = expected >= .5
    if not valid.any():
        return np.ones((native.shape[0]*scale, native.shape[1]*scale))
    ratio = np.clip(native[:, :, 3]/255/np.maximum(expected, 1e-6), 0, 1)
    _, (rows, cols) = ndimage.distance_transform_edt(~valid, return_indices=True)
    ratio = ndimage.gaussian_filter(ratio[rows, cols], OPACITY_SIGMA, mode='nearest')
    return crop(upsample(ratio, scale, order=1), scale)


def soft_remainder(native, drawn, scale):
    """The vector plus a smooth field of what it left out: the native art's positive premultiplied remainder above
    REMAINDER_MINIMUM (a faint fringe or glow beside a hard stroke), rebuilt as a glow. Nothing is sharpened here."""
    remainder = premultiplied(native)-box_down(drawn, scale)
    remainder = np.where(remainder[:, :, 3:] > REMAINDER_MINIMUM/255, np.clip(remainder, 0, None), 0)
    remainder[:, :, :3] = np.minimum(remainder[:, :, :3], remainder[:, :, 3:])
    if not remainder[:, :, 3].any():
        return drawn
    total = drawn+glow_field(native, scale, remainder, REMAINDER_ROUNDS, REMAINDER_SIGMA)
    total[:, :, 3] = np.minimum(total[:, :, 3], 1)
    total[:, :, :3] = np.minimum(total[:, :, :3], total[:, :, 3:])
    return total


def clean_palette(native, colours):
    """Palette and memberships without colours that hold less than MINIMUM_COLOUR_PIXELS of membership."""
    memberships, residual = unmix(native, colours)
    keep = memberships.sum(axis=(0, 1)) >= MINIMUM_COLOUR_PIXELS
    if keep.any() and not keep.all():
        colours = colours[keep]
        memberships, residual = unmix(native, colours)
    return colours, memberships, residual


def redraw(native, scale, work):
    """A redrawn tile of `native` at `scale`, or None when nothing could be traced.

    Returns {'class', 'method', 'tile', 'features'} and, for traced cells, 'svg' (the colour preview at `scale`),
    'masks' (the coverage SVGs rendered at `scale`), 'layers' and 'renderer'.
    """
    cell_class, features, vector = classify(native)
    if cell_class == 'complex':
        return {'class': 'complex', 'method': None, 'tile': None, 'features': features}
    low, high = source_range(native, scale)
    fallback = smooth_colour(native, scale)
    if cell_class in ('glow', 'tiny'):
        tile = straight_tile(glow_field(native, scale), fallback, low, high)
        return {'class': cell_class, 'method': 'smooth-field', 'tile': tile, 'features': features}
    colours, memberships = vector
    small = min(native.shape[:2]) < SMALL_SIDE
    bodies, layers, preview = vector_layers(colours, memberships, SMALL_BOUNDARY_SIGMA if small else BOUNDARY_SIGMA)
    if not bodies:
        return None
    height, width = native.shape[:2]
    masks = [svg_document(width, height, scale, body) for body in bodies]
    coverages, renderer = render(masks+[svg_document(width, height, 1, body) for body in bodies], work)
    premultiplied_tile = compose(layers, coverages[:len(bodies)])
    premultiplied_tile *= opacity_correction(native, compose(layers, coverages[len(bodies):]), scale)[:, :, None]
    premultiplied_tile = soft_remainder(native, premultiplied_tile, scale)
    if cell_class == 'shaded':
        alpha = premultiplied_tile[:, :, 3:]
        premultiplied_tile = np.concatenate((fallback/255*alpha, alpha), axis=2)
    tile = straight_tile(premultiplied_tile, fallback, low, high)
    return {'class': cell_class, 'method': 'traced-vector', 'tile': tile, 'features': features,
            'svg': svg_document(width, height, scale, preview), 'masks': masks, 'renderer': renderer,
            'layers': [{**layer, 'colour': [int(v) for v in layer['colour']]} for layer in layers]}
