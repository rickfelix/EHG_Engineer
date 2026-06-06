/**
 * SD park / unpark — set a Strategic Directive aside without abandoning it.
 *
 * Reuses the existing-but-unused status='deferred' as the canonical "parked" state
 * (no new enum value, no status migration). Park releases the atomic claim across
 * strategic_directives_v2 + claude_sessions in ONE transaction, never touches
 * current_phase, runs under a non-EXEC actor, and guards the auto_transition_status
 * edge (progress>=100 in EXEC/PLAN would otherwise flip status to pending_approval).
 *
 * Replaces the dead metadata.do_not_auto_start flag and the cancel-to-park workaround:
 * deferred is already excluded from every live work-selection allowlist and from the
 * claim-liveness sweep, and (unlike cancel) does NOT fire trg_reset_patterns_on_sd_cancel
 * or trigger_retro_notification — so a parked SD stays recoverable and queryable.
 *
 * SD-LEO-INFRA-PARKED-STATUS-REPLACE-001.
 */
export const PARK_STATUS = 'deferred';
const WORKABLE = ['draft', 'active', 'planning', 'in_progress'];
const TERMINAL = ['completed', 'cancelled'];
const PARK_META_KEYS = ['park_reason', 'parked_at', 'parked_by', 'parked_from_status', 'parked_progress_original'];

/**
 * Pure planning helper (no DB) — decide the park transition for a loaded SD row.
 * Throws on a terminal SD or an EXEC/empty actor. `edge` means progress must be
 * normalized to 99 so auto_transition_status does not override status='deferred'.
 * @param {{sd_key,status,current_phase,progress}} sd
 * @returns {{edge:boolean, parkMetaPatch:object}}
 */
export function computeParkPlan(sd, reason, actor, nowIso) {
  if (!reason) throw new Error('park requires a reason');
  if (!actor || actor === 'EXEC') throw new Error(`park requires a non-EXEC actor (got: ${actor})`);
  if (TERMINAL.includes(sd.status)) throw new Error(`Cannot park ${sd.sd_key}: terminal status (${sd.status})`);
  const edge = Number(sd.progress) >= 100 && ['EXEC', 'PLAN'].includes(sd.current_phase);
  return {
    edge,
    parkMetaPatch: {
      park_reason: reason,
      parked_at: nowIso || new Date().toISOString(),
      parked_by: actor,
      parked_from_status: sd.status,
      parked_progress_original: edge ? Number(sd.progress) : null,
    },
  };
}

/**
 * Park an SD: status->deferred + release claim (both tables, one txn).
 * @param {{query:Function}} client - pg client (injectable for tests)
 */
export async function park(client, sdKey, { reason, actor }) {
  const { rows } = await client.query(
    'SELECT sd_key, status, current_phase, progress, metadata FROM strategic_directives_v2 WHERE sd_key=$1',
    [sdKey]
  );
  if (!rows.length) throw new Error(`SD not found: ${sdKey}`);
  const sd = rows[0];
  const { edge, parkMetaPatch } = computeParkPlan(sd, reason, actor);
  try {
    await client.query('BEGIN');
    // SD side: deferred + release-claim mirror + edge guard + merged park metadata. No current_phase write.
    await client.query(
      `UPDATE strategic_directives_v2
         SET status=$2, is_working_on=false, claiming_session_id=NULL, active_session_id=NULL,
             progress = CASE WHEN $3 THEN 99 ELSE progress END,
             metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb,
             updated_at=now(), updated_by=$5
       WHERE sd_key=$1`,
      [sdKey, PARK_STATUS, edge, JSON.stringify(parkMetaPatch), actor]
    );
    // Session side: release the claim; clear worktree fields WITH sd_key (ck_claude_sessions_worktree_state_consistency).
    await client.query(
      `UPDATE claude_sessions
         SET sd_key=NULL, worktree_path=NULL, worktree_branch=NULL, status='idle', updated_at=now()
       WHERE sd_key=$1`,
      [sdKey]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  return { sdKey, status: PARK_STATUS, parked_from_status: sd.status, edge };
}

/**
 * Unpark an SD: restore a workable status + strip park metadata. Claim-neutral
 * (re-claim via the normal sd-start atomic path). Never touches current_phase.
 */
export async function unpark(client, sdKey, { actor = 'cli', restoreStatus } = {}) {
  if (actor === 'EXEC') throw new Error('unpark requires a non-EXEC actor');
  const { rows } = await client.query(
    'SELECT sd_key, status, metadata FROM strategic_directives_v2 WHERE sd_key=$1',
    [sdKey]
  );
  if (!rows.length) throw new Error(`SD not found: ${sdKey}`);
  const sd = rows[0];
  if (sd.status !== PARK_STATUS) throw new Error(`SD ${sdKey} is not parked (status=${sd.status})`);
  const md = { ...(sd.metadata || {}) };
  const from = md.parked_from_status;
  const target = restoreStatus || (WORKABLE.includes(from) ? from : 'draft');
  const origProg = md.parked_progress_original;
  for (const k of PARK_META_KEYS) delete md[k];
  // RETURNING the persisted status, because restoring progress>=100 in EXEC/PLAN makes
  // auto_transition_status flip status to 'pending_approval' (correct resume behavior) —
  // so the requested target and the actual status can differ. Report the truth.
  const { rows: out } = await client.query(
    `UPDATE strategic_directives_v2
       SET status=$2, progress = COALESCE($3, progress), metadata=$4::jsonb, updated_at=now(), updated_by=$5
     WHERE sd_key=$1
     RETURNING status`,
    [sdKey, target, origProg ?? null, JSON.stringify(md), actor]
  );
  const actual = (out[0] && out[0].status) || target;
  return { sdKey, status: actual, requested: target };
}
