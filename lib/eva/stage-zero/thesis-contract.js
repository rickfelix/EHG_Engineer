/**
 * Stage-0 THESIS + EXPLICIT-DECISIONS CONTRACT — SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001.
 *
 * Provenance: deep-challenge commission (spec R3 + R5, Bravo flaw-ledger findings 4/6,
 * Solomon adjudication 2026-07-10 12:21Z). Stage-0's output was a bare composite score;
 * this module makes it a falsifiable THESIS (who pays, for what, reached how, at what
 * price, testable before build), with PRE-REGISTERED KILL CRITERIA emitted as
 * machine-consumable contracts (the S20-26 O2 launch gate arms them as live gauges),
 * and NAMED EXPLICIT DECISIONS replacing silent factory assumptions (form factor first).
 *
 * Pure module: no DB / fs / network / LLM. Derivations pull ONLY from fields the
 * candidate/synthesis already carries and record per-field provenance — a value with no
 * source is listed in incomplete_fields, never invented (value-authenticity invariant).
 */

import { parseRevenuePotential } from './utils/parse-revenue.js';

export const THESIS_FIELDS = Object.freeze(['who_pays', 'pays_for_what', 'reached_how', 'price_point']);
export const KILL_COMPARATORS = Object.freeze(['lt', 'lte', 'gt', 'gte', 'eq']);

/**
 * Validate a venture thesis. A valid thesis answers: who pays, for what, how they are
 * reached, at what price — plus a pre-build demand-test plan (>=2 concrete steps, each
 * with an instruction and a success_signal). Independent of any score by construction.
 *
 * @param {Object} thesis
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateVentureThesis(thesis) {
  const errors = [];
  if (!thesis || typeof thesis !== 'object') {
    return { valid: false, errors: ['thesis must be a non-null object (a bare score is not a Stage-Zero output)'] };
  }
  for (const f of THESIS_FIELDS) {
    if (!thesis[f] || typeof thesis[f] !== 'string' || !thesis[f].trim()) {
      errors.push(`thesis.${f} is required (non-empty string)`);
    }
  }
  const plan = thesis.demand_test_plan;
  if (!Array.isArray(plan) || plan.length < 2) {
    errors.push('thesis.demand_test_plan requires >=2 steps (a demand test executable BEFORE build)');
  } else {
    plan.forEach((s, i) => {
      if (!s || typeof s.instruction !== 'string' || !s.instruction.trim()) errors.push(`demand_test_plan[${i}].instruction is required`);
      if (!s || typeof s.success_signal !== 'string' || !s.success_signal.trim()) errors.push(`demand_test_plan[${i}].success_signal is required`);
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate pre-registered kill criteria. Each criterion is a MACHINE-CONSUMABLE contract:
 * numeric comparator math a downstream gate evaluates with zero free-text parsing.
 *
 * @param {Array} list
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateKillCriteria(list) {
  const errors = [];
  if (!Array.isArray(list) || list.length === 0) {
    return { valid: false, errors: ['kill_criteria requires >=1 pre-registered criterion ("this venture dies if X by stage Y")'] };
  }
  list.forEach((c, i) => {
    if (!c || typeof c !== 'object') { errors.push(`kill_criteria[${i}] must be an object`); return; }
    if (!c.id || typeof c.id !== 'string') errors.push(`kill_criteria[${i}].id is required`);
    if (!c.metric || typeof c.metric !== 'string') errors.push(`kill_criteria[${i}].metric is required`);
    if (!KILL_COMPARATORS.includes(c.comparator)) errors.push(`kill_criteria[${i}].comparator must be one of ${KILL_COMPARATORS.join('|')}`);
    if (typeof c.threshold !== 'number' || !Number.isFinite(c.threshold)) errors.push(`kill_criteria[${i}].threshold must be a finite number`);
    if (!Number.isInteger(c.stage_by) || c.stage_by < 1 || c.stage_by > 26) errors.push(`kill_criteria[${i}].stage_by must be an integer stage 1-26`);
    if (!c.description || typeof c.description !== 'string') errors.push(`kill_criteria[${i}].description is required`);
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate ONE kill criterion against an observed value. Pure comparator math — the
 * O2-gate consumption seam. killed=true means the criterion FIRED (observed value is on
 * the death side of the threshold: e.g. comparator 'lt' kills when observed < threshold).
 *
 * @param {Object} criterion - a validateKillCriteria-valid criterion
 * @param {number} observedValue
 * @returns {{ killed: boolean, criterionId: string, observed: number, threshold: number, comparator: string }}
 */
export function evaluateKillCriterion(criterion, observedValue) {
  const v = Number(observedValue);
  if (!Number.isFinite(v)) {
    // Fail-closed for gauges: an unobservable metric cannot prove survival.
    return { killed: true, criterionId: criterion.id, observed: NaN, threshold: criterion.threshold, comparator: criterion.comparator, reason: 'unobservable_metric_fail_closed' };
  }
  const t = criterion.threshold;
  const killed =
    criterion.comparator === 'lt' ? v < t :
    criterion.comparator === 'lte' ? v <= t :
    criterion.comparator === 'gt' ? v > t :
    criterion.comparator === 'gte' ? v >= t :
    v === t; // 'eq'
  return { killed, criterionId: criterion.id, observed: v, threshold: t, comparator: criterion.comparator };
}

/**
 * Derive the thesis DETERMINISTICALLY from fields the candidate/synthesis already carries.
 * No LLM call, no invention: every populated field records its source in
 * thesis.provenance[field] = { source_field, derived: true }; a field whose source is
 * absent is listed in thesis.incomplete_fields (the caller demotes maturity — honesty
 * over completeness).
 *
 * @param {Object} pathOutput - PathOutput (suggested_* fields, target_market, metadata)
 * @param {Object} [synthesisResults] - keyed synthesis outputs (virality etc.)
 * @param {Object} [candidate] - the LLM-emitted discovery candidate when available
 *                               (revenue_model, monthly_revenue_potential)
 * @returns {Object} thesis (possibly incomplete — check incomplete_fields)
 */
export function buildThesisFromSynthesis(pathOutput = {}, synthesisResults = {}, candidate = {}) {
  const provenance = {};
  const incomplete = [];
  const thesis = { demand_test_plan: [], provenance, incomplete_fields: incomplete };

  const market = pathOutput.target_market || candidate.target_market;
  if (market && String(market).trim()) {
    thesis.who_pays = String(market).trim();
    provenance.who_pays = { source_field: 'target_market', derived: true };
  } else incomplete.push('who_pays');

  const solution = pathOutput.suggested_solution || candidate.solution;
  if (solution && String(solution).trim()) {
    thesis.pays_for_what = String(solution).trim();
    provenance.pays_for_what = { source_field: 'suggested_solution', derived: true };
  } else incomplete.push('pays_for_what');

  // reached_how: prefer concrete viral channels the synthesis emitted; else the discovery
  // path itself is an honest (weak) reach hypothesis source.
  const channels = synthesisResults?.virality?.viral_channels;
  if (Array.isArray(channels) && channels.length > 0) {
    thesis.reached_how = channels.map((c) => (typeof c === 'string' ? c : c?.channel || JSON.stringify(c))).join('; ');
    provenance.reached_how = { source_field: 'synthesis.virality.viral_channels', derived: true };
  } else if (candidate.automation_approach || pathOutput.metadata?.path) {
    thesis.reached_how = candidate.automation_approach
      ? String(candidate.automation_approach).trim()
      : `distribution hypothesis pending — origin path: ${pathOutput.metadata.path}`;
    provenance.reached_how = { source_field: candidate.automation_approach ? 'candidate.automation_approach' : 'pathOutput.metadata.path', derived: true, weak: true };
  } else incomplete.push('reached_how');

  const revenueModel = candidate.revenue_model;
  const parsed = parseRevenuePotential(candidate.monthly_revenue_potential);
  if (revenueModel && String(revenueModel).trim()) {
    thesis.price_point = parsed
      ? `${String(revenueModel).trim()} (candidate estimate $${parsed.low}-$${parsed.high}/mo, E0 ungraded)`
      : String(revenueModel).trim();
    provenance.price_point = { source_field: parsed ? 'candidate.revenue_model + monthly_revenue_potential' : 'candidate.revenue_model', derived: true };
  } else if (parsed) {
    thesis.price_point = `candidate estimate $${parsed.low}-$${parsed.high}/mo (E0 ungraded — no external source)`;
    provenance.price_point = { source_field: 'candidate.monthly_revenue_potential', derived: true, weak: true };
  } else incomplete.push('price_point');

  // Demand-test plan: pre-build probes phrased against the derived who_pays/pays_for_what.
  // Templated STRUCTURE (the plan shape), grounded CONTENT (fields above) — provenance says so.
  if (thesis.who_pays && thesis.pays_for_what) {
    thesis.demand_test_plan = [
      {
        step: 1,
        instruction: `Landing-page probe: state the offer ("${truncate(thesis.pays_for_what, 90)}") to ${truncate(thesis.who_pays, 60)} with a request-access CTA; drive the reach channel (${truncate(thesis.reached_how || 'channel TBD', 60)}).`,
        success_signal: 'Unpaid visitor -> signup conversion >= 5% over the first 100 visitors, or >= 10 qualified signups',
      },
      {
        step: 2,
        instruction: 'Willingness-to-pay probe: present the price point to signups (pre-order / paid pilot ask) before any build.',
        success_signal: '>= 3 explicit pre-commitments (pre-order, LOI, or paid pilot acceptance)',
      },
    ];
    provenance.demand_test_plan = { source_field: 'derived_from(who_pays, pays_for_what, reached_how)', derived: true, template: 'landing_page+wtp_probe' };
  } else {
    incomplete.push('demand_test_plan');
  }

  return thesis;
}

/**
 * Derive >=2 default pre-registered kill criteria tied to the demand-test plan. These are
 * the venture's own falsifiers, registered at selection — downstream gates consume them
 * as contracts instead of inventing generic thresholds later (spec R3 gate-realism).
 *
 * @param {Object} thesis - output of buildThesisFromSynthesis (plan may be present)
 * @returns {Array} kill criteria (validateKillCriteria-valid)
 */
export function deriveDefaultKillCriteria(thesis = {}) {
  return [
    {
      id: 'kill-demand-signals',
      metric: 'demand_test_qualified_signups',
      comparator: 'lt',
      threshold: 10,
      stage_by: 12,
      description: 'Dies if the pre-build demand test produces fewer than 10 qualified signups by stage 12 (demand_test_plan step 1 unmet).',
      source: 'derived_default',
    },
    {
      id: 'kill-willingness-to-pay',
      metric: 'pre_commitments',
      comparator: 'lt',
      threshold: 3,
      stage_by: 16,
      description: 'Dies if fewer than 3 explicit pre-commitments (pre-order/LOI/paid pilot) exist by stage 16 (demand_test_plan step 2 unmet).',
      source: 'derived_default',
    },
    {
      id: 'kill-first-revenue',
      metric: 'real_revenue_events',
      comparator: 'lt',
      threshold: 1,
      stage_by: 24,
      description: `Dies if zero real revenue events have occurred by stage 24 (${thesis?.price_point ? `price point: ${truncate(thesis.price_point, 80)}` : 'price point pending'}).`,
      source: 'derived_default',
    },
  ];
}

/**
 * EXPLICIT-DECISION REGISTRY (spec R5): any dimension the factory currently builds only
 * ONE way is a selection-time DECISION with a declared default — never a silent
 * assumption discovered at Stage 14. form_factor is the first (chairman-surfaced)
 * instance; pricing model and hosting follow the same pattern later.
 */
export const EXPLICIT_DECISIONS = Object.freeze({
  form_factor: Object.freeze({
    default: 'web',
    allowed: Object.freeze(['web', 'pwa', 'native']),
    phase1_anti_goal: 'native',
    native_criterion:
      'native only when an OS capability (push-critical UX, hardware sensor access, offline-first field use) is LOAD-BEARING for the core loop and a PWA demonstrably cannot deliver it',
  }),
});

/**
 * Build the explicit-decisions block for a brief. Defaults apply unless an override is
 * provided (an override marks decided_by:'chairman' and must be an allowed value).
 *
 * @param {Object} [overrides] - e.g. { form_factor: { value: 'pwa', rationale: '...' } }
 * @returns {Object} explicit_decisions
 */
export function buildExplicitDecisions(overrides = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(EXPLICIT_DECISIONS)) {
    const ov = overrides[key];
    if (ov && spec.allowed.includes(ov.value)) {
      out[key] = {
        value: ov.value,
        default: spec.default,
        decided_by: 'chairman',
        rationale: ov.rationale || '(chairman override — no rationale recorded)',
        criterion_for_native: spec.native_criterion,
      };
    } else {
      out[key] = {
        value: spec.default,
        default: spec.default,
        decided_by: 'default',
        rationale: `declared factory default (${spec.default}-first; ${spec.phase1_anti_goal} is a Phase-1 anti-goal)`,
        criterion_for_native: spec.native_criterion,
      };
    }
  }
  return out;
}

/**
 * Validate the explicit-decisions block: every registry key present with an allowed value.
 * @param {Object} decisions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExplicitDecisions(decisions) {
  const errors = [];
  if (!decisions || typeof decisions !== 'object') {
    return { valid: false, errors: ['explicit_decisions must be a non-null object (silent assumptions are not a valid output)'] };
  }
  for (const [key, spec] of Object.entries(EXPLICIT_DECISIONS)) {
    const d = decisions[key];
    if (!d || typeof d !== 'object') { errors.push(`explicit_decisions.${key} is required`); continue; }
    if (!spec.allowed.includes(d.value)) errors.push(`explicit_decisions.${key}.value must be one of ${spec.allowed.join('|')}`);
    if (!d.rationale || typeof d.rationale !== 'string') errors.push(`explicit_decisions.${key}.rationale is required`);
  }
  return { valid: errors.length === 0, errors };
}

function truncate(s, n) {
  const str = String(s);
  return str.length <= n ? str : str.slice(0, n - 1) + '…';
}

export default {
  THESIS_FIELDS,
  KILL_COMPARATORS,
  validateVentureThesis,
  validateKillCriteria,
  evaluateKillCriterion,
  buildThesisFromSynthesis,
  deriveDefaultKillCriteria,
  EXPLICIT_DECISIONS,
  buildExplicitDecisions,
  validateExplicitDecisions,
};
