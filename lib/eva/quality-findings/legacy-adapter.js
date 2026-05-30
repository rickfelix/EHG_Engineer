/**
 * Legacy adapter: transform existing code_quality_findings rows into the
 * canonical FindingShape (10 unified categories) used by the Stage 20
 * Unified Quality Lifecycle Loop.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A
 *
 * Idempotent: keyed on finding_hash. Re-running against the same legacy
 * input set yields zero new transformed rows beyond the first run.
 *
 * @module lib/eva/quality-findings/legacy-adapter
 */

import { FINDING_CATEGORIES, SEVERITY_LEVELS, computeFindingHash, validateFindingShape } from './finding-shape.js';

/**
 * Map legacy `check` field to a canonical finding_category.
 * Legacy values observed: "npm_audit", "secrets", "lint", "test_suite",
 * "capability". These map identity. Anything else is unmappable and
 * routed to "capability" with a marker so it surfaces for triage rather
 * than silently dropping.
 */
const LEGACY_CHECK_MAP = Object.freeze({
  npm_audit: 'npm_audit',
  secrets: 'secrets',
  lint: 'lint',
  test_suite: 'test_suite',
  capability: 'capability',
  // SD-LEO-INFRA-STAGE-CODE-QUALITY-001: the analyzer now emits these canonical
  // QA + Vision-Compliance categories directly (identity map) so they persist
  // under their own category instead of collapsing to the 'capability' fallback.
  unit_test: 'unit_test',
  e2e_test: 'e2e_test',
  feedback_widget_present: 'feedback_widget_present',
  error_capture_wired: 'error_capture_wired',
});

/**
 * Transform one legacy finding into the canonical FindingShape.
 * Returns null if the legacy finding is malformed (caller decides whether
 * to log + continue or hard-fail).
 *
 * @param {Object} legacy        - row from code_quality_findings
 * @param {Object} ctx
 * @param {string} ctx.venture_id - venture context (legacy rows may lack this)
 * @returns {Object|null} canonical finding
 */
export function transformLegacyFinding(legacy, ctx) {
  if (!legacy || typeof legacy !== 'object') return null;
  if (!ctx?.venture_id) return null;

  const category = LEGACY_CHECK_MAP[legacy.check] || 'capability';
  const severity = SEVERITY_LEVELS.includes(legacy.severity) ? legacy.severity : 'medium';
  const finding_signature = String(legacy.title || legacy.detail || legacy.check || 'unknown')
    .slice(0, 256);
  const finding_hash = computeFindingHash({
    venture_id: ctx.venture_id,
    stage_number: 20,
    finding_category: category,
    finding_signature,
  });

  const canonical = {
    venture_id: ctx.venture_id,
    stage_number: 20,
    finding_category: category,
    severity,
    finding_hash,
    evidence_pointer: {
      legacy_check: legacy.check,
      legacy_title: legacy.title,
      legacy_detail: legacy.detail,
      // FR-D: forward sandbox provenance when caller stamps it on the legacy
      // finding. Preserves env_allowlist + install_command + cwd so consumers
      // (FR-B persistence, FR-F aggregator) can audit the run conditions.
      ...(legacy.sandbox ? { sandbox: legacy.sandbox } : {}),
    },
    sd_key: legacy.sd_key || null,
    created_at: legacy.created_at || new Date().toISOString(),
    resolved_at: legacy.resolved_at || null,
  };

  const v = validateFindingShape(canonical);
  if (!v.valid) return null;
  return canonical;
}

/**
 * Adapt a batch of legacy findings to canonical shape, deduping by
 * finding_hash. Returns the canonical batch.
 *
 * @param {Array<Object>} legacyRows
 * @param {Object} ctx
 * @returns {{canonical: Array, skipped: Array, hashes: Set<string>}}
 */
export function adaptLegacyBatch(legacyRows, ctx) {
  const seen = new Set();
  const canonical = [];
  const skipped = [];

  for (const row of legacyRows || []) {
    const t = transformLegacyFinding(row, ctx);
    if (!t) {
      skipped.push(row);
      continue;
    }
    if (seen.has(t.finding_hash)) {
      // Duplicate within batch — idempotency at the input layer.
      continue;
    }
    seen.add(t.finding_hash);
    canonical.push(t);
  }

  return { canonical, skipped, hashes: seen };
}

export { FINDING_CATEGORIES, LEGACY_CHECK_MAP };
