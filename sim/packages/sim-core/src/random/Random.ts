export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal distribution, mean 0 and standard deviation 1. */
  gaussian(): number;
}

/** Small, fast, seedable generator (mulberry32) so runs can be repeated exactly. */
export class SeededRandom implements Random {
  private state: number;
  private spareGaussian: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  gaussian(): number {
    if (this.spareGaussian !== null) {
      const value = this.spareGaussian;
      this.spareGaussian = null;
      return value;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const radius = Math.sqrt(-2 * Math.log(u));
    this.spareGaussian = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  }

  /** Derives an independent generator, so each sensor gets its own stream. */
  fork(salt: number): SeededRandom {
    return new SeededRandom(Math.imul(this.state ^ salt, 2654435761) ^ salt);
  }
}
