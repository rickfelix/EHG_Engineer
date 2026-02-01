/**
 * Idempotent Worker Base Class
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * Provides base implementation for pipeline workers with:
 * - At-least-once delivery safety via idempotency keys
 * - Automatic retry with exponential backoff
 * - Configuration-driven stage enabling/disabling
 * - Event emission at each processing step
 *
 * FR-5: Implement idempotent worker pattern with retry + dedupe
 *
 * @module lib/data-plane/idempotent-worker
 */

import { createClient } from '@supabase/supabase-js';
import {
  emitEvent,
  checkEventExists,
  markEventProcessed,
  generateIdempotencyKey,
  generateCorrelationId
} from './events.js';

// Default configuration
const DEFAULT_CONFIG = {
  maxRetries: 3,
  retryBackoffBaseMs: 2000,
  configRefreshIntervalMs: 60000
};

// Cached configuration
let configCache = null;
let lastConfigFetch = 0;

/**
 * Get Supabase client
 * @returns {Object} Supabase client instance
 */
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Fetch configuration from database
 * Caches for configRefreshIntervalMs to avoid DB round-trips
 *
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<Object>} Configuration object
 */
export async function fetchConfig(supabase = null) {
  const now = Date.now();

  // Return cached config if fresh
  if (configCache && (now - lastConfigFetch) < DEFAULT_CONFIG.configRefreshIntervalMs) {
    return configCache;
  }

  try {
    const client = supabase || getSupabase();

    // Fetch all active config entries
    const { data, error } = await client
      .from('integration_config')
      .select('config_key, config_value')
      .eq('is_active', true);

    if (error) throw error;

    // Build config object from entries
    const config = {
      pipeline: { enabled: true },
      stages: {
        feedback_to_proposal: { enabled: true },
        prioritization: { enabled: true },
        execution: { enabled: true }
      },
      worker: {
        maxRetries: DEFAULT_CONFIG.maxRetries,
        retryBackoffBaseMs: DEFAULT_CONFIG.retryBackoffBaseMs
      },
      events: {
        redactPayloads: false
      }
    };

    // Merge database config
    for (const entry of data || []) {
      if (entry.config_key === 'pipeline_processing_config') {
        const pipelineConfig = entry.config_value;
        if (pipelineConfig.batch_size) config.pipeline.batchSize = pipelineConfig.batch_size;
        if (pipelineConfig.retry_max_attempts) config.worker.maxRetries = pipelineConfig.retry_max_attempts;
        if (pipelineConfig.retry_backoff_base_seconds) {
          config.worker.retryBackoffBaseMs = pipelineConfig.retry_backoff_base_seconds * 1000;
        }
      }

      if (entry.config_key === 'event_routing_config') {
        const routingConfig = entry.config_value;
        if (routingConfig.feedback_intake) {
          config.stages.feedback_to_proposal.enabled = routingConfig.feedback_intake.enabled !== false;
        }
        if (routingConfig.prioritization) {
          config.stages.prioritization.enabled = routingConfig.prioritization.enabled !== false;
        }
        if (routingConfig.execution_enqueue) {
          config.stages.execution.enabled = routingConfig.execution_enqueue.enabled !== false;
        }
      }
    }

    configCache = config;
    lastConfigFetch = now;
    return config;

  } catch (error) {
    console.error('[IdempotentWorker] Failed to fetch config:', error.message);
    // Return cached config or defaults on error
    return configCache || {
      pipeline: { enabled: true },
      stages: {
        feedback_to_proposal: { enabled: true },
        prioritization: { enabled: true },
        execution: { enabled: true }
      },
      worker: DEFAULT_CONFIG,
      events: { redactPayloads: false }
    };
  }
}

/**
 * Force config refresh (useful after config changes)
 */
export function invalidateConfigCache() {
  configCache = null;
  lastConfigFetch = 0;
}

/**
 * Base class for idempotent pipeline workers
 */
export class IdempotentWorker {
  /**
   * Create an idempotent worker
   *
   * @param {Object} options - Worker options
   * @param {string} options.stageName - Stage name (e.g., 'feedback_to_proposal')
   * @param {string} options.entityType - Entity type for events
   * @param {Object} [options.supabase] - Optional Supabase client
   */
  constructor({ stageName, entityType, supabase = null }) {
    this.stageName = stageName;
    this.entityType = entityType;
    this.supabase = supabase || getSupabase();
  }

  /**
   * Get current configuration
   * @returns {Promise<Object>} Configuration object
   */
  async getConfig() {
    return fetchConfig(this.supabase);
  }

  /**
   * Check if this stage is enabled
   * @returns {Promise<boolean>} Whether stage is enabled
   */
  async isStageEnabled() {
    const config = await this.getConfig();

    // Check global pipeline enable
    if (!config.pipeline?.enabled) {
      return false;
    }

    // Check stage-specific enable
    return config.stages?.[this.stageName]?.enabled !== false;
  }

  /**
   * Generate idempotency key for this worker's operation
   *
   * @param {string} entityId - Entity ID being processed
   * @param {string} eventType - Event type being generated
   * @param {number} [version=1] - Version number
   * @returns {string} Idempotency key
   */
  getIdempotencyKey(entityId, eventType, version = 1) {
    return generateIdempotencyKey(eventType, this.entityType, entityId, version);
  }

  /**
   * Generate correlation ID for tracing
   * @param {string} baseId - Base entity ID
   * @returns {string} Correlation ID
   */
  getCorrelationId(baseId) {
    return generateCorrelationId(baseId);
  }

  /**
   * Check if operation was already completed
   *
   * @param {string} idempotencyKey - Key to check
   * @returns {Promise<boolean>} Whether operation was completed
   */
  async wasAlreadyProcessed(idempotencyKey) {
    const result = await checkEventExists(idempotencyKey, this.supabase);
    return result.exists && result.processed;
  }

  /**
   * Emit an event for this worker
   *
   * @param {Object} params - Event parameters
   * @returns {Promise<Object>} Emit result
   */
  async emit(params) {
    return emitEvent({
      ...params,
      supabase: this.supabase
    });
  }

  /**
   * Mark event as processed
   *
   * @param {string} eventId - Event ID to mark
   * @returns {Promise<Object>} Mark result
   */
  async markProcessed(eventId) {
    return markEventProcessed(eventId, this.supabase);
  }

  /**
   * Execute with retry logic
   *
   * @param {Function} operation - Async operation to execute
   * @param {Object} [context={}] - Context for logging
   * @returns {Promise<Object>} Operation result
   */
  async executeWithRetry(operation, context = {}) {
    const config = await this.getConfig();
    const maxRetries = config.worker?.maxRetries || DEFAULT_CONFIG.maxRetries;
    const backoffBase = config.worker?.retryBackoffBaseMs || DEFAULT_CONFIG.retryBackoffBaseMs;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (this.isRetryableError(error)) {
          if (attempt < maxRetries) {
            const delay = backoffBase * Math.pow(2, attempt - 1);
            console.log(`[${this.stageName}] Retry ${attempt}/${maxRetries} in ${delay}ms:`, error.message);
            await this.sleep(delay);
          }
        } else {
          // Non-retryable error, fail immediately
          throw error;
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Check if error is retryable
   * Override in subclass for custom logic
   *
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   */
  isRetryableError(error) {
    // Network errors, timeouts, and transient DB errors are retryable
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /socket hang up/i,
      /temporarily unavailable/i,
      /deadlock/i,
      /lock wait timeout/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process an item through the worker
   * Must be implemented by subclass
   *
   * @param {Object} item - Item to process
   * @returns {Promise<Object>} Processing result
   */
  async process(item) {
    throw new Error('process() must be implemented by subclass');
  }

  /**
   * Run the worker with idempotency checks
   *
   * @param {Object} item - Item to process
   * @returns {Promise<Object>} Processing result
   */
  async run(item) {
    // Check if stage is enabled
    const enabled = await this.isStageEnabled();
    if (!enabled) {
      console.log(`[${this.stageName}] Stage disabled by config, skipping`);
      return {
        success: true,
        skipped: true,
        reason: 'disabled_by_config'
      };
    }

    // Execute with retry
    try {
      return await this.executeWithRetry(() => this.process(item));
    } catch (error) {
      console.error(`[${this.stageName}] Processing failed after retries:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default {
  IdempotentWorker,
  fetchConfig,
  invalidateConfigCache
};
