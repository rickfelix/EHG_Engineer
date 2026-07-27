#!/usr/bin/env node
/**
 * Per-role ACK of a CHAIRMAN DIRECTIVE — SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1.
 *
 * A role (adam / coordinator / solomon) records that it has GENUINELY ACTIONED a chairman_directive
 * by writing a chairman_directive_ack reply row. Mirrors lib/coordinator/adam-action-ack.cjs's
 * two-stage-ACK shape VERBATIM: read_at = DELIVERED is stamped by the transport/inbox drain (the
 * directive was surfaced); payload.actioned_at = ACTIONED is stamped HERE (the role genuinely acted).
 * A directive stays OUTSTANDING for a role until this ack row exists — non-compliance is VISIBLE, not
 * silent (that visibility is computed by lib/coordinator/chairman-directive-gauge.cjs).
 *
 * Ack is keyed by directive_id (NOT topic_id) so this child is dependency-free.
 *
 * QF-20260727-454: a chairman directive was acknowledged before it was ever read (self-reported
 * by Solomon 2026-07-27) — this verb used to accept ANY --id string and write the ack with ZERO
 * DB verification, so an ack could be issued for a directive_id nothing here had actually fetched
 * (including one that never existed). The root shape: a target resolved by proxy ("the newest
 * unacked row") instead of taken from the row genuinely read. The fix couples the two: the ack
 * now REFUSES unless it can fetch the directive it is stamping, in THIS SAME operation, and the
 * fetched body is surfaced in the confirmation output. A missing/unknown directive_id is a loud
 * refusal (exit 1), never a silent best-guess — "handled" can no longer outrun "read".
 *
 * Usage:
 *   node scripts/ack-chairman-directive.cjs --id <directive_id> --role <adam|coordinator|solomon> [--note "<text>"]
 */
'use strict';

const { getServiceClient, PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');

const CHAIRMAN_DIRECTIVE_KIND = PAYLOAD_KINDS.CHAIRMAN_DIRECTIVE; // 'chairman_directive'
const CHAIRMAN_DIRECTIVE_ACK_KIND = 'chairman_directive_ack';

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

/**
 * QF-20260727-454: fetch the CURRENT (latest-issued, SUPERSEDES-aware — mirrors
 * lib/coordinator/chairman-directive-gauge.cjs's decideChairmanDirectiveCompliance) row for an
 * EXPLICIT directiveId. This is the ONLY lookup the ack path performs, and it is REQUIRED before
 * any ack write. Explicit directiveId in, the one row it genuinely identifies out — never a
 * newest-unacked / most-recent-across-ALL-directives substitute standing in for it.
 * Exported for tests.
 * @returns {Promise<{row: object|null, error: object|null}>}
 */
async function fetchDirectiveForAck(supabase, directiveId) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, subject, body, payload, created_at')
    .eq('payload->>kind', CHAIRMAN_DIRECTIVE_KIND)
    .eq('payload->>directive_id', directiveId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { row: null, error };
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { row, error: null };
}

/** Pure: the text to surface as "what this operation read", from a fetched directive row. */
function directiveBodyText(directiveRow) {
  if (!directiveRow) return '';
  return String(directiveRow.body || (directiveRow.payload && directiveRow.payload.body) || '');
}

async function main() {
  const argv = process.argv.slice(2);
  const directiveId = argVal(argv, '--id');
  const role = argVal(argv, '--role');
  const note = argVal(argv, '--note');
  if (!directiveId || !role) {
    console.error('Usage: node scripts/ack-chairman-directive.cjs --id <directive_id> --role <adam|coordinator|solomon> [--note "<text>"]');
    process.exit(2);
  }

  const supabase = getServiceClient();

  // QF-20260727-454: REFUSE — never silently ack a directive_id this operation could not read.
  const { row: directiveRow, error: fetchErr } = await fetchDirectiveForAck(supabase, directiveId);
  if (fetchErr) { console.error('ERROR: directive lookup failed:', fetchErr.message); process.exit(1); }
  if (!directiveRow) {
    console.error(
      `ERROR: refusing to ack — no chairman_directive found for directive_id=${directiveId}. ` +
      'An ack must read the directive it stamps handled in the SAME operation; there is nothing ' +
      'here to read, so there is nothing here to ack. If you meant a different directive_id, re-run ' +
      'with the id of the row you actually read.'
    );
    process.exit(1);
  }

  const actionedAt = new Date().toISOString();

  const payload = {
    kind: CHAIRMAN_DIRECTIVE_ACK_KIND, // a terminal reply — deliberately NOT a DIRECTIVE_KIND
    directive_id: directiveId,         // ack keyed by directive_id (dependency-free; no topic_id)
    role: String(role),
    actioned_at: actionedAt,           // ACTIONED marker (mirrors adam-action-ack payload.actioned_at)
    reply_to: directiveId,             // correlation echo (reply-lane convention)
  };
  if (note) payload.note = String(note);

  await insertCoordinationRow(supabase, {
    sender_session: role,
    sender_type: role,
    target_session: 'broadcast',       // broadcast so the per-role gauge reads every role's ack
    message_type: 'INFO',
    subject: `[CHAIRMAN_DIRECTIVE_ACK ${directiveId}] role=${role}`,
    body: note || `${role} actioned chairman_directive ${directiveId}`,
    payload,
  });

  // QF-20260727-454: surface what THIS operation read, in the SAME call that performs the ack —
  // the transcript itself carries evidence the read happened here, not via a separate/earlier/
  // different lookup.
  const bodyText = directiveBodyText(directiveRow);
  console.log(`✓ chairman_directive_ack recorded: id=${directiveId} role=${role} actioned_at=${actionedAt}`);
  console.log(`  directive_read (${bodyText.length} chars): ${bodyText.slice(0, 300)}${bodyText.length > 300 ? '…' : ''}`);
}

module.exports = { fetchDirectiveForAck, directiveBodyText, CHAIRMAN_DIRECTIVE_KIND, CHAIRMAN_DIRECTIVE_ACK_KIND };

if (require.main === module) {
  main().catch((e) => { console.error('ack-chairman-directive failed:', (e && e.message) || e); process.exit(1); });
}
