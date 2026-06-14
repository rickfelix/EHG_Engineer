/**
 * Venture-Intake Gate Pack G1-G6 — OBSERVE-ONLY hard-problems/defensibility screen.
 * SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001 (Phase-2 Act-1).
 *
 * Six intake criteria authored ONCE here (single canonical authorship) and composed
 * onto the verified-live substrate (gate-bars.js evaluateGateBars for S3/S23/S25;
 * intake-bar.js for the Stage-1 intake bar). Each gate EVALUATES and RECORDS a verdict
 * to governance_audit_log (the gate-bars precedent — no schema change, no
 * eva_stage_gate_results constraint conflict) but NEVER blocks/kills/promotes while
 * observe-only.
 *
 * Two INDEPENDENT enforcement seams gate any future binding:
 *   - INTAKE_GATES_OBSERVE_ONLY (this module) — separate from gate-bars.js
 *     GATE_BARS_OBSERVE_ONLY so the pack's flip is decoupled from the gate-bar regime.
 *   - isPackBinding(cohortSize) — the pack stays observe-only until a >=3-run
 *     calibration cohort exists (currently 0 completed runs; one venture is a cohort
 *     of one). The binding-enforcement branch is authored-but-DORMANT (guarded behind
 *     BOTH seams, never reached this SD).
 *
 * Criteria are v1-unratified (chairman ratify-or-amend pending). Venture #1 is NOT
 * blocked by this pack: it only records observations; the first pick is the chairman's
 * manual judgment off the pipeline via the existing Stage Zero conductChairmanReview
 * path (no new checklist UX authored — out of scope).
 */
'use strict';

import { isCalibrationEligibleVenture } from './gate-enforcement.js';

/** Bar-version marker for every observation this pack emits (chairman-unratified). */
export const INTAKE_GATE_BAR_VERSION = 'v1-unratified';

/**
 * Independent observe-only seam (TR-2). SEPARATE constant from gate-bars.js
 * GATE_BARS_OBSERVE_ONLY: flipping the pack to binding is its own reviewed,
 * chairman-gated change AND additionally requires a >=3-run cohort (isPackBinding).
 */
export const INTAKE_GATES_OBSERVE_ONLY = true;

/** The lifecycle stage whose completion marks a finished, calibration-eligible run. */
export const COMPLETION_STAGE = 26;

/** The >=3-run cohort trigger (FR-2/FR-4). Pure; n<3 → not binding-eligible. */
export function isPackBinding(cohortSize) {
  const n = Number(cohortSize);
  return Number.isFinite(n) && n >= 3;
}

/** change_reason marker calibration queries filter on (gate-bars precedent, FR-3/TR-1). */
export const INTAKE_GATE_OBSERVATION_REASON =
  'intake_gate_observation (SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001, observe-only)';

// ── evidence helpers (pure) ──────────────────────────────────────────────────
/** First present non-null value among field names, checking input + input.metadata. */
function firstField(input, names) {
  for (const n of names) {
    if (input?.[n] != null) return input[n];
    if (input?.metadata?.[n] != null) return input.metadata[n];
  }
  return undefined;
}
const nonEmptyStr = (v, minLen = 1) =>
  typeof v === 'string' && v.trim().length >= minLen;
const finitePositive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;

function makeBar(gate, label, criterionIndex, pass, status, detail) {
  return { gate, label, criterion_index: criterionIndex, pass, status, detail, observe_only: true, bar_version: INTAKE_GATE_BAR_VERSION };
}
/** Fail-open: an evaluation error degrades THAT criterion to 'unverified', never throws. */
function errBar(gate, label, criterionIndex, err) {
  return makeBar(gate, label, criterionIndex, null, 'unverified', `evaluation errored (fail-open): ${err?.message ?? err}`);
}

// ── G1-G6 evaluators (each defined EXACTLY ONCE — single canonical authorship) ──
const G1_LABEL = 'Distribution-Channel-First: a primary distribution channel is identified before build';
const G2_LABEL = 'Quantified PMF: a numeric product-market-fit signal exists (not vibes)';
const G3_LABEL = 'Timing/Why-Now: a falsifiable why-now/timing thesis is present';
const G4_LABEL = 'Transactional Validation: evidence of paid/committed validation, not just interest';
const G5_LABEL = 'Non-Commodity Moat: a declared defensibility beyond execution speed';
const G6_LABEL = 'Option-B Monetization-Shape: the monetization shape matches an acceptable Option-B pattern';

/** Allowed Option-B monetization shapes (G6). Normalized lower-case, hyphen/underscore-insensitive. */
export const OPTION_B_SHAPES = Object.freeze(new Set([
  'subscription', 'saas', 'usage', 'usagebased', 'metered', 'licensing', 'license',
  'marketplace', 'takerate', 'productizedservice', 'transactional', 'platformfee',
]));
const normalizeShape = (v) => String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '');

/** G1 — Distribution-Channel-First (criterion #4). */
export function evaluateG1(input = {}) {
  try {
    const chan = firstField(input, ['distribution_channel', 'primary_channel', 'go_to_market', 'gtm_channel', 'distribution']);
    const pass = nonEmptyStr(chan);
    return makeBar('G1', G1_LABEL, 4, pass, pass ? 'pass' : 'fail',
      pass ? `primary distribution channel declared ('${String(chan).slice(0, 48)}')`
           : 'no distribution_channel/primary_channel/go_to_market — channel not identified before build');
  } catch (e) { return errBar('G1', G1_LABEL, 4, e); }
}

/** G2 — Quantified PMF (criterion #5). Requires a NUMERIC demand/retention/conversion signal. */
export function evaluateG2(input = {}) {
  try {
    const metric = firstField(input, ['pmf_signal', 'retention_rate', 'conversion_rate', 'demand_count', 'mrr', 'paying_users', 'pmf_score']);
    const pass = finitePositive(metric);
    return makeBar('G2', G2_LABEL, 5, pass, pass ? 'pass' : 'fail',
      pass ? `quantified PMF signal present (${metric})`
           : 'no numeric pmf_signal/retention_rate/conversion_rate/mrr — PMF is unquantified (vibes)');
  } catch (e) { return errBar('G2', G2_LABEL, 5, e); }
}

/** G3 — Timing / Why-Now (criterion #7). */
export function evaluateG3(input = {}) {
  try {
    const thesis = firstField(input, ['why_now', 'timing_thesis', 'why_now_thesis', 'timing']);
    const pass = nonEmptyStr(thesis, 20);
    return makeBar('G3', G3_LABEL, 7, pass, pass ? 'pass' : 'fail',
      pass ? 'falsifiable why-now/timing thesis present'
           : 'no why_now/timing_thesis (>=20 chars) — timing is unstated/non-falsifiable');
  } catch (e) { return errBar('G3', G3_LABEL, 7, e); }
}

/** G4 — Transactional Validation (criterion #6). Paid/committed, not just interest. */
export function evaluateG4(input = {}) {
  try {
    const ev = firstField(input, ['transactional_validation', 'paid_validation', 'committed_revenue', 'loi_count', 'preorders', 'paid_pilots']);
    const pass = ev === true || finitePositive(ev) || nonEmptyStr(ev, 3);
    return makeBar('G4', G4_LABEL, 6, pass, pass ? 'pass' : 'fail',
      pass ? 'transactional (paid/committed) validation evidence present'
           : 'no paid/committed validation (transactional_validation/committed_revenue/loi_count) — interest only');
  } catch (e) { return errBar('G4', G4_LABEL, 6, e); }
}

/** G5 — Non-Commodity Moat (criterion #18). Defensibility beyond execution speed. */
export function evaluateG5(input = {}) {
  try {
    const moat = firstField(input, ['non_commodity_moat', 'moat', 'defensibility', 'differentiation']);
    const declared = nonEmptyStr(moat, 10);
    const speedOnly = declared && /^[^a-z]*(speed|fast(er)?|velocity|quick(er)?|first[\s-]?mover)[^a-z]*$/i.test(String(moat).trim());
    const pass = declared && !speedOnly;
    return makeBar('G5', G5_LABEL, 18, pass, pass ? 'pass' : 'fail',
      pass ? 'non-commodity moat/defensibility declared (beyond speed)'
           : declared ? 'declared moat reduces to execution-speed only — commodity defensibility'
                      : 'no moat/defensibility/non_commodity_moat (>=10 chars) declared');
  } catch (e) { return errBar('G5', G5_LABEL, 18, e); }
}

/** G6 — Option-B Monetization-Shape Filter (criterion #0). */
export function evaluateG6(input = {}) {
  try {
    const shape = firstField(input, ['monetization_shape', 'business_model', 'monetization', 'revenue_model']);
    const norm = normalizeShape(shape);
    const pass = norm.length > 0 && OPTION_B_SHAPES.has(norm);
    return makeBar('G6', G6_LABEL, 0, pass, pass ? 'pass' : 'fail',
      pass ? `monetization shape '${shape}' matches an Option-B pattern`
           : shape != null && norm.length > 0 ? `monetization shape '${shape}' is not an accepted Option-B pattern`
                                              : 'no monetization_shape/business_model declared');
  } catch (e) { return errBar('G6', G6_LABEL, 0, e); }
}

/**
 * The six gates in canonical order. The ONLY registry — composition sites import
 * these references, they do not redefine the criteria (single-canonical-definition).
 */
export const INTAKE_GATES = Object.freeze([
  { gate: 'G1', criterion_index: 4, evaluate: evaluateG1 },
  { gate: 'G2', criterion_index: 5, evaluate: evaluateG2 },
  { gate: 'G3', criterion_index: 7, evaluate: evaluateG3 },
  { gate: 'G4', criterion_index: 6, evaluate: evaluateG4 },
  { gate: 'G5', criterion_index: 18, evaluate: evaluateG5 },
  { gate: 'G6', criterion_index: 0, evaluate: evaluateG6 },
]);

/**
 * Pack-level evaluation. Runs all six gates and returns observe-only bars. The
 * binding-enforcement branch is authored-but-DORMANT: it is guarded behind BOTH
 * INTAKE_GATES_OBSERVE_ONLY===false AND isPackBinding(cohortSize), so while either
 * seam holds (always, this SD) the pack emits NO kill/promotion/blocking verdict.
 *
 * @param {Object} input - a gate row, idea/blueprint, or any evidence-bearing object
 * @param {{cohortSize?:number}} [opts]
 * @returns {{gates:Array, observe_only:boolean, binding_eligible:boolean, verdict:null|object, bar_version:string}}
 */
export function evaluateIntakeGates(input = {}, opts = {}) {
  const gates = INTAKE_GATES.map((g) => g.evaluate(input));
  const bindingEligible = isPackBinding(opts.cohortSize);

  let verdict = null; // observe-only default: NEVER a kill/promotion/blocking verdict
  if (!INTAKE_GATES_OBSERVE_ONLY && bindingEligible) {
    // DORMANT binding-enforcement branch — unreachable this SD (INTAKE_GATES_OBSERVE_ONLY===true).
    // Authored as the seam only; real blocking is deliberately NOT wired (honest deferral, FR-2).
    verdict = { binding: true, failed: gates.filter((b) => b.status === 'fail').map((b) => b.gate) };
  }

  return { gates, observe_only: INTAKE_GATES_OBSERVE_ONLY, binding_eligible: bindingEligible, verdict, bar_version: INTAKE_GATE_BAR_VERSION };
}

// ── cohort trigger (FR-4) ────────────────────────────────────────────────────
/**
 * PURE: count DISTINCT calibration-eligible ventures from a set of completed-run
 * rows ({id|venture_id, metadata}). Excludes workflow_scaffold ventures via the
 * canonical isCalibrationEligibleVenture predicate. Injected-resolver pattern so
 * the gate evaluators stay pure and this stays unit-testable without a DB.
 */
export function countCalibrationEligible(ventureRows = []) {
  const eligible = new Set();
  for (const v of ventureRows || []) {
    const id = v?.id ?? v?.venture_id;
    if (id && isCalibrationEligibleVenture(v)) eligible.add(id);
  }
  return eligible.size;
}

/**
 * Count calibration-eligible ventures that COMPLETED the pipeline (stage-26 work
 * stage_status='completed'), applying the scaffold filter. Computed at evaluation
 * time (no pre-computed scalar — Flag C). FAIL-OPEN to 0: a query error must never
 * fabricate a cohort (and 0 is the correct current answer — cohort 1 active).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>}
 */
export async function getCompletedVentureRunCount(supabase) {
  try {
    const { data: completed, error } = await supabase
      .from('venture_stage_work')
      .select('venture_id')
      .eq('lifecycle_stage', COMPLETION_STAGE)
      .eq('stage_status', 'completed');
    if (error || !Array.isArray(completed)) return 0;
    const ids = [...new Set(completed.map((r) => r?.venture_id).filter(Boolean))];
    if (ids.length === 0) return 0;
    const { data: ventures, error: vErr } = await supabase
      .from('ventures')
      .select('id, metadata')
      .in('id', ids);
    if (vErr || !Array.isArray(ventures)) return 0;
    return countCalibrationEligible(ventures);
  } catch {
    return 0; // fail-open: never fabricate a cohort
  }
}

// ── observation recorder (FR-3 / TR-1) ───────────────────────────────────────
/**
 * Record a pack evaluation observe-only to governance_audit_log (the gate-bars
 * precedent — namespaced changed_by/change_reason, operation='INSERT'). No schema
 * change; sidesteps the eva_stage_gate_results unique-index + gate_type CHECK.
 * FAIL-SOFT: recording trouble logs and returns null — observation must never break
 * the gate/intake path it rides on.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ventureId?:string, stageNumber?:number, surface?:string, gateRowId?:string|null}} ctx
 * @param {ReturnType<typeof evaluateIntakeGates>} evaluation
 * @returns {Promise<string|null>}
 */
export async function recordIntakeGateObservation(supabase, ctx, evaluation) {
  if (!evaluation?.gates?.length) return null;
  try {
    const { data, error } = await supabase
      .from('governance_audit_log')
      .insert({
        table_name: 'eva_stage_gate_results',
        record_id: ctx?.gateRowId ?? null,
        operation: 'INSERT',
        changed_by: 'venture-intake-gates',
        change_reason: INTAKE_GATE_OBSERVATION_REASON,
        new_values: {
          venture_id: ctx?.ventureId ?? null,
          stage_number: ctx?.stageNumber ?? null,
          surface: ctx?.surface ?? null,
          observe_only: evaluation.observe_only,
          binding_eligible: evaluation.binding_eligible,
          bar_version: evaluation.bar_version,
          gates: evaluation.gates,
        },
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn(`[venture-intake-gates] observation record failed (non-blocking): ${err.message}`);
    return null;
  }
}

// ── intake-bar composition adapters (FR-3) — import canonical defs, do not redefine ──
/** G5 as the Stage-1 intake bar's 8th criterion ({id,label,test} shape). */
export const G5_INTAKE_CHECK = Object.freeze({
  id: 'non_commodity_moat',
  label: G5_LABEL,
  test: (idea) => {
    const bar = evaluateG5(idea);
    return { pass: Boolean(bar.pass), rationale: bar.detail };
  },
});

/**
 * G6 as the intake-bar OBSERVE-ONLY filter. Returns the G6 bar; callers RECORD it
 * but never drop the idea (observe-only — never blocks intake).
 */
export function g6IntakeFilter(idea) {
  return evaluateG6(idea);
}
