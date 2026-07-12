/**
 * FR-4 — Objective + anti-Goodhart-guard registry (SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B).
 *
 * A venture-org objective-function registry paired with anti-Goodhart guards, modeled on the
 * shape of lib/governance/gauge-registry.js (descriptor rows + string-keyed detector
 * indirection) and lib/governance/guardrail-registry.js (a `check`-style evaluator returning
 * { passed, violations, warnings } with a per-item blocking/advisory mode, plus fire-and-forget
 * event emission). It is NOT a parallel governance engine — it reuses those conventions.
 *
 * Storage is the additive substrate created by 20260712_spine_core_identity_registry_fabric.sql:
 *   org_objective_registry (venture_id, objective_key, statement, metric, target, mode, ...)
 *   org_guard_registry      (objective_key, guard_key, guard_type, predicate_description, mode, ...)
 *
 * Distinction from guardrail-registry's deliberate removal of a runtime register():
 * registerObjective/registerGuard here are the legitimate SERVER-SIDE authoring API for org
 * governance data (seeded by chairman/coordinator/calibration-engine via the service-role
 * client), NOT a runtime SD-gate bypass vector. All access is service-role; the tables are
 * RLS-locked to service_role (20260712_spine_core_rls.sql).
 *
 * House convention (mirrors lib/org/chairman-surface.mjs, factory-identity-fold.cjs): `supabase`
 * is dependency-injected; this module never constructs a client. Behaviour is injected through
 * `opts` seams (loadGuardsFn, detectorResolver) so unit tests run DB-free.
 */

export const MODES = Object.freeze({ ADVISORY: 'advisory', BLOCKING: 'blocking' });
export const GUARD_TYPES = Object.freeze(['anti_goodhart', 'constraint', 'tripwire']);
export const OBJECTIVE_GUARD_EVENT_PASSED = 'ORG_OBJECTIVE_GUARD_PASSED';
export const OBJECTIVE_GUARD_EVENT_VIOLATED = 'ORG_OBJECTIVE_GUARD_VIOLATED';

/**
 * Built-in guard detectors keyed by guard_type. Each detector is pure:
 *   (observation, { guard, objectiveKey }) => { tripped: boolean, reason?: string }
 * The guard's stored predicate_description is human documentation; the detector is the
 * executable predicate (mirrors gauge-registry's detectorFn string-key → resolver indirection).
 */
const BUILTIN_DETECTORS = Object.freeze({
  // Classic Goodhart: the metric CLAIMS its target is met, but gaming signals are present —
  // the proxy metric was optimized directly instead of the true outcome it stands in for.
  anti_goodhart(observation) {
    const gaming = Array.isArray(observation?.gamingSignals) ? observation.gamingSignals : [];
    if (observation?.claimsTargetMet && gaming.length > 0) {
      return { tripped: true, reason: `metric claims target met but ${gaming.length} gaming signal(s) present: ${gaming.join(', ')}` };
    }
    return { tripped: false };
  },
  // A hard constraint the caller reports as violated for this guard_key.
  constraint(observation, { guard }) {
    const violated = Array.isArray(observation?.constraintViolations) && observation.constraintViolations.includes(guard.guard_key);
    return violated ? { tripped: true, reason: `constraint ${guard.guard_key} reported violated` } : { tripped: false };
  },
  // A tripwire the caller reports as fired for this guard_key.
  tripwire(observation, { guard }) {
    const fired = Array.isArray(observation?.tripwires) && observation.tripwires.includes(guard.guard_key);
    return fired ? { tripped: true, reason: `tripwire ${guard.guard_key} fired` } : { tripped: false };
  },
});

/** Register (upsert) an objective. Server-side authoring API. */
export async function registerObjective(supabase, { ventureId = null, objectiveKey, statement, metric = null, target = null, mode = MODES.ADVISORY, createdBy = null } = {}) {
  if (!objectiveKey || !statement) throw new Error('registerObjective requires objectiveKey and statement');
  if (mode !== MODES.ADVISORY && mode !== MODES.BLOCKING) throw new Error(`invalid mode: ${mode}`);
  const { data, error } = await supabase
    .from('org_objective_registry')
    .upsert({ venture_id: ventureId, objective_key: objectiveKey, statement, metric, target, mode, created_by: createdBy }, { onConflict: 'venture_id,objective_key' })
    .select()
    .maybeSingle();
  if (error) throw new Error(`registerObjective failed: ${error.message}`);
  return data;
}

/** Register (upsert) a guard watching an objective. Server-side authoring API. */
export async function registerGuard(supabase, { objectiveKey, guardKey, guardType = 'anti_goodhart', predicateDescription, mode = MODES.ADVISORY } = {}) {
  if (!objectiveKey || !guardKey || !predicateDescription) throw new Error('registerGuard requires objectiveKey, guardKey, predicateDescription');
  if (!GUARD_TYPES.includes(guardType)) throw new Error(`invalid guardType: ${guardType}`);
  if (mode !== MODES.ADVISORY && mode !== MODES.BLOCKING) throw new Error(`invalid mode: ${mode}`);
  const { data, error } = await supabase
    .from('org_guard_registry')
    .upsert({ objective_key: objectiveKey, guard_key: guardKey, guard_type: guardType, predicate_description: predicateDescription, mode }, { onConflict: 'guard_key' })
    .select()
    .maybeSingle();
  if (error) throw new Error(`registerGuard failed: ${error.message}`);
  return data;
}

/**
 * Evaluate an objective's active guards against an observation.
 * Returns { passed, violations, warnings, objectiveKey }: a tripped guard in BLOCKING mode is a
 * violation (passed=false); in ADVISORY mode it is a warning (never blocks). A detector that
 * throws is downgraded to an advisory warning (fail-open), matching guardrail-registry.
 *
 * @param {object} supabase - injected service-role client (used for guard load + event emit)
 * @param {{ objectiveKey: string, ventureId?: string|null, observation?: object }} args
 * @param {{ loadGuardsFn?: function, detectorResolver?: function, emitFn?: function }} [opts] - test seams
 */
export async function evaluateObjective(supabase, { objectiveKey, ventureId = null, observation = {} } = {}, opts = {}) {
  if (!objectiveKey) throw new Error('evaluateObjective requires objectiveKey');
  const loadGuards = opts.loadGuardsFn || (async () => {
    const { data, error } = await supabase
      .from('org_guard_registry')
      .select('*')
      .eq('objective_key', objectiveKey)
      .eq('status', 'active');
    if (error) throw new Error(`load guards failed: ${error.message}`);
    return data || [];
  });
  const resolveDetector = opts.detectorResolver || ((guard) => BUILTIN_DETECTORS[guard.guard_type]);

  const guards = await loadGuards();
  const violations = [];
  const warnings = [];
  for (const guard of guards) {
    const detector = resolveDetector(guard);
    if (typeof detector !== 'function') continue; // unknown guard_type → skip that guard (fail-open)
    let result;
    try {
      result = detector(observation, { guard, objectiveKey });
    } catch (e) {
      warnings.push({ guardKey: guard.guard_key, guardType: guard.guard_type, reason: `detector error (downgraded to advisory): ${e.message}` });
      continue;
    }
    if (result && result.tripped) {
      const entry = { guardKey: guard.guard_key, guardType: guard.guard_type, reason: result.reason || 'guard tripped' };
      if (guard.mode === MODES.BLOCKING) violations.push(entry);
      else warnings.push(entry);
    }
  }
  const passed = violations.length === 0;
  const emit = opts.emitFn || emitEvaluationEvent;
  emit(supabase, { objectiveKey, ventureId, passed, violations, warnings });
  return { passed, violations, warnings, objectiveKey };
}

/**
 * Fire-and-forget governance event. Never awaited, never throws — mirrors
 * guardrail-registry.emitGuardrailEvent + writer-authorization.recordWriterWouldDenyEvidence.
 */
function emitEvaluationEvent(supabase, { objectiveKey, ventureId, passed, violations, warnings }) {
  try {
    const p = supabase.from('system_events').insert({
      event_type: passed ? OBJECTIVE_GUARD_EVENT_PASSED : OBJECTIVE_GUARD_EVENT_VIOLATED,
      payload: {
        objective_key: objectiveKey,
        venture_id: ventureId,
        passed,
        violation_count: violations.length,
        warning_count: warnings.length,
        violations,
        warnings,
      },
    });
    if (p && typeof p.then === 'function') p.then(() => {}, () => {}); // swallow async rejection
  } catch {
    /* fail-soft: governance evaluation must never break on telemetry */
  }
}

/** List active objectives, optionally scoped to a venture. */
export async function listObjectives(supabase, { ventureId = null } = {}) {
  let q = supabase.from('org_objective_registry').select('*').eq('status', 'active');
  if (ventureId) q = q.eq('venture_id', ventureId);
  const { data, error } = await q;
  if (error) throw new Error(`listObjectives failed: ${error.message}`);
  return data || [];
}
