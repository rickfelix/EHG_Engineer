/**
 * system_alerts write-contract — SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-B (child B).
 *
 * The SINGLE fail-loud writer that every breakage detector + the canary (children C/D) and the
 * catch-rate harness (F) use to persist a breakage alert to system_alerts. Consumes child A's
 * frozen taxonomy (lib/coordinator/break-class-taxonomy.cjs): the precise break-class id rides in
 * system_alerts.metadata.break_class (the harness read-back key); alert_type is written via
 * toAlertType() to a value the LIVE system_alerts_alert_type_check admits
 * (circuit_breaker/threshold_breach/system_health/eva_error) — NO alert_type CHECK widening
 * (protects the 3 live EVA SECURITY-DEFINER functions). Severity stays in the live
 * {info,warning,critical} set. Reuses the 14 existing system_alerts columns; no schema migration.
 *
 * NOT-NULL columns supplied: alert_type, severity, title, message, source_service.
 * Dedup: an OPEN alert (resolved_at IS NULL) for the same (metadata.break_class, source_service)
 * is suppressed so a recurring breakage does not flood the table. Fail-loud: any query/insert error
 * throws — never a silent swallow. Pure builder logic is unit-tested with a fake supabase (no live
 * writes); call sites in child C must use THIS writer (no hand-rolled inserts).
 *
 * @module lib/breakage/alert-writer
 */
// @wire-check-exempt: write-contract for the BREAKAGE-DETECTOR decomposition; consumers are sibling
// children C (detector wiring) / D (canary) / F (harness) which are not yet built. Correctly
// unreferenced until child C imports recordSystemAlert — NOT dead code. REMOVE this marker when a
// sibling imports it (then it is genuinely reachable and must be wire-checked). Coordinator-
// sanctioned exemption pattern for a decomposition-root module (same as child A's taxonomy).
'use strict';

const {
  BREAK_CLASSES,
  BREAK_CLASS_SPEC,
  LEGAL_SEVERITIES,
  toAlertType,
} = require('../coordinator/break-class-taxonomy.cjs');

/**
 * Build the canonical system_alerts row for a break class (pure — no IO). Exposed for testing +
 * for callers that want the row without writing.
 * @param {object} opts
 * @returns {object} a system_alerts insert payload (all NOT-NULL columns populated)
 */
function buildAlertRow(opts = {}) {
  const { breakClass, sourceService, severity, title, message, sourceEntityId, metadata } = opts;
  if (!BREAK_CLASSES.includes(breakClass)) {
    throw new Error(
      `[recordSystemAlert] unknown break class "${breakClass}" — must be one of: ${BREAK_CLASSES.join(', ')}`
    );
  }
  if (!sourceService || typeof sourceService !== 'string') {
    throw new Error('[recordSystemAlert] sourceService (NOT NULL) is required');
  }
  const spec = BREAK_CLASS_SPEC[breakClass];
  const sev = severity && LEGAL_SEVERITIES.includes(severity) ? severity : spec.defaultSeverity;
  return {
    alert_type: toAlertType(breakClass), // guaranteed in the legal CHECK set by child A
    severity: sev,
    title: title || `Breakage: ${spec.label}`,
    message: message || `${spec.label} detected by the breakage detector`,
    source_service: sourceService,
    source_entity_id: sourceEntityId || null,
    metadata: { ...(metadata && typeof metadata === 'object' ? metadata : {}), break_class: breakClass },
  };
}

/**
 * Persist a breakage alert to system_alerts — the single fail-loud, deduped write-contract.
 * @param {object} supabase - Supabase client
 * @param {object} opts - { breakClass (required, in BREAK_CLASSES), sourceService (required), severity?, title?, message?, sourceEntityId?, metadata? }
 * @returns {Promise<{id: string, deduped: boolean}>}
 */
async function recordSystemAlert(supabase, opts = {}) {
  const row = buildAlertRow(opts); // loud reject on bad class / missing source before any IO

  // Dedup: skip if an OPEN (unresolved) alert for the same break_class + source already exists.
  const { data: existing, error: dedupErr } = await supabase
    .from('system_alerts')
    .select('id')
    .eq('source_service', row.source_service)
    .eq('metadata->>break_class', row.metadata.break_class)
    .is('resolved_at', null)
    .limit(1);
  if (dedupErr) {
    throw new Error(`[recordSystemAlert] dedup query failed (fail-loud): ${dedupErr.message}`);
  }
  if (Array.isArray(existing) && existing.length > 0) {
    return { id: existing[0].id, deduped: true };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('system_alerts')
    .insert(row)
    .select('id')
    .single();
  if (insertErr) {
    throw new Error(`[recordSystemAlert] insert failed (fail-loud): ${insertErr.message}`);
  }
  return { id: inserted.id, deduped: false };
}

module.exports = { recordSystemAlert, buildAlertRow };
