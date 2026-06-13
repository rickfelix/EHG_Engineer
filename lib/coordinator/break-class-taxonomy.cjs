/**
 * Break-class taxonomy — SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-A (child A of the
 * production-breakage detector/surface orchestrator).
 *
 * This is the SINGLE source of truth for the enumerated set of production-breakage classes
 * and is the DENOMINATOR for the X2 catch-rate measurement (KR-2026-07-02): an injected defect
 * of each class must fire an alert before a simulated customer report, measured as
 * caught / DENOMINATOR_COUNT. The set is FROZEN and pinned by tests/unit/break-class-taxonomy.test.js
 * (the test IS the freeze — no post-hoc redefinition without a deliberate, reviewed test change).
 *
 * FROZEN ENCODING CONTRACT (orchestrator-owned, consumed by sibling children B-F): the canonical
 * alert encoding carries the class id in system_alerts.metadata.break_class; alert_type is written
 * via toAlertType() to a value the LIVE system_alerts_alert_type_check admits
 * (circuit_breaker/threshold_breach/system_health/eva_error) — so NO alert_type CHECK widening is
 * needed (that would risk the 3 live EVA SECURITY-DEFINER functions). Severity uses the live
 * system_alerts 3-level vocab {info,warning,critical} (NOT eva_severity).
 *
 * Doctrine matches lib/coordinator/row-growth.cjs / detectors.cjs: a PURE, frozen, require()-able
 * CommonJS module — no DB/IO here. Children C (detector wiring), D (canary), and F (catch-rate
 * harness) import this contract so the class list, severity, and encoding are declared exactly once.
 *
 * @module lib/coordinator/break-class-taxonomy
 */
'use strict';

/** Bump deliberately (reviewed) when the taxonomy changes — pinned by test so it cannot drift silently. */
const TAXONOMY_VERSION = 'v1';

/**
 * The enumerated break classes, in stable order. This array IS the X2 denominator.
 * 'model-availability-cap' is the slash-free normalization of the proposal's
 * 'model-availability/cap' (valid identifier; safe as a jsonb key / board filter).
 */
const BREAK_CLASSES = Object.freeze([
  'schema-drift',
  'migration-fail',
  'row-growth-anomaly',
  'RLS-regression',
  'model-availability-cap',
  'gate-pipeline-down',
  'payment-webhook-fail',
]);

/** The X2 catch-rate denominator (count of enumerated break classes). */
const DENOMINATOR_COUNT = BREAK_CLASSES.length;

/** Legal system_alerts.alert_type values — the LIVE system_alerts_alert_type_check set. */
const LEGAL_ALERT_TYPES = Object.freeze(['circuit_breaker', 'threshold_breach', 'system_health', 'eva_error']);

/** Legal system_alerts.severity values — the LIVE system_alerts_severity_check set. */
const LEGAL_SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

/**
 * Per-class spec. `defaultSeverity` is a legal system_alerts severity; `alertType` is the legal
 * system_alerts.alert_type this class is encoded as (the class id itself rides in
 * metadata.break_class); `detector` names the PRODUCING component as an ASPIRATIONAL mapping —
 * it documents intent, NOT current readiness (the detectors/canary land in children C and D).
 */
const BREAK_CLASS_SPEC = Object.freeze({
  'schema-drift':           Object.freeze({ label: 'Schema drift',                   defaultSeverity: 'critical', alertType: 'system_health',    detector: 'schema-reference-lint (child C)' }),
  'migration-fail':         Object.freeze({ label: 'Migration apply failure',        defaultSeverity: 'critical', alertType: 'system_health',    detector: 'migration-apply-state (child C)' }),
  'row-growth-anomaly':     Object.freeze({ label: 'Row-growth anomaly',             defaultSeverity: 'warning',  alertType: 'threshold_breach', detector: 'lib/coordinator/row-growth.cjs (child C)' }),
  'RLS-regression':         Object.freeze({ label: 'RLS regression',                 defaultSeverity: 'critical', alertType: 'system_health',    detector: 'breakage canary (child D)' }),
  'model-availability-cap': Object.freeze({ label: 'Model availability / usage cap', defaultSeverity: 'warning',  alertType: 'threshold_breach', detector: 'llm_canary_* / breakage canary (child D)' }),
  'gate-pipeline-down':     Object.freeze({ label: 'Gate pipeline down',             defaultSeverity: 'critical', alertType: 'system_health',    detector: 'breakage canary (child D)' }),
  'payment-webhook-fail':   Object.freeze({ label: 'Payment webhook failure',        defaultSeverity: 'critical', alertType: 'system_health',    detector: 'breakage canary (child D)' }),
});

/**
 * Map a break-class id to a LEGAL system_alerts.alert_type. Callers MUST also write the precise
 * class id to system_alerts.metadata.break_class (the canonical encoding the harness reads back via
 * metadata->>'break_class'). Unknown ids fail-safe to 'system_health' (still legal — never a CHECK
 * violation); pass only BREAK_CLASSES members in normal use.
 * @param {string} breakClassId
 * @returns {string} a value guaranteed to be in LEGAL_ALERT_TYPES
 */
function toAlertType(breakClassId) {
  const spec = BREAK_CLASS_SPEC[breakClassId];
  return (spec && spec.alertType) || 'system_health';
}

module.exports = Object.freeze({
  TAXONOMY_VERSION,
  BREAK_CLASSES,
  DENOMINATOR_COUNT,
  LEGAL_ALERT_TYPES,
  LEGAL_SEVERITIES,
  BREAK_CLASS_SPEC,
  toAlertType,
});
