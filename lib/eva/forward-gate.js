/**
 * Chairman-decision Forward Gate (ADVISORY / LOG-ONLY)
 *
 * SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001
 *
 * Runs the PURE evaluateDecision() engine over a chairman decision on the forward
 * path and records the advisory verdict to `audit_log` ONLY. It is deliberately
 * authority-neutral:
 *   - it NEVER writes/updates `chairman_decisions` (decision/status/authority),
 *   - it NEVER blocks, rejects, or overrides a decision or its acceptance,
 *   - any error is swallowed (fail-open) so it can never stall decision creation.
 *
 * CONST-002: the forward gate is advisory; a harden-to-blocking mode is OUT OF
 * SCOPE (a separate, chairman-gated follow-up). The advisory verdict lives in a
 * separate table so the chairman's authority is provably untouched.
 *
 * The audit_log coverage rows it emits are ALSO the signal the vision ordinal-13
 * ("Decision Filter Engine") probe reads (db_count over event_type below).
 */

import { evaluateDecision } from './decision-filter-engine.js';

export const FORWARD_GATE_EVENT = 'chairman_forward_gate_score';
const FORWARD_GATE_ENTITY = 'chairman_decision';

// SD-LEO-INFRA-DECISION-FILTER-ENFORCE-MODE-001 (chairman ruling 2026-06-22, authority item 2/3):
// STAGED enforce-mode. Stage 1 = the canary/shadow layer below. Resolved from
// DECISION_FILTER_ENFORCE_MODE (default 'advisory'); 'enforce-canary' records a `would_hold` shadow
// verdict (the data a future accuracy gate + the V1 decision-filter cap consume) WITHOUT touching
// chairman_decisions and WITHOUT any actual pause. Per the chairman ruling: enforce = auto-HOLD-for-
// confirm (reversible, one-click logged override), NEVER a hard veto, fail-OPEN always. The actual
// auto-HOLD pause-wiring (stage 3) and the accuracy-gate computation (stage 2) are explicit follow-ups.
export const ENFORCE_MODE_ADVISORY = 'advisory';
export const ENFORCE_MODE_CANARY = 'enforce-canary';

/** Resolve the configured enforce mode (opts override -> env -> advisory default). */
export function resolveEnforceMode(opt) {
  const raw = opt ?? process.env.DECISION_FILTER_ENFORCE_MODE;
  return raw === ENFORCE_MODE_CANARY ? ENFORCE_MODE_CANARY : ENFORCE_MODE_ADVISORY;
}

/**
 * Pure: build the enforce-mode metadata merged into the advisory audit row. `advisory: true` is
 * ALWAYS set (chairman authority provably untouched). In 'enforce-canary' mode it additionally
 * records `would_hold` (the engine recommends NOT auto-proceeding) plus a reversible/override marker
 * — SHADOW ONLY, no pause. Any unknown mode resolves to advisory (fail-safe toward not-enforcing).
 *
 * @param {Object} verdict - evaluateDecision() output (auto_proceed, recommendation, ...)
 * @param {string} mode - ENFORCE_MODE_ADVISORY | ENFORCE_MODE_CANARY
 * @returns {Object} metadata fragment
 */
export function buildEnforceMetadata(verdict = {}, mode = ENFORCE_MODE_ADVISORY) {
  if (mode !== ENFORCE_MODE_CANARY) {
    return { advisory: true, mode: ENFORCE_MODE_ADVISORY };
  }
  return {
    advisory: true, // authority untouched: the canary records, it does not pause
    mode: ENFORCE_MODE_CANARY,
    would_hold: verdict.auto_proceed === false,
    hold_reason: verdict.recommendation ?? null,
    reversible: true,
    override: 'one-click-logged (stage: shadow — records only, no pause)',
  };
}

/**
 * Adapt a chairman_decisions row into an evaluateDecision() input.
 * Honest mapping: only fields that genuinely exist on the decision are passed;
 * the engine tolerates a sparse input (missing prefs become advisory triggers).
 *
 * @param {Object} decision - a chairman_decisions row
 * @returns {Object} evaluateDecision input
 */
export function decisionToEngineInput(decision = {}) {
  const brief = (decision && typeof decision.brief_data === 'object' && decision.brief_data) || {};
  const input = {};
  if (decision.lifecycle_stage !== undefined && decision.lifecycle_stage !== null) {
    input.stage = String(decision.lifecycle_stage);
  }
  // NB: chairman_decisions.health_score is CATEGORICAL ('green'/'red'/NULL), NOT a 0-100
  // vision score — verified live. We deliberately do NOT map it to evaluateDecision.visionScore
  // (that would feed the engine NaN). It is carried in the audit metadata as raw context only.
  const description = decision.summary || brief.summary || brief.ventureName || decision.decision_type;
  if (description) input.description = String(description);
  // Pass through any explicit numeric/array signals the brief carries (advisory only).
  if (Number.isFinite(brief.cost)) input.cost = brief.cost;
  if (Number.isFinite(brief.score)) input.score = brief.score;
  if (Array.isArray(brief.technologies)) input.technologies = brief.technologies;
  if (Array.isArray(brief.vendors)) input.vendors = brief.vendors;
  return input;
}

/**
 * Has this decision already been advisory-scored? (idempotency guard)
 * @returns {Promise<boolean>}
 */
export async function hasForwardGateScore(decisionId, supabase) {
  if (!decisionId || !supabase) return false;
  try {
    const { count, error } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', FORWARD_GATE_EVENT)
      .eq('entity_id', decisionId);
    if (error) return false;
    return (Number(count) || 0) > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Advisory-score a chairman decision and log the verdict to audit_log.
 *
 * ADVISORY / LOG-ONLY: writes ONLY to audit_log; never touches chairman_decisions;
 * never throws (fail-open). Idempotent under serial use: a decision that already has a
 * coverage row is skipped (best-effort check-then-insert; no unique constraint, so two
 * truly-concurrent calls for the same decision could both insert — harmless duplicate
 * advisory rows, never a correctness issue, since each decision is created+scored once
 * inline on the forward path).
 *
 * @param {Object} decision - a chairman_decisions row (must have .id)
 * @param {Object} opts
 * @param {Object} opts.supabase - Supabase client
 * @param {Object} [opts.logger=console]
 * @param {Object} [opts.preferences] - chairman preference map (advisory)
 * @returns {Promise<{logged: boolean, skipped?: boolean, verdict?: Object, reason?: string}>}
 */
export async function recordForwardGateScore(decision, { supabase, logger = console, preferences, enforceMode } = {}) {
  try {
    if (!decision || !decision.id || !supabase) {
      return { logged: false, reason: 'missing decision.id or supabase' };
    }

    // Idempotency: never double-log coverage for the same decision.
    if (await hasForwardGateScore(decision.id, supabase)) {
      return { logged: false, skipped: true, reason: 'coverage row already exists' };
    }

    // Run the genuine PURE engine over the real decision (no IO inside evaluateDecision).
    const input = decisionToEngineInput(decision);
    const verdict = evaluateDecision(input, { preferences, logger: { info() {}, debug() {} } });

    // ADVISORY record — audit_log ONLY. entity_id + severity satisfy live constraints.
    // SD-LEO-INFRA-DECISION-FILTER-ENFORCE-MODE-001: merge the staged enforce-mode shadow metadata.
    // In 'enforce-canary' this records would_hold; it STILL writes only audit_log, never
    // chairman_decisions, and the path remains fail-open. Default (flag unset) stays advisory.
    const mode = resolveEnforceMode(enforceMode);
    const { error } = await supabase.from('audit_log').insert({
      event_type: FORWARD_GATE_EVENT,
      entity_type: FORWARD_GATE_ENTITY,
      entity_id: decision.id,
      severity: 'info',
      metadata: {
        ...buildEnforceMetadata(verdict, mode),
        const_002: 'log-only; chairman authority unchanged',
        auto_proceed: verdict.auto_proceed,
        recommendation: verdict.recommendation,
        escalation_level: verdict.escalation_level ?? null,
        escalation_label: verdict.escalation_label ?? null,
        trigger_count: Array.isArray(verdict.triggers) ? verdict.triggers.length : 0,
        triggers: verdict.triggers,
        lifecycle_stage: decision.lifecycle_stage ?? null,
        decision_type: decision.decision_type ?? null,
      },
    });

    if (error) {
      // Fail-open: log and continue — never block the decision path.
      try { logger.warn?.(`[ForwardGate] advisory log failed (non-fatal): ${error.message}`); } catch (_) {}
      return { logged: false, reason: error.message };
    }
    return { logged: true, verdict };
  } catch (e) {
    // Absolute fail-open guarantee — the advisory gate can never stall decision creation.
    try { logger.warn?.(`[ForwardGate] advisory scoring threw (non-fatal): ${e.message}`); } catch (_) {}
    return { logged: false, reason: e.message };
  }
}
