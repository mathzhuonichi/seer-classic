// sfc32: small, fast, seedable, identical on every JS runtime. The state is
// four uint32s so a battle snapshot can be saved and restored exactly.

export class Rng {
  s: [number, number, number, number];
  draws = 0;

  constructor(seed: number | [number, number, number, number]) {
    if (Array.isArray(seed)) {
      this.s = [...seed] as [number, number, number, number];
      return;
    }
    // splitmix32 to expand one seed into four words
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
    for (let i = 0; i < 12; i++) this.nextU32();
    this.draws = 0;
  }

  nextU32(): number {
    let [a, b, c, d] = this.s;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.s = [a >>> 0, b, c, d];
    this.draws++;
    return t;
  }

  /** float in [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** true with probability pct/100 */
  chance(pct: number): boolean {
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    return this.next() * 100 < pct;
  }

  pick<T>(xs: T[]): T {
    return xs[this.int(0, xs.length - 1)];
  }
}
