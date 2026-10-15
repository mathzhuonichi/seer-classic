"""Reject changed interior colors that a whole-cell average can conceal."""
from __future__ import annotations

import numpy as np


def local_color_comparison(reference, candidate):
    """Compare stable opaque interiors, allowing one pixel of registration.

    Inputs are equally sized uint8 RGBA arrays. A stable source pixel has a
    fully opaque 3x3 neighborhood and at most 24 levels of variation in each
    channel. Every such pixel searches the candidate's 3x3 neighborhood for an
    opaque color match. Four-connected mismatches distinguish a real changed
    feature from isolated antialiasing or compression noise.
    """
    if reference.shape != candidate.shape or reference.ndim != 3 or reference.shape[2] != 4:
        raise ValueError('Local comparison requires equally sized RGBA images')
    height, width = reference.shape[:2]
    result = {'method': 'Stable opaque interior RGB with one-pixel registration tolerance',
              'stableRangeLimit': 24, 'sourceAlphaMinimum': 250, 'candidateAlphaMinimum': 240,
              'colorErrorLimit': 24, 'rejectedConnectedRegionMinimum': 6,
              'stablePixels': 0, 'badPixels': 0, 'largestBadRegionPixels': 0, 'passed': True}
    if min(width, height) < 3:
        return result
    source = reference.astype(np.int16, copy=False)
    rendered = candidate.astype(np.int16, copy=False)
    minimum = np.full((height-2, width-2, 3), 255, dtype=np.int16)
    maximum = np.zeros_like(minimum)
    alpha_minimum = np.full((height-2, width-2), 255, dtype=np.int16)
    best = np.full((height-2, width-2), np.inf, dtype=np.float32)
    center = source[1:-1, 1:-1, :3]
    for dy in range(3):
        for dx in range(3):
            neighborhood = source[dy:dy+height-2, dx:dx+width-2]
            minimum = np.minimum(minimum, neighborhood[:, :, :3])
            maximum = np.maximum(maximum, neighborhood[:, :, :3])
            alpha_minimum = np.minimum(alpha_minimum, neighborhood[:, :, 3])
            sample = rendered[dy:dy+height-2, dx:dx+width-2]
            error = np.abs(center-sample[:, :, :3]).mean(axis=2)
            best = np.minimum(best, np.where(sample[:, :, 3] >= 240, error, np.inf))
    stable = (alpha_minimum >= 250) & ((maximum-minimum).max(axis=2) <= 24)
    bad = stable & (best > 24)
    result['stablePixels'] = int(stable.sum())
    result['badPixels'] = int(bad.sum())
    remaining = bad.copy()
    largest = 0
    for y, x in zip(*np.nonzero(bad)):
        if not remaining[y, x]:
            continue
        remaining[y, x] = False
        stack, count = [(int(y), int(x))], 0
        while stack:
            py, px = stack.pop()
            count += 1
            for ny, nx in ((py-1, px), (py+1, px), (py, px-1), (py, px+1)):
                if 0 <= ny < height-2 and 0 <= nx < width-2 and remaining[ny, nx]:
                    remaining[ny, nx] = False
                    stack.append((ny, nx))
        largest = max(largest, count)
    result['largestBadRegionPixels'] = largest
    result['passed'] = largest < 6
    return result
