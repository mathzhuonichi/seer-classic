#!/usr/bin/env python3
"""Stroke-only native gate for local redraws of thin-stroke battle cells (V62).

A thin-stroke cell is hard-edged art (redraw class flat or shaded, battle_hd_redraw.classify) whose thin parts
(battle_hd_redraw.split_strokes: what a 3x3 opening removes) hold at least STROKE_SHARE_MINIMUM of its native coverage:
speed lines, lightning, hairlines and dashes. On such cells the alpha IoU at alpha 16 is dominated by the antialiasing
pattern of one-pixel lines, and V60's gate (battle_hd_ai_upscale.GATE) rejects about half of even the true vector
renders. The stroke gate keeps V60's measurements (the redraw reduced to native size by the premultiplied box filter
against the original pixels: alpha IoU, premultiplied RGBA mean error, largest 3x3 block error, and the unchanged
stable-interior colour check) with thresholds calibrated on true vector renders of thin-stroke cells
(calibrate_battle_hd_stroke_gate.py): about 95% of them pass. Every other class keeps V60's gate.
"""
from __future__ import annotations

import numpy as np

import battle_hd_ai_upscale as ai
import battle_hd_redraw as rd

STROKE_CLASS = 'stroke'
# Thin parts hold at least this share of the native coverage (the V61 calibration's stroke sample uses the same rule).
STROKE_SHARE_MINIMUM = .5
STROKE_CLASSES = ('flat', 'shaded')
# From artifacts/battle-hd-v62/stroke-calibration.json (calibrate_battle_hd_stroke_gate.py, seed v62-stroke-gate):
# 400 true vector renders of thin-stroke cells from 211 species; the 2nd/98th percentiles of the calibration half
# (200 cells) pass 95% of it on every check at once, and 96% of the held-out half.
GATE = {'alphaIoU16Minimum': 0.6561, 'premultipliedRgbaMaeMaximum': 46.2163, 'blockErrorMaximum': 71.951,
        'localColorCheck': 'battle_hd_local_fidelity.local_color_comparison with its default limits'}


def stroke_share(vector):
    """Share of the native coverage in thin parts, from a flat/shaded cell's (palette, memberships)."""
    coverage = np.clip(vector[1].sum(axis=2), 0, 1)
    _, thin, _ = rd.split_strokes(coverage)
    return float(coverage[thin > 0].sum()/max(float(coverage.sum()), 1e-9))


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
