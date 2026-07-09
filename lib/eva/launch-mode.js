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
 * Pure: may this decided_by flip a venture's launch_mode? CHAIRMAN ONLY — no
 * agent bypass, unlike the S16 approval allowlist (which also admits
 * monitoring_agent/testing_agent). The substring predicate itself mirrors the
 * v_is_chairman LIKE '%chairman%' in 20260411_expand_chairman_approval_allowlist.sql
 * (kept identical to the DB flip-guard so the two layers can never disagree).
 * NB (adversarial review): the string is only trusted because setLaunchMode
 * resolves it from the AUTHORITATIVE chairman_decisions row — never from
 * caller input.
 * @param {string|null|undefined} decidedBy
 * @returns {boolean}
 */
export function isAllowlistedModeFlipper(decidedBy) {
  return typeof decidedBy === 'string' && decidedBy.toLowerCase().includes('chairman');
}

/**
 * Strict mode read for WRITE/GATE paths (adversarial review W6/W10): unlike
 * getLaunchMode (fail-open to 'simulated' for harmless display consumers),
 * this distinguishes a real read from a failed one so callers can fail CLOSED.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<{ mode: 'simulated'|'live'|null, ok: boolean, reason?: string }>}
 */
export async function getLaunchModeStrict(supabase, ventureId) {
  if (!supabase || !ventureId) return { mode: null, ok: false, reason: 'missing_supabase_or_venture' };
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('id, launch_mode') // schema-lint-disable-line: chairman-gated column (database/migrations/20260703_ventures_launch_mode.sql)
      .eq('id', ventureId)
      .maybeSingle();
    if (error) return { mode: null, ok: false, reason: error.message };
    if (!data) return { mode: null, ok: false, reason: 'venture_not_found' };
    return { mode: data.launch_mode === LIVE ? LIVE : SIMULATED, ok: true };
  } catch (e) {
    return { mode: null, ok: false, reason: (e && e.message) || String(e) };
  }
}

/**
 * The ONLY launch_mode write path (FR-1/FR-2). Fail-closed at every step:
 *   1. toMode must be a valid mode and differ from the current mode (read via
 *      getLaunchModeStrict — a degraded read ABORTS, never defaults).
 *   2. The decision id is resolved against the AUTHORITATIVE chairman_decisions
 *      row (adversarial review C1): the ROW's decided_by must pass the chairman
 *      allowlist and, when the row carries a venture_id, it must match the
 *      venture being flipped. Caller-supplied decided_by is never trusted.
 *   3. AUDIT-FIRST: the launch_mode_audit row (who/when/from-to) is written
 *      BEFORE the flip — an audit failure means NO flip is attempted at all.
 *   4. The flip UPDATE is rowcount-verified (.select()); an unmatched venture
 *      id is a failure, not a silent success. On flip failure the audit row is
 *      left UNCONFIRMED (confirmed_at null) — an honest record of an aborted
 *      attempt; on success it is stamped confirmed_at.
 * While the chairman-gated DDL (column + audit table, file-only migrations)
 * is unapplied live, step 3 fails and nothing flips — the coherent degraded
 * state: no venture can go live before the chairman applies the bundle.
 * @param {{ supabase: object, ventureId: string, toMode: 'simulated'|'live', decision: { id: string } }} params
 * @returns {Promise<{ flipped: boolean, fromMode?: string, toMode?: string, auditId?: string, reason?: string }>}
 */
export async function setLaunchMode({ supabase, ventureId, toMode, decision } = {}) {
  if (!supabase || !ventureId) return { flipped: false, reason: 'missing_supabase_or_venture' };
  if (toMode !== SIMULATED && toMode !== LIVE) return { flipped: false, reason: 'invalid_mode' };
  if (!decision || !decision.id) return { flipped: false, reason: 'missing_decision' };

  // C1: resolve the decision from the authoritative table — the ROW is the
  // trust root (its decided_by writes are themselves guarded by the S16-class
  // trigger), never the caller's copy of it.
  let decisionRow = null;
  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id, decided_by, venture_id, status')
      .eq('id', decision.id)
      .maybeSingle();
    if (error) return { flipped: false, reason: `decision_lookup_failed: ${error.message}` };
    decisionRow = data;
  } catch (e) {
    return { flipped: false, reason: `decision_lookup_failed: ${(e && e.message) || e}` };
  }
  if (!decisionRow) return { flipped: false, reason: 'decision_not_found' };
  if (!isAllowlistedModeFlipper(decisionRow.decided_by)) {
    return { flipped: false, reason: 'decided_by_not_allowlisted' };
  }
  // Re-review hardening: decision SEMANTICS, not just identity — a chairman-
  // REJECTED decision is not consent, and a flip is inherently per-venture so
  // the decision must be bound to THIS venture (a venture-less decision row
  // must never act as a universal flip ticket).
  if (decisionRow.status !== 'approved') {
    return { flipped: false, reason: `decision_not_approved: status=${decisionRow.status}` };
  }
  if (!decisionRow.venture_id) {
    return { flipped: false, reason: 'decision_not_venture_bound' };
  }
  if (decisionRow.venture_id !== ventureId) {
    return { flipped: false, reason: 'decision_venture_mismatch' };
  }

  // SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-5): live requires a production
  // deploy — 'launch_mode=live becomes meaningful only when a production deploy
  // exists' (design SSOT). Additive AND on top of the decision/audit semantics
  // (untouched). OBSERVE-ONLY-FIRST per the protocol default:
  // LAUNCH_MODE_DEPLOY_PRECONDITION defaults to 'observe' (violation logged
  // loudly, flip proceeds); set 'enforce' to block after the calibration review.
  // Flips to 'simulated' (incl. emergency rollbacks) are never gated here.
  if (toMode === LIVE) {
    const gateMode = process.env.LAUNCH_MODE_DEPLOY_PRECONDITION || 'observe';
    const { data: routed, error: depErr } = await supabase
      .from('venture_deployments')
      .select('id')
      .eq('venture_id', ventureId)
      .eq('status', 'routed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Query fault (incl. unapplied migration) counts as no-deploy-visible: in
    // observe mode that is a logged violation; in enforce mode it fails closed.
    const hasDeploy = !depErr && !!routed;
    if (!hasDeploy) {
      const detail = depErr ? `deploy record read failed: ${depErr.message}` : 'no venture_deployments row with status=routed';
      if (gateMode === 'enforce') {
        return { flipped: false, reason: `no_production_deploy: ${detail}` };
      }
      console.error(`[launch-mode] DEPLOY-PRECONDITION VIOLATION (observe mode — flip proceeds): venture ${ventureId} flipping to live with ${detail}`);
    }
  }

  // W6: strict read — a degraded mode read must ABORT the write path (a LIVE
  // venture must never read as simulated here; that both blocks emergency
  // rollbacks and records a false from_mode in the audit).
  const strict = await getLaunchModeStrict(supabase, ventureId);
  if (!strict.ok) return { flipped: false, reason: `mode_read_failed: ${strict.reason}` };
  const fromMode = strict.mode;
  if (fromMode === toMode) return { flipped: false, fromMode, toMode, reason: 'already_in_mode' };

  // AUDIT-FIRST (FR-2): who/when/from-to lands before the state changes. The
  // decided_by written here is the AUTHORITATIVE row's value (C1).
  let auditId = null;
  try {
    const { data, error } = await supabase
      .from('launch_mode_audit') // schema-lint-disable-line: chairman-gated table (database/migrations/20260705_launch_mode_audit.sql), file-only until the chairman sitting bundle — audit failure correctly blocks all flips meanwhile
      .insert({
        venture_id: ventureId,
        from_mode: fromMode,
        to_mode: toMode,
        decided_by: decisionRow.decided_by,
        decision_id: decisionRow.id,
      })
      .select('id')
      .single();
    if (error || !data) return { flipped: false, fromMode, toMode, reason: `audit_write_failed: ${error ? error.message : 'no row'}` };
    auditId = data.id;
  } catch (e) {
    return { flipped: false, fromMode, toMode, reason: `audit_write_failed: ${e && e.message ? e.message : e}` };
  }

  try {
    // W6: rowcount-verified — an unmatched venture id is a FAILURE, never a
    // silent flipped:true with a phantom audit trail.
    // .eq('launch_mode', fromMode): the loser of a racing double-flip fails
    // honestly (0 rows) instead of no-op-confirming a duplicate audit row.
    const { data: updated, error } = await supabase
      .from('ventures')
      .update({ launch_mode: toMode }) // schema-lint-disable-line: chairman-gated column (database/migrations/20260703_ventures_launch_mode.sql)
      .eq('id', ventureId)
      .eq('launch_mode', fromMode)
      .select('id');
    if (error) throw new Error(error.message);
    if (!Array.isArray(updated) || updated.length === 0) throw new Error('venture row not found (0 rows updated)');
    // W5: stamp the audit row CONFIRMED — a row without confirmed_at is an
    // honest record of an aborted attempt, never mistakable for a real flip.
    try { await supabase.from('launch_mode_audit').update({ confirmed_at: new Date().toISOString() }).eq('id', auditId); } catch { /* row stays unconfirmed; flip itself succeeded */ } // schema-lint-disable-line: chairman-gated table, see above
    return { flipped: true, fromMode, toMode, auditId };
  } catch (e) {
    // W5: do NOT delete — the unconfirmed audit row is the honest record of the
    // aborted attempt (deletes could fail and a deleted row hides the attempt;
    // confirmed_at-null rows are excluded from flip history by consumers, and
    // the flip-guard trigger consumes tickets one-time-use so a leftover row is
    // not a replayable ticket).
    return { flipped: false, fromMode, toMode, auditId, reason: `flip_write_failed: ${e && e.message ? e.message : e}` };
  }
}
