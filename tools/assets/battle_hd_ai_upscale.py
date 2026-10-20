#!/usr/bin/env python3
"""Local AI super-resolution of retained original raster battle cells (V60).

Runs the pinned Real-ESRGAN ncnn-Vulkan release on the local GPU; no image leaves the machine. The model sees an
opaque RGB image whose low-alpha pixels carry the colour of the nearest visible art, so no dark fringe can enter an
edge, and the alpha channel separately as a grey image. Both are padded by edge replication, as the atlas extrudes
its cells, and cropped after the model. The tile takes the model's alpha at silhouette edges and an interpolated
alpha in glows and soft gradients, which the model would harden or round to zero. A 2x tile is a premultiplied box
reduction of the 4x result; an 8x tile is the 4x result enlarged 2x by premultiplied Lanczos (the model's own detail
stops at 4x; a second model pass measured worse against the vector renders).

The gate reduces a tile to the native cell size with the same premultiplied box filter and compares it with the
original pixels: alpha IoU, premultiplied RGBA mean error, the largest mean error of a 3x3 block, and the pipeline's
stable-interior colour check (battle_hd_local_fidelity). The thresholds come from calibrate_battle_hd_ai_gates.py,
which measures known-good original-vector cells with this gate.
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image

from battle_hd_local_fidelity import local_color_comparison

ROOT = Path(__file__).resolve().parents[2]
# Report kind of a V60 species and the mode of its AI cells, counted apart from original-source cells.
KIND = 'ai-upscaled-raster-override'
AI_MODE = 'ai-upscaled'
TOOL_DIR = ROOT/'.cache/tools/realesrgan-ncnn-vulkan-20220424'
UPSCALER = {
    'tool': 'realesrgan-ncnn-vulkan', 'release': 'xinntao/Real-ESRGAN v0.2.5.0, ncnn-Vulkan build 20220424 (macOS universal)',
    'archive': 'realesrgan-ncnn-vulkan-20220424-macos.zip',
    'archiveUrl': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip',
    'archiveSha256': 'e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a',
    'binarySha256': 'c1c35d92079085de96b9d547fd7e4464bc8a2e9ccf28d7b8c712d72ade91b7cc',
    'model': 'realesrgan-x4plus-anime', 'modelScale': 4,
    'modelParamSha256': '2b8fb6e0ae4d2d85704ca08c119a2f5ea40add4f2ecd512eb7f4cd44b6127ed4',
    'modelBinSha256': 'fe01c269cfd10cdef8e018ab66ebe750cf79c7af4d1f9c16c737e1295229bacc',
    'arguments': ['-s', '4', '-t', '0', '-j', '1:1:1', '-f', 'png'],
}
# Edge-replicated context around a cell, in native pixels.
PAD = 8
# Pixels below this alpha carry no reliable straight colour; their colour is filled from visible neighbours.
COLOUR_ALPHA = 4
SCALES = (2, 4, 8)
ALPHA_MODES = ('model', 'lanczos', 'blend', 'lifted', 'edge')
EIGHT_MODES = ('second-pass', 'lanczos')
# Chosen by calibrate_battle_hd_ai_gates.py against the original-vector renders of known-good cells.
ALPHA_MODE = 'edge'
EIGHT_MODE = 'lanczos'
# 'blend': the model's alpha where the interpolated alpha is at least BLEND_HIGH, the interpolated alpha below
# BLEND_LOW (faint glows the model would round to zero), linear between.
BLEND_LOW, BLEND_HIGH = 16, 64
# 'edge': the model's alpha where the native alpha changes by at least EDGE_HIGH within a 3x3 neighbourhood (a
# silhouette edge), the interpolated alpha where it changes by at most EDGE_LOW (glows and soft gradients, which the
# model would harden), linear between.
EDGE_LOW, EDGE_HIGH = 64, 160
# Thresholds from artifacts/battle-hd-ai-v60/calibration.json: the 5th (IoU) and 95th (errors) percentiles of 360
# known-good original-vector cells measured by this gate. An AI tile must agree with the original raster at least as
# well as 95% of real source renders do.
GATE = {'alphaIoU16Minimum': 0.8664, 'premultipliedRgbaMaeMaximum': 21.5582, 'blockErrorMaximum': 74.4794,
        'localColorCheck': 'battle_hd_local_fidelity.local_color_comparison with its default limits'}
# A cell this small gives the model nothing to work with; it keeps its original pixels.
MINIMUM_SIDE, MINIMUM_AREA = 4, 64


def sha(data):
    return hashlib.sha256(data).hexdigest()


def method():
    """Everything that determines an AI tile besides the cell's own pixels."""
    return {**UPSCALER, 'padding': PAD, 'colourAlphaMinimum': COLOUR_ALPHA, 'alphaMode': ALPHA_MODE,
            'alphaBlend': [BLEND_LOW, BLEND_HIGH], 'alphaEdge': [EDGE_LOW, EDGE_HIGH], 'eightTimesMode': EIGHT_MODE,
            'reduction': 'premultiplied box filter'}


def verify_upscaler():
    """The pinned binary and model, or an error naming what changed."""
    checks = {'realesrgan-ncnn-vulkan': UPSCALER['binarySha256'],
              f'models/{UPSCALER["model"]}.param': UPSCALER['modelParamSha256'],
              f'models/{UPSCALER["model"]}.bin': UPSCALER['modelBinSha256']}
    for name, expected in checks.items():
        path = TOOL_DIR/name
        if not path.exists() or sha(path.read_bytes()) != expected:
            raise ValueError(f'Pinned upscaler file missing or changed: {path}')
    return UPSCALER


def png_bytes(array):
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format='PNG', compress_level=1)
    return buffer.getvalue()


def bleed(rgba):
    """Straight RGB whose low-alpha pixels take the alpha-weighted colour of the nearest visible pixels."""
    rgb = rgba[:, :, :3].astype(np.float64)
    known = rgba[:, :, 3] >= COLOUR_ALPHA
    if not known.any():
        return np.zeros_like(rgba[:, :, :3])
    weight = np.where(known, rgba[:, :, 3]/255, 0.0)
    colour = rgb*weight[:, :, None]
    unknown = ~known
    height, width = unknown.shape
    while unknown.any():
        padded_colour, padded_weight = np.pad(colour, ((1, 1), (1, 1), (0, 0))), np.pad(weight, 1)
        total = sum(padded_colour[dy:dy+height, dx:dx+width] for dy in range(3) for dx in range(3))
        mass = sum(padded_weight[dy:dy+height, dx:dx+width] for dy in range(3) for dx in range(3))
        reached = unknown & (mass > 0)
        colour[reached] = total[reached]/mass[reached, None]
        weight[reached] = 1
        unknown &= ~reached
    result = colour/np.maximum(weight, 1e-12)[:, :, None]
    result[known] = rgb[known]
    return np.clip(np.rint(result), 0, 255).astype(np.uint8)


def grey(channel):
    return np.repeat(channel[:, :, None], 3, axis=2)


def model_inputs(rgba):
    """Edge-padded model inputs: bled RGB, alpha, and alpha lifted by a square root."""
    alpha = np.pad(rgba[:, :, 3], PAD, mode='edge')
    lifted = np.clip(np.rint(np.sqrt(alpha/255)*255), 0, 255).astype(np.uint8)
    return {'rgb': np.pad(bleed(rgba), ((PAD, PAD), (PAD, PAD), (0, 0)), mode='edge'), 'alpha': grey(alpha), 'lifted': grey(lifted)}


def run_model(images, cache, load=True):
    """4x model output for each {key: HxWx3 uint8}, cached by input content; returns ({key: array}, {key: name})."""
    verify_upscaler()
    cache.mkdir(parents=True, exist_ok=True)
    encoded = {key: png_bytes(image) for key, image in images.items()}
    names = {key: sha(data) for key, data in encoded.items()}
    pending = {name: key for key, name in names.items() if not (cache/f'{name}.png').exists()}
    if pending:
        with tempfile.TemporaryDirectory(dir=cache.parent) as temporary:
            source, target = Path(temporary)/'in', Path(temporary)/'out'
            source.mkdir()
            target.mkdir()
            for name, key in pending.items():
                (source/f'{name}.png').write_bytes(encoded[key])
            command = [str(TOOL_DIR/'realesrgan-ncnn-vulkan'), '-i', str(source), '-o', str(target),
                       '-n', UPSCALER['model'], '-m', str(TOOL_DIR/'models'), *UPSCALER['arguments']]
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=14400)
            for name, key in pending.items():
                output = target/f'{name}.png'
                with Image.open(output) as result:
                    if result.size != (images[key].shape[1]*4, images[key].shape[0]*4):
                        raise ValueError(f'Model output {name} has size {result.size}')
                shutil.move(output, cache/f'{name}.png')
    result = {}
    for key, name in names.items() if load else ():
        with Image.open(cache/f'{name}.png') as image:
            result[key] = np.asarray(image.convert('RGB'))
    return result, names


def box(image, factor):
    """Plain box reduction of an opaque uint8 image."""
    height, width = image.shape[:2]
    return np.rint(image.reshape(height//factor, factor, width//factor, factor, -1).mean(axis=(1, 3))).astype(np.uint8)


def model_kinds():
    return ('rgb', 'lifted') if ALPHA_MODE == 'lifted' else ('rgb',) if ALPHA_MODE == 'lanczos' else ('rgb', 'alpha')


def prepare(cells, scales, cache, kinds=None):
    """Fill the model cache for {key: native RGBA} at {key: scale} without keeping the outputs."""
    kinds = kinds or model_kinds()
    inputs = {(key, kind): image for key, rgba in cells.items() for kind, image in model_inputs(rgba).items() if kind in kinds}
    run_model(inputs, cache, load=False)
    eight = {item: image for item, image in inputs.items() if scales.get(item[0]) == 8}
    if eight and EIGHT_MODE == 'second-pass':
        first, _ = run_model(eight, cache)
        run_model({item: box(image, 2) for item, image in first.items()}, cache, load=False)


def model_outputs(cells, scales, cache, kinds=None, second_pass=None):
    """Padded model outputs per cell: 4x for every cell and, for 8x cells, a second pass (EIGHT_MODE 'second-pass')."""
    kinds = kinds or model_kinds()
    second_pass = EIGHT_MODE == 'second-pass' if second_pass is None else second_pass
    all_inputs = {key: model_inputs(rgba) for key, rgba in cells.items()}
    inputs = {(key, kind): images[kind] for key, images in all_inputs.items() for kind in kinds}
    first, first_names = run_model(inputs, cache)
    second_inputs = {(key, kind): box(first[(key, kind)], 2) for key, kind in inputs if second_pass and scales.get(key) == 8}
    second, second_names = run_model(second_inputs, cache) if second_inputs else ({}, {})
    outputs = {key: {'native': rgba, 'inputs': all_inputs[key],
                     4: {kind: first[(key, kind)] for kind in kinds},
                     'names': {kind: first_names[(key, kind)] for kind in kinds}} for key, rgba in cells.items()}
    for (key, kind), image in second.items():
        outputs[key].setdefault(8, {})[kind] = image
        outputs[key]['names'][f'{kind}-second'] = second_names[(key, kind)]
    return outputs


def straight(premultiplied, fallback=0):
    """Straight uint8 RGBA from premultiplied 0-255 floats; fully transparent pixels take the `fallback` colour."""
    alpha = np.clip(np.rint(premultiplied[:, :, 3]), 0, 255)
    rgb = premultiplied[:, :, :3]*255/np.maximum(premultiplied[:, :, 3:], 1e-9)
    rgb = np.where(alpha[:, :, None] > 0, rgb, fallback)
    return np.concatenate((np.clip(np.rint(rgb), 0, 255), alpha[:, :, None]), axis=2).astype(np.uint8)


def premultiplied(rgba):
    alpha = rgba[:, :, 3:].astype(np.float64)/255
    return np.concatenate((rgba[:, :, :3]*alpha, alpha*255), axis=2)


def reduce_premultiplied(rgba, factor):
    """Box reduction by an integer factor in premultiplied space; straight uint8 RGBA out.

    A pixel that ends fully transparent keeps the plain mean of the straight colour: the battle renderer interpolates
    straight RGBA, so a transparent texel next to the art must carry its colour, not black (no dark fringe).
    """
    if factor == 1:
        return rgba
    height, width = rgba.shape[:2]
    if height % factor or width % factor:
        raise ValueError('Reduction factor must divide the tile size')
    def blocks(values):
        return values.reshape(height//factor, factor, width//factor, factor, -1).mean(axis=(1, 3))
    return straight(blocks(premultiplied(rgba)), blocks(rgba[:, :, :3].astype(np.float64)))


def interpolated_alpha(alpha, factor):
    """Lanczos enlargement of a padded native alpha channel (no AI)."""
    image = Image.fromarray(alpha[:, :, 0]).resize((alpha.shape[1]*factor, alpha.shape[0]*factor), Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float64)


def alpha_at(output, factor, alpha_mode):
    if alpha_mode == 'lanczos':
        return interpolated_alpha(output['inputs']['alpha'], factor)
    if alpha_mode == 'lifted':
        return (output[factor]['lifted'].astype(np.float64).mean(axis=2)/255)**2*255
    model = output[factor]['alpha'].astype(np.float64).mean(axis=2)
    if alpha_mode == 'model':
        return model
    smooth = interpolated_alpha(output['inputs']['alpha'], factor)
    if alpha_mode == 'edge':
        weight = edge_weight(output['inputs']['alpha'][:, :, 0], factor)
    else:
        weight = np.clip((smooth-BLEND_LOW)/(BLEND_HIGH-BLEND_LOW), 0, 1)
    return weight*model+(1-weight)*np.clip(smooth, 0, 255)


def edge_weight(alpha, factor):
    """1 at native silhouette edges, 0 in smooth alpha, bilinearly enlarged by `factor`."""
    height, width = alpha.shape
    padded = np.pad(alpha.astype(np.float64), 1, mode='edge')
    windows = [padded[dy:dy+height, dx:dx+width] for dy in range(3) for dx in range(3)]
    spread = np.max(windows, axis=0)-np.min(windows, axis=0)
    weight = np.clip((spread-EDGE_LOW)/(EDGE_HIGH-EDGE_LOW), 0, 1).astype(np.float32)
    return np.asarray(Image.fromarray(weight, 'F').resize((width*factor, height*factor), Image.Resampling.BILINEAR), dtype=np.float64)


def tile_at(output, scale, alpha_mode=None, eight_mode=None):
    """Straight RGBA tile at `scale` from a cell's model outputs."""
    alpha_mode, eight_mode = alpha_mode or ALPHA_MODE, eight_mode or EIGHT_MODE
    factor = 8 if scale == 8 and eight_mode == 'second-pass' else 4
    crop = PAD*factor
    # The model's colour stays under transparent texels too: it continues the bled colour, so no dark fringe.
    rgb = output[factor]['rgb'][crop:-crop, crop:-crop]
    alpha = np.clip(np.rint(alpha_at(output, factor, alpha_mode)), 0, 255).astype(np.uint8)[crop:-crop, crop:-crop]
    tile = np.concatenate((rgb, alpha[:, :, None]), axis=2)
    if scale == 8 and factor == 4:
        size = (tile.shape[1]*2, tile.shape[0]*2)
        channels = [np.asarray(Image.fromarray(tile[:, :, c].astype(np.float32), 'F').resize(size, Image.Resampling.LANCZOS))
                    for c in range(4)]
        return np.clip(np.rint(np.stack(channels, axis=2)), 0, 255).astype(np.uint8)
    return reduce_premultiplied(tile, factor//scale) if factor > scale else tile


def gate_metrics(original, tile, scale):
    """Measurements of a `scale`x tile reduced to the native cell size against the original native pixels."""
    native = reduce_premultiplied(tile, scale)
    a, b = premultiplied(original), premultiplied(native)
    alpha_a, alpha_b = original[:, :, 3] > 16, native[:, :, 3] > 16
    foreground = alpha_a | alpha_b
    error = np.abs(a-b).mean(axis=2)
    height, width = error.shape
    block = (sum(error[dy:dy+height-2, dx:dx+width-2] for dy in range(3) for dx in range(3))/9
             if height >= 3 and width >= 3 else error)
    local = local_color_comparison(original, native)
    return {'alphaIoU16': round(float((alpha_a & alpha_b).sum()/max(1, foreground.sum())), 6),
            'premultipliedRgbaMae': round(float(error[foreground].mean()) if foreground.any() else 0.0, 6),
            'blockError': round(float(block.max()), 6), 'localColorPassed': local['passed'],
            'localLargestBadRegionPixels': local['largestBadRegionPixels'], 'localStablePixels': local['stablePixels']}


def gate_passes(metrics, gate=None):
    gate = gate or GATE
    return bool(metrics['alphaIoU16'] >= gate['alphaIoU16Minimum']
                and metrics['premultipliedRgbaMae'] <= gate['premultipliedRgbaMaeMaximum']
                and metrics['blockError'] <= gate['blockErrorMaximum'] and metrics['localColorPassed'])


def too_small(size):
    return min(size) < MINIMUM_SIDE or size[0]*size[1] < MINIMUM_AREA
