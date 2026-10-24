#!/usr/bin/env python3
"""Stroke-only native gate for local redraws of thin-stroke battle cells (V62).

A thin-stroke cell is hard-edged art (redraw class flat or shaded, battle_hd_redraw.classify) whose line-like thin
parts hold at least STROKE_SHARE_MINIMUM of its native coverage: speed lines, lightning, hairlines, dashes and rings. A
thin part is what a 3x3 opening removes (battle_hd_redraw.split_strokes); it is line-like when its skeleton has at
least STROKE_MINIMUM_LENGTH pixels, so dots, sparkles and particle fields are not strokes. On such cells the alpha IoU at alpha 16 is dominated by the antialiasing
pattern of one-pixel lines, and V60's gate (battle_hd_ai_upscale.GATE) rejects about half of even the true vector
renders. The stroke gate keeps V60's measurements (the redraw reduced to native size by the premultiplied box filter
against the original pixels: alpha IoU, premultiplied RGBA mean error, largest 3x3 block error, and the unchanged
stable-interior colour check) with thresholds calibrated on true vector renders of thin-stroke cells
(calibrate_battle_hd_stroke_gate.py): about 95% of them pass. Every other class keeps V60's gate.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd

STROKE_CLASS = 'stroke'
# Line-like thin parts hold at least this share of the native coverage (V61's stroke sample took all thin parts).
STROKE_SHARE_MINIMUM = .5
# Skeleton pixels of a thin part below which it is a dot, not a line.
STROKE_MINIMUM_LENGTH = 4
STROKE_CLASSES = ('flat', 'shaded')
# From battle_hd_stroke_calibration_v62.json (calibrate_battle_hd_stroke_gate.py, seed v62-stroke-gate):
# 400 true vector renders of thin-stroke cells from 226 species; the 2.5th/97.5th percentiles of the calibration half
# (200 cells) pass 95% of it on every check at once, and 93.5% of the held-out half (V60's gate: 58.8% of all 400).
GATE = {'alphaIoU16Minimum': 0.7001, 'premultipliedRgbaMaeMaximum': 46.3354, 'blockErrorMaximum': 70.4406,
        'localColorCheck': 'battle_hd_local_fidelity.local_color_comparison with its default limits'}


def stroke_share(vector):
    """Share of the native coverage in line-like thin parts, from a flat/shaded cell's (palette, memberships)."""
    coverage = np.clip(vector[1].sum(axis=2), 0, 1)
    _, thin, count = rd.split_strokes(coverage)
    if not count:
        return 0.0
    lengths = ndimage.sum(skeletonize(thin > 0), thin, index=np.arange(1, count+1))
    lines = np.isin(thin, 1+np.flatnonzero(lengths >= STROKE_MINIMUM_LENGTH))
    return float(coverage[lines].sum()/max(float(coverage.sum()), 1e-9))


def gate_class(cell_class, vector):
    """'stroke' for a thin-stroke cell, else the redraw class itself; and the stroke share (None without a palette)."""
    if cell_class not in STROKE_CLASSES or vector is None:
        return cell_class, None
    share = round(stroke_share(vector), 6)
    return (STROKE_CLASS if share >= STROKE_SHARE_MINIMUM else cell_class), share


def classify(native):
    """battle_hd_redraw.classify plus the gate class: (redraw class, features with strokeShare, gate class)."""
    cell_class, features, vector = rd.classify(native)
    gated, share = gate_class(cell_class, vector)
    return cell_class, {**features, 'strokeShare': share}, gated


def thresholds(gated):
    """The gate of a gate class: the stroke gate for thin strokes, V60's gate for every other class."""
    return GATE if gated == STROKE_CLASS else ai.GATE


def passes(metrics, gated):
    return ai.gate_passes(metrics, thresholds(gated))
