# Revision 25: official damage and stat source audit

The retained single-type table, composite type arithmetic and nature multipliers agree with the official Flash client retrieved in this pass. The executable comparison checks 324 single cells, all 29,241 combinations of retained single and unordered dual types, and 150 nature/stat multiplier cells. No confirmed powered-damage or base-stat formula mismatch was recovered. Exact server rounding remains unresolved; the existing formula and its intermediate floors are retained rather than replaced with an unrelated game's rule.

One catalog label required correction: the official `NatureXMLInfo` entry 5 calls the defense-raising, special-attack-lowering nature **顽皮**, while the recovered catalog called `impish` **淘气**. The standalone and bundled catalogs now both use **顽皮**. All 25 named nature entries and their numeric multipliers were checked, with no additional mismatch and no duplicate label.

## Official source identity and actual operations

The official [RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf) was fetched successfully during this pass: HTTP 200, 9,178,617 bytes, SHA-256 `2405e1cb24f4a44fa6183c03a51357f58895a0a9ff1e5376a6506be53cfc493f`. Skipping the loader's seven-byte prefix and inflating gives SHA-256 `ca040870b9150463f5858ac42d0e0c347380010e12ae16d02068dc78048ccd40`, identical to the previously statically exported official client. This confirms the retrieved artifact's identity, not a historical release date or server implementation.

The audit reads the SWF's `DefineBinaryData` records directly, independently of a community mirror. Record 94 is the nature configuration and record 246 is the type relation configuration. Their XML and live-fetch metadata remain under ignored `.cache/damage-official-v25/`. Guessed standalone nature/type XML endpoints returned HTTP 404 and are recorded as failures, not source evidence. The earlier official Unity type extraction also matches all 324 retained cells; its binary-reader replay remains `tools/verification/unity-type-source.py`.

The inspected official exports are under `.cache/classic-robots/core-script/scripts/com/robot/core/`:

| Official class | Relevant source | What it establishes |
| --- | --- | --- |
| `config/xml/TypeXMLInfo.as` | `getRelationsPow`, lines 80–119; `getDivisor`, lines 121–137 | Composite power coefficients and the direction of dual-versus-dual grouping. The simpler `getRelations` method is a different averaging operation and must not be substituted for it. |
| `config/xml/NatureXMLInfo.as` and embedded record 94 | Named nature rows and their five multipliers | All 25 local natures have the corresponding official 0.9/1/1.1 multipliers; HP remains unaffected. The one label discrepancy is explicit. |
| `controller/PetPropAddController.as` | Nature array at line 30; `getEvEffect`, lines 939–949 | A display contribution is calculated as `int(nature × level/100 × EV/4)`, or `int(level/100 × EV/4)` for HP. This is not the complete server stat routine. |
| `info/pet/PetInfo.as` | Lines 184–189 | Maximum HP and the five complete non-HP stats are read from server input. |
| `info/fightInfo/attack/AttackValue.as` | Lines 123–124 and 143 | HP loss, real hurt HP and the critical flag are read from server input. |

## Exact coefficient comparison

For a pair of coefficients, the official `getDivisor` returns 1 when both equal 2, 4 when either equals 0, and 2 otherwise. Single attacks against dual defenders and dual attacks against single defenders apply this pair operation. Dual attacks against dual defenders first combine both attacking components against each defending component, then average those two values. That is exactly the current `battle/core/src/typechart.ts` behavior.

The new runner extracts the actual `getRelationsPow` and `getDivisor` ActionScript bodies and removes only their type annotations for JavaScript execution. The provided `getRelation` function reads the independently extracted official XML. All 18 singleton inputs and all 153 distinct unordered dual inputs are compared against the engine, for 171² = 29,241 attack/defender cases. This is exhaustive for the retained 18 base types and at most two distinct components; it does not claim coverage of later types or arbitrary higher-cardinality inputs.

## Damage and stat boundaries

The current conventional damage reconstruction remains

\[
B=\left\lfloor (0.4L+2)P\frac{A}{D}\frac1{50}\right\rfloor+2,
\qquad H=B\,S\,T\,\frac r{255}\,C,
\]

with STAB `S = 1.5` when the skill's components belong to the user, the verified official type coefficient `T`, integer roll `r ∈ {217,…,255}`, and ordinary critical multiplier `C ∈ {1,2}`. The engine applies its subsequent conditions and final damage handling separately. Existing notes preserve the period formula evidence and the post-damage critical defense-stage clear; those are not promoted here to recovered official server code.

The official sources inspected here do not establish the ordinary server's STAB decision for partially overlapping dual skills, stage multiplier formula, random-roll distribution/draw ordering, critical probability/multiplier, critical stage-clear ordering, or intermediate/final damage truncation. Their packet parsers receive completed server results. A formula-compatible example or successful engine regression cannot certify these missing details.

Likewise, the retained base-stat function uses `floor(EV/4)`, scales by level, floors before the non-HP `+5`, and applies a final nature floor. The official EV display contribution includes a fractional `EV/4`, but removing the server reconstruction's floors from this separate display routine would be an inference rather than a verified correction. `raising/core/stats.ts` now documents that boundary in its comments. The arithmetic itself is unchanged.

## Verification and replay

Run the focused official-source comparison from the repository root with the pinned snapshots present:

```sh
node --input-type=module - <<'JS'
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  await server.ssrLoadModule('/tools/verification/damage-official-v25.ts');
} finally {
  await server.close();
}
JS
```

The run passed 324 single cells, 29,241 type combinations, 150 nature multipliers and 375 raising/battle stat bridge cases spanning all natures, five levels and three individual values. Nine server-packet field assertions passed. Stat bridge cases establish that raising and battle use the same implementation; they do not establish official server parity. Output and source hashes are saved to ignored `artifacts/damage-official-v25/parity.json`.

The existing `classic-damage.ts` runner passed eight focused critical-hit cases, and `runDamageAudit()` passed 28 cases with zero failures. These verify retained engine behavior, including type immunity, damage modifiers and the documented critical boundary. No production build, package, original-game battle, account action or speculative damage formula change was performed by this audit.
