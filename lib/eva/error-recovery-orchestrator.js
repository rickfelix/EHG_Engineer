/**
 * Error Recovery Orchestrator
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-F
 *
 * Unified entry point that chains saga coordinator, circuit breaker,
 * gate-failure-recovery, and DLQ into a single recovery pipeline.
 *
 * @module lib/eva/error-recovery-orchestrator
 */

import { createSagaCoordinator } from './saga-coordinator.js';
import { attemptGateRecovery, classifyFailureSeverity } from './gate-failure-recovery.js';
import { replayDLQEntry } from './event-bus/event-router.js';

/**
 * @typedef {object} RecoveryResult
 * @property {'recovered'|'compensated'|'escalated'|'failed'} outcome
 * @property {string} strategy - Which recovery path was used
 * @property {object} [details] - Strategy-specific details
 * @property {Error} [error] - If failed, the final error
 */

/**
 * Circuit breaker wrapper for external service calls.
 * Checks system_health table before allowing calls.
 *
 * @param {object} supabase
 * @param {string} serviceName
 * @param {Function} fn - The async function to protect
 * @returns {Promise<any>}
 */
export async function withCircuitBreaker(supabase, serviceName, fn) {
  const { data } = await supabase
    .from('system_health')
    .select('circuit_breaker_state, failure_count, last_failure_at')
    .eq('service_name', serviceName)
    .single()
    .catch(() => ({ data: null }));

  const state = data?.circuit_breaker_state || 'CLOSED';
  const RECOVERY_WINDOW_MS = 60 * 60 * 1000;

  if (state === 'OPEN') {
    const lastFailure = data?.last_failure_at ? new Date(data.last_failure_at).getTime() : 0;
    if (Date.now() - lastFailure < RECOVERY_WINDOW_MS) {
      const err = new Error(`Circuit breaker OPEN for ${serviceName}`);
      err.circuitBreakerTripped = true;
      throw err;
    }
    // Recovery window passed — allow one test request (HALF_OPEN)
  }

  try {
    const result = await fn();
    // Record success
    await supabase.from('system_health').upsert({
      service_name: serviceName,
      circuit_breaker_state: 'CLOSED',
      failure_count: 0,
      last_success_at: new Date().toISOString(),
    }, { onConflict: 'service_name' }).catch(() => {});
    return result;
  } catch (err) {
    // Record failure
    const newCount = (data?.failure_count || 0) + 1;
    const newState = newCount >= 3 ? 'OPEN' : state;
    await supabase.from('system_health').upsert({
      service_name: serviceName,
      circuit_breaker_state: newState,
      failure_count: newCount,
      last_failure_at: new Date().toISOString(),
    }, { onConflict: 'service_name' }).catch(() => {});
    throw err;
  }
}

/**
 * Recover from an event processing failure.
 * Tries DLQ replay first, then saga compensation.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.eventId - The failed event ID
 * @param {string} params.eventType
 * @param {object} params.payload
 * @param {Error} params.error
 * @returns {Promise<RecoveryResult>}
 */
export async function recoverEventFailure({ supabase, eventId, eventType, payload, error }) {
  // Check if this event is in DLQ
  const { data: dlqEntry } = await supabase
    .from('eva_events_dlq')
    .select('id, replayed')
    .eq('original_event_id', eventId)
    .single()
    .catch(() => ({ data: null }));

  if (dlqEntry && !dlqEntry.replayed) {
    try {
      const result = await replayDLQEntry(supabase, dlqEntry.id);
      return { outcome: 'recovered', strategy: 'dlq_replay', details: result };
    } catch (replayErr) {
      return { outcome: 'failed', strategy: 'dlq_replay', error: replayErr };
    }
  }

  return { outcome: 'escalated', strategy: 'manual_review', details: { eventId, eventType, reason: error.message } };
}

/**
 * Recover from a gate failure using the gate-failure-recovery module.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.ventureId
 * @param {string} params.gateId
 * @param {string[]} params.reasons - Failure reason codes
 * @param {Function} params.reRunFn - Function to re-run the gate
 * @returns {Promise<RecoveryResult>}
 */
export async function recoverGateFailure({ supabase, ventureId, gateId, reasons, reRunFn }) {
  const severity = classifyFailureSeverity(reasons);

  try {
    const result = await attemptGateRecovery(
      { ventureId, gateId, reasons },
      { supabase, reRun: reRunFn }
    );
    return { outcome: 'recovered', strategy: 'gate_retry', details: result };
  } catch (err) {
    return {
      outcome: severity === 'critical' ? 'escalated' : 'failed',
      strategy: 'gate_retry',
      details: { severity, gateId },
      error: err,
    };
  }
}

/**
 * Execute a multi-step operation with saga compensation.
 *
 * @param {object} params
 * @param {object} params.supabase
 * @param {string} params.operationName
 * @param {{ name: string, action: Function, compensate: Function }[]} params.steps
 * @returns {Promise<RecoveryResult>}
 */
export async function executeWithSaga({ supabase, operationName, steps }) {
  const saga = createSagaCoordinator({ name: operationName });

  for (const step of steps) {
    saga.addStep(step.name, step.action, step.compensate);
  }

  const result = await saga.execute();
  await saga.persistLog(supabase, result).catch(() => {});

  if (result.success) {
    return { outcome: 'recovered', strategy: 'saga', details: result };
  }
  if (result.compensationErrors && result.compensationErrors.length === 0) {
    return { outcome: 'compensated', strategy: 'saga', details: result };
  }
  return { outcome: 'failed', strategy: 'saga', details: result, error: result.error };
}

/**
 * Get a summary of all recovery system states.
 *
 * @param {object} supabase
 * @returns {Promise<object>}
 */
export async function getRecoveryStatus(supabase) {
  const [circuitBreakers, dlqStats, sagaLogs] = await Promise.all([
    supabase.from('system_health').select('service_name, circuit_breaker_state, failure_count, last_failure_at, last_success_at').catch(() => ({ data: [] })),
    supabase.from('eva_events_dlq').select('id, event_type, replayed, created_at').order('created_at', { ascending: false }).limit(20).catch(() => ({ data: [] })),
    supabase.from('eva_saga_log').select('saga_id, name, status, created_at').order('created_at', { ascending: false }).limit(20).catch(() => ({ data: [] })),
  ]);

  const dlqItems = dlqStats.data || [];
  const pendingDLQ = dlqItems.filter(i => !i.replayed);

  return {
    circuitBreakers: (circuitBreakers.data || []).map(cb => ({
      service: cb.service_name,
      state: cb.circuit_breaker_state,
      failures: cb.failure_count,
      lastFailure: cb.last_failure_at,
      lastSuccess: cb.last_success_at,
    })),
    dlq: {
      total: dlqItems.length,
      pending: pendingDLQ.length,
      replayed: dlqItems.length - pendingDLQ.length,
      recent: pendingDLQ.slice(0, 5),
    },
    sagas: {
      total: (sagaLogs.data || []).length,
      byStatus: (sagaLogs.data || []).reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {}),
      recent: (sagaLogs.data || []).slice(0, 5),
    },
  };
}
