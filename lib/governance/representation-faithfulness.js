/**
 * Governing-representation faithfulness — SD-LEO-INFRA-GOVERNING-REPRESENTATION-FAITHFULNESS-001.
 *
 * @wire-check-exempt: naming tier over an existing incident family. The contract + shared predicate
 * are built first; wiring each remaining site's adapter + the coordinator health surface is the
 * activation follow-on (tracked in INSTANCE_REGISTRY as status='planned'). Consumed today by tests.
 *
 * THE INVARIANT (the thing the whole gauge-vs-truth incident family was silently violating):
 *   A fact or obligation that lives in a SOURCE representation R1 must be FAITHFULLY present in the
 *   representation R2 that actually GOVERNS behavior, and any divergence must FAIL LOUD — never
 *   silently resolve to a convenient default.
 *
 * THE SINGLE MECHANICAL PREDICATE (Solomon's validated cheap test):
 *   "Does the governing representation R2 derive from the source-of-truth R1 AT WRITE/ACTION TIME,
 *    and does it ALARM ON DIVERGENCE?"  ->  faithful iff (derives_at_action_time && alarms_on_divergence)
 *
 * It generalizes cleanly across count-integrity (rows.length vs true COUNT), acceptance-trim
 * (gate-accepted mock vs ratified live AC), and comms-truncation (preview vs full body). Instead of N
 * sibling SDs, incidents register here as INSTANCES of ONE contract.
 *
 * PURE CORES (data-in / verdict-out, no DB). Counterfactual retained: a site that genuinely resists
 * the common predicate is registered as a per-site instance rather than force-fit (records the decision).
 */

/**
 * INSTANCE_REGISTRY — the single queryable place a gauge-vs-truth incident is registered.
 * Each instance names R1 (source-of-truth) and R2 (the representation that governs behavior), whether
 * R2 derives from R1 at action time, and whether the site alarms loudly on divergence.
 *  status: 'shipped' (fix built) | 'existing' (mechanism present) | 'planned' (divergence known, unfixed) | 'separate' (resists the common predicate; per-site)
 *  divergence_detected_at: ISO ts of a still-open divergence (drives the health metric); null if none.
 */
export const INSTANCE_REGISTRY = Object.freeze([
  {
    name: 'count-integrity',
    r1_source: 'true row count (COUNT(*) / full unpaginated set)',
    r2_governing: 'rows.length after a PostgREST select (silently capped at 1000)',
    derive_site: 'count-discipline sweep derives the count from a true-count query at read time',
    alarm_mechanism: 'count-discipline sweep flags rows.length==1000 as suspect',
    derives_at_action_time: true, alarms_on_divergence: true, status: 'shipped', divergence_detected_at: null,
  },
  {
    name: 'acceptance-integrity',
    r1_source: 'ratified live acceptance criteria',
    r2_governing: 'gate-accepted unit-test mock the gate scored against',
    derive_site: 'LEADFINAL-ACCEPTANCE-INTEGRITY-001 binds the gate to the ratified live AC',
    alarm_mechanism: 'gate fails when the accepted unit is a mock of the AC, not the live AC',
    derives_at_action_time: true, alarms_on_divergence: true, status: 'shipped', divergence_detected_at: null,
    sibling_sd: 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001',
  },
  {
    name: 'role-measurement-integrity',
    r1_source: 'true role assignment (SET_IDENTITY / authoritative role)',
    r2_governing: 'measured / displayed role used to gate behavior',
    derive_site: 'ROLE-MEASUREMENT-INTEGRITY-001 derives the measured role from the authoritative row',
    alarm_mechanism: 'measurement alarms when displayed role diverges from the authoritative assignment',
    derives_at_action_time: true, alarms_on_divergence: true, status: 'shipped', divergence_detected_at: null,
    sibling_sd: 'SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001',
  },
  {
    name: 'comms-capBody',
    r1_source: 'full message body',
    r2_governing: 'preview / truncated body actually delivered (slice(0,300))',
    derive_site: 'capBody derives the sent body from the full body at send time',
    alarm_mechanism: 'truncation is explicit + reconciled, not silently dropped',
    derives_at_action_time: true, alarms_on_divergence: true, status: 'existing', divergence_detected_at: null,
  },
  {
    name: 'park-obligation-watcher',
    r1_source: 'coordinator park/route order',
    r2_governing: 'worker loop state that actually governs whether the worker parks',
    derive_site: 'a park-obligation watcher should reconcile the loop state against the park order at tick time',
    alarm_mechanism: 'alarm when a parked-order worker is still working (or vice-versa)',
    derives_at_action_time: false, alarms_on_divergence: false, status: 'planned', divergence_detected_at: '2026-07-19T00:00:00Z',
  },
  {
    name: 'review-loop-action-closure',
    r1_source: 'flagged-and-owed obligation (the one thing flagged for closure)',
    r2_governing: 'closure/escalation ledger that guarantees the item reaches closure',
    derive_site: 'action-closure watcher escalates an unclosed flagged item by its due cycle (Adam -> chairman-visible)',
    alarm_mechanism: 'auto-escalation by due cycle so the 4-cycle-zombie class cannot recur',
    derives_at_action_time: false, alarms_on_divergence: false, status: 'planned', divergence_detected_at: '2026-07-18T00:00:00Z',
    due_cycle_ms: 24 * 60 * 60 * 1000,
  },
  {
    name: 'fence-classification-view',
    r1_source: '~8 scattered fence metadata keys (exec_hold, do_not_auto_dispatch, requires_human_action, needs_coordinator_review, review_hold_disposition, exec_hold_reason, depends_on, fence_lifted_at)',
    r2_governing: 'the fence status each tick actually acts on (currently hand-derived, no queryable view)',
    derive_site: 'a queryable fence-classification view would derive fence status from the keys at query time',
    alarm_mechanism: 'MISSING — hand-derived each tick, so mis-derivable (a facet was missed on first pass)',
    derives_at_action_time: false, alarms_on_divergence: false, status: 'planned', divergence_detected_at: '2026-07-20T00:00:00Z',
  },
  {
    // SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-A (Part 1). A GENUINE
    // venture can advance its stage gauge to a high number while never starting a real build
    // (canonical live case: ApexNiche AI at stage-19, launch_mode='simulated', deployment_url/
    // repo_url/workflow_started_at all null). lib/governance/real-build-discriminator.mjs derives
    // R2-vs-R1 at assessment time and annotates the divergence (reversible metadata, never resets
    // the stage). The alarm/escalation surface is Child B (the stall alarm) — hence 'planned'.
    name: 'stage-vs-real-build',
    r1_source: 'real-build state (deployment_url / repo_url / workflow_started_at evidence, or launch_mode=\'live\')',
    r2_governing: 'current_lifecycle_stage — the stage gauge the whole venture lifecycle acts on',
    derive_site: 'real-build-discriminator.mjs assessRealBuildDivergence derives R2-vs-R1 (stage > STAGE_SIMULATION_OK && !real_build_started) at assessment time',
    alarm_mechanism: 'backfill sweep annotates metadata.build_provenance (Part 1); loud stall alarm is Child B (Part 2)',
    derives_at_action_time: true, alarms_on_divergence: false, status: 'planned', divergence_detected_at: '2026-07-21T00:00:00Z',
    sibling_sd: 'SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-A',
  },
]);

const REMEDIATION = Object.freeze({
  hand_derived: 'derive R2 from R1 at write/action time (not hand-derived after the fact)',
  silent_default: 'alarm loudly on divergence — never silently resolve R1!=R2 to a convenient default',
});

/**
 * The shared mechanical predicate (F2). Faithful iff R2 derives from R1 at action time AND the site
 * alarms on divergence. A hand-derived R2 is unfaithful; a silent-default site is unfaithful even when
 * R2 currently matches R1 (the alarm is the contract, not the momentary agreement).
 * @param {{derives_at_action_time?:boolean, alarms_on_divergence?:boolean, divergence_detected_at?:string|null, name?:string}} instance
 * @returns {{ name:string|null, faithful:boolean, divergent:boolean, alarms_on_divergence:boolean, remediation:string[] }}
 */
export function assessFaithfulness(instance = {}) {
  const derives = instance.derives_at_action_time === true;
  const alarms = instance.alarms_on_divergence === true;
  const divergent = instance.divergence_detected_at != null;
  const remediation = [];
  if (!derives) remediation.push(REMEDIATION.hand_derived);
  if (!alarms) remediation.push(REMEDIATION.silent_default);
  return { name: instance.name || null, faithful: derives && alarms, divergent, alarms_on_divergence: alarms, remediation };
}

/** Assess the whole registry: per-instance verdicts + the set of currently-unfaithful instances. */
export function assessRegistry(registry = INSTANCE_REGISTRY) {
  const list = Array.isArray(registry) ? registry : [];
  const assessed = list.map((i) => ({ ...assessFaithfulness(i), status: i.status }));
  return { assessed, unfaithful: assessed.filter((a) => !a.faithful), total: list.length };
}

/**
 * Divergence-age health metric (F3): oldest still-open divergence + oldest unclosed flagged-item age.
 * An instance with no recorded divergence contributes null (excluded from the oldest calc).
 * @param {Array<object>} registry
 * @param {{ nowMs:number }} opts
 */
export function divergenceAge(registry = INSTANCE_REGISTRY, { nowMs } = {}) {
  const list = Array.isArray(registry) ? registry : [];
  const offenders = [];
  for (const i of list) {
    if (!i || i.divergence_detected_at == null) continue; // no divergence -> null contribution
    const ageMs = Math.max(0, nowMs - new Date(i.divergence_detected_at).getTime());
    offenders.push({ instance: i.name || null, age_ms: ageMs, kind: i.due_cycle_ms != null ? 'unclosed_flagged' : 'undetected_divergence' });
  }
  offenders.sort((a, b) => b.age_ms - a.age_ms);
  const oldest = (kind) => { const m = offenders.filter((o) => o.kind === kind).map((o) => o.age_ms); return m.length ? Math.max(...m) : null; };
  return {
    oldest_undetected_divergence_ms: oldest('undetected_divergence'),
    oldest_unclosed_flagged_ms: oldest('unclosed_flagged'),
    offenders,
  };
}

/**
 * Review-loop action-closure predicate (F4). A flagged 'one thing' (R1) must reach a
 * closure-guaranteeing ledger (R2) by its due cycle; an unclosed item past its due cycle is flagged
 * (would auto-escalate to Adam -> chairman-visible), so the 4-cycle-zombie class cannot recur.
 * @param {{ closed?:boolean, closed_at?:string|null, flagged_at?:string }} item
 * @param {{ nowMs:number, dueCycleMs:number }} opts
 * @returns {{ faithful:boolean, past_due:boolean, age_ms:number|null, remediation:string|null }}
 */
export function isActionClosureFaithful(item = {}, { nowMs, dueCycleMs } = {}) {
  if (item.closed === true || item.closed_at != null) return { faithful: true, past_due: false, age_ms: null, remediation: null };
  const ageMs = item.flagged_at != null ? Math.max(0, nowMs - new Date(item.flagged_at).getTime()) : Infinity;
  const pastDue = Number.isFinite(dueCycleMs) && ageMs > dueCycleMs;
  return {
    faithful: !pastDue,
    past_due: pastDue,
    age_ms: Number.isFinite(ageMs) ? ageMs : null,
    remediation: pastDue ? 'auto-escalate the unclosed flagged item (due cycle elapsed): Adam -> chairman-visible' : null,
  };
}
