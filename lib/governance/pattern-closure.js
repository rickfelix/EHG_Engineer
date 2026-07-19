/**
 * Canonical issue_patterns closure gate — SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2).
 *
 * A pattern is a PAT-* row in issue_patterns. Today 3 independent write paths flip
 * status='resolved' with no check that a real prevention artifact (a named guard/gate/
 * test) exists — evidenced by PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 being declared
 * closed at its 21st code-comment witness (PR #3700) yet witnessed 22nd/26th/28th since,
 * with no DB-level reopen. closeIssuePatterns() is the single canonical write path going
 * forward (the SD-completion DB trigger mirrors this same gate directly in SQL, since it
 * cannot import a JS module — see database/migrations/*_pattern_closure_prevention_gate.sql).
 *
 * Enforcement is flag-gated (chairman_dashboard_config.metadata.
 * pattern_registry_enforce_prevention_required, default/absent=false) so this SD ships with
 * zero behavior change; an operator flips the flag ON after observing at least one
 * measurement window from leaf-3's already-live per-loop health gauges.
 */

const CONFIG_TABLE = 'chairman_dashboard_config';
const CONFIG_KEY = 'default';
const ENFORCE_FLAG_PATH = 'pattern_registry_enforce_prevention_required';

/** Pure: true iff a pattern carries a non-empty prevention_checklist. */
export function hasValidPreventionArtifact(pattern) {
  return !!(pattern && Array.isArray(pattern.prevention_checklist) && pattern.prevention_checklist.length > 0);
}

/**
 * Whether prevention-required closure enforcement is currently ON. Fails OPEN (false) on
 * any query error or missing config row/key so a transient DB issue never blocks an
 * unrelated SD-completion flow.
 * @param {object} supabase
 * @returns {Promise<boolean>}
 */
export async function isPreventionRequiredEnforced(supabase) {
  try {
    const { data, error } = await supabase
      .from(CONFIG_TABLE)
      .select('metadata')
      .eq('config_key', CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return false;
    return data.metadata?.[ENFORCE_FLAG_PATH] === true;
  } catch {
    return false;
  }
}

/**
 * The canonical write path to resolve issue_patterns rows. Selects candidates
 * (status IN 'assigned'|'active' — the two states real callers resolve from: SD-assigned
 * patterns via resolveLearningItems(), and operator-selected active patterns via /learn's
 * resolvePatterns() — optionally filtered by sdId/patternIds), partitions into eligible
 * (has a prevention artifact) and deferred. With enforcement OFF, resolves every candidate
 * (today's behavior, unchanged) but warns about any that would have been deferred. With
 * enforcement ON, resolves only eligible candidates — deferred ones are left untouched,
 * never throwing, so no caller (e.g. LEAD-FINAL-APPROVAL) is ever blocked.
 * @param {object} supabase
 * @param {{patternIds?: string[], sdId?: string, resolutionNotes: string}} opts
 * @returns {Promise<{resolved: string[], deferred: Array<{pattern_id: string, reason: string}>}>}
 */
const OPEN_STATUSES = ['assigned', 'active'];

export async function closeIssuePatterns(supabase, { patternIds, sdId, resolutionNotes } = {}) {
  let query = supabase.from('issue_patterns').select('pattern_id, prevention_checklist').in('status', OPEN_STATUSES);
  if (sdId) query = query.eq('assigned_sd_id', sdId);
  if (Array.isArray(patternIds) && patternIds.length > 0) query = query.in('pattern_id', patternIds);

  const { data: candidates, error: selectError } = await query;
  if (selectError || !Array.isArray(candidates) || candidates.length === 0) {
    return { resolved: [], deferred: [] };
  }
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 exact-cap tripwire: exactly the PostgREST
  // 1000-row max is presumed truncated. WARN, don't crash — this function is documented to never
  // throw (LEAD-FINAL-APPROVAL callers), and each candidate it DID fetch is still individually
  // legitimate to resolve; missing ones are picked up on the next call.
  // (Pagination not used: the unit-test chain stubs expose no .order()/.range().)
  if (candidates.length === 1000) {
    console.warn('[pattern-closure] open-pattern candidate read returned exactly 1000 rows (PostgREST cap) — candidate set may be truncated');
  }

  const enforced = await isPreventionRequiredEnforced(supabase);
  const eligible = [];
  const deferred = [];
  for (const c of candidates) {
    if (hasValidPreventionArtifact(c)) {
      eligible.push(c.pattern_id);
    } else {
      deferred.push({ pattern_id: c.pattern_id, reason: 'missing prevention_checklist (no named guard/gate/test)' });
    }
  }

  const toResolve = enforced ? eligible : candidates.map((c) => c.pattern_id);
  const actuallyDeferred = enforced ? deferred : [];

  if (!enforced && deferred.length > 0) {
    console.warn(
      `⚠️  [PATTERN_CLOSURE] ${deferred.length} pattern(s) resolved WITHOUT a prevention artifact (enforcement OFF): ${deferred.map((d) => d.pattern_id).join(', ')}`
    );
  }

  if (toResolve.length === 0) {
    return { resolved: [], deferred: actuallyDeferred };
  }

  // Race guard: a row can drop out of this UPDATE's WHERE clause between the SELECT above
  // and here (a concurrent status change, e.g. another resolver or FR-4's auto-reopen).
  // .update() alone reports no error on a zero-row match, so `.select()` the actually-
  // updated rows back and only report those as resolved — never claim a write that didn't
  // happen (downstream callers prune MEMORY.md / publish PATTERN_RESOLVED on `resolved`).
  // Re-apply the same sdId scope the SELECT used: without it, a pattern reassigned to a
  // different SD in that same race window would still resolve here and get attributed
  // (via resolutionNotes) to the original sdId — the SQL twin avoids this because its
  // assigned_sd_id filter lives in the same single atomic UPDATE, not a separate SELECT.
  const now = new Date().toISOString();
  let updateQuery = supabase
    .from('issue_patterns')
    .update({ status: 'resolved', resolution_date: now, resolution_notes: resolutionNotes })
    .in('status', OPEN_STATUSES)
    .in('pattern_id', toResolve);
  if (sdId) updateQuery = updateQuery.eq('assigned_sd_id', sdId);
  const { data: updatedRows, error: updateError } = await updateQuery.select('pattern_id');

  if (updateError || !Array.isArray(updatedRows)) {
    return { resolved: [], deferred: actuallyDeferred };
  }

  return { resolved: updatedRows.map((r) => r.pattern_id), deferred: actuallyDeferred };
}

export default { hasValidPreventionArtifact, isPreventionRequiredEnforced, closeIssuePatterns };
