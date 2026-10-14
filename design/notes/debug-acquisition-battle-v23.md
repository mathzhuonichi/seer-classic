# Development acquisition and battle integration, revision 23

Date: 2026-10-03. The user's current scope is development and debugging, without another production build, application package or portable export. Existing releases and the port-1425 save were preserved. No new scene artwork was acquired. The previously completed offline motion for all 1,483 retained species, official audio and skill effects remain integrated.

## Resulting behavior

Encyclopedia acquisition buttons use the selected form's directed ancestry to locate real initial-form entries. Evolution conditions appear separately. An adult or sibling challenge reward cannot substitute for a missing initial-form entry. For example, 21 Electric Rabbit identifies root 19 Lili and reports its missing initial acquisition; it does not repurpose the adult reward. Fusion evolutions target their actual fusion infants. Seville 413 targets the essence route for Sevi 412 and displays its level-32 evolution.

The game controller registers 42 initial-form recruitment tasks backed by 63 exact official premium-currency product records. Each task names five ordinary SPT opponents with numbers strictly below its initial reward species. Divine-beast and Puni campaigns and their families are excluded. All five named encounter IDs must be cleared; repeated victories or an unrelated guardian clear cannot satisfy a missing gate. The task panel displays individual clear status and travels to each prerequisite's existing scene. An encyclopedia task button opens its exact task, instead of merely opening a long task list.

Claims create one level-1 initial form without payment, use the existing party/storage placement rule, and persist through the existing quest-ID ledger. A full party sends the reward to storage. Capacity rejection now happens before random generation, preserving the entire save and RNG when both party and storage are full. The registry describes evidenced paid purchase options; it does not assert historical paid exclusivity or an exhaustive classification of deleted historical products. See [source and transaction evidence](paid-spt-recruitment-v23.md).

Seville is an ordinary single-player encounter with one opponent and an essence hatching Sevi. Qigesa's presentation likewise describes a direct ordinary challenge. The engine already has no cooperative lobby to remove. Normal six-creature player rosters and sequential campaign opponents remain. Seville's level 80 and 10,000 HP are authored solo calibration. Its recovery rule now uses the core's actual absolute `hp: 200` field: 199 HP heals fully, 200 HP does not, and a lethal hit does not revive it. See [solo encounter verification](solo-challenges-v23.md).

WorldMap reports its actual rendered background to the App through a stable callback. Battle entry freezes that source in local presentation state, then preloads and renders it below both creature canvases, effects and health panels. This does not depend on navigation preferences successfully reaching local storage. Campaign entry reuses its existing mapped rendezvous picture; that same image appears below its stage interface and in battle. Small opaque caption backgrounds keep text readable against detailed original images. Cancelling battle preparation returns to the initiating scene.

## Verification

TypeScript and `git diff --check` pass. Independent GPT-6.1 Sol medium workers checked source-backed recruitment data, controller transactions, initial-route consistency and solo encounter mechanics. Their edits were integrated in the shared development source; no release was built by any worker.

- The source gate verifier covers all 42 initial rewards, distinct preceding SPTs, false empty/partial/repeated gates, and divine/NPC/adult exclusions.
- The controller verifier covers all 42 one-time level-1 claims, save/reload, zero-coin claims, unchanged existing creatures/items/experience, full-party storage placement and full-capacity rejection preserving RNG. A bounded real engine victory against the original Delasa encounter records the last prerequisite and unlocks recruitment. Its attack strength is a test override, not a natural boss-difficulty playthrough.
- Initial-route checks cover all 1,483 entries, multiple roots, shortest ancestry paths, unsupported transformations and adult/sibling rejection. Server rendering verifies every focused recruitment task and 36 paid evolved-form entries. The current independent acquisition dependency closure reaches 451 of 1,479 eligible forms; 1,028 remain missing. Source ancestry alone grants no executable transformation. See [coverage and missing list](base-form-acquisition-v23.md).
- Solo checks cover player roster sizes one through six, one opponent, the 200/199/lethal recovery boundaries, actual victory settlement, infant essence hatch/reload, and first-clear-only reward behavior.

The in-app browser exercised the Vite development source on an isolated port-1437 origin:

| Interaction | Observed result |
| --- | --- |
| Grassland wild encounter | Entry and battle both use `/maps/original/10.jpg`; both original creature canvases and health panels appear above the picture. |
| Akshia prerequisite travel and battle | Task button opens the actual ice-field boss dialogue; entry and battle both use `/maps/original/40.png`. |
| Seville evolved-form encyclopedia entry | Shows initial Sevi 412, opens Dragon Temple's ordinary Seville dialogue, then creates one species-413 opponent against the player's roster. Both scenes use `/maps/original/348.jpg`. |
| Puni stage entry and first seal | Stage interface and battle share `/maps/original/500.svg`; seals and campaign ordering remain available. |
| Paid initial-form task | Encyclopedia entry opens only the exact Karta task and its five named prerequisites. In a prepared clear-progress fixture, pointer interaction claims exactly one initial reward at zero coins; exported-save reload keeps the claim disabled. |
| Failed world-preference writes | A controlled fixture rejects world-preference writes after starting in Dragon Temple. Traveling to grassland and entering a battle still uses actual displayed map 10, despite stale persisted navigation. |
| Cancel battle preparation | The visible return button aborts preparation and restores the initiating grassland scene. |

Browser screenshots, visible fixture diagnostics and the isolated fixture source are saved under ignored `artifacts/debug-acquisition-battle-v23/`. Recruitment prerequisites were not all naturally defeated in the browser; prepared progress and bounded engine fixtures explicitly isolate UI, reward and settlement correctness. Seville's full-HP solo difficulty has not been balanced through a complete natural playthrough. The user-facing development server at port 1425 returns HTTP 200 and remains running; no user save import, reset or modifier action was performed on that origin.

The seven source transformation links listed in the recruitment report still lack executable rules. This integration supplies their evidenced initial-form entrances without claiming those adult transformations are implemented. It does not fill the remaining 1,028 acquisition routes.
