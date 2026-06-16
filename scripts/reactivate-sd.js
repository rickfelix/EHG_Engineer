#!/usr/bin/env node
/**
 * Canonical SD Reactivation Script — SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 (FR-3)
 *
 * Atomically moves an SD OUT of status='deferred': flips status (default 'draft'),
 * syncs metadata.blocker (stamps metadata.reactivated_at + marks the blocker cleared), and
 * emits an sd_transition_audit row (transition_type='REACTIVATE'). The direct-UPDATE path
 * used for ad-hoc reactivations bypasses BOTH the blocker sync and the audit — this routine
 * closes that gap (the gap a chairman-authorized manual reactivation exposed). Mirrors the
 * canonical scripts/cancel-sd.js structure (parseArgs -> resolveSD -> guarded atomic update).
 *
 * Per the SD's explicit anti-requirement, the claim-validity predicate is NOT made to read
 * metadata.blocker — nothing reads it; that would be dead defensive code against a non-cause.
 *
 * "Atomic" here = the status + metadata flip is ONE guarded UPDATE keyed on status='deferred', so a
 * concurrent reactivation cannot double-apply. NOTE: the guard is on the STATUS column; metadata is a
 * read-modify-write (last-writer-wins) — a concurrent writer mutating a DIFFERENT metadata key in the
 * narrow read->write window would be overwritten (low risk: manual single-actor reactivation). The
 * audit row is emitted immediately after the flip (loud-but-non-fatal on failure — the state change
 * must not be masked by an audit hiccup), mirroring cancel-sd.js.
 *
 * Usage:
 *   node scripts/reactivate-sd.js <SD-KEY-or-UUID> [--to <status>] [--reason "<text>"]
 *   node scripts/reactivate-sd.js --help
 *
 * Defaults: --to draft
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

// Valid reactivation targets — where a 'deferred' SD can be moved back to.
export const VALID_REACTIVATION_TARGETS = new Set(['draft', 'active', 'in_progress']);
// Terminal statuses that must NOT be reactivated (loud refusal).
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

/**
 * PURE: compute the reactivation update + audit pre/post state for an SD.
 * Returns {ok:false, reason} when the SD is not 'deferred' (caller decides exit code);
 * throws on an invalid target status.
 * @param {{status?:string,current_phase?:string,metadata?:object,sd_key?:string,id?:string}} sd
 * @param {{toStatus?:string, reason?:string, nowIso?:string}} [opts]
 */
export function computeReactivation(sd, { toStatus = 'draft', reason = null, nowIso } = {}) {
  if (!sd) throw new Error('computeReactivation: sd is required');
  if (!VALID_REACTIVATION_TARGETS.has(toStatus)) {
    throw new Error(`computeReactivation: invalid --to status '${toStatus}' (allowed: ${[...VALID_REACTIVATION_TARGETS].join(', ')})`);
  }
  if (sd.status !== 'deferred') {
    return { ok: false, reason: 'not_deferred', terminal: TERMINAL_STATUSES.has(sd.status), currentStatus: sd.status };
  }
  const ts = nowIso || new Date().toISOString();
  const priorMeta = (sd.metadata && typeof sd.metadata === 'object' && !Array.isArray(sd.metadata)) ? sd.metadata : {};
  const priorBlocker = (priorMeta.blocker && typeof priorMeta.blocker === 'object' && !Array.isArray(priorMeta.blocker))
    ? priorMeta.blocker : null;

  // Sync metadata.blocker: stamp reactivated_at and mark the blocker cleared (preserve the
  // object for the audit trail rather than silently dropping it — internally consistent).
  const nextMeta = { ...priorMeta, reactivated_at: ts };
  if (priorBlocker) nextMeta.blocker = { ...priorBlocker, status: 'cleared', cleared_at: ts };
  if (reason) nextMeta.reactivation_reason = String(reason).slice(0, 500);

  const updates = { status: toStatus, metadata: nextMeta, updated_at: ts };
  const pre_state = { status: sd.status, current_phase: sd.current_phase ?? null, blocker_status: priorBlocker?.status ?? null };
  const post_state = { status: toStatus, reactivated_at: ts, blocker_status: priorBlocker ? 'cleared' : null };
  return { ok: true, updates, pre_state, post_state, blockerCleared: !!priorBlocker };
}

/**
 * PURE: build the sd_transition_audit insert row for a reactivation.
 * sd_id (uuid) + request_id (text) are NOT NULL on the table.
 */
export function buildReactivationAudit({ sdId, pre_state, post_state, sessionId = null, requestId, nowIso }) {
  if (!sdId) throw new Error('buildReactivationAudit: sdId is required');
  if (!requestId) throw new Error('buildReactivationAudit: requestId is required (request_id is NOT NULL)');
  if (!pre_state) throw new Error('buildReactivationAudit: pre_state is required (pre_state is NOT NULL)');
  const ts = nowIso || new Date().toISOString();
  return {
    sd_id: sdId,
    transition_type: 'REACTIVATE',
    session_id: sessionId,
    request_id: requestId,
    pre_state,
    post_state: post_state ?? null,
    status: 'completed',
    started_at: ts,
    completed_at: ts,
  };
}

// ── CLI (IO) ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/reactivate-sd.js <SD-KEY-or-UUID> [--to <status>] [--reason "<text>"]

Atomically reactivates a DEFERRED SD (SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 FR-3):
  - flips status OUT of 'deferred' (default --to draft; also: active, in_progress)
  - syncs metadata: stamps metadata.reactivated_at and marks metadata.blocker.status='cleared'
  - emits an sd_transition_audit row (transition_type='REACTIVATE', pre_state/post_state)

The status+metadata flip is one guarded UPDATE (WHERE status='deferred' — concurrent-safe).
Idempotent: re-running on an already-reactivated SD is a no-op. Refuses completed/cancelled SDs.

Options:
  --to <status>      Target status (draft | active | in_progress). Default: draft
  --reason "<text>"  Optional reactivation reason (recorded in metadata)

Examples:
  node scripts/reactivate-sd.js SD-LEO-FIX-FOO-001 --reason "Chairman cleared the gate"
  node scripts/reactivate-sd.js SD-LEO-FIX-FOO-001 --to in_progress
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }
  const toIdx = args.indexOf('--to');
  const toStatus = toIdx !== -1 ? args[toIdx + 1] : 'draft';
  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : null;
  const consumed = new Set([toIdx, toIdx + 1, reasonIdx, reasonIdx + 1].filter(i => i >= 0));
  const sdInput = args.find((a, i) => !a.startsWith('-') && !consumed.has(i));
  if (!sdInput) {
    console.error('❌ Missing SD identifier (sd_key or UUID)');
    process.exit(1);
  }
  return { sdInput, toStatus, reason };
}

async function resolveSD(supabase, input) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  // uuid_id is the real uuid PK (sd_transition_audit.sd_id FKs to it); id is a varchar
  // surrogate (often itself uuid-shaped). A UUID input may be either, so match both.
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, title, status, current_phase, metadata')
    .or(isUuid ? `uuid_id.eq.${input},id.eq.${input}` : `sd_key.eq.${input}`)
    .limit(1)
    .single();
  if (error || !data) {
    console.error(`❌ SD not found: ${input}`);
    process.exit(1);
  }
  return data;
}

async function main() {
  const { sdInput, toStatus, reason } = parseArgs();
  const supabase = createSupabaseServiceClient();
  const sd = await resolveSD(supabase, sdInput);

  console.log(`SD: ${sd.sd_key} — ${sd.title?.slice(0, 80)}`);
  console.log(`  Current status: ${sd.status} / phase: ${sd.current_phase}`);
  console.log(`  Reactivating to: ${toStatus}${reason ? ` (reason: ${reason})` : ''}`);
  console.log('');

  const plan = computeReactivation(sd, { toStatus, reason });
  if (!plan.ok) {
    if (plan.terminal) {
      console.error(`❌ Cannot reactivate ${sd.sd_key}: status='${plan.currentStatus}' is terminal. Use a different remediation path.`);
      process.exit(1);
    }
    console.log(`ℹ️  SD ${sd.sd_key} is status='${plan.currentStatus}', not 'deferred' — nothing to reactivate (idempotent no-op).`);
    process.exit(0);
  }

  // Guarded atomic flip — only applies if the SD is STILL 'deferred'.
  const { data: updated, error: upErr } = await supabase
    .from('strategic_directives_v2')
    .update(plan.updates)
    .eq('id', sd.id)
    .eq('status', 'deferred')
    .select('sd_key, status');
  if (upErr) {
    console.error(`❌ Failed to reactivate ${sd.sd_key}:`, upErr.message);
    process.exit(1);
  }
  if (!updated || updated.length === 0) {
    console.log(`ℹ️  ${sd.sd_key} was no longer 'deferred' at write time (concurrent change) — no-op.`);
    process.exit(0);
  }
  console.log(`✓ ${sd.sd_key} reactivated: status=${toStatus}, metadata.reactivated_at stamped${plan.blockerCleared ? ', metadata.blocker.status=cleared' : ''}`);

  // Emit the sd_transition_audit row (loud-but-non-fatal — the flip already landed).
  const auditRow = buildReactivationAudit({
    // sd_transition_audit.sd_id FKs to strategic_directives_v2.uuid_id (NOT the varchar id).
    sdId: sd.uuid_id,
    pre_state: plan.pre_state,
    post_state: plan.post_state,
    sessionId: process.env.CLAUDE_SESSION_ID || null,
    requestId: randomUUID(),
  });
  const { error: auditErr } = await supabase.from('sd_transition_audit').insert(auditRow);
  if (auditErr) {
    console.warn(`⚠️  sd_transition_audit write for ${sd.sd_key} failed (non-fatal — SD already reactivated):`, auditErr.message);
  } else {
    console.log(`✓ sd_transition_audit: REACTIVATE recorded for ${sd.sd_key}`);
  }

  console.log('\n✅ Reactivation complete.');
}

// Only run main() when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && /reactivate-sd\.js$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
}
