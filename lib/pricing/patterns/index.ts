/**
 * Pricing Patterns Module
 *
 * Exports all foundational pricing patterns with Stripe integration.
 *
 * SD-PRICING-PATTERNS-001
 */

export { FlatRatePricing, type FlatRateConfig, type FlatRateSubscription } from './flat-rate';
export { TieredPricing, type TieredConfig, type PricingTier, type TierCalculation } from './tiered';
export { FreeTrialPricing, type FreeTrialConfig, type TrialSubscription } from './free-trial';
export { UsageBasedPricing, type UsageBasedConfig, type UsageBasedSubscription, type UsageSummary, type PricingUnit } from './usage-based';

// Pattern type union
export type PricingPattern = 'flat_rate' | 'tiered' | 'free_trial' | 'usage_based';

// Factory function to create pricing pattern instance
export function createPricingPattern(
  pattern: PricingPattern,
  config: FlatRateConfig | TieredConfig | FreeTrialConfig | UsageBasedConfig
): FlatRatePricing | TieredPricing | FreeTrialPricing | UsageBasedPricing {
  switch (pattern) {
    case 'flat_rate':
      return new FlatRatePricing(config as FlatRateConfig);
    case 'tiered':
      return new TieredPricing(config as TieredConfig);
    case 'free_trial':
      return new FreeTrialPricing(config as FreeTrialConfig);
    case 'usage_based':
      return new UsageBasedPricing(config as UsageBasedConfig);
    default:
      throw new Error(`Unknown pricing pattern: ${pattern}`);
  }
}

// Re-export types for convenience
import type { FlatRateConfig } from './flat-rate';
import type { TieredConfig } from './tiered';
import type { FreeTrialConfig } from './free-trial';
import type { UsageBasedConfig } from './usage-based';
import { FlatRatePricing } from './flat-rate';
import { TieredPricing } from './tiered';
import { FreeTrialPricing } from './free-trial';
import { UsageBasedPricing } from './usage-based';
