/**
 * Venture Health Monitor
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-M
 *
 * Automated HTTP health checks for deployed ventures.
 * Exception-only alerts. Maintenance SDs auto-created for critical issues.
 */

import { processHealthResult, resetAllStates } from './health-alert-manager.js';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_HISTORY_ENTRIES = 50;

/**
 * Execute an HTTP health check against a URL.
 *
 * @param {string} url - The URL to check
 * @param {number} [timeoutMs=10000] - Request timeout in milliseconds
 * @returns {Promise<{ healthy: boolean, statusCode: number|null, responseTime: number, error: string|null }>}
 */
export async function checkVentureHealth(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timer);
    const responseTime = Date.now() - startTime;
    const healthy = response.status >= 200 && response.status < 400;

    return {
      healthy,
      statusCode: response.status,
      responseTime,
      error: healthy ? null : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';

    return {
      healthy: false,
      statusCode: null,
      responseTime,
      error: isTimeout ? `Timeout after ${timeoutMs}ms` : err.message,
    };
  }
}

/**
 * Run a health check for a single venture and process the result.
 * Returns the check result with alert actions.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} url - Venture application URL
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - Request timeout
 * @param {function} [options.onAlert] - Callback for alerts: (ventureId, alertType, context) => void
 * @param {function} [options.onCreateSD] - Callback for SD creation: (ventureId, context) => void
 * @returns {Promise<{ checkResult: object, alertAction: object }>}
 */
export async function monitorVenture(ventureId, url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, onAlert, onCreateSD } = options;

  const checkResult = await checkVentureHealth(url, timeoutMs);
  const alertAction = processHealthResult(ventureId, checkResult.healthy, checkResult);

  // Fire callbacks if actions needed
  if (alertAction.alert && onAlert) {
    onAlert(ventureId, alertAction.alert, { checkResult, alertAction });
  }
  if (alertAction.createSD && onCreateSD) {
    onCreateSD(ventureId, { checkResult, alertAction });
  }

  return { checkResult, alertAction };
}

/**
 * Build a health history entry from a check result.
 *
 * @param {object} checkResult - From checkVentureHealth
 * @param {object} alertAction - From processHealthResult
 * @returns {object} History entry for advisory_data.health_history
 */
export function buildHistoryEntry(checkResult, alertAction) {
  return {
    timestamp: new Date().toISOString(),
    healthy: checkResult.healthy,
    statusCode: checkResult.statusCode,
    responseTime: checkResult.responseTime,
    error: checkResult.error,
    alert: alertAction.alert,
    consecutiveFailures: alertAction.consecutiveFailures,
  };
}

/**
 * Append a health history entry to venture_stage_work advisory_data.
 * Maintains a rolling window of MAX_HISTORY_ENTRIES.
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} lifecycleStage - Stage number (typically 22+)
 * @param {object} entry - History entry from buildHistoryEntry
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function appendHealthHistory(supabase, ventureId, lifecycleStage, entry) {
  try {
    const { data: existing } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', lifecycleStage)
      .maybeSingle();

    const currentAdvisory = existing?.advisory_data || {};
    const history = Array.isArray(currentAdvisory.health_history)
      ? currentAdvisory.health_history
      : [];

    history.push(entry);

    // Rolling window
    while (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
    }

    const updatedAdvisory = { ...currentAdvisory, health_history: history };

    if (existing) {
      const { error } = await supabase
        .from('venture_stage_work')
        .update({ advisory_data: updatedAdvisory })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', lifecycleStage);
      if (error) return { success: false, error: error.message };
    }
    // If no row exists, skip (row must be created by stage execution)

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export { resetAllStates, DEFAULT_TIMEOUT_MS, MAX_HISTORY_ENTRIES };
