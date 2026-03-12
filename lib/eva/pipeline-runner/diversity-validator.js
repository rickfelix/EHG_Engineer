/**
 * Diversity Validator
 *
 * Standalone module for validating archetype diversity in synthetic venture batches.
 * Reuses shannonEntropy/normalizedEntropy from synthetic-venture-factory.js.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-B
 */

import { shannonEntropy, normalizedEntropy } from './synthetic-venture-factory.js';

const DEFAULT_CONFIG = {
  minNormalizedEntropy: 0.6,
  correlationThreshold: 0.3,
  minBatchSizeForValidation: 4,
};

export class DiversityValidator {
  /**
   * @param {Object} [config]
   * @param {number} [config.minNormalizedEntropy=0.6] - Minimum normalized entropy
   * @param {number} [config.correlationThreshold=0.3] - Max deviation from uniform
   * @param {number} [config.minBatchSizeForValidation=4] - Min batch size to validate
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate diversity of a batch of ventures.
   *
   * @param {Object[]} ventures - Array of venture objects with .archetype field
   * @returns {{ valid: boolean, entropy: number, normalizedEntropy: number, distribution: Object, correlationAlerts: string[], warnings: string[] }}
   */
  validate(ventures) {
    const warnings = [];

    if (!ventures || ventures.length === 0) {
      return { valid: false, entropy: 0, normalizedEntropy: 0, distribution: {}, correlationAlerts: ['Empty batch'], warnings };
    }

    if (ventures.length < this.config.minBatchSizeForValidation) {
      warnings.push(`Batch size ${ventures.length} is below minimum ${this.config.minBatchSizeForValidation} for reliable diversity validation`);
    }

    const archetypeKeys = ventures.map(v => v.archetype);
    const entropy = shannonEntropy(archetypeKeys);
    const uniqueCount = new Set(archetypeKeys).size;
    const normEntropy = normalizedEntropy(entropy, uniqueCount);

    const distribution = this._getDistribution(archetypeKeys);
    const correlationAlerts = this._detectCorrelation(distribution, ventures.length);

    const valid = normEntropy >= this.config.minNormalizedEntropy && correlationAlerts.length === 0;

    return {
      valid,
      entropy,
      normalizedEntropy: normEntropy,
      distribution,
      correlationAlerts,
      warnings,
    };
  }

  /**
   * Get archetype distribution as proportions.
   */
  _getDistribution(archetypeKeys) {
    const counts = {};
    for (const key of archetypeKeys) {
      counts[key] = (counts[key] || 0) + 1;
    }
    const total = archetypeKeys.length;
    const distribution = {};
    for (const [key, count] of Object.entries(counts)) {
      distribution[key] = {
        count,
        proportion: count / total,
      };
    }
    return distribution;
  }

  /**
   * Detect if any archetype deviates too far from uniform distribution.
   */
  _detectCorrelation(distribution, _totalCount) {
    const alerts = [];
    const archetypeCount = Object.keys(distribution).length;
    if (archetypeCount === 0) return alerts;

    const uniformProportion = 1 / archetypeCount;

    for (const [key, { proportion }] of Object.entries(distribution)) {
      const deviation = Math.abs(proportion - uniformProportion);
      if (deviation > this.config.correlationThreshold) {
        alerts.push(
          `Archetype '${key}' deviates ${(deviation * 100).toFixed(1)}% from uniform (proportion=${(proportion * 100).toFixed(1)}%, expected=${(uniformProportion * 100).toFixed(1)}%)`
        );
      }
    }

    return alerts;
  }
}
