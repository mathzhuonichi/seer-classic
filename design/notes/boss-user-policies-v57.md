# Boss user policies, V57

The user declined the first four unresolved mechanics from the V56 report and
adopted a concrete rule for the fifth: Moshidilu executes first below 25% HP.
These are explicit remake decisions, not recovered official server behavior.
The canonical decisions are recorded in `data/boss-user-policies-v57.json` and
copied into both generated evidence ledgers. Historical source disagreements
remain available in the full evidence ledger.

## Moshidilu

`forced_execution_below_pct` uses current HP with the strict comparison
`hp * 100 < maxHp * 25`. At 3,000,000 maximum HP, 749,999 enables it and
750,000 does not. Healing to the boundary or above disables it immediately.
It replaces both the former permanent half-HP execution phase and the
unquantified gradual damage-growth declaration.

While active, the automatic boss chooses an available damaging attack before
consulting ordinary AI. If both attacks have exhausted PP, it uses Struggle
even when status moves still have PP. The mode ranks before opposing move
priority and speed. Its attack directly KOs the target, bypassing ordinary
accuracy, protection, incapacitation, OHKO immunity and HP floors. Normal PP
consumption and the move event are retained. If an opposing action first moves
the boss below the threshold, an already chosen status move becomes an attack
when the boss acts; the earlier action is not retroactively reordered.

Switches, items and fleeing retain their existing sequence. The policy grants
no immortality: existing damage over time can still defeat the boss. Its
separate status-immunity boundary remains strictly below 1,000,000 HP, and
existing statuses continue ticking after that boundary.

## Explicitly waived mechanics

| Encounter | User-declined addition | Behavior retained |
| --- | --- | --- |
| Puni seal 7 | Additional reported low boss accuracy | Existing skill accuracy and rules |
| Puni true body | Additional player-accuracy reduction at low boss HP | Existing life rules and critical defense clearing |
| Eersaila | Unquantified HP-dependent critical probability curve | All existing weekday rules; the historical script declaration emits an explicit waiver event without changing probability |
| Kenpede | Temporary reflection activation, duration and termination window | Existing configured reflection and other rules |

Waived entries are distinct from implemented entries and active unsupported
contracts. The current execution ledger contains 590 handled entries,
118 retained approximation notes, four waived mechanics, one replacement
policy, and no active unsupported contracts. This does not establish complete
historical parity or resolve unrelated estimated parameters.

## Validation

`node tools/verification/boss-rules-v56.mjs --write-support` passes 29 focused
groups and 193 real base/variant smoke configurations with no unknown-script
warnings. New checks use ordinary player HP and cover the exact boundary,
legacy-AI status preference, maximum opposing priority and speed, healing out
of the mode, attack PP exhaustion, protection/evasion/control effects,
mid-turn threshold crossing, and existing poison damage. The previous tower,
weekday, revival, field, validation and finite-state regressions remain green.

The evidence/controller suite passes 18 groups, including actual catalog,
campaign and Moshidilu battle views for all five current policy decisions.
All 14 existing campaign-mechanics groups pass. The evidence generator and its
`--check` mode pass. TypeScript and whitespace checks pass. Core verification
uses no controller; controller verification uses explicit fixture saves and
temporary no-op storage. Neither uses a browser, user save, network or
listening server.
