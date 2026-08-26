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
 * IDEMPOTENT PER AXIS (unactioned): at most ONE unactioned owed-action row per axis, however many
 * ticks the stall lasts — the lane's population is bounded at six forever. The row is NOT the
 * clearance mechanism — clearance is the axis leaving STALLED at the next derivation
 * (drain-descriptor prohibition, contract.cjs:44-47) — so re-emitting per tick would only
 * manufacture duplicate residents on a lane with per-row manual acking.
 *
 * WHY NOT (axis, since): the since anchor is NOT stable across a stall span, in three reproduced
 * ways (EXEC TESTING 2e94a3dd + SECURITY 7f5fb22a, both executed PoCs): (1) tick 1 of every
 * episode keys on verdict.measured_at (the axis is not yet in spans) while tick 2 keys on the
 * persisted recorded_at — different value AND format, two rows per episode; (2) once the global
 * 2000-row window saturates, a truncated span's anchor advances one run per tick — one new
 * DIRECTIVE row per hour per stalled axis, forever; (3) the same flood starts immediately while
 * persistRenderedVerdict is failing. An axis-scoped key is immune to all three, and a new stall
 * episode after the prior row was ACKED still emits fresh (actioned_at excludes it from the match).
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
    // The key is the AXIS ALONE — see the header for the three reproduced ways a since-anchored
    // key floods this deliver-not-consume lane.
    const { data: existing, error: selErr } = await supabase
      .from(TABLE)
      .select('id')
      .eq('payload->>kind', 'adam_action_required')
      .eq('payload->>action_kind', ACTION_KIND)
      .eq('payload->>owed_axis', oa.axis)
      .is('payload->>actioned_at', null)
      .limit(1);
    if (selErr) {
      throw new Error(`emitOwedActions(): idempotency read failed for axis ${oa.axis}: ${selErr.message}`);
    }
    if (existing && existing.length) continue;

    // since is display data, normalized to one format — the persisted recorded_at arrives as
    // '+00:00' with microseconds while measured_at is ISO-Z, and two formats for one instant is
    // how the original key broke.
    const sinceIso = Number.isFinite(Date.parse(oa.since)) ? new Date(oa.since).toISOString() : String(oa.since);

    // SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-4/D2: keystroke_packets, when present (fleet_health
    // only, today), is appended RAW to body -- NOT through safeCitation(), which caps at 160 chars
    // and strips control characters, including newlines. A multi-line numbered recovery packet run
    // through that would silently collapse to an unreadable fragment; body itself carries no such cap.
    const keystrokeSuffix = Array.isArray(oa.keystroke_packets) && oa.keystroke_packets.length
      ? '\n\nRECOVERY:\n' + oa.keystroke_packets.join('\n\n')
      : '';

    const body =
      'OWED ACTION (drive-state forcing-function): axis ' + oa.axis + ' STALLED since ' + sinceIso +
      ' (runs' + (oa.truncated ? '>=' : '=') + oa.runs + '). Owed act: ' + oa.act +
      '. The all-green drive-state summary is withheld until this axis moves. Citation: ' + safeCitation(oa.citation) +
      keystrokeSuffix;

    const payload = {
      ...buildActionRequiredPayload({ actionKind: ACTION_KIND, body, senderCallsign: sender }),
      owed_axis: oa.axis,
      since: sinceIso,
      run_id: oa.run_id,
      citation: safeCitation(oa.citation),
      // Structured access alongside the prose in body -- null for the 5/6 axes that never set it.
      keystroke_packets: Array.isArray(oa.keystroke_packets) && oa.keystroke_packets.length ? oa.keystroke_packets : null,
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
