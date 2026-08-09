#!/usr/bin/env node
/**
 * Worker-side ACK of an ADVISORY row — SD-LEO-INFRA-WORKER-REACHABLE-ACK-001 / FR-2.
 *
 * THE GAP THIS CLOSES. A coordinator RULING arrives as payload.kind='coordinator_reply', which is
 * deliberately NOT a DIRECTIVE_KIND — scripts/worker-ack-directive.cjs refuses it, correctly, with
 * "this path is reserved for genuine directives, never advisory rows". But that left a worker with
 * NO way to acknowledge a ruling at all: the row stayed unacknowledged until some later /checkin
 * happened to drain it, so the coordinator could not tell "read and actioned" from "never
 * reached". Measured repeatedly in one session — rulings sat unacked for hours while the worker
 * had already acted on them.
 *
 * WHY A SEPARATE VERB RATHER THAN A WIDER ALLOW-LIST. Adding coordinator_reply to DIRECTIVE_KINDS
 * would have been the small edit, and it would have been wrong: DIRECTIVE_KINDS also drives
 * deliver-not-consume (read_at stays NULL) in scripts/hooks/coordination-inbox.cjs and
 * priority-exempt selection. Widening it to buy an ack verb changes semantics the ack has nothing
 * to do with. The lanes stay separate; only the allow-list differs.
 *
 * The row is stamped by the SAME shared core as the directive path (ackRow), so the two verbs
 * cannot drift.
 *
 * Usage:
 *   node scripts/worker-ack-advisory.cjs --id <message_id> [--note "<text>"]
 */
'use strict';

const { getServiceClient } = require('../lib/fleet/worker-status.cjs');
const { ackAdvisory } = require('./worker-ack-directive.cjs');

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const id = argVal(argv, '--id');
  const note = argVal(argv, '--note');
  // An explicit id is REQUIRED — never a silently-resolved "newest unacked row", which is the
  // defect QF-20260727-454 pinned across every sanctioned ack path (acking a row before it was
  // read, because recency was used as a proxy for identity).
  if (!id) {
    console.error('Usage: node scripts/worker-ack-advisory.cjs --id <message_id> [--note "<text>"]');
    // FR-1: exitCode, not exit() — process.exit() here aborts on Windows with
    // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" and the shell reads 127
    // (command-not-found), making a deliberate refusal indistinguishable from a missing binary.
    process.exitCode = 2;
    return;
  }

  const supabase = getServiceClient();
  try {
    const result = await ackAdvisory(supabase, id, { note, sessionId: process.env.CLAUDE_SESSION_ID || null });
    if (result.alreadyAcked) {
      console.log(`worker-ack-advisory: id=${id} already acknowledged at ${result.acknowledgedAt} (idempotent no-op).`);
    } else {
      console.log(`✓ advisory acknowledged: id=${id} kind=${result.kind} actioned_at=${result.acknowledgedAt}`);
    }
  } catch (e) {
    console.error(`worker-ack-advisory: ${(e && e.message) || e}`);
    process.exitCode = 1;
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
