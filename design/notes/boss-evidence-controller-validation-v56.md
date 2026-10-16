# V56 independent evidence and controller validation

`node tools/verification/boss-evidence-controller-v56.mjs` passed all 17 check groups against the integrated V56 sources.

The checks cover all 180 Boss encounters and 240 members in both evidence indexes. Each runtime member is matched to its species, configured values, and detailed field classifications. Displayed source URLs must belong to the encounter or an explicit field citation; the test permits retained source gaps rather than inventing citations. Aggregate evidence retains the least certain member status and counts encounter-wide unsupported mechanics once. A specific Puni regression checks the seventh seal plus the true body: both the numeric total and limitation text report two unsupported effects. The six-member body contributes one encounter-wide effect and one matching count sentence, while unrelated limitation text remains intact.

Every Boss catalog entry and opponent has evidence. All seven campaigns, 30 stages, and 57 stage opponents retain their evidence. Public controller starts for the first stage in all seven campaigns were also exercised, checking the 21 real active and reserve opponents against the retained source configurations.

All 74 configured members above level 100 display `??` through the presentation helpers and evidence views while their core level remains numeric and unchanged. A real floor-31 controller start retains level 120 internally. Difuert is checked separately: its documented `??` display is preserved even though its internal reconstruction uses level 80.

The Aluobisi adapter and actual controller starts establish these boundaries:

- A first challenge uses level 100; a second uses 90; an imported prior count of three starts at 70.
- Large counts stop at level 50, and the evidence explicitly labels that floor as inferred.
- The source encounter remains level 100, and all adapted battles retain the configured 5,000 HP and other member data.
- A successful start increments the attempt counter once. Repeated snapshots, retreat, closing the result, and reloading do not add another attempt. The list preview moves to the next attempt's level while the active battle retains its current level.
- Unknown, locked, active-battle, campaign-entry and exhausted-team rejections preserve the exported save, RNG, current battle and construction count.

Actual classic, random and elite facility starts keep runtime kind `trainer`, tactical selection and no Boss evidence. They do not create Boss attempt counters. The independent AI oracle was rerun after the core-rule changes were frozen: all 12 groups, 1,440 Boss states and 72 trainer member cases passed.

The controller test uses the existing V54-style in-memory observation hook to capture the real Battle object after construction. It does not replace the constructor or mutate battle parameters. Storage is a temporary no-op adapter, all saves are explicit test fixtures, and HTTP access is blocked. The Vite server uses middleware mode without listening ports, WebSockets or file watchers, with an independent cache. No browser, real user save, build, package or user development server was involved.

The report is `artifacts/boss-evidence-controller-v56/regression.json`, including source hashes. This validation checks implementation and faithful propagation of the audit classifications. It does not independently re-establish the historical claims in the evidence index or provide browser layout QA; those are separate workstreams.
