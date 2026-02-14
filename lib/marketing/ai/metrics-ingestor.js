/**
 * Marketing Metrics Ingestor
 * SD-EVA-FEAT-MARKETING-AI-001 (US-006)
 *
 * Ingests performance metrics from marketing platforms via:
 * - Scheduled API polling (hourly)
 * - Real-time webhook callbacks
 *
 * All metrics are normalized to a common schema before storage.
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 30_000;
const WEBHOOK_PROCESSING_TARGET_MS = 500;

/**
 * Common metric schema.
 * @typedef {{channel: string, metricType: string, value: number, timestamp: string, source: string, raw?: object}} NormalizedMetric
 */

/**
 * Create a metrics ingestor instance.
 *
 * @param {object} deps
 * @param {object} deps.supabase - Supabase client
 * @param {object} [deps.platformClients] - Map of platform name → API client
 * @param {object} [deps.notifier] - Notification service for alerts
 * @param {object} [deps.logger] - Logger
 * @returns {MetricsIngestor}
 */
export function createMetricsIngestor(deps) {
  const { supabase, platformClients = {}, notifier, logger = console } = deps;

  return {
    /**
     * Poll a specific platform for new metrics since last poll.
     *
     * @param {string} platformName - Platform identifier
     * @returns {Promise<{success: boolean, metricsIngested: number, error?: string}>}
     */
    async pollPlatform(platformName) {
      const client = platformClients[platformName];
      if (!client) {
        return { success: false, metricsIngested: 0, error: `No client for platform: ${platformName}` };
      }

      // Get last poll timestamp
      const { data: lastPoll } = await supabase
        .from('metrics_poll_state')
        .select('last_poll_at')
        .eq('platform_name', platformName)
        .single();

      const since = lastPoll?.last_poll_at ?? new Date(Date.now() - 3600_000).toISOString();
      let rawMetrics;
      let retryCount = 0;

      while (retryCount <= MAX_RETRIES) {
        try {
          rawMetrics = await client.fetchMetrics({ since });
          break;
        } catch (err) {
          retryCount++;
          logger.warn(`Poll failed for ${platformName} (attempt ${retryCount}/${MAX_RETRIES + 1}):`, err.message);

          if (retryCount > MAX_RETRIES) {
            // Alert on exhausted retries
            if (notifier) {
              await notifier.alert({
                type: 'metrics_poll_failure',
                platform: platformName,
                error: err.message,
                attempts: retryCount
              });
            }
            return {
              success: false,
              metricsIngested: 0,
              error: `Poll failed after ${retryCount} attempts: ${err.message}`
            };
          }

          await sleep(RETRY_DELAY_MS);
        }
      }

      // Normalize and store
      const normalized = rawMetrics.map(m => normalizeMetric(m, platformName));
      if (normalized.length > 0) {
        const { error } = await supabase.from('marketing_metrics').insert(normalized);
        if (error) {
          logger.error('Failed to store metrics:', error.message);
          return { success: false, metricsIngested: 0, error: error.message };
        }
      }

      // Update poll state
      await supabase.from('metrics_poll_state').upsert({
        platform_name: platformName,
        last_poll_at: new Date().toISOString()
      }, { onConflict: 'platform_name' });

      return { success: true, metricsIngested: normalized.length };
    },

    /**
     * Process an incoming webhook payload from a marketing platform.
     *
     * @param {object} params
     * @param {string} params.platformName - Source platform
     * @param {object} params.payload - Raw webhook payload
     * @param {object} [params.headers] - Request headers (for signature verification)
     * @returns {Promise<{accepted: boolean, metricsIngested: number, processingTimeMs: number, error?: string}>}
     */
    async processWebhook(params) {
      const startTime = Date.now();
      const { platformName, payload, headers } = params;

      // Validate payload has expected fields
      if (!payload || typeof payload !== 'object') {
        return {
          accepted: false,
          metricsIngested: 0,
          processingTimeMs: Date.now() - startTime,
          error: 'Invalid payload: expected object'
        };
      }

      // Validate signature if verifier available
      const client = platformClients[platformName];
      if (client?.verifySignature && headers) {
        try {
          const valid = await client.verifySignature(payload, headers);
          if (!valid) {
            logger.warn(`Webhook signature verification failed for ${platformName}`);
            return {
              accepted: false,
              metricsIngested: 0,
              processingTimeMs: Date.now() - startTime,
              error: 'Signature verification failed'
            };
          }
        } catch (err) {
          logger.warn('Signature verification error:', err.message);
        }
      }

      // Normalize the webhook event to metrics
      const events = Array.isArray(payload.events) ? payload.events : [payload];
      const normalized = events
        .map(e => normalizeMetric(e, platformName))
        .filter(m => m !== null);

      if (normalized.length > 0) {
        const { error } = await supabase.from('marketing_metrics').insert(normalized);
        if (error) {
          return {
            accepted: false,
            metricsIngested: 0,
            processingTimeMs: Date.now() - startTime,
            error: `Storage failed: ${error.message}`
          };
        }
      }

      const processingTimeMs = Date.now() - startTime;
      if (processingTimeMs > WEBHOOK_PROCESSING_TARGET_MS) {
        logger.warn(`Webhook processing exceeded target: ${processingTimeMs}ms > ${WEBHOOK_PROCESSING_TARGET_MS}ms`);
      }

      return {
        accepted: true,
        metricsIngested: normalized.length,
        processingTimeMs
      };
    },

    /**
     * Poll all configured platforms.
     *
     * @returns {Promise<{results: Array<{platform: string, success: boolean, metricsIngested: number}>}>}
     */
    async pollAll() {
      const results = [];
      for (const platformName of Object.keys(platformClients)) {
        const result = await this.pollPlatform(platformName);
        results.push({ platform: platformName, ...result });
      }
      return { results };
    }
  };
}

/**
 * Normalize a raw metric event to the common schema.
 *
 * @param {object} raw - Raw metric from platform
 * @param {string} source - Platform name
 * @returns {NormalizedMetric|null}
 */
function normalizeMetric(raw, source) {
  try {
    return {
      channel: raw.channel ?? raw.platform ?? raw.source ?? source,
      metric_type: raw.metric_type ?? raw.type ?? raw.event_type ?? 'unknown',
      value: typeof raw.value === 'number' ? raw.value : parseFloat(raw.value) || 0,
      timestamp: raw.timestamp ?? raw.created_at ?? new Date().toISOString(),
      source,
      raw_data: raw
    };
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { normalizeMetric, MAX_RETRIES, RETRY_DELAY_MS, WEBHOOK_PROCESSING_TARGET_MS };
