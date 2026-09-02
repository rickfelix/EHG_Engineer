#!/usr/bin/env node
/**
 * Guarded setter for strategic_directives_v2.metadata.completion_evidence_invalid.
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-5)
 *
 * WHY THIS EXISTS. FR-5 adds a guarded reopen branch to reactivate-sd.js: a status='completed'
 * SD can only move back to active/LEAD_FINAL when metadata.completion_evidence_invalid===true.
 * Nothing in the codebase wrote that flag before this SD, which would have made the reopen
 * path dead by construction -- unreachable by any sanctioned action. This is the ONLY writer.
 *
 * Sets the flag, stamps who/why/when, and writes an sd_transition_audit row
 * (transition_type='FLAG_COMPLETION_EVIDENCE_INVALID') so the MARK itself is traceable, not
 * just its downstream consequence (the eventual reactivate-sd.js reopen).
 *
 * Refuses without --reason (an unexplained flag flip is as untrustworthy as an unexplained
 * bypass) -- same discipline as bypass-rubric.js's minimum-length reason requirement, though
 * this is a length-only check, not a rubric classification (a false-completion report is
 * inherently free-form; there is no fixed vocabulary of legitimate reasons to pattern-match).
 *
 * Usage:
 *   node scripts/mark-completion-evidence-invalid.js --sd-id <SD-KEY-or-UUID> --reason "<text (min 20 chars)>" [--offending-handoff-id <uuid>]
 *   node scripts/mark-completion-evidence-invalid.js --help
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const MIN_REASON_LENGTH = 20;

/** Minimal argv parser: --flag value pairs. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

/**
 * Pure guard: is this invocation well-formed? Returns null when acceptable, or a
 * reason string when the mark must be refused.
 */
export function refusalReason({ sd_id, reason }) {
  if (!sd_id) return 'missing --sd-id';
  if (!reason || typeof reason !== 'string') return 'missing --reason (required — an unexplained flag flip is as untrustworthy as an unexplained bypass)';
  if (reason.trim().length < MIN_REASON_LENGTH) {
    return `--reason must be at least ${MIN_REASON_LENGTH} characters (got ${reason.trim().length})`;
  }
  return null;
}

/**
 * PURE: compute the metadata update for marking completion evidence invalid.
 * @param {{metadata?: object}} sd
 * @param {{reason: string, actor: string, offendingHandoffId?: string|null, nowIso?: string}} opts
 */
export function computeMarkInvalid(sd, { reason, actor, offendingHandoffId = null, nowIso } = {}) {
  const ts = nowIso || new Date().toISOString();
  const priorMeta = (sd?.metadata && typeof sd.metadata === 'object' && !Array.isArray(sd.metadata)) ? sd.metadata : {};
  const nextMeta = {
    ...priorMeta,
    completion_evidence_invalid: true,
    completion_evidence_invalid_reason: String(reason).slice(0, 1000),
    completion_evidence_invalid_by: actor,
    completion_evidence_invalid_at: ts,
    completion_evidence_invalid_offending_handoff_id: offendingHandoffId || null,
  };
  return { updates: { metadata: nextMeta, updated_at: ts }, ts };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches scripts/lib/sd-id-resolver.js's UUID_OR_KEY_REGEX key-branch shape.
const SD_KEY_RE = /^SD-[A-Z0-9-]+$/i;

export async function resolveSD(supabase, input) {
  const isUuid = UUID_RE.test(input);
  // SECURITY review finding S2 (EXEC-TO-PLAN evidence, measured 2026-09-02): the non-UUID
  // branch interpolated `input` into a PostgREST .or() filter string unvalidated. A value like
  // "NO-SUCH-KEY,status.eq.completed" was accepted as an ADDITIONAL OR-clause rather than part
  // of the sd_key match, letting an arbitrary --sd-id argument mark an unrelated (order-
  // dependent, .limit(1).single()) SD's completion evidence invalid -- this script is the ONLY
  // sanctioned writer of that flag, so this was a live filter-injection path into the reopen
  // unlock. Reject anything that isn't a genuine UUID or SD-KEY shape before it ever reaches
  // the query string.
  if (!isUuid && !SD_KEY_RE.test(input)) {
    throw new Error(`Invalid --sd-id format (expected a UUID or SD-KEY, got: ${JSON.stringify(input)})`);
  }
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_key, status, metadata')
    .or(isUuid ? `uuid_id.eq.${input},id.eq.${input}` : `sd_key.eq.${input}`)
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(`SD not found: ${input}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`Usage: node scripts/mark-completion-evidence-invalid.js --sd-id <SD-KEY-or-UUID> --reason "<text>" [--offending-handoff-id <uuid>]

Marks strategic_directives_v2.metadata.completion_evidence_invalid=true for the given SD.
This is the ONLY sanctioned writer of that flag -- reactivate-sd.js's completed->active
reopen path refuses without it. Writes an sd_transition_audit row for traceability.

Options:
  --sd-id <id>                  SD key or UUID (required)
  --reason "<text>"             Why this completion's evidence is invalid (required, min 20 chars)
  --offending-handoff-id <uuid> The sd_phase_handoffs.id this reopen traces back to (optional)
`);
    process.exit(0);
  }

  const reason0 = refusalReason(args);
  if (reason0) {
    console.error(`\nmark-completion-evidence-invalid: ${reason0}`);
    process.exit(2);
  }

  const supabase = createSupabaseServiceClient();
  const sd = await resolveSD(supabase, args.sd_id).catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  });

  const { updates } = computeMarkInvalid(sd, {
    reason: args.reason,
    actor: process.env.CLAUDE_SESSION_ID || 'unknown',
    offendingHandoffId: args.offending_handoff_id || null,
  });

  const { data: updated, error: upErr } = await supabase
    .from('strategic_directives_v2')
    .update(updates)
    .eq('id', sd.id)
    .select('sd_key, status')
    .maybeSingle();
  if (upErr) {
    console.error(`\n❌ Failed to mark ${sd.sd_key}:`, upErr.message);
    process.exit(1);
  }

  console.log(`✓ ${updated.sd_key}: metadata.completion_evidence_invalid=true (status=${updated.status})`);

  // Audit trail entry for the MARK itself (loud-but-non-fatal — the flag already landed).
  const auditRow = {
    sd_id: sd.uuid_id,
    transition_type: 'FLAG_COMPLETION_EVIDENCE_INVALID',
    session_id: process.env.CLAUDE_SESSION_ID || null,
    request_id: randomUUID(),
    pre_state: { status: sd.status, completion_evidence_invalid: sd.metadata?.completion_evidence_invalid ?? null },
    post_state: { status: sd.status, completion_evidence_invalid: true, reason: args.reason },
    status: 'completed',
    started_at: updates.updated_at,
    completed_at: updates.updated_at,
  };
  const { error: auditErr } = await supabase.from('sd_transition_audit').insert(auditRow);
  if (auditErr) {
    console.warn('⚠️  sd_transition_audit write failed (non-fatal — flag already set):', auditErr.message);
  } else {
    console.log('✓ sd_transition_audit: FLAG_COMPLETION_EVIDENCE_INVALID recorded');
  }

  console.log(`\nNext: node scripts/reactivate-sd.js ${sd.sd_key} --to active --reason "<why reopening now>"`);
}

// Only run main() when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && /mark-completion-evidence-invalid\.js$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
}
