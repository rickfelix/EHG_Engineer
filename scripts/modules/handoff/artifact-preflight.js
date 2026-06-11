/**
 * Artifact Pre-Flight — SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-A (program L1)
 *
 * Runs artifact-shape checks inside the handoff EXECUTE path BEFORE the gate
 * pipeline burns a full evaluation. ~60% of parseable handoff rejections
 * (2026-06-07..10) are artifact-shape traps the shipped tooling already
 * detects offline, but /loop workers call executeHandoff directly
 * (scripts/handoff.js execute → cli-main.js → HandoffOrchestrator) and never
 * run the optional precheckHandoff advisory path.
 *
 * DESIGN CONTRACT (FR-2):
 *  - HARD_FAIL is reserved for shapes the gates DETERMINISTICALLY reject —
 *    today that is exactly one check: GATE_SD_METRICS_SUFFICIENCY at
 *    LEAD-TO-PLAN, mirrored here by calling the gate's own
 *    validateMetricsSufficiency() on the same SD row (parity by construction,
 *    zero re-encoding). The gate is BLOCKING and unconditionally registered
 *    (executors/lead-to-plan/index.js getRequiredGates — no orchestrator-child
 *    reduced set at LEAD-TO-PLAN).
 *  - Everything else is ADVISORY ONLY. Verified non-deterministic at gate
 *    time, so a pre-pipeline block would false-positive:
 *      • PLAN-TO-LEAD empty/pending metric actuals — the consolidated
 *        SUCCESS_METRICS gate AUTO-POPULATES empty actuals from accepted
 *        handoffs / completed stories before scoring
 *        (success-metrics-gate.js:202-260), and evidence-bound metrics
 *        ({evidence:{kind,ref}}) are resolved from machine evidence with the
 *        actual text ignored.
 *      • lib/artifact-contracts shape mode on the SD row — "no SD gate
 *        counterpart today" (lib/artifact-contracts/index.js), and on the PRD
 *        row — shape mode mirrors add-prd's creation-time checks, not a
 *        PLAN-TO-EXEC gate.
 *  - Any internal error FAILS OPEN to the normal pipeline (verdict ERROR;
 *    the caller proceeds). Never block on tooling.
 *
 * Violations reuse the SHAPE_VIOLATION rendering contract:
 *   { field, expected, got, hint }  →  formatViolations()
 */

import { validateMetricsSufficiency } from './verifiers/lead-to-plan/sd-validation.js';
import { validateArtifact, formatViolations } from '../../../lib/artifact-contracts/index.js';

export { formatViolations };

const PENDING_PATTERN = /^(pending|tbd|to\s*be\s*determined|not\s*yet|awaiting|[\d.]+%?\s*-?\s*pending.*)$/i;
const isEmptyOrPending = (val) =>
  val == null || String(val).trim() === '' || PENDING_PATTERN.test(String(val).trim());

function normalizeType(handoffType) {
  return String(handoffType || '').toUpperCase().replace(/_/g, '-');
}

/**
 * Pure preflight core — no DB, no I/O.
 *
 * @param {object} input
 * @param {string} input.handoffType — e.g. 'LEAD-TO-PLAN' (underscores accepted)
 * @param {object|null} input.sd — full strategic_directives_v2 row
 * @param {object|null} input.prd — product_requirements_v2 row (PLAN-TO-EXEC only; may be null)
 * @returns {{ verdict: 'PASS'|'HARD_FAIL'|'ERROR',
 *             violations: Array<{field:string,expected:string,got:string,hint:string}>,
 *             advisories: Array<{field:string,expected:string,got:string,hint:string}> }}
 */
export function runArtifactPreflight({ handoffType, sd, prd } = {}) {
  const type = normalizeType(handoffType);
  const violations = [];
  const advisories = [];

  if (!sd || typeof sd !== 'object') {
    // No SD row available — nothing deterministic to assert; let the pipeline
    // (which has its own SD-existence handling) own the failure.
    return { verdict: 'PASS', violations, advisories };
  }

  if (type === 'LEAD-TO-PLAN') {
    // ── HARD-FAIL: GATE_SD_METRICS_SUFFICIENCY mirror (exact gate function) ──
    const sufficiency = validateMetricsSufficiency(sd);
    if (!sufficiency.pass) {
      violations.push({
        field: 'success_metrics',
        expected: '>=3 UNIQUE metrics (success_criteria accepted as fallback source)',
        got: `${sufficiency.uniqueCount} unique of ${sufficiency.originalCount} (${sufficiency.issues.join('; ') || 'insufficient'})`,
        hint: 'GATE_SD_METRICS_SUFFICIENCY (BLOCKING at LEAD-TO-PLAN) dedups by text — padding with duplicates fails. Populate strategic_directives_v2.success_metrics with >=3 distinct measurable outcomes. Pre-validate payloads with: npm run contract:check -- sd <file>',
      });
    }

    // ── ADVISORY: SD contract shape (no SD gate counterpart today) ──
    try {
      const sdShape = validateArtifact('sd', sd, { mode: 'shape' });
      advisories.push(...sdShape.violations);
    } catch { /* advisory only */ }
  }

  if (type === 'PLAN-TO-EXEC' && prd && typeof prd === 'object') {
    // ── ADVISORY: PRD contract shape (mirrors add-prd creation checks, not a gate) ──
    try {
      const prdShape = validateArtifact('prd', prd, { mode: 'shape' });
      advisories.push(...prdShape.violations);
    } catch { /* advisory only */ }
  }

  if (type === 'PLAN-TO-LEAD') {
    // ── ADVISORY: empty/pending metric actuals. NOT a hard-fail — the
    // SUCCESS_METRICS gate auto-populates from accepted-handoff/story evidence
    // and evidence-bound metrics resolve from machine evidence. Surfacing the
    // remediation early still saves the round-trip when auto-population has
    // nothing to draw on.
    const raw = Array.isArray(sd.success_metrics) ? sd.success_metrics : [];
    raw.forEach((m, i) => {
      const metric = typeof m === 'string' ? { name: m, actual: null } : (m || {});
      if (metric.evidence) return; // evidence-bound — gate resolves from evidence
      if (isEmptyOrPending(metric.actual)) {
        advisories.push({
          field: `success_metrics[${i}].actual`,
          expected: 'achieved-state actual LEADING WITH A NUMBER (e.g. "8/8 — all FRs verified", "100% — 6 of 6")',
          got: metric.actual == null ? 'null' : `"${String(metric.actual)}"`,
          hint: 'The SUCCESS_METRICS gate attempts auto-population from accepted handoffs/stories, but a recorded numeric-leading actual is deterministic. Update strategic_directives_v2.success_metrics[].actual before PLAN-TO-LEAD.',
        });
      }
    });
  }

  return {
    verdict: violations.length > 0 ? 'HARD_FAIL' : 'PASS',
    violations,
    advisories,
  };
}

/**
 * Async wrapper used by HandoffOrchestrator.executeHandoff — gathers the rows,
 * runs the pure core, and NEVER throws (any internal failure → verdict ERROR,
 * caller falls open to the normal pipeline).
 *
 * @param {object} deps
 * @param {object} deps.sdRepo — SDRepository (getById)
 * @param {object} deps.prdRepo — PRDRepository (getBySdId)
 * @param {string} deps.handoffType
 * @param {string} deps.sdId — sd_key or UUID
 */
export async function executeArtifactPreflight({ sdRepo, prdRepo, handoffType, sdId }) {
  try {
    const type = normalizeType(handoffType);
    const sd = await sdRepo.getById(sdId);
    if (!sd) return { verdict: 'PASS', violations: [], advisories: [] };

    let prd = null;
    if (type === 'PLAN-TO-EXEC' && prdRepo && typeof prdRepo.getBySdId === 'function') {
      try { prd = await prdRepo.getBySdId(sd.id || sdId); } catch { /* no PRD is the prerequisite preflight's problem */ }
    }

    return runArtifactPreflight({ handoffType: type, sd, prd });
  } catch (e) {
    return { verdict: 'ERROR', violations: [], advisories: [], error: (e && e.message) || String(e) };
  }
}

/**
 * FR-3 telemetry: fire-and-forget prevented-bounce event on the EXISTING
 * coordination_events table (no new tables). Failure never affects the
 * handoff result.
 */
export async function logPreventedBounce(supabase, { sdKey, handoffType, trapFields }) {
  try {
    const { error } = await supabase.from('coordination_events').insert({
      event_type: 'HANDOFF_PREVENTED_BOUNCE',
      severity: 'info',
      payload: {
        sd_key: sdKey,
        handoff_type: normalizeType(handoffType),
        trap_fields: trapFields || [],
        source: 'artifact-preflight',
      },
    });
    if (error) console.warn(`   [artifact-preflight] telemetry write failed (non-fatal): ${error.message}`);
  } catch (e) {
    console.warn(`   [artifact-preflight] telemetry threw (non-fatal): ${(e && e.message) || e}`);
  }
}
