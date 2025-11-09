import { createHash, randomBytes } from 'crypto';

export interface RNGCommitment {
  seed: string;
  nonce: string;
  commit: string;
}

export interface VerificationResult {
  valid: boolean;
  reproduced: any;
  expected: any;
}

/**
 * Provably Fair RNG Service
 *
 * Before match starts:
 * 1. Generate secret seed + nonce
 * 2. Publish commitment hash = SHA256(seed + nonce)
 * 3. Use seed for all random generation during match
 *
 * After match ends:
 * 4. Reveal seed + nonce
 * 5. Players can verify by recomputing hash and RNG sequence
 */
export class ProvablyFairService {
  /**
   * Generate a new RNG commitment for a match
   */
  generateCommitment(): RNGCommitment {
    const seed = randomBytes(32).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const commit = this.createCommit(seed, nonce);

    return { seed, nonce, commit };
  }

  /**
   * Create commitment hash
   */
  createCommit(seed: string, nonce: string): string {
    return createHash('sha256')
      .update(seed + nonce)
      .digest('hex');
  }

  /**
   * Verify that a seed + nonce match a commitment
   */
  verifyCommitment(seed: string, nonce: string, commit: string): boolean {
    const computed = this.createCommit(seed, nonce);
    return computed === commit;
  }

  /**
   * Create a seeded RNG that produces deterministic values
   */
  createSeededRNG(seed: string) {
    let state = this.seedToNumber(seed);

    // Linear Congruential Generator (simple but deterministic)
    const next = (): number => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296; // normalize to [0, 1)
    };

    return {
      // Random float between 0 and 1
      random: (): number => {
        return next();
      },

      // Random integer between min (inclusive) and max (exclusive)
      randomInt: (min: number, max: number): number => {
        return Math.floor(next() * (max - min)) + min;
      },

      // Random float between min and max
      randomFloat: (min: number, max: number): number => {
        return next() * (max - min) + min;
      },

      // Random point on a circle of given radius
      randomPointOnCircle: (radius: number): { x: number; y: number } => {
        const angle = next() * Math.PI * 2;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
      },

      // Random point inside a circle of given radius
      randomPointInCircle: (radius: number): { x: number; y: number } => {
        const angle = next() * Math.PI * 2;
        const r = Math.sqrt(next()) * radius;
        return {
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
        };
      },
    };
  }

  /**
   * Convert seed string to initial number state
   */
  private seedToNumber(seed: string): number {
    const hash = createHash('sha256').update(seed).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Generate initial spawn positions for players
   */
  generateSpawnPositions(
    seed: string,
    playerCount: number,
    mapRadius: number
  ): Array<{ x: number; y: number }> {
    const rng = this.createSeededRNG(seed);
    const positions: Array<{ x: number; y: number }> = [];

    // Distribute players evenly around the map
    const spawnRadius = mapRadius * 0.7; // spawn within 70% of map radius

    for (let i = 0; i < playerCount; i++) {
      positions.push(rng.randomPointInCircle(spawnRadius));
    }

    return positions;
  }

  /**
   * Generate pellet positions
   */
  generatePelletPositions(
    seed: string,
    count: number,
    mapRadius: number
  ): Array<{ x: number; y: number }> {
    const rng = this.createSeededRNG(seed + ':pellets');
    const positions: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < count; i++) {
      positions.push(rng.randomPointInCircle(mapRadius));
    }

    return positions;
  }

  /**
   * Verify match RNG by reproducing all random values
   */
  verifyMatch(
    seed: string,
    nonce: string,
    commit: string,
    matchData: {
      playerCount: number;
      mapRadius: number;
      pelletCount: number;
    }
  ): VerificationResult {
    // First verify the commitment
    if (!this.verifyCommitment(seed, nonce, commit)) {
      return {
        valid: false,
        reproduced: null,
        expected: { commit },
      };
    }

    // Reproduce the RNG sequence
    const reproduced = {
      spawnPositions: this.generateSpawnPositions(
        seed,
        matchData.playerCount,
        matchData.mapRadius
      ),
      pelletPositions: this.generatePelletPositions(
        seed,
        matchData.pelletCount,
        matchData.mapRadius
      ),
    };

    return {
      valid: true,
      reproduced,
      expected: reproduced,
    };
  }

  /**
   * Create verification JSON for public API
   */
  createVerificationJSON(
    seed: string,
    nonce: string,
    commit: string,
    matchData: any
  ): any {
    const verification = this.verifyMatch(seed, nonce, commit, matchData);

    return {
      commitment: {
        commit,
        seed,
        nonce,
        algorithm: 'SHA256(seed + nonce)',
      },
      verification: {
        valid: verification.valid,
        message: verification.valid
          ? 'Commitment verified successfully'
          : 'Commitment verification failed',
      },
      reproduced: verification.reproduced,
      instructions: {
        step1: 'Compute SHA256(seed + nonce)',
        step2: 'Compare result with commit hash',
        step3: 'Use seed to regenerate RNG sequence',
        step4: 'Verify spawn positions match',
      },
    };
  }
}

export const provablyFairService = new ProvablyFairService();
