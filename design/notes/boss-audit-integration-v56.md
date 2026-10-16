# V56 Boss audit integration

This note records the V56 integration checkpoint. The later
[V57 user-policy decision](boss-user-policies-v57.md) supersedes its five
unrestored-mechanic statuses with four explicit waivers and one strict-quarter
Moshidilu replacement. Current focused counts are 29 rule groups and 18
evidence/controller groups; the remaining V56 observations below retain their
original review scope.

All 180 production Boss encounters and 240 members now have field-specific evidence. The UI distinguishes reviewed period observations, inferred configuration and authored behavior. Exact hidden server stats and server AI were not recovered. Detailed claims, conflicts and source boundaries are in [the evidence audit](boss-evidence-v56.md); execution coverage is in [the rule audit](boss-rules-v56.md).

Enhanced action selection, voluntary switching, medicine planning and replacement selection remain confined to simulated-player trainer encounters, including the existing facilities. Bosses use the historical project policy with their explicit sequence, weighted, forced and script overrides. [The AI isolation note](boss-ai-isolation-v56.md) identifies the historical Git source and oracle boundaries.

The shared level formatter masks values above 100. It also respects the independently sourced Difute display exception while retaining the estimated internal level 80. Scene actors, challenge indexes, campaign opponents, battle health displays, accessible descriptions, enemy team details and capture previews use the formatter. No numeric hidden level is exposed through the evidence table.

Evidence disclosures are available in scene dialogue, the challenge center, campaign stages and combat. Each field carries its own classification, and short source-link lists lead to the retained reports. Multi-member encounters preserve each member's evidence, aggregate uncertainty conservatively, and count encounter-wide unsupported mechanics once. Campaign aggregation regenerates its warning count rather than retaining an individual encounter's count.

Aluobisi's saved attempt counter now drives the encoded level decrease before battle construction and the next-attempt preview. It does not change the source encounter or HP. The minimum level 50 remains an explicit reconstruction assumption and is disclosed in the UI. Existing remake access policies remain in effect.

## Verification

- TypeScript and whitespace checks pass.
- Evidence generation is deterministic and all source hashes and member mappings match.
- Rule execution: 21 groups, including 193 actual base/variant configurations.
- Historical AI oracle: 12 groups and 1,440 Boss-state comparisons; 72 trainer members retain enhanced dispatch.
- Evidence/controller integration: 17 groups, all 180 encounters/240 members, all campaign stages, attempt accounting, rejected-start atomicity, hidden-level display and facility isolation. See [the controller validation note](boss-evidence-controller-validation-v56.md).
- Existing Boss/support regression: 18 groups. Its former enhanced-Boss expectation now asserts the restored historical status-move behavior; its tower fixture now unlocks floor 61 through saved progression before entering.
- Existing tower regression: 13 groups and 43 settlement witnesses. Existing campaign rules: 14 groups. Existing trainer AI and passive-ownership checks also pass, as detailed in the AI note.

Full-shell UI review used only `/preview.html` on an isolated development server with memory-only storage. Floor 60 was checked at 1280 by 720 and 640 by 480: all three opponent levels are masked, the table and enemy roster identify inferred values, and the evidence dialog fits both viewports. Difute's challenge index displays `??` and exposes its period-report link. Floor 70's four-member scene and normal-HP battle were also checked. Screenshots and run reports are under the ignored `artifacts/boss-audit-v56/` directory. Browser console errors were absent in the reviewed flows.

No production build, desktop package, push, real player-save access, or user development-server restart was performed. Five mechanisms were listed as unrestored at the V56 checkpoint; their current V57 dispositions are identified above. Working handlers can still contain estimated magnitudes; neither execution coverage nor these regressions establish complete official historical parity.
