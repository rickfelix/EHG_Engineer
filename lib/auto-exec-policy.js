/**
 * Auto-exec policy gates — SD-LEO-INFRA-POLICY-GATED-AUTO-001B (child of the
 * policy-gated auto-execution engine).
 *
 * The safety gates the engine (001C) consults BEFORE any action. No control loop
 * and no auto-execution live here. Three concerns:
 *
 *  1. Reversibility classifier (FM-C) — an action is auto-eligible ONLY if it is
 *     reversible within a bounded window AND not outward-facing AND not in the
 *     human-owned forbidden-class set. Anything unknown/ambiguous defaults to
 *     FORBIDDEN (fail-safe).
 *  2. Path-overlap guard (FM-D, file side) — the engine may never target its own
 *     guardrail paths (policy/forbidden/flag/kill-switch storage + settings.json).
 *     The DB side of meta-stability is enforced at the storage layer by the
 *     leo_engine_ro role's write-deny (see the migration + db test); this guard
 *     covers filesystem/config targets static role grants cannot.
 *  3. Fail-closed policy reader — loading an action-class policy that is missing
 *     any required facet yields not-eligible, never a partial-policy proceed.
 *
 * The pure functions are unit-tested with no DB; the two async helpers wrap a
 * supabase client and are exercised by the db-project integration test.
 */

/** Facets every action-class policy MUST define for the engine to act on it. */
export const REQUIRED_POLICY_FACETS = Object.freeze([
  'preconditions', 'canary', 'rollback', 'blast_radius', 'observe_window', 'escalation',
]);

/** Guardrail targets the engine must never act on (file/config side). */
export const DEFAULT_GUARDRAIL_PATHS = Object.freeze([
  '.claude/settings.json',
  '.claude/settings.local.json',
  'leo_auto_exec_policy',
  'leo_auto_exec_forbidden',
  'leo_feature_flags',
  'leo_kill_switches',
]);

const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();

/**
 * Pure reversibility classifier. Default-safe: returns FORBIDDEN unless the action
 * is provably reversible, not outward-facing, and not in the forbidden set.
 *
 * @param {object} action {action_class, target?, outward_facing?, reversible?, rollback_window_ms?}
 * @param {object} opts {forbiddenClasses?: string[]}
 * @returns {{eligible: boolean, verdict: 'reversible'|'forbidden', reason: string}}
 */
export function classifyReversibility(action, opts = {}) {
  const forbidden = new Set((opts.forbiddenClasses || []).map((c) => String(c).toLowerCase()));
  if (!action || typeof action !== 'object' || !action.action_class) {
    return { eligible: false, verdict: 'forbidden', reason: 'no action_class (default-safe)' };
  }
  const cls = String(action.action_class).toLowerCase();
  if (forbidden.has(cls)) {
    return { eligible: false, verdict: 'forbidden', reason: `action_class '${action.action_class}' is in the forbidden set` };
  }
  if (action.outward_facing === true) {
    return { eligible: false, verdict: 'forbidden', reason: 'outward-facing action is never auto-eligible' };
  }
  const windowMs = Number(action.rollback_window_ms);
  if (action.reversible === true && Number.isFinite(windowMs) && windowMs > 0) {
    return { eligible: true, verdict: 'reversible', reason: `reversible within ${windowMs}ms rollback window` };
  }
  return { eligible: false, verdict: 'forbidden', reason: 'not provably reversible within a bounded window (default-safe)' };
}

/**
 * Pure path-overlap guard. Blocks an action whose target equals, contains, or is
 * contained by any guardrail path (so the engine cannot edit its own safety layer).
 *
 * @param {string} target file path or table identifier the action would touch
 * @param {object} opts {guardrailPaths?: string[]}
 * @returns {{blocked: boolean, reason: string}}
 */
export function checkPathOverlap(target, opts = {}) {
  const guardrails = (opts.guardrailPaths || DEFAULT_GUARDRAIL_PATHS).map(norm);
  const t = norm(target);
  if (!t) return { blocked: true, reason: 'empty target (default-safe)' };
  for (const g of guardrails) {
    // equality; target inside a guardrail dir; a guardrail dir inside the target;
    // or a guardrail path appearing as a path-boundary SUFFIX of an absolute /
    // prefixed target (e.g. 'C:/proj/.claude/settings.json' or 'repo/leo_feature_flags').
    if (t === g || t.startsWith(g + '/') || g.startsWith(t + '/') || t.endsWith('/' + g)) {
      return { blocked: true, reason: `target '${target}' overlaps guardrail path '${g}'` };
    }
  }
  return { blocked: false, reason: 'target does not overlap any guardrail path' };
}

/** Pure: does a policy object define every required facet (non-null)? */
export function validatePolicyShape(policy) {
  if (!policy || typeof policy !== 'object') return { ok: false, missing: [...REQUIRED_POLICY_FACETS] };
  const missing = REQUIRED_POLICY_FACETS.filter((f) => policy[f] == null);
  return { ok: missing.length === 0, missing };
}

/**
 * Combined eligibility decision for one action against one action-class policy.
 * Pure — the engine composes the DB reads (loadActionPolicy / fetchForbiddenClasses)
 * and passes the results in. ALL gates must pass; any failure is fail-safe FORBIDDEN.
 */
export function decideAutoExecEligibility(action, { policy, forbiddenClasses = [], guardrailPaths } = {}) {
  const cls = classifyReversibility(action, { forbiddenClasses });
  if (!cls.eligible) return { eligible: false, gate: 'reversibility', reason: cls.reason };

  const overlap = checkPathOverlap(action.target, { guardrailPaths });
  if (overlap.blocked) return { eligible: false, gate: 'path-overlap', reason: overlap.reason };

  const shape = validatePolicyShape(policy);
  if (!shape.ok) return { eligible: false, gate: 'policy', reason: `policy incomplete (missing: ${shape.missing.join(', ')})` };

  return { eligible: true, gate: null, reason: 'all gates passed' };
}

/**
 * DB: load an action-class policy (fail-closed). Returns {ok:false} when the policy
 * is absent or incomplete so a partial policy can never authorize an action.
 */
export async function loadActionPolicy(db, actionClass) {
  try {
    const { data, error } = await db
      .from('leo_auto_exec_policy')
      .select('action_class, preconditions, canary, rollback, blast_radius, observe_window, escalation')
      .eq('action_class', actionClass)
      .maybeSingle();
    if (error) return { ok: false, reason: `policy query error: ${error.message}` };
    if (!data) return { ok: false, reason: `no policy for action_class '${actionClass}'` };
    const shape = validatePolicyShape(data);
    if (!shape.ok) return { ok: false, reason: `policy for '${actionClass}' incomplete (missing: ${shape.missing.join(', ')})` };
    return { ok: true, policy: data };
  } catch (e) {
    return { ok: false, reason: `policy load failed: ${e.message}` };
  }
}

/** DB: read the human-owned forbidden action-class set. Fail-safe: a read error
 *  returns a sentinel so callers treat everything as forbidden, never as allowed. */
export async function fetchForbiddenClasses(db) {
  try {
    const { data, error } = await db
      .from('leo_auto_exec_forbidden')
      .select('action_class, outward_facing');
    if (error || !data) return { ok: false, classes: [], reason: 'forbidden-set read failed (treat all as forbidden)' };
    return { ok: true, classes: data.map((r) => r.action_class) };
  } catch (e) {
    return { ok: false, classes: [], reason: `forbidden-set read failed: ${e.message}` };
  }
}
