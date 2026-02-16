/**
 * PostHog Analytics Integration
 *
 * Captures venture lifecycle events and marketing metrics
 * via PostHog. Supports both cloud and self-hosted deployments.
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L
 *
 * @module lib/marketing/posthog-integration
 */

// ── Configuration ───────────────────────────────────────

const DEFAULT_CONFIG = {
  apiKey: process.env.POSTHOG_API_KEY || '',
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
  batchSize: 10,
  flushIntervalMs: 30_000,
  enabled: process.env.POSTHOG_ENABLED !== 'false',
};

// ── Event Types ─────────────────────────────────────────

export const VENTURE_EVENTS = Object.freeze({
  VENTURE_CREATED: 'venture_created',
  STAGE_STARTED: 'stage_started',
  STAGE_COMPLETED: 'stage_completed',
  GATE_PASSED: 'gate_passed',
  GATE_FAILED: 'gate_failed',
  DECISION_SUBMITTED: 'decision_submitted',
  MARKETING_CONTENT_GENERATED: 'marketing_content_generated',
  MARKETING_CONTENT_PUBLISHED: 'marketing_content_published',
  MARKETING_CAMPAIGN_STARTED: 'marketing_campaign_started',
  FEEDBACK_RECEIVED: 'feedback_received',
});

// ── PostHog Client ──────────────────────────────────────

/**
 * Create a PostHog analytics client.
 *
 * @param {object} [config] - Override default configuration
 * @returns {PostHogClient}
 */
export function createPostHogClient(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const eventBuffer = [];
  let flushTimer = null;

  /**
   * Capture an event.
   * @param {string} distinctId - Venture or user identifier
   * @param {string} event - Event name from VENTURE_EVENTS
   * @param {object} [properties] - Event properties
   */
  function capture(distinctId, event, properties = {}) {
    if (!cfg.enabled) return;

    eventBuffer.push({
      distinct_id: distinctId,
      event,
      properties: {
        ...properties,
        $lib: 'ehg-engineer',
        $lib_version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    if (eventBuffer.length >= cfg.batchSize) {
      flush();
    }
  }

  /**
   * Flush buffered events to PostHog.
   * @returns {Promise<{success: boolean, eventsFlushed: number}>}
   */
  async function flush() {
    if (eventBuffer.length === 0) {
      return { success: true, eventsFlushed: 0 };
    }

    const batch = eventBuffer.splice(0);

    if (!cfg.apiKey) {
      // No API key — events are silently dropped (dev mode)
      return { success: true, eventsFlushed: batch.length };
    }

    try {
      const response = await fetch(`${cfg.host}/batch/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: cfg.apiKey,
          batch,
        }),
      });

      return {
        success: response.ok,
        eventsFlushed: batch.length,
      };
    } catch {
      // Re-queue failed events
      eventBuffer.unshift(...batch);
      return { success: false, eventsFlushed: 0 };
    }
  }

  /**
   * Start periodic flushing.
   */
  function startPeriodicFlush() {
    if (flushTimer) return;
    flushTimer = setInterval(flush, cfg.flushIntervalMs);
  }

  /**
   * Stop periodic flushing and flush remaining events.
   * @returns {Promise<{eventsFlushed: number}>}
   */
  async function shutdown() {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    return flush();
  }

  /**
   * Get the number of buffered events.
   * @returns {number}
   */
  function getBufferSize() {
    return eventBuffer.length;
  }

  /**
   * Check if the client is configured with an API key.
   * @returns {boolean}
   */
  function isConfigured() {
    return Boolean(cfg.apiKey);
  }

  return {
    capture,
    flush,
    startPeriodicFlush,
    shutdown,
    getBufferSize,
    isConfigured,
  };
}

// ── Venture Event Helpers ───────────────────────────────

/**
 * Track a venture lifecycle event.
 *
 * @param {PostHogClient} client - PostHog client instance
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.event - Event type from VENTURE_EVENTS
 * @param {object} [params.properties] - Additional properties
 */
export function trackVentureEvent(client, { ventureId, event, properties = {} }) {
  client.capture(ventureId, event, {
    venture_id: ventureId,
    ...properties,
  });
}

/**
 * Track a stage transition.
 *
 * @param {PostHogClient} client
 * @param {object} params
 * @param {string} params.ventureId
 * @param {number} params.fromStage
 * @param {number} params.toStage
 * @param {number} [params.durationMs]
 */
export function trackStageTransition(client, { ventureId, fromStage, toStage, durationMs }) {
  client.capture(ventureId, VENTURE_EVENTS.STAGE_COMPLETED, {
    venture_id: ventureId,
    from_stage: fromStage,
    to_stage: toStage,
    duration_ms: durationMs || null,
  });
}

/**
 * Track marketing content generation.
 *
 * @param {PostHogClient} client
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string} params.contentType
 * @param {string} params.channel
 * @param {number} params.variantCount
 */
export function trackContentGenerated(client, { ventureId, contentType, channel, variantCount }) {
  client.capture(ventureId, VENTURE_EVENTS.MARKETING_CONTENT_GENERATED, {
    venture_id: ventureId,
    content_type: contentType,
    channel,
    variant_count: variantCount,
  });
}

/**
 * Track marketing content publication.
 *
 * @param {PostHogClient} client
 * @param {object} params
 * @param {string} params.ventureId
 * @param {string} params.platform
 * @param {boolean} params.success
 * @param {string} [params.postUrl]
 */
export function trackContentPublished(client, { ventureId, platform, success, postUrl }) {
  client.capture(ventureId, VENTURE_EVENTS.MARKETING_CONTENT_PUBLISHED, {
    venture_id: ventureId,
    platform,
    success,
    post_url: postUrl || null,
  });
}
