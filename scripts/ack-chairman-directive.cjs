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
 * Usage:
 *   node scripts/ack-chairman-directive.cjs --id <directive_id> --role <adam|coordinator|solomon> [--note "<text>"]
 */
'use strict';

const { getServiceClient } = require('../lib/fleet/worker-status.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');

const CHAIRMAN_DIRECTIVE_ACK_KIND = 'chairman_directive_ack';

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
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
  const actionedAt = new Date().toISOString();

  const payload = {
    kind: CHAIRMAN_DIRECTIVE_ACK_KIND, // a terminal reply — deliberately NOT a DIRECTIVE_KIND
    directive_id: directiveId,         // ack keyed by directive_id (dependency-free; no topic_id)
    role: String(role),
    actioned_at: actionedAt,           // ACTIONED marker (mirrors adam-action-ack payload.actioned_at)
    reply_to: directiveId,             // correlation echo (reply-lane convention)
  };
  if (note) payload.note = String(note);

  const supabase = getServiceClient();
  await insertCoordinationRow(supabase, {
    sender_session: role,
    sender_type: role,
    target_session: 'broadcast',       // broadcast so the per-role gauge reads every role's ack
    message_type: 'INFO',
    subject: `[CHAIRMAN_DIRECTIVE_ACK ${directiveId}] role=${role}`,
    body: note || `${role} actioned chairman_directive ${directiveId}`,
    payload,
  });

  console.log(`✓ chairman_directive_ack recorded: id=${directiveId} role=${role} actioned_at=${actionedAt}`);
}

main().catch((e) => { console.error('ack-chairman-directive failed:', (e && e.message) || e); process.exit(1); });
