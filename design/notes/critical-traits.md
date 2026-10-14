# Critical-rate trait calibration

The original checked-in client records identify zero-star 会心 (ID 1023, effect 30) and 免爆 (ID 1063, effect 64), both with Args `1 0`. Their descriptions state an increase or decrease in critical-hit probability without an explicit denominator. Later upgrade records use different effect IDs and parameters; they do not establish the probability of the original zero-star tier.

A targeted search of Taomee's official site did not recover a numerical probability mapping for those two original trait effects. The official [Seer item catalogue](https://seer.61.com/main/props/NONO/index.html) specifies a 1/16 critical-hit increase for the critical energy bead. That supports the existence of a sixteen-part critical-rate increment in the classic product, but it does not establish that either trait uses the same increment.

This remake explicitly calibrates 会心 as one additional step on the engine's sixteen-point critical-rate scale, and 免爆 as one fewer incoming step, bounded below by the probability test's zero threshold. The usual engine rate therefore changes from 1/16 to 2/16 under 会心 and from 1/16 to 0 under 免爆. The two effects cancel when opposed. A forced critical attack remains forced, and encounter rules that grant critical immunity retain priority. No later-star mapping is substituted.

These are playable remake choices, not verified historical trait probabilities. The raw original records remain intact. The public trait descriptions label the numeric behavior as a remake rule, and each runtime trait includes an English calibration note. This distinction should remain visible until a reliable original probability mapping is recovered.

The focused deterministic battle check verifies ordinary random critical damage separately from the calibrated traits, then confirms that the zero-star resistance suppresses the ordinary base critical rate and that the additional-rate hook uses one step. It does not certify equivalence with the original client battle server.
