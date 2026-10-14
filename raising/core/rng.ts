// One PRNG for the whole project: the battle core's sfc32 (state = four uint32s, so
// Save.rng_state round-trips exactly). The raising rules only need Rng.int(min, max).
export { Rng as SeededRng } from "../../battle/core/src/rng.ts";
