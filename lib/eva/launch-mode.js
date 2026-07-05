/**
 * Launch-mode read helpers — SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-1).
 *
 * `ventures.launch_mode` is a distinct axis from the existing `pipeline_mode`
 * (lifecycle stage). It is chairman-gated DDL (database/migrations/20260703_ventures_launch_mode.sql)
 * staged but not necessarily applied yet — getLaunchMode fails open to 'simulated'
 * (today's de-facto behavior) on ANY read error, including the column not existing yet,
 * so callers never depend on the migration having landed.
 */

export const SIMULATED = 'simulated';
export const LIVE = 'live';
const DEFAULT_MODE = SIMULATED;

/**
 * Read a venture's launch_mode. Fails open to 'simulated' on any error
 * (missing supabase/ventureId, undefined_column, network error, no row).
 * @param {object} [supabase]
 * @param {string} [ventureId]
 * @returns {Promise<'simulated'|'live'>}
 */
export async function getLaunchMode(supabase, ventureId) {
  if (!supabase || !ventureId) return DEFAULT_MODE;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('launch_mode') // schema-lint-disable-line: chairman-gated column (database/migrations/20260703_ventures_launch_mode.sql), intentionally not yet applied to the live schema — getLaunchMode fails open to 'simulated' until the chairman applies it
      .eq('id', ventureId)
      .maybeSingle();
    if (error || !data) return DEFAULT_MODE;
    return data.launch_mode === LIVE ? LIVE : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** @param {string} mode @returns {boolean} */
export function isLiveMode(mode) {
  return mode === LIVE;
}

/** @param {string} mode @returns {boolean} */
export function isSimulatedMode(mode) {
  return mode !== LIVE;
}

// ── SD-LEO-INFRA-LAUNCH-MODE-POLICY-002: the flip path (FR-1/FR-2) ──────────

/**
 * Pure: may this decided_by flip a venture's launch_mode? CHAIRMAN ONLY —
 * deliberately STRICTER than the S16 approval allowlist (which also admits
 * monitoring_agent/testing_agent): a mode flip to live is exactly the action
 * that must never be programmatic. Mirrors the v_is_chairman predicate in
 * database/migrations/20260411_expand_chairman_approval_allowlist.sql.
 * @param {string|null|undefined} decidedBy
 * @returns {boolean}
 */
export function isAllowlistedModeFlipper(decidedBy) {
  return typeof decidedBy === 'string' && decidedBy.toLowerCase().includes('chairman');
}

/**
 * The ONLY launch_mode write path (FR-1/FR-2). Fail-closed at every step:
 *   1. toMode must be a valid mode and differ from the current mode.
 *   2. decision must carry an allowlisted (chairman) decided_by + an id.
 *   3. AUDIT-FIRST: the launch_mode_audit row (who/when/from-to) is written
 *      BEFORE the flip — an audit failure means NO flip is attempted at all.
 *   4. If the flip UPDATE then fails, the audit row is compensated (deleted,
 *      best-effort) and the error surfaces.
 * While the chairman-gated DDL (column + audit table, file-only migrations)
 * is unapplied live, step 3 fails and nothing flips — the coherent degraded
 * state: no venture can go live before the chairman applies the bundle.
 * @param {{ supabase: object, ventureId: string, toMode: 'simulated'|'live', decision: { id: string, decided_by: string } }} params
 * @returns {Promise<{ flipped: boolean, fromMode?: string, toMode?: string, auditId?: string, reason?: string }>}
 */
export async function setLaunchMode({ supabase, ventureId, toMode, decision } = {}) {
  if (!supabase || !ventureId) return { flipped: false, reason: 'missing_supabase_or_venture' };
  if (toMode !== SIMULATED && toMode !== LIVE) return { flipped: false, reason: 'invalid_mode' };
  if (!decision || !decision.id) return { flipped: false, reason: 'missing_decision' };
  if (!isAllowlistedModeFlipper(decision.decided_by)) {
    return { flipped: false, reason: 'decided_by_not_allowlisted' };
  }

  const fromMode = await getLaunchMode(supabase, ventureId);
  if (fromMode === toMode) return { flipped: false, fromMode, toMode, reason: 'already_in_mode' };

  // AUDIT-FIRST (FR-2): who/when/from-to lands before the state changes.
  let auditId = null;
  try {
    const { data, error } = await supabase
      .from('launch_mode_audit') // schema-lint-disable-line: chairman-gated table (database/migrations/20260705_launch_mode_audit.sql), file-only until the chairman sitting bundle — audit failure correctly blocks all flips meanwhile
      .insert({
        venture_id: ventureId,
        from_mode: fromMode,
        to_mode: toMode,
        decided_by: decision.decided_by,
        decision_id: decision.id,
      })
      .select('id')
      .single();
    if (error || !data) return { flipped: false, fromMode, toMode, reason: `audit_write_failed: ${error ? error.message : 'no row'}` };
    auditId = data.id;
  } catch (e) {
    return { flipped: false, fromMode, toMode, reason: `audit_write_failed: ${e && e.message ? e.message : e}` };
  }

  try {
    const { error } = await supabase
      .from('ventures')
      .update({ launch_mode: toMode }) // schema-lint-disable-line: chairman-gated column (database/migrations/20260703_ventures_launch_mode.sql)
      .eq('id', ventureId);
    if (error) throw new Error(error.message);
    return { flipped: true, fromMode, toMode, auditId };
  } catch (e) {
    // Compensate: the flip failed after the audit row landed — remove the row
    // (best-effort) so the audit never records a flip that did not happen.
    try { await supabase.from('launch_mode_audit').delete().eq('id', auditId); } catch { /* best-effort */ } // schema-lint-disable-line: chairman-gated table, see above
    return { flipped: false, fromMode, toMode, reason: `flip_write_failed: ${e && e.message ? e.message : e}` };
  }
}
