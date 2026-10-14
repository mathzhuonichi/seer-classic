# Classic trait source and integration

`data/traits.json` extracts 48 zero-star trait definitions from the original client `NewSe.NewSeIdx` table. The source dump is pinned to commit `a00bcdd5800e3bae5df881b4994a170a87541115`, the same commit used by the monster catalog. Each entry preserves its numeric trait ID, original Chinese name and description, effect ID, argument string, and upgrade records through three stars. Five-star later upgrades and the later high-ID traits 反弹 and 吸血 are excluded.

Source: https://github.com/Nattsu39/seer_data/blob/a00bcdd5800e3bae5df881b4994a170a87541115/resource/config/xml/new_se.json

The initial integration supplies hooks for 15 single-type bonuses, 强袭, 精神, 坚硬, 精准, and 回避. The other 28 effects are retained with an explicit unsupported marker until the battle engine implements equivalent trigger conditions. The data extraction is source verified; its hook mappings are implementation proposals and require engine validation. In particular, accuracy modifications are additive percentage points, and single-type bonuses require an exact skill-type match. The client description and parameter values disagree for some upgraded traits; both are retained without silently reconciling them. The initial mappings use only zero-star definitions.

Run `python3 tools/assets/build_traits.py` to regenerate from the checked-in raw client table `tools/assets/new_se.source.json`. The extraction does not alter the battle engine or mechanic module.
