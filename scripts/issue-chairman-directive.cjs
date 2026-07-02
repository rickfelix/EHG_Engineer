#!/usr/bin/env node
/**
 * Issue a durable, queryable CHAIRMAN DIRECTIVE (broadcast) — SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1.
 *
 * Chairman intent enters via ONE agent and propagates by RELAY (the weakest rail). The last hop
 * silently died once (a 5-min-baseline directive; Solomon ran 2h non-compliant) because
 * 'chairman_directive' was not in the DIRECTIVE_KINDS no-auto-ack allowlist, so the generic inbox
 * drain auto-acked/consumed it before any role acted. This CLI writes a FIRST-CLASS broadcast row
 * all 3 roles (Adam / coordinator / Solomon) surface deliberately, with per-role ack-tracking so
 * non-compliance is VISIBLE not silent.
 *
 * SUPERSEDES: latest issued_at wins (keyed on directive_id) — a stale earlier directive never
 * out-ranks a newer one for the same directive_id (the chairman reversed effort low->high->low).
 *
 * The ack is keyed by directive_id (NOT topic_id), so this child is dependency-free.
 *
 * Insert routes through lib/coordinator/dispatch.cjs insertCoordinationRow with
 * target_session='broadcast' + message_type='INFO' (assertSdDispatchable only fires for
 * WORK_ASSIGNMENT, so an INFO broadcast passes the dispatch guard).
 *
 * Usage:
 *   node scripts/issue-chairman-directive.cjs --directive "<text>" [--id <slug>] [--roles adam,coordinator,solomon]
 */
'use strict';

const crypto = require('crypto');
const { getServiceClient, PAYLOAD_KINDS } = require('../lib/fleet/worker-status.cjs');
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');

const DEFAULT_ROLES = Object.freeze(['adam', 'coordinator', 'solomon']);

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const directive = argVal(argv, '--directive') || argVal(argv, '-d');
  if (!directive) {
    console.error('Usage: node scripts/issue-chairman-directive.cjs --directive "<text>" [--id <slug>] [--roles adam,coordinator,solomon]');
    process.exit(2);
  }
  const directiveId = argVal(argv, '--id') || `cd-${crypto.randomUUID()}`;
  const rolesArg = argVal(argv, '--roles');
  const appliesTo = rolesArg ? rolesArg.split(',').map((s) => s.trim()).filter(Boolean) : [...DEFAULT_ROLES];
  const issuedAt = new Date().toISOString();

  const payload = {
    kind: PAYLOAD_KINDS.CHAIRMAN_DIRECTIVE,
    directive_id: directiveId,
    issued_at: issuedAt,           // SUPERSEDES key: latest issued_at wins per directive_id
    applies_to: appliesTo,         // which roles must ack
    directive: String(directive),
    request_ack: true,             // reuse the DELIVERED transport-ack layer for read confirmation
    body: String(directive),       // rendered by the role inbox partitions
  };

  const supabase = getServiceClient();
  await insertCoordinationRow(supabase, {
    sender_session: 'chairman',
    sender_type: 'chairman',
    target_session: 'broadcast',   // broadcast sentinel — dispatch short-circuits the live-session lookup
    message_type: 'INFO',          // assertSdDispatchable only fires for WORK_ASSIGNMENT → INFO passes
    subject: `[CHAIRMAN_DIRECTIVE ${directiveId}]`,
    body: String(directive),
    payload,
  });

  console.log(`✓ chairman_directive issued: id=${directiveId} applies_to=[${appliesTo.join(', ')}] issued_at=${issuedAt}`);
  console.log(`  Each role acks via: node scripts/ack-chairman-directive.cjs --id ${directiveId} --role <adam|coordinator|solomon>`);
}

main().catch((e) => { console.error('issue-chairman-directive failed:', (e && e.message) || e); process.exit(1); });
