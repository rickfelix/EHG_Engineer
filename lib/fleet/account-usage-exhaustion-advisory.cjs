// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-4): idempotent adam_action_required advisory when a
// burn projection crosses exhaustion-before-reset.
//
// IDEMPOTENCY KEY: (account_uuid8, meter, reset_at epoch) -- matched on TUPLE EXISTENCE,
// regardless of actioned_at state (prospective TESTING finding 32abc6cd). Matching only
// unactioned rows would let a duplicate slip in once the first row for a still-current epoch
// had already been acked; matching on tuple existence means exactly one row ever exists per
// epoch, and a NEW epoch (reset_at advances) is what re-arms the advisory.
//
// Uses insertCoordinationRow() (lib/coordinator/dispatch.cjs) -- a NEW file writing to
// session_coordination must not raw-insert (session-coordination-insert-classguard-lint).

'use strict';

const defaultDispatch = require('../coordinator/dispatch.cjs');
const defaultAdamIdentity = require('../coordinator/adam-identity.cjs');
const { buildActionRequiredPayload } = require('../coordinator/adam-action-ack.cjs');
const { projectBurn, VERDICTS } = require('./account-usage-burn-projection.cjs');

const TABLE = 'session_coordination';
const ACTION_KIND = 'usage_exhaustion_projection';

/**
 * Re-run the projection for one account/meter and, only on a CONFIDENT_EXHAUSTS_BEFORE_RESET
 * verdict not already recorded for the current reset epoch, emit one advisory row into the
 * existing adam_action_required tick lane.
 *
 * @param {string} accountUuid8
 * @param {'session'|'week_all_models'|'week_fable'} meter
 * @param {{supabase:object, senderSession?:string, insertCoordinationRow?:Function,
 *   getActiveAdamId?:Function}} opts - the two function overrides are injectable dependencies
 *   for testability (CLAUDE_EXEC.md testability-aware implementation); both default to the
 *   real production implementations.
 * @returns {Promise<{emitted:boolean, verdict:string, reason?:string}>}
 */
async function maybeEmitExhaustionAdvisory(accountUuid8, meter, opts = {}) {
  if (!opts.supabase) throw new Error('account-usage-exhaustion-advisory: supabase client is required');
  const insertCoordinationRow = opts.insertCoordinationRow || defaultDispatch.insertCoordinationRow;
  const getActiveAdamId = opts.getActiveAdamId || defaultAdamIdentity.getActiveAdamId;
  const projection = await projectBurn(accountUuid8, meter, opts);

  if (projection.verdict !== VERDICTS.CONFIDENT_EXHAUSTS_BEFORE_RESET) {
    // Silent by default (TS-10) -- no row for any non-exhaustion verdict, not merely idempotent.
    return { emitted: false, verdict: projection.verdict };
  }

  const resetEpoch = String(new Date(projection.reset_at).getTime());

  const { data: existing, error: selErr } = await opts.supabase
    .from(TABLE)
    .select('id')
    .eq('payload->>kind', 'adam_action_required')
    .eq('payload->>action_kind', ACTION_KIND)
    .eq('payload->>account_uuid8', accountUuid8)
    .eq('payload->>meter', meter)
    .eq('payload->>reset_at_epoch', resetEpoch)
    .limit(1);
  if (selErr) {
    throw new Error(`maybeEmitExhaustionAdvisory(): idempotency read failed: ${selErr.message}`);
  }
  if (existing && existing.length) {
    return { emitted: false, verdict: projection.verdict, reason: 'already_recorded_for_epoch' };
  }

  const targetSession = await getActiveAdamId(opts.supabase, {});
  const senderSession = opts.senderSession || process.env.CLAUDE_SESSION_ID || 'account-usage-exhaustion-advisory';

  const body =
    `USAGE EXHAUSTION PROJECTION: account ${accountUuid8}, meter ${meter} projected to exhaust at ` +
    `${projection.projected_exhaustion_at}, BEFORE its reset at ${projection.reset_at}. ` +
    `Slope ${projection.slope_pct_per_day.toFixed(2)}%/day. Source ledger row ids: ${projection.row_ids.join(', ')}.`;

  const payload = {
    ...buildActionRequiredPayload({ actionKind: ACTION_KIND, body, senderCallsign: senderSession }),
    account_uuid8: accountUuid8,
    meter,
    reset_at_epoch: resetEpoch,
    row_ids: projection.row_ids,
  };

  await insertCoordinationRow(opts.supabase, {
    message_type: 'INFO',
    target_session: targetSession,
    subject: `[USAGE EXHAUSTION] ${meter} exhausts before reset — account ${accountUuid8}`,
    sender_type: 'account-usage-exhaustion-advisory',
    sender_session: senderSession,
    body,
    payload,
  });

  return { emitted: true, verdict: projection.verdict };
}

module.exports = { maybeEmitExhaustionAdvisory, ACTION_KIND, TABLE };
