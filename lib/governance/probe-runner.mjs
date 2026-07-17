/**
 * ONE generic registry-driven probe runner — SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 (FR-2).
 *
 * Replaces per-role probe SCRIPTS with probe ROWS (governance_probe_registry): the
 * runner loads active rows and evaluates each by predicate_type. Adding a probe is
 * an INSERT, never a script.
 *
 * Predicate types (both COMPOSE existing evaluators — no parallel logic):
 * - adherence_fact: the pure fact-verdict style of lib/adam/adherence-probes.js —
 *   config {fact, expect: 'truthy'|'falsy'|'equals', value?}. FAIL-LOUD: an
 *   unresolved fact (null/undefined) yields 'unknown', never a silent pass.
 * - closure_predicate: delegates to lib/loop-governance/closure-engine.js
 *   evaluateLoopClosure — config {predicate_type, closure_predicate}; evidence is
 *   supplied per-probe by the injected fact resolver. closed→pass, open/starved→fail.
 *
 * The registry table ships as a chairman-gated STAGED migration; until the apply,
 * loadActiveProbes reports {degraded:true} and the runner exits cleanly — governed
 * degradation, never a crash and never a fake pass.
 */
import { evaluateLoopClosure, LOOP_STATUS } from '../loop-governance/closure-engine.js';

const MISSING_TABLE_RX = /does not exist|schema cache|42P01/i;

/** Load active probe rows; degraded (not thrown) when the staged table is absent live. */
export async function loadActiveProbes(supabase) {
  const { data, error } = await supabase
    .from('governance_probe_registry')
    .select('probe_key, target_role, predicate_type, predicate_config, gt_case_ref, added_from_situation, active')
    .eq('active', true);
  if (error) {
    if (MISSING_TABLE_RX.test(error.message || '')) {
      return { degraded: true, reason: 'governance_probe_registry not applied yet (chairman-gated STAGED migration pending)', probes: [] };
    }
    return { degraded: true, reason: `registry read failed: ${error.message}`, probes: [] };
  }
  return { degraded: false, probes: data || [] };
}

/**
 * PURE per-probe evaluation.
 * @param {Object} probe - a governance_probe_registry row
 * @param {Object} facts - resolved facts/evidence keyed by probe_key (IO stays in the caller)
 * @param {Date} [now]
 * @returns {{probe_key:string, target_role:string, verdict:'pass'|'fail'|'unknown', detail:string}}
 */
export function evaluateProbe(probe, facts = {}, now = new Date()) {
  const cfg = probe?.predicate_config || {};
  const base = { probe_key: probe?.probe_key || '(unknown)', target_role: probe?.target_role || '(unknown)' };

  if (probe?.predicate_type === 'adherence_fact') {
    const value = facts[cfg.fact];
    if (value === null || value === undefined) {
      return { ...base, verdict: 'unknown', detail: `fact '${cfg.fact}' unresolved — never a silent pass` };
    }
    let pass;
    if (cfg.expect === 'falsy') pass = !value;
    else if (cfg.expect === 'equals') pass = value === cfg.value;
    else pass = !!value; // default 'truthy'
    return { ...base, verdict: pass ? 'pass' : 'fail', detail: `fact '${cfg.fact}'=${JSON.stringify(value)} expect=${cfg.expect || 'truthy'}` };
  }

  if (probe?.predicate_type === 'closure_predicate') {
    const evidence = facts[base.probe_key] || {};
    const { status, reason } = evaluateLoopClosure(
      { predicate_type: cfg.predicate_type, closure_predicate: cfg.closure_predicate },
      evidence,
      now,
    );
    const verdict = status === LOOP_STATUS.CLOSED ? 'pass'
      : status === LOOP_STATUS.UNKNOWN ? 'unknown'
      : 'fail'; // open and starved are both drift signals for a duty probe
    return { ...base, verdict, detail: `${status}: ${reason}` };
  }

  return { ...base, verdict: 'unknown', detail: `unknown predicate_type '${probe?.predicate_type}'` };
}

/**
 * Run the whole registry once.
 * @param {Object} supabase
 * @param {Object} [opts]
 * @param {Function} [opts.resolveFacts] - async (probes) => facts object (IO seam)
 * @param {Date} [opts.now]
 * @returns {Promise<{degraded:boolean, reason?:string, results:Array}>}
 */
export async function runProbeRegistry(supabase, { resolveFacts, now = new Date() } = {}) {
  const loaded = await loadActiveProbes(supabase);
  if (loaded.degraded) return { degraded: true, reason: loaded.reason, results: [] };
  const facts = resolveFacts ? await resolveFacts(loaded.probes) : {};
  return { degraded: false, results: loaded.probes.map((p) => evaluateProbe(p, facts, now)) };
}
