/**
 * Flat Rate Pricing Pattern
 *
 * Charges a fixed monthly or annual price with automatic Stripe subscription creation.
 * Handles proration for mid-cycle upgrades/downgrades.
 *
 * SD-PRICING-PATTERNS-001
 */

export interface FlatRateConfig {
  productId: string;
  productName: string;
  priceInCents: number;
  currency: string;
  billingPeriod: 'monthly' | 'annual';
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface FlatRateSubscription {
  id: string;
  customerId: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  priceInCents: number;
  billingPeriod: 'monthly' | 'annual';
  stripeSubscriptionId: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  stripeCustomerId: string;
  priceId: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

/**
 * FlatRatePricing class for fixed price subscriptions
 */
export class FlatRatePricing {
  private config: FlatRateConfig;

  constructor(config: FlatRateConfig) {
    this.config = config;
  }

  /**
   * Create a flat rate subscription
   */
  async create(params: CreateSubscriptionParams): Promise<FlatRateSubscription> {
    // In production, this would call Stripe API
    // For now, return a mock subscription structure
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
      priceInCents: this.config.priceInCents,
      billingPeriod: this.config.billingPeriod,
      stripeSubscriptionId: `sub_stripe_${generateId()}`,
    };
  }

  /**
   * Calculate proration for mid-cycle upgrade/downgrade
   */
  calculateProration(
    currentPriceInCents: number,
    newPriceInCents: number,
    daysRemaining: number,
    totalDaysInPeriod: number
  ): { credit: number; charge: number; net: number } {
    const remainingRatio = daysRemaining / totalDaysInPeriod;

    // Credit for unused portion of current plan
    const credit = Math.round(currentPriceInCents * remainingRatio);

    // Charge for remaining portion of new plan
    const charge = Math.round(newPriceInCents * remainingRatio);

    return {
      credit,
      charge,
      net: charge - credit,
    };
  }

  /**
   * Handle Stripe webhook events for this pricing pattern
   */
  async handleWebhookEvent(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'invoice.paid':
        return { handled: true, action: 'subscription_payment_succeeded' };
      case 'invoice.payment_failed':
        return { handled: true, action: 'subscription_payment_failed' };
      case 'customer.subscription.updated':
        return { handled: true, action: 'subscription_updated' };
      case 'customer.subscription.deleted':
        return { handled: true, action: 'subscription_canceled' };
      default:
        return { handled: false };
    }
  }

  /**
   * Get configuration
   */
  getConfig(): FlatRateConfig {
    return { ...this.config };
  }

  /**
   * Get annual price (with typical 2-month discount)
   */
  getAnnualPrice(): number {
    if (this.config.billingPeriod === 'annual') {
      return this.config.priceInCents;
    }
    // 10 months instead of 12 (16.7% discount)
    return this.config.priceInCents * 10;
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default FlatRatePricing;
