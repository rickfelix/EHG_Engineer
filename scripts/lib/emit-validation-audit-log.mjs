// scripts/lib/emit-validation-audit-log.mjs
// FAIL-CLOSED-WITH-RETRY validation_audit_log emission helper.
// Closes RISK F-A-R-11 (CRITICAL unmitigated in LEAD RISK analysis).
// On any failure during 3 attempts (100ms / 300ms / 900ms backoff), THROWS — caller MUST rollback transaction and FAIL handoff.

const DEFAULT_BACKOFF_MS = [100, 300, 900];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Emit a row to validation_audit_log with FAIL-CLOSED-WITH-RETRY semantics.
 *
 * @param {object} params
 * @param {object} params.supabase - Supabase client (required).
 * @param {string} params.correlation_id - UUID for downstream parity JOIN (required).
 * @param {string|null} params.sd_id - SD UUID context.
 * @param {string|null} params.sd_type - SD type ('infrastructure', etc.).
 * @param {string} params.validator_name - Source identifier (required).
 * @param {string} params.failure_reason - Required text (caller-provided).
 * @param {string|null} params.artifact_id - Linked artifact UUID.
 * @param {string} params.failure_category - Required category (e.g., 'bypass', 'bypass_rejected').
 * @param {object} params.metadata - JSONB metadata.
 * @param {string} params.execution_context - Caller identifier.
 * @param {object} [options]
 * @param {number[]} [options.backoff_ms] - Override default backoff array.
 * @returns {Promise<{id: string, written_at: string}>}
 * @throws {Error} After 3 retry exhaustion — caller MUST rollback and FAIL handoff.
 */
export async function emitValidationAuditLog(params, options = {}) {
  if (!params || !params.supabase) throw new Error('emitValidationAuditLog: supabase client required');
  if (!params.correlation_id) throw new Error('emitValidationAuditLog: correlation_id required');
  if (!params.validator_name) throw new Error('emitValidationAuditLog: validator_name required');
  if (!params.failure_reason) throw new Error('emitValidationAuditLog: failure_reason required');
  if (!params.failure_category) throw new Error('emitValidationAuditLog: failure_category required');

  const backoff = options.backoff_ms || DEFAULT_BACKOFF_MS;
  if (!Array.isArray(backoff) || backoff.length !== 3) {
    throw new Error('emitValidationAuditLog: backoff_ms must be array of exactly 3 entries');
  }

  const row = {
    correlation_id: params.correlation_id,
    sd_id: params.sd_id || null,
    sd_type: params.sd_type || null,
    validator_name: params.validator_name,
    failure_reason: params.failure_reason,
    artifact_id: params.artifact_id || null,
    failure_category: params.failure_category,
    metadata: {
      ...(params.metadata || {}),
      correlation_id: params.correlation_id,
      emit_helper_version: '1.0.0',
    },
    execution_context: params.execution_context || 'emit-validation-audit-log',
  };

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(backoff[attempt - 1]);
    const { data, error } = await params.supabase
      .from('validation_audit_log')
      .insert(row)
      .select('id, created_at')
      .single();
    if (!error && data) {
      return { id: data.id, written_at: data.created_at };
    }
    lastErr = error;
  }
  throw new Error(
    `emitValidationAuditLog: FAIL-CLOSED after 3 retries (backoff=${backoff.join('/')}ms) — caller MUST rollback transaction and FAIL handoff. Last error: ${lastErr?.message || 'unknown'}`
  );
}
