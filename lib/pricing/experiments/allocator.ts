/**
 * Variant Allocator
 *
 * Assigns users to experiment variants consistently using deterministic hashing.
 *
 * SD-PRICING-TESTING-001
 */

import { type ExperimentConfig, type ExperimentVariant } from './config';

export interface AllocationResult {
  experimentId: string;
  variantId: string;
  variantName: string;
  priceInCents: number;
  isControl: boolean;
  hash: number;
}

export interface AllocatorOptions {
  salt?: string;
  overrides?: Map<string, string>; // userId -> variantId for testing
}

/**
 * VariantAllocator for consistent user-to-variant assignment
 */
export class VariantAllocator {
  private salt: string;
  private overrides: Map<string, string>;

  constructor(options: AllocatorOptions = {}) {
    this.salt = options.salt || 'pricing_experiment';
    this.overrides = options.overrides || new Map();
  }

  /**
   * Allocate a user to a variant
   */
  allocate(userId: string, experiment: ExperimentConfig): AllocationResult | null {
    // Check for override
    const overrideVariantId = this.overrides.get(`${userId}:${experiment.id}`);
    if (overrideVariantId) {
      const variant = experiment.variants.find(v => v.id === overrideVariantId);
      if (variant) {
        return this.buildResult(experiment, variant, 0);
      }
    }

    // Check experiment status
    if (experiment.status !== 'active') {
      return null;
    }

    // Calculate hash
    const hash = this.calculateHash(userId, experiment.id);
    const normalizedHash = hash % 10000; // 0-9999 for 0.01% precision

    // Find variant based on allocation
    let cumulativeAllocation = 0;
    for (const variant of experiment.variants) {
      cumulativeAllocation += variant.allocationPercent * 100; // Convert to 0-10000 scale
      if (normalizedHash < cumulativeAllocation) {
        return this.buildResult(experiment, variant, hash);
      }
    }

    // Fallback to last variant (shouldn't happen with valid config)
    const lastVariant = experiment.variants[experiment.variants.length - 1];
    return this.buildResult(experiment, lastVariant, hash);
  }

  private buildResult(
    experiment: ExperimentConfig,
    variant: ExperimentVariant,
    hash: number
  ): AllocationResult {
    return {
      experimentId: experiment.id,
      variantId: variant.id,
      variantName: variant.name,
      priceInCents: variant.priceInCents,
      isControl: variant.isControl,
      hash,
    };
  }

  /**
   * Calculate deterministic hash for user+experiment
   */
  private calculateHash(userId: string, experimentId: string): number {
    const input = `${this.salt}:${userId}:${experimentId}`;
    let hash = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  /**
   * Check allocation consistency (for testing)
   */
  verifyConsistency(userId: string, experiment: ExperimentConfig, iterations: number = 100): boolean {
    const firstResult = this.allocate(userId, experiment);
    if (!firstResult) return false;

    for (let i = 0; i < iterations; i++) {
      const result = this.allocate(userId, experiment);
      if (!result || result.variantId !== firstResult.variantId) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get allocation distribution for an experiment (for testing/validation)
   */
  getDistribution(
    experiment: ExperimentConfig,
    sampleSize: number = 10000
  ): Map<string, { count: number; percent: number }> {
    const distribution = new Map<string, { count: number; percent: number }>();

    // Initialize counts
    for (const variant of experiment.variants) {
      distribution.set(variant.id, { count: 0, percent: 0 });
    }

    // Simulate allocations
    for (let i = 0; i < sampleSize; i++) {
      const userId = `test_user_${i}`;
      const result = this.allocate(userId, experiment);
      if (result) {
        const current = distribution.get(result.variantId)!;
        current.count++;
      }
    }

    // Calculate percentages
    for (const [variantId, data] of distribution) {
      data.percent = (data.count / sampleSize) * 100;
    }

    return distribution;
  }

  /**
   * Set override for testing
   */
  setOverride(userId: string, experimentId: string, variantId: string): void {
    this.overrides.set(`${userId}:${experimentId}`, variantId);
  }

  /**
   * Clear all overrides
   */
  clearOverrides(): void {
    this.overrides.clear();
  }
}

export default VariantAllocator;
