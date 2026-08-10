/**
 * OWED-ACTION EMITTER — SD-LEO-INFRA-DRIVE-STATE-FORCING-001 FR-3.
 *
 * Writes owed-actions onto the EXISTING adam_action_required lane (a registered DIRECTIVE kind in
 * lib/fleet/worker-status.cjs, which is what makes the row re-print every coordinator/Adam tick
 * until acknowledged — the loudness is inherited, not built). No new kind, no schema change.
 *
 * WHY scripts/lib: this module writes, and the write path for this subsystem lives here by the
 * same ratified reasoning as drive-state-verdict-store.cjs:8-13 (lib/ proposes, it does not write).
 *
 * IDEMPOTENT PER (axis, since): one unactioned row per stall span, however many ticks the stall
 * lasts. The row is NOT the clearance mechanism — clearance is the axis leaving STALLED at the
 * next derivation (drain-descriptor prohibition, contract.cjs:44-47) — so re-emitting per tick
 * would only manufacture duplicate residents on a lane with per-row manual acking.
 *
 * PAYLOAD CONSTRUCTION HAZARD, load-bearing: buildActionRequiredPayload destructures exactly
 * {actionKind, body, senderCallsign} and rebuilds a fresh object — any extra key passed IN is
 * silently dropped. The owed fields are therefore spread ONTO its return value, never into its
 * arguments, and the readback test asserts they survived on the stored row.
 */

'use strict';

const { buildActionRequiredPayload } = require('../../lib/coordinator/adam-action-ack.cjs');
const { safeCitation } = require('../../lib/governance/drive-state/render.cjs');

const ACTION_KIND = 'drive_state_owed_action';
const TABLE = 'session_coordination';

/**
 * Emit one lane row per owed action (idempotent), then READ BACK and return the stored rows.
 * The readback is the only emission evidence the meta-control accepts — an insert's success
 * return is not persistence.
 *
 * @param {object} opts
 * @param {object} opts.supabase service client
 * @param {ReadonlyArray} opts.owedActions deriveOwedActions() output
 * @param {string} [opts.targetSession] defaults to broadcast-coordinator
 * @param {string} [opts.senderSession] attribution — an unattributed row is un-ackable and
 *        immortal on this lane (QF-20260726-536)
 * @returns {Promise<Array>} the read-back unactioned rows for the owed axes
 */
async function emitOwedActions({ supabase, owedActions, targetSession, senderSession } = {}) {
  if (!supabase) throw new Error('emitOwedActions(): supabase client is required');
  const list = Array.isArray(owedActions) ? owedActions : [];
  const target = targetSession || 'broadcast-coordinator';
  const sender = senderSession || process.env.CLAUDE_SESSION_ID || 'coordinator-hourly-review-cron';

  for (const oa of list) {
    const { data: existing, error: selErr } = await supabase
      .from(TABLE)
      .select('id')
      .eq('payload->>kind', 'adam_action_required')
      .eq('payload->>action_kind', ACTION_KIND)
      .eq('payload->>owed_axis', oa.axis)
      .eq('payload->>since', oa.since)
      .is('payload->>actioned_at', null)
      .limit(1);
    if (selErr) {
      throw new Error(`emitOwedActions(): idempotency read failed for axis ${oa.axis}: ${selErr.message}`);
    }
    if (existing && existing.length) continue;

    const body =
      'OWED ACTION (drive-state forcing-function): axis ' + oa.axis + ' STALLED since ' + oa.since +
      ' (runs' + (oa.truncated ? '>=' : '=') + oa.runs + '). Owed act: ' + oa.act +
      '. The all-green drive-state summary is withheld until this axis moves. Citation: ' + safeCitation(oa.citation);

    const payload = {
      ...buildActionRequiredPayload({ actionKind: ACTION_KIND, body, senderCallsign: sender }),
      owed_axis: oa.axis,
      since: oa.since,
      run_id: oa.run_id,
      citation: safeCitation(oa.citation),
    };

    const { error: insErr } = await supabase.from(TABLE).insert({
      message_type: 'INFO',
      target_session: target,
      subject: '[DRIVE-STATE OWED-ACTION] ' + oa.axis + ' stalled — ' + oa.act,
      sender_type: 'drive-state-forcing',
      sender_session: sender,
      body,
      payload,
    });
    if (insErr) {
      throw new Error(`emitOwedActions(): lane write failed for axis ${oa.axis}: ${insErr.message}`);
    }
  }

  return readbackOwedActions({ supabase, owedActions: list });
}

/** The post-insert readback — evidence by measurement, not by return value. */
async function readbackOwedActions({ supabase, owedActions } = {}) {
  if (!supabase) throw new Error('readbackOwedActions(): supabase client is required');
  const list = Array.isArray(owedActions) ? owedActions : [];
  if (list.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, payload')
    .eq('payload->>kind', 'adam_action_required')
    .eq('payload->>action_kind', ACTION_KIND)
    .in('payload->>owed_axis', list.map((o) => o.axis))
    .is('payload->>actioned_at', null);
  if (error) throw new Error(`readbackOwedActions(): readback failed: ${error.message}`);
  return data || [];
}

module.exports = { emitOwedActions, readbackOwedActions, ACTION_KIND, TABLE };
