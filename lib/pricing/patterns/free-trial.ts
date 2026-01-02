/**
 * Free Trial Pricing Pattern
 *
 * Provides N-day trial before billing begins.
 * Handles trial end notifications and automatic conversion to paid.
 *
 * SD-PRICING-PATTERNS-001
 */

export interface FreeTrialConfig {
  productId: string;
  productName: string;
  priceInCents: number;
  currency: string;
  billingPeriod: 'monthly' | 'annual';
  trialDays: 7 | 14 | 30;
  reminderDaysBefore: number;
  requirePaymentMethod: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
}

export interface TrialSubscription {
  id: string;
  customerId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  trialStart: Date;
  trialEnd: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  priceInCents: number;
  stripeSubscriptionId: string;
  reminderSent: boolean;
}

export interface CreateTrialParams {
  customerId: string;
  stripeCustomerId: string;
  email: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

/**
 * FreeTrialPricing class for trial subscriptions
 */
export class FreeTrialPricing {
  private config: FreeTrialConfig;

  constructor(config: FreeTrialConfig) {
    this.config = config;
  }

  /**
   * Create a trial subscription
   */
  async create(params: CreateTrialParams): Promise<TrialSubscription> {
    if (this.config.requirePaymentMethod && !params.paymentMethodId) {
      throw new Error('Payment method required for trial subscription');
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + this.config.trialDays);

    return {
      id: `sub_${generateId()}`,
      customerId: params.customerId,
      status: 'trialing',
      trialStart: now,
      trialEnd: trialEnd,
      priceInCents: this.config.priceInCents,
      stripeSubscriptionId: `sub_stripe_${generateId()}`,
      reminderSent: false,
    };
  }

  /**
   * Check if trial is ending soon and needs reminder
   */
  shouldSendReminder(subscription: TrialSubscription): boolean {
    if (subscription.reminderSent) return false;
    if (subscription.status !== 'trialing') return false;

    const now = new Date();
    const daysUntilEnd = Math.ceil(
      (subscription.trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysUntilEnd <= this.config.reminderDaysBefore && daysUntilEnd > 0;
  }

  /**
   * Get days remaining in trial
   */
  getDaysRemaining(subscription: TrialSubscription): number {
    if (subscription.status !== 'trialing') return 0;

    const now = new Date();
    const daysRemaining = Math.ceil(
      (subscription.trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return Math.max(0, daysRemaining);
  }

  /**
   * Check if trial has expired
   */
  isTrialExpired(subscription: TrialSubscription): boolean {
    if (subscription.status !== 'trialing') return false;
    return new Date() >= subscription.trialEnd;
  }

  /**
   * Convert trial to paid subscription
   */
  async convertToPaid(subscription: TrialSubscription): Promise<TrialSubscription> {
    if (subscription.status !== 'trialing') {
      throw new Error('Can only convert trialing subscriptions');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (this.config.billingPeriod === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    return {
      ...subscription,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    };
  }

  /**
   * Generate trial reminder email content
   */
  getReminderEmailContent(subscription: TrialSubscription): {
    subject: string;
    body: string;
  } {
    const daysRemaining = this.getDaysRemaining(subscription);
    const priceFormatted = (this.config.priceInCents / 100).toFixed(2);

    return {
      subject: `Your trial ends in ${daysRemaining} days`,
      body: `Your free trial of ${this.config.productName} will end in ${daysRemaining} days. ` +
        `After your trial, you will be charged $${priceFormatted}/${this.config.billingPeriod}. ` +
        'No action needed to continue - you can cancel anytime before your trial ends.',
    };
  }

  /**
   * Handle Stripe webhook events for trial pricing
   */
  async handleWebhookEvent(event: {
    type: string;
    data: Record<string, unknown>;
  }): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'customer.subscription.trial_will_end':
        return { handled: true, action: 'send_trial_ending_reminder' };
      case 'customer.subscription.updated':
        const status = (event.data as { status?: string }).status;
        if (status === 'active') {
          return { handled: true, action: 'trial_converted_to_paid' };
        }
        return { handled: true, action: 'subscription_updated' };
      case 'customer.subscription.deleted':
        return { handled: true, action: 'trial_or_subscription_canceled' };
      default:
        return { handled: false };
    }
  }

  getConfig(): FreeTrialConfig {
    return { ...this.config };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default FreeTrialPricing;
