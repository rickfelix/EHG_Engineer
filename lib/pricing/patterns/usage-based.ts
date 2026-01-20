/**
 * Usage-Based Pricing Pattern
 *
 * Charges based on metered usage with configurable unit price.
 * Supports per-unit, per-1000, per-million pricing.
 *
 * SD-PRICING-PATTERNS-001
 */

export type PricingUnit = 'per_unit' | 'per_thousand' | 'per_million';

export interface UsageBasedConfig {
  productId: string;
  productName: string;
  currency: string;
  billingPeriod: 'monthly' | 'annual';
  unitPriceInCents: number;
  pricingUnit: PricingUnit;
  includedUnits: number;
  minimumCharge?: number;
  maximumCharge?: number;
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface UsageBasedSubscription {
  id: string;
  customerId: string;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  currentUsage: number;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
}

export interface UsageReport {
  quantity: number;
  timestamp: Date;
  action: 'increment' | 'set';
  idempotencyKey: string;
}

export interface UsageSummary {
  totalUnits: number;
  billableUnits: number;
  unitPrice: number;
  pricingUnit: PricingUnit;
  estimatedCharge: number;
  includedUnits: number;
}

/**
 * UsageBasedPricing class for metered billing
 */
export class UsageBasedPricing {
  private config: UsageBasedConfig;

  constructor(config: UsageBasedConfig) {
    this.config = config;
  }

  /**
   * Create a usage-based subscription
   */
  async create(params: {
    customerId: string;
    stripeCustomerId: string;
    paymentMethodId?: string;
    metadata?: Record<string, string>;
  }): Promise<UsageBasedSubscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    if (this.config.billingPeriod === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    return {
      id: `sub_${generateId()}`,
      customerId: params.customerId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      currentUsage: 0,
      stripeSubscriptionId: `sub_stripe_${generateId()}`,
      stripeSubscriptionItemId: `si_${generateId()}`,
    };
  }

  /**
   * Report usage to Stripe
   */
  async reportUsage(
    _subscriptionItemId: string,
    _report: UsageReport
  ): Promise<{ success: boolean; usageRecordId?: string }> {
    // In production, this would call:
    // stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {...})

    return {
      success: true,
      usageRecordId: `ur_${generateId()}`,
    };
  }

  /**
   * Calculate charge for given usage
   */
  calculateCharge(totalUnits: number): number {
    const billableUnits = Math.max(0, totalUnits - this.config.includedUnits);

    let divisor = 1;
    switch (this.config.pricingUnit) {
      case 'per_thousand':
        divisor = 1000;
        break;
      case 'per_million':
        divisor = 1000000;
        break;
      default:
        divisor = 1;
    }

    let charge = Math.ceil(billableUnits / divisor) * this.config.unitPriceInCents;

    // Apply minimum
    if (this.config.minimumCharge && charge < this.config.minimumCharge) {
      charge = this.config.minimumCharge;
    }

    // Apply maximum
    if (this.config.maximumCharge && charge > this.config.maximumCharge) {
      charge = this.config.maximumCharge;
    }

    return charge;
  }

  /**
   * Get usage summary for dashboard display
   */
  getUsageSummary(totalUnits: number): UsageSummary {
    const billableUnits = Math.max(0, totalUnits - this.config.includedUnits);

    return {
      totalUnits,
      billableUnits,
      unitPrice: this.config.unitPriceInCents,
      pricingUnit: this.config.pricingUnit,
      estimatedCharge: this.calculateCharge(totalUnits),
      includedUnits: this.config.includedUnits,
    };
  }

  /**
   * Format price for display
   */
  formatPrice(): string {
    const dollars = (this.config.unitPriceInCents / 100).toFixed(4);

    switch (this.config.pricingUnit) {
      case 'per_thousand':
        return `$${dollars} per 1,000 units`;
      case 'per_million':
        return `$${dollars} per 1,000,000 units`;
      default:
        return `$${dollars} per unit`;
    }
  }

  /**
   * Get projected cost for month based on current usage rate
   */
  getProjectedMonthlyCost(
    currentUsage: number,
    daysElapsed: number,
    totalDaysInMonth: number
  ): { projected: number; low: number; high: number } {
    if (daysElapsed === 0) {
      return { projected: 0, low: 0, high: 0 };
    }

    const dailyRate = currentUsage / daysElapsed;
    const projectedUsage = dailyRate * totalDaysInMonth;

    // Add 15% confidence interval
    const projected = this.calculateCharge(projectedUsage);
    const low = this.calculateCharge(projectedUsage * 0.85);
    const high = this.calculateCharge(projectedUsage * 1.15);

    return { projected, low, high };
  }

  /**
   * Handle Stripe webhook events for usage-based pricing
   */
  async handleWebhookEvent(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'invoice.created':
        return { handled: true, action: 'invoice_with_usage_created' };
      case 'invoice.finalized':
        return { handled: true, action: 'usage_invoice_finalized' };
      case 'customer.subscription.updated':
        return { handled: true, action: 'subscription_updated' };
      default:
        return { handled: false };
    }
  }

  getConfig(): UsageBasedConfig {
    return { ...this.config };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default UsageBasedPricing;
