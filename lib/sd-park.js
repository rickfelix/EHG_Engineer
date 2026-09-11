import { checkHoldStamp, buildProvenancedStamp, logHoldStateViolation } from './governance/hold-state-contract.js';

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
 *
 * review_at/release_condition (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001) are OPTIONAL
 * additions to the existing reason/actor contract — omitting them is unchanged
 * behavior while HOLD_STATE_CONTRACT_MODE=observe (default); only 'enforce' mode
 * rejects a park missing them.
 */
export const PARK_STATUS = 'deferred';
const WORKABLE = ['draft', 'active', 'planning', 'in_progress'];
const TERMINAL = ['completed', 'cancelled'];
const PARK_META_KEYS = ['park_reason', 'parked_at', 'parked_by', 'parked_from_status', 'parked_from_status_source', 'parked_progress_original', 'park_review_at', 'park_release_condition', 'stamped_by_session'];
// SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 (FR-3): unpark's own audit-stamp keys,
// stripped by park() on re-park (FR-9) so a park->unpark->park cycle never leaves a
// stale "last unparked at" reading as current. stamped_by_session is intentionally
// NOT listed here -- it's shared with PARK_META_KEYS and re-set by whichever action
// (park or unpark) ran most recently.
const UNPARK_META_KEYS = ['unparked_by', 'unparked_at', 'unparked_reason'];

/**
 * Pure planning helper (no DB) — decide the park transition for a loaded SD row.
 * Throws on a terminal SD or an EXEC/empty actor, and (enforce mode only) on a
 * hold-state-contract violation. `edge` means progress must be normalized to 99
 * so auto_transition_status does not override status='deferred'.
 * @param {{sd_key,status,current_phase,progress}} sd
 * @param {{reviewAt?:string, releaseCondition?:string, writingSessionId?:string}} [opts]
 * @returns {{edge:boolean, parkMetaPatch:object, holdCheck:{ok:boolean,mode:string,errors:string[]}}}
 */
export function computeParkPlan(sd, reason, actor, nowIso, opts = {}) {
  if (!reason) throw new Error('park requires a reason');
  if (!actor || actor === 'EXEC') throw new Error(`park requires a non-EXEC actor (got: ${actor})`);
  if (TERMINAL.includes(sd.status)) throw new Error(`Cannot park ${sd.sd_key}: terminal status (${sd.status})`);
  const edge = Number(sd.progress) >= 100 && ['EXEC', 'PLAN'].includes(sd.current_phase);

  const holdCheck = checkHoldStamp({
    reason, owner: actor, review_at: opts.reviewAt, release_condition: opts.releaseCondition,
  });
  const stamped = buildProvenancedStamp(
    { reason, owner: actor, review_at: opts.reviewAt, release_condition: opts.releaseCondition },
    opts.writingSessionId
  );

  return {
    edge,
    holdCheck,
    parkMetaPatch: {
      park_reason: stamped.reason,
      parked_at: nowIso || new Date().toISOString(),
      parked_by: stamped.owner,
      parked_from_status: sd.status,
      parked_progress_original: edge ? Number(sd.progress) : null,
      ...(opts.reviewAt ? { park_review_at: stamped.review_at } : {}),
      ...(opts.releaseCondition ? { park_release_condition: stamped.release_condition } : {}),
      ...(stamped.stamped_by_session ? { stamped_by_session: stamped.stamped_by_session } : {}),
    },
  };
}

/**
 * Park an SD: status->deferred + release claim (both tables, one txn).
 * @param {{query:Function}} client - pg client (injectable for tests)
 * @param {{reviewAt?, releaseCondition?, writingSessionId?, supabaseForViolationLog?}} [opts]
 *   supabaseForViolationLog is an OPTIONAL supabase-js client used only to log an
 *   observe-mode violation row; pg `client` above is the canonical write path and is
 *   unaffected either way.
 */
export async function park(client, sdKey, { reason, actor, reviewAt, releaseCondition, writingSessionId, supabaseForViolationLog } = {}) {
  const { rows } = await client.query(
    'SELECT sd_key, status, current_phase, progress, metadata FROM strategic_directives_v2 WHERE sd_key=$1',
    [sdKey]
  );
  if (!rows.length) throw new Error(`SD not found: ${sdKey}`);
  const sd = rows[0];
  const { edge, parkMetaPatch, holdCheck } = computeParkPlan(sd, reason, actor, undefined, { reviewAt, releaseCondition, writingSessionId });
  if (!holdCheck.ok && holdCheck.mode === 'observe') {
    await logHoldStateViolation(supabaseForViolationLog, { surface: 'sd_park', stamp: { reason, owner: actor, review_at: reviewAt, release_condition: releaseCondition }, errors: holdCheck.errors });
  }
  try {
    await client.query('BEGIN');
    // SD side: deferred + release-claim mirror + edge guard + merged park metadata. No current_phase write.
    // FR-9: strip any stale unpark audit fields (unparked_by/unparked_at/unparked_reason,
    // plus stamped_by_session which is shared with PARK_META_KEYS) from a PRIOR unpark
    // cycle BEFORE merging in this park's own patch, so a park->unpark->park round-trip
    // never leaves a stale "last unparked at" reading as current. Also strips
    // parked_from_status_source (adversarial review finding): parkMetaPatch's own
    // parked_from_status below is a directly-observed fact (sd.status at THIS park call),
    // never inferred, so a stale 'backfill_inferred' marker from a prior parked_from_status
    // must not survive a re-park -- it would otherwise mislabel a genuine re-park as an
    // inferred value if this row is ever unparked directly without going through unpark().
    await client.query(
      `UPDATE strategic_directives_v2
         SET status=$2, is_working_on=false, claiming_session_id=NULL, active_session_id=NULL,
             progress = CASE WHEN $3 THEN 99 ELSE progress END,
             metadata = (COALESCE(metadata,'{}'::jsonb) - 'unparked_by' - 'unparked_at' - 'unparked_reason' - 'stamped_by_session' - 'parked_from_status_source') || $4::jsonb,
             updated_at=now(), updated_by=$5, lifecycle_write_token='sd-park.js'
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
 * Pure planning helper (no DB) — decide the unpark transition for a loaded SD row.
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 — mirrors computeParkPlan so the core
 * unpark decisions (reason/actor guards, the restore-status resolution, the audit
 * stamp) are real, runnable unit tests instead of resting on the DB-tier integration
 * file (TESTING sub-agent review, evidence e03cc24e-6d29-4dd5-ba23-777ffd66c88f,
 * measured that file executes zero tests in this environment).
 *
 * FR-4: only auto-resolves the restore status when metadata.parked_from_status is
 * BOTH present AND in WORKABLE. Any other case (missing, or present-but-not-workable,
 * e.g. an 'unknown' backfill sentinel or a stale non-workable value) REQUIRES an
 * explicit restoreStatus — it never silently falls back to 'draft'.
 * @param {{sd_key,status,metadata}} sd
 * @param {string} reason
 * @param {string} actor
 * @param {string} [nowIso]
 * @param {{restoreStatus?:string, writingSessionId?:string}} [opts]
 * @returns {{target:string, origProg:(number|null), unparkMetadata:object}}
 */
export function computeUnparkPlan(sd, reason, actor, nowIso, opts = {}) {
  if (!reason) throw new Error('unpark requires a reason');
  if (!actor || actor === 'EXEC') throw new Error(`unpark requires a non-EXEC actor (got: ${actor})`);
  if (sd.status !== PARK_STATUS) throw new Error(`SD ${sd.sd_key} is not parked (status=${sd.status})`);

  const md = { ...(sd.metadata || {}) };
  const from = md.parked_from_status;
  const restoreStatus = opts.restoreStatus;
  // SECURITY (EXEC-TO-PLAN review, C2 + residual): a backfilled parked_from_status is an
  // INFERENCE (from current_phase, not a recorded fact from an actual park() call) —
  // auto-resolving it exactly like a real recorded value would defeat FR-4's whole purpose
  // for precisely the population it was built to protect. FAIL-CLOSED as a trust
  // ALLOWLIST, not a denylist of one known marker string: auto-resolve ONLY when
  // parked_from_status_source is absent/null — ANY present value (a future source, a case
  // variant, whitespace) still requires an explicit --restore, never silently trusted.
  const isInferred = md.parked_from_status_source != null;

  // SECURITY (EXEC-TO-PLAN review, evidence 8d7007a2-fb78-4339-9d0f-aae830ccbd64): an
  // explicit --restore must ALSO be a WORKABLE status. Without this, --restore is an
  // unvalidated escalation path — an operator (or a typo) supplying --restore completed
  // would write status='completed' through the allowlisted sd-park.js writer, firing the
  // full completion cascade (tr_sd_completed_event, auto-close-deliverables, etc.) without
  // ever passing LEAD-FINAL-APPROVAL. FR-4 exists to make unpark SAFER, not to open a new,
  // more-visible escalation path than the fallback it replaces.
  if (restoreStatus && !WORKABLE.includes(restoreStatus)) {
    const err = new Error(
      `Cannot unpark ${sd.sd_key}: --restore "${restoreStatus}" is not a workable status. ` +
      `Must be one of: ${WORKABLE.join(', ')}.`
    );
    err.code = 'UNPARK_RESTORE_STATUS_INVALID';
    throw err;
  }

  if (!restoreStatus && (isInferred || !WORKABLE.includes(from))) {
    const err = new Error(
      `Cannot unpark ${sd.sd_key}: metadata.parked_from_status is ` +
      `${isInferred ? `"${from}" (INFERRED, source="${md.parked_from_status_source}", not a recorded fact)` : from ? `"${from}" (not a workable status)` : 'missing'}. ` +
      'Supply --restore <status> to specify the status to restore to explicitly.'
    );
    err.code = 'UNPARK_RESTORE_STATUS_REQUIRED';
    throw err;
  }

  const target = restoreStatus || from;
  const origProg = md.parked_progress_original;

  for (const k of PARK_META_KEYS) delete md[k];
  for (const k of UNPARK_META_KEYS) delete md[k];

  const stamped = buildProvenancedStamp({ reason, owner: actor }, opts.writingSessionId);

  return {
    target,
    origProg: origProg ?? null,
    unparkMetadata: {
      ...md,
      unparked_by: stamped.owner,
      unparked_at: nowIso || new Date().toISOString(),
      unparked_reason: stamped.reason,
      ...(stamped.stamped_by_session ? { stamped_by_session: stamped.stamped_by_session } : {}),
    },
  };
}

/**
 * Unpark an SD: restore a workable status + strip park metadata, stamping an audit
 * trail (FR-3). Claim-neutral (re-claim via the normal sd-start atomic path). Never
 * touches current_phase.
 */
export async function unpark(client, sdKey, { reason, actor = 'cli', restoreStatus, writingSessionId } = {}) {
  const { rows } = await client.query(
    'SELECT sd_key, status, metadata FROM strategic_directives_v2 WHERE sd_key=$1',
    [sdKey]
  );
  if (!rows.length) throw new Error(`SD not found: ${sdKey}`);
  const sd = rows[0];
  const { target, origProg, unparkMetadata } = computeUnparkPlan(sd, reason, actor, undefined, { restoreStatus, writingSessionId });
  // RETURNING the persisted status, because restoring progress>=100 in EXEC/PLAN makes
  // auto_transition_status flip status to 'pending_approval' (correct resume behavior) —
  // so the requested target and the actual status can differ. Report the truth.
  // SECURITY (EXEC-TO-PLAN review, D2): `AND status=$6` closes the TOCTOU window between
  // the SELECT above and this UPDATE — if a concurrent writer un-parked (or re-parked) the
  // row in between, this UPDATE matches zero rows instead of silently overwriting whatever
  // that writer did.
  const { rows: out } = await client.query(
    `UPDATE strategic_directives_v2
       SET status=$2, progress = COALESCE($3, progress), metadata=$4::jsonb, updated_at=now(), updated_by=$5,
           lifecycle_write_token='sd-park.js'
     WHERE sd_key=$1 AND status=$6
     RETURNING status`,
    [sdKey, target, origProg, JSON.stringify(unparkMetadata), actor, PARK_STATUS]
  );
  if (!out.length) {
    throw new Error(`SD ${sdKey} was no longer parked (status changed concurrently) — unpark aborted, no write made`);
  }
  return { sdKey, status: out[0].status, requested: target };
}
