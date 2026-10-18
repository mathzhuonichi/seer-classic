# Unity assets and open-source SWF verification

The Unity asset route is operational on the current Mac. A real official Rei bundle was downloaded and decoded by two independent libraries, which agreed on all animation sequences and every atlas pixel. The ordinary Flash route also passed a fresh targeted FFDec export. These results support recovering original animation assets; they do not recover the classic damage routine.

At the time of this initial audit, 323 of the 324 retained single-type cells agreed with the official Unity table; fighting against evil was 0.5 in the official table and 1 locally. No battle or type data was changed by that audit. The user subsequently instructed that official data take precedence, and the coefficient was corrected. All 324 cells now match. The historical boundary remains unresolved; see [official-game-feel-resources.md](official-game-feel-resources.md) for that correction and actual browser animation/audio verification.

## User reference and attribution boundary

The supplied [Bilibili video](https://www.bilibili.com/video/BV1y5ea6QEpW/) is titled `deepseek花费300亿token制作的赛尔号 宝可梦 洛克王国 游戏勇者之塔推一推`, by `流川少女`, with a duration of 367 seconds. Its public description concerns unconnected Pokemon models and animation placement. Its public metadata and page were inspected; the accessible player API exposed no subtitle track. The page required sign-in to read all 72 comments. No complete viewing, complete technical-comment review, source attribution for the author's game, or validation of its formulas is claimed. The tools below were found and verified independently; they are not attributed to the video author.

## Audited tools

| Tool | Version or source pin | Actual operation and result |
|---|---|---|
| [Albi0](https://github.com/SeerAPI/albi0) | PyPI 0.6.0; source `bf66b160492f59f9a7eee88f918c9265bfa69a26` | Listed the Newseer updaters, read official manifests and downloaded three selected animation resources plus one configuration bundle. All downloads stayed in the ignored audit workspace. |
| [Unity SWF bundle parser](https://github.com/Nattsu39/seer-pet-viewer/tree/b2135046c48245795bc218726fcbad1ea005f02d/packages/swf-bundle) | `@seer-pet-anim/swf-bundle` 0.3.1; `@arkntools/unity-js` 5.3.0 | Decoded the real SwfClipAsset, geometry, labels, atlas and shared materials. The tested Rei produced no material warnings. |
| [UnityPy](https://github.com/K0lb3/UnityPy) | 1.24.2 | Independently read the same asset's type tree and decoded its Texture2D. Frame rate, sequence lengths, labels, image dimensions and all RGBA pixels agreed with the JavaScript decoder. |
| [FFDec](https://github.com/jindrapetrik/jpexs-decompiler) | Existing local 26.3.0 | Re-exported the official decoded core's AttackValue class. Its bytes exactly matched the previously cached decompilation. The original game and Flash scripts were not executed. |
| [SWF reconstruction](https://github.com/Nattsu39/seer-pet-viewer/tree/b2135046c48245795bc218726fcbad1ea005f02d/packages/swf-rebuild) | `@seer-pet-anim/swf-rebuild` 0.2.0 | Attempted reconstruction using the existing original Rei SWF and matching Unity clip/material bundle. It failed at the original-SWF transform guard. No rebuilt SWF was produced. |

FFDec reads actual Flash display lists and bytecode. The Unity parser reads preconverted meshes, textures and animation sequences inside UnityFS bundles. The reconstruction tool also requires the original SWF; it cannot manufacture missing original scripts from the animation package.

The reconstruction failure was `Source action/idle placement must use translation only`. The checked guard rejects nonidentity scale or skew in a source action/idle placement. This is a concrete compatibility limit on the tested Rei source, not a failure to decode its Unity animation. A compatible source or a separately validated extension would be needed before using this tool to replace original SWFs.

## Official animation specimen

The official [PetAnimPackage manifest](https://newseer.61.com/Assets/StandaloneWindows64/PetAnimPackage/PackageManifest_PetAnimPackage_20260924034650.bytes) reports version `20260924034650`, 6,326 asset entries and 6,246 bundles. Its SHA-256 is `0cc084c17aff787208dc33f4ffe898785173fecf7b5f9eb35f216cc5ee303184`. `Assets/Pets/70.prefab` identifies `ppets_70` and two dependencies.

| Logical resource | Bytes | SHA-256 |
|---|---:|---|
| `ppets_70` | 579,315 | `cddca15a2ce15026ed685d64796ad5585890c81b4046ad88bf7ce2ab08e77d40` |
| `petanimpackage_share_assets_flashtools_resources_materials_generated.bundle` | 3,627 | `1df8c3bba2fdecf9da717143c4507faa206c23c641df4d9ce7eaa28bb79fcd74` |
| `punityshaders` | 27,681 | `b1733edea0612af4b853bea7396de8b5142ea23e94eda7a3061a48ec00fd90a6` |

All three resources have the UnityFS signature. The main bundle has three MonoScript references in FTRuntime: SwfClip, SwfClipAsset and SwfClipController. The SwfClipAsset fields contain a sprite reference, frame rate and animation sequences. These script references are not recovered function bodies or a damage implementation.

The decoded frame rate is **24 fps**, with a **2,048 by 1,024** atlas and 100 pixels per geometry unit. Raw sequence names are preserved rather than assigning unsupported combat meanings to every abbreviation.

| Source sequence | Frames | Labels |
|---|---:|---|
| `standby` | 29 | action_end |
| `attack` | 75 | action_hit, action_end |
| `sa` | 75 | action_hit, action_end |
| `cp` | 75 | action_hit, action_end |
| `hited` | 8 | action_end |

Both decoders agreed on the complete sequence summary. Their 8,388,608 atlas RGBA bytes were identical, with SHA-256 `cc63c55695d8aba13e40f4487fad921f741526f658574a41b1108e23119010f6`. No alpha or visible RGB pixel differed. This verifies decoding of this specimen; it does not certify every material, mask, Spine format or creature. The browser renderer was not incorporated into the game or visually certified by this audit. The useful integration lead is the actual action timeline and its hit/end labels.

## Direct configuration and formula boundary

The official ConfigPackage manifest reports version `20260930183512` and one bundle, pgame_configs_bytes, of 9,881,712 bytes. Its official URL and SHA-256 are retained in `artifacts/unity-swf-audit/`. UnityPy identified 552 TextAssets plus the AssetBundle object. This is a table collection; the sampled animation objects and the inspected type table expose no ordinary damage function. This bounded inspection is not a proof that no relevant calculation exists anywhere in the complete client.

The bundle's typesRelation asset is 8,078 bytes, with SHA-256 `ec04bb1ee5fc1856ce9ed4f67b139630edc70d3a377759aa0938706428f74a5e`. Its field order was checked against the [SeerAPI parser](https://github.com/SeerAPI/seerapi/blob/8529086d51e8047053c1fd4e6bb2cc0272dd3b17/packages/solaris/solaris/parse/parsers/types_relation.py). The repository's independent reader consumed the entire binary and decoded 26 types. Its complete output matched the [pinned configuration mirror](https://github.com/SeerAPI/config-sources/blob/410673e3300583eca6be96f3b799af3867d0112b/unity/typesRelation.json).

Aliases were normalized before comparing the 18 retained base types. The initial comparison found 323 matches among 324 ordered cells. The only difference before the follow-up correction was:

| Attack | Defense | Current official Unity value | Local value |
|---|---|---:|---:|
| Fighting (fight) | Evil (demon) | 0.5 | 1 |

This is direct current-client evidence, stronger than an inferred neutral value from an omitted website cell. It does not establish that the same value was used by the pre-2013 server. The earlier 4399 parity result and its neutral omission convention remain documented in [calculator-parity-audit.md](calculator-parity-audit.md). The subsequent correction follows the user's express preference for the current official coefficient; it does not claim to resolve the period boundary.

Fresh FFDec output confirms that AttackValue reads lost HP, actual hurt HP, remaining HP and the critical flag from an IDataInput. The tested class does not calculate ordinary damage from level, power, attack and defense. Its SHA-256 is `ea484cc32cab30643dfd320725893e11894ca2879c50d3d27500524b531bdbd8`; the decoded official core is `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`. An animation package, successful bytecode export, current type table and fan game's formula establish different things. None resolves the classic damage routine's exact floors, random distribution or multihit order. See [damage-formula-research.md](damage-formula-research.md).

## Reproduction and retained evidence

The isolated Python environment, npm runtime and downloaded source are under ignored `.cache/unity-swf-audit/`; game dependencies and production artifacts were not updated. Versions and npm integrity strings are retained in `artifacts/unity-swf-audit/toolchain.json`.

For Albi0 0.6.0, patterns match local_basename, which appends .bundle to the logical bundle name. A logical name alone can select zero files while the command reports success. The exact successful selections for the tested snapshot were:

```sh
.cache/unity-swf-audit/venv/bin/albi0 update -n newseer.pet \
  -w .cache/unity-swf-audit/downloads \
  --max-size 10M ppets_70.bundle \
  petanimpackage_share_assets_flashtools_resources_materials_generated.bundle.bundle \
  punityshaders.bundle

.cache/unity-swf-audit/venv/bin/albi0 update -n newseer.config \
  -w .cache/unity-swf-audit/downloads \
  --max-size 10M pgame_configs_bytes.bundle

node .cache/unity-swf-audit/parse-sample.mjs
python3 tools/verification/unity-type-source.py \
  .cache/unity-swf-audit/config-text-assets/typesRelation \
  --output artifacts/unity-swf-audit/official-unity-types.json
```

The Node replay has a scoped import-resolution workaround for extensionless relative imports in the dependency. It does not modify parsing, geometry or pixels. Shared material input is the manifest's actual dependency rather than a fallback shader.

Evidence includes original source manifests, bundle identities, independent sequence summaries, the extracted atlas, pixel comparison, official type-table replay and failed SWF reconstruction record. Downloads and generated bulk data remain ignored. No whole-game download, original-game login, account operation, publication, native-client execution or complete historical damage experiment was performed.
