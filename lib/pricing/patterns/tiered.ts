/**
 * Tiered Pricing Pattern
 *
 * Supports multiple tiers with volume-based pricing.
 * Uses Stripe graduated pricing for automatic tier calculation.
 *
 * SD-PRICING-PATTERNS-001
 */

export interface PricingTier {
  upTo: number | 'inf';
  unitPriceInCents: number;
  flatFeeInCents?: number;
}

export interface TieredConfig {
  productId: string;
  productName: string;
  currency: string;
  billingPeriod: 'monthly' | 'annual';
  tiers: PricingTier[];
  aggregateUsage: 'sum' | 'max' | 'last_during_period';
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface UsageRecord {
  customerId: string;
  quantity: number;
  timestamp: Date;
  action: 'increment' | 'set';
  idempotencyKey?: string;
}

export interface TierCalculation {
  tier: number;
  tierName: string;
  unitPrice: number;
  totalUnits: number;
  tierCost: number;
  totalCost: number;
}

/**
 * TieredPricing class for volume-based pricing
 */
export class TieredPricing {
  private config: TieredConfig;

  constructor(config: TieredConfig) {
    this.validateTiers(config.tiers);
    this.config = config;
  }

  private validateTiers(tiers: PricingTier[]): void {
    if (tiers.length === 0) {
      throw new Error('At least one tier is required');
    }
    if (tiers.length > 5) {
      throw new Error('Maximum 5 tiers supported');
    }

    // Ensure last tier has 'inf' as upTo
    const lastTier = tiers[tiers.length - 1];
    if (lastTier.upTo !== 'inf') {
      throw new Error('Last tier must have upTo: "inf"');
    }

    // Validate ascending order
    for (let i = 0; i < tiers.length - 1; i++) {
      const current = tiers[i].upTo as number;
      const next = tiers[i + 1].upTo;
      if (next !== 'inf' && current >= next) {
        throw new Error('Tier limits must be in ascending order');
      }
    }
  }

  /**
   * Calculate which tier the usage falls into and the cost
   */
  calculateTier(totalUsage: number): TierCalculation {
    let remainingUnits = totalUsage;
    let totalCost = 0;
    let previousLimit = 0;
    let currentTierIndex = 0;

    for (let i = 0; i < this.config.tiers.length; i++) {
      const tier = this.config.tiers[i];
      const tierLimit = tier.upTo === 'inf' ? Infinity : tier.upTo;
      const tierCapacity = tierLimit - previousLimit;

      if (remainingUnits <= 0) break;

      const unitsInTier = Math.min(remainingUnits, tierCapacity);
      const tierCost = unitsInTier * tier.unitPriceInCents + (tier.flatFeeInCents || 0);

      totalCost += tierCost;
      remainingUnits -= unitsInTier;
      currentTierIndex = i;
      previousLimit = tierLimit === Infinity ? previousLimit : tierLimit;
    }

    const currentTier = this.config.tiers[currentTierIndex];

    return {
      tier: currentTierIndex + 1,
      tierName: this.getTierName(currentTierIndex),
      unitPrice: currentTier.unitPriceInCents,
      totalUnits: totalUsage,
      tierCost: totalCost,
      totalCost: totalCost,
    };
  }

  private getTierName(index: number): string {
    const names = ['Starter', 'Growth', 'Professional', 'Business', 'Enterprise'];
    return names[index] || `Tier ${index + 1}`;
  }

  /**
   * Report usage to Stripe for metered billing
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async reportUsage(_record: UsageRecord): Promise<{ success: boolean; usageRecordId?: string }> {
    // In production, this would call Stripe usage_records API
    return {
      success: true,
      usageRecordId: `ur_${generateId()}`,
    };
  }

  /**
   * Get breakdown of charges by tier for an invoice
   */
  getInvoiceBreakdown(totalUsage: number): Array<{
    tier: number;
    tierName: string;
    unitsInTier: number;
    unitPrice: number;
    tierTotal: number;
  }> {
    const breakdown: Array<{
      tier: number;
      tierName: string;
      unitsInTier: number;
      unitPrice: number;
      tierTotal: number;
    }> = [];

    let remainingUnits = totalUsage;
    let previousLimit = 0;

    for (let i = 0; i < this.config.tiers.length && remainingUnits > 0; i++) {
      const tier = this.config.tiers[i];
      const tierLimit = tier.upTo === 'inf' ? Infinity : tier.upTo;
      const tierCapacity = tierLimit - previousLimit;
      const unitsInTier = Math.min(remainingUnits, tierCapacity);

      breakdown.push({
        tier: i + 1,
        tierName: this.getTierName(i),
        unitsInTier,
        unitPrice: tier.unitPriceInCents,
        tierTotal: unitsInTier * tier.unitPriceInCents + (tier.flatFeeInCents || 0),
      });

      remainingUnits -= unitsInTier;
      previousLimit = tierLimit === Infinity ? previousLimit : tierLimit;
    }

    return breakdown;
  }

  /**
   * Handle Stripe webhook events for tiered pricing
   */
  async handleWebhookEvent(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'invoice.created':
        return { handled: true, action: 'invoice_created' };
      case 'invoice.finalized':
        return { handled: true, action: 'invoice_finalized' };
      case 'usage_record.created':
        return { handled: true, action: 'usage_recorded' };
      default:
        return { handled: false };
    }
  }

  getConfig(): TieredConfig {
    return { ...this.config };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default TieredPricing;
