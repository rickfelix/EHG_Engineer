/**
 * Metric Collector
 *
 * Tracks conversion, revenue, and engagement metrics per variant.
 *
 * SD-PRICING-TESTING-001
 */

export interface MetricEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  eventType: 'view' | 'click' | 'conversion' | 'revenue';
  value?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface VariantMetrics {
  variantId: string;
  variantName: string;
  visitors: number;
  conversions: number;
  conversionRate: number;
  totalRevenue: number;
  revenuePerVisitor: number;
  averageOrderValue: number;
  engagement: {
    clicks: number;
    clickRate: number;
  };
}

export interface ExperimentMetrics {
  experimentId: string;
  experimentName: string;
  totalVisitors: number;
  totalConversions: number;
  totalRevenue: number;
  overallConversionRate: number;
  variants: VariantMetrics[];
  startDate: Date;
  lastUpdated: Date;
}

/**
 * MetricCollector for experiment event tracking
 */
export class MetricCollector {
  private events: MetricEvent[] = [];
  private uniqueVisitors: Map<string, Set<string>> = new Map(); // experimentId -> Set<userId>

  /**
   * Record a metric event
   */
  async recordEvent(event: Omit<MetricEvent, 'timestamp'>): Promise<void> {
    const fullEvent: MetricEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.events.push(fullEvent);

    // Track unique visitors
    if (event.eventType === 'view') {
      if (!this.uniqueVisitors.has(event.experimentId)) {
        this.uniqueVisitors.set(event.experimentId, new Set());
      }
      this.uniqueVisitors.get(event.experimentId)!.add(event.userId);
    }
  }

  /**
   * Record a page view
   */
  async recordView(experimentId: string, variantId: string, userId: string): Promise<void> {
    await this.recordEvent({
      experimentId,
      variantId,
      userId,
      eventType: 'view',
    });
  }

  /**
   * Record a click
   */
  async recordClick(experimentId: string, variantId: string, userId: string): Promise<void> {
    await this.recordEvent({
      experimentId,
      variantId,
      userId,
      eventType: 'click',
    });
  }

  /**
   * Record a conversion
   */
  async recordConversion(
    experimentId: string,
    variantId: string,
    userId: string,
    revenueInCents?: number
  ): Promise<void> {
    await this.recordEvent({
      experimentId,
      variantId,
      userId,
      eventType: 'conversion',
    });

    if (revenueInCents !== undefined) {
      await this.recordEvent({
        experimentId,
        variantId,
        userId,
        eventType: 'revenue',
        value: revenueInCents,
      });
    }
  }

  /**
   * Get metrics for an experiment
   */
  async getExperimentMetrics(
    experimentId: string,
    variantNames: Map<string, string>
  ): Promise<ExperimentMetrics> {
    const experimentEvents = this.events.filter(e => e.experimentId === experimentId);
    const variantMetricsMap = new Map<string, VariantMetrics>();

    // Group events by variant
    for (const event of experimentEvents) {
      if (!variantMetricsMap.has(event.variantId)) {
        variantMetricsMap.set(event.variantId, {
          variantId: event.variantId,
          variantName: variantNames.get(event.variantId) || event.variantId,
          visitors: 0,
          conversions: 0,
          conversionRate: 0,
          totalRevenue: 0,
          revenuePerVisitor: 0,
          averageOrderValue: 0,
          engagement: { clicks: 0, clickRate: 0 },
        });
      }

      const metrics = variantMetricsMap.get(event.variantId)!;

      switch (event.eventType) {
        case 'view':
          metrics.visitors++;
          break;
        case 'click':
          metrics.engagement.clicks++;
          break;
        case 'conversion':
          metrics.conversions++;
          break;
        case 'revenue':
          metrics.totalRevenue += event.value || 0;
          break;
      }
    }

    // Calculate derived metrics
    const variants: VariantMetrics[] = [];
    let totalVisitors = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const metrics of variantMetricsMap.values()) {
      metrics.conversionRate = metrics.visitors > 0
        ? (metrics.conversions / metrics.visitors) * 100
        : 0;
      metrics.revenuePerVisitor = metrics.visitors > 0
        ? metrics.totalRevenue / metrics.visitors
        : 0;
      metrics.averageOrderValue = metrics.conversions > 0
        ? metrics.totalRevenue / metrics.conversions
        : 0;
      metrics.engagement.clickRate = metrics.visitors > 0
        ? (metrics.engagement.clicks / metrics.visitors) * 100
        : 0;

      totalVisitors += metrics.visitors;
      totalConversions += metrics.conversions;
      totalRevenue += metrics.totalRevenue;

      variants.push(metrics);
    }

    const timestamps = experimentEvents.map(e => e.timestamp);
    const startDate = timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date();
    const lastUpdated = timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date();

    return {
      experimentId,
      experimentName: experimentId,
      totalVisitors,
      totalConversions,
      totalRevenue,
      overallConversionRate: totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0,
      variants,
      startDate,
      lastUpdated,
    };
  }

  /**
   * Get events for a specific user
   */
  async getUserEvents(experimentId: string, userId: string): Promise<MetricEvent[]> {
    return this.events.filter(
      e => e.experimentId === experimentId && e.userId === userId
    );
  }

  /**
   * Clear all events (for testing)
   */
  clearEvents(): void {
    this.events = [];
    this.uniqueVisitors.clear();
  }
}

export default MetricCollector;
