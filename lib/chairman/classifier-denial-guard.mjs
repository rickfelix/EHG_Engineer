/**
 * lib/chairman/classifier-denial-guard.mjs — QF-20260906-881.
 *
 * Extends the chairman-gated-decision-row-guard's trigger set with two events NEITHER
 * SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001 (SD-level GO/DEFER fences) nor the
 * requires_human_action fence family (QF-193/858/481/179) covers: (a) an UNGATED migration-apply
 * WAIT (CHAIRMAN_APPLY_VERIFICATION's `ordinaryUnapplied` branch, which — unlike its
 * `ceremonyPending` sibling — writes no chairman_decisions row today) and (b) a worker /signal
 * stuck naming a host-level command the Claude Code auto-mode permission classifier denied
 * (apply-migration.js, leo-create-sd.js, schtasks, permissions.allow). Both write a
 * chairman_decisions row, decision_type='chairman_approval' — an existing, already-mapped arm
 * (see lib/chairman/decision-retirement.mjs armOf() / fn_chairman_decision_value) — instead of
 * leaving the item on a hand-kept board note. REUSE, no new table (76a3c081).
 */
import { classifyMigrationApplyState } from '../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js';
import { sdKeyOwnsFile } from '../../scripts/modules/handoff/executors/lead-final-approval/sd-key-file-ownership.js';
import { recordPendingDecision } from './record-pending-decision.mjs';
import { COMPLETION_FLAG } from '../governance/completion-flag-keys.js';

// Matches both the tool's own exact wording ("denied by the Claude Code auto mode classifier")
// and common worker-signal paraphrases ("denied by the auto-mode permission classifier") — a
// /signal body is free text written by the worker, not a verbatim copy of the tool error.
const DENIAL_RX = /denied by (?:the )?(?:claude code )?auto[- ]mode (?:permission )?classifier/i;
const COMMAND_RX = /`([^`]*\b(?:apply-migration|leo-create-sd|schtasks)[^`]*)`|(\bnode scripts\/\S+\.m?js[^\s"']*)/i;
const SIGNAL_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/** Is this sd_key+kind(+file) already a pending or approved chairman_approval row? Fail-open (a
 *  lookup error must not flood the queue with duplicates on retry, so we skip rather than
 *  double-record). `file` is included for migration_apply_wait candidates so a SECOND, distinct
 *  unapplied migration under the same SD+kind still surfaces rather than being masked forever by
 *  an earlier (already-approved or still-pending) row for a different file. */
async function alreadyCovered(supabase, sdKey, kind, file) {
  const context = file ? { sd_key: sdKey, kind, file } : { sd_key: sdKey, kind };
  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id')
    .eq('decision_type', 'chairman_approval')
    .contains('brief_data', { context })
    .neq('status', 'rejected')
    .limit(1);
  return error ? true : (data || []).length > 0;
}

/** Ungated SDs at LEAD_FINAL owning a migration the classifier reports PARTIAL/NOT_APPLIED. */
async function findMigrationApplyWaitCandidates(supabase) {
  const { files, error } = await classifyMigrationApplyState();
  if (error) return [];
  // SDs sitting at pending_approval/LEAD_FINAL are a small, transient population by
  // construction (they clear on the next handoff) — 200 is a generous, provably-bounded cap,
  // not an expected-to-truncate one.
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata')
    .eq('status', 'pending_approval')
    .eq('current_phase', 'LEAD_FINAL')
    .limit(200);
  const out = [];
  for (const sd of sds || []) {
    const rawFlag = sd.metadata?.requires_chairman_apply;
    if (rawFlag === true || rawFlag === 'true') continue; // ceremonyPending already covers gated SDs
    const declared = Array.isArray(sd.metadata?.migration_files) ? sd.metadata.migration_files : [];
    const owned = files.filter((f) => declared.includes(f.file) || sdKeyOwnsFile(sd.sd_key, f.file));
    const unapplied = owned.find((f) => f.status !== 'APPLIED' && f.status !== 'NO_DDL');
    if (unapplied) {
      out.push({ sd_key: sd.sd_key, kind: 'migration_apply_wait', file: unapplied.file, command: `node scripts/apply-migration.js ${unapplied.file}` });
    }
  }
  return out;
}

/** Recent worker /signal stuck rows naming a classifier-denied host command. */
async function findClassifierDeniedSignalCandidates(supabase) {
  const since = new Date(Date.now() - SIGNAL_LOOKBACK_MS).toISOString();
  // Bounded to the same 48h lookback window this function already scopes to; 200 is a
  // generous cap on how many /signal stuck rows can land in that window, not an
  // expected-to-truncate one.
  const { data } = await supabase
    .from('session_coordination')
    .select('id, payload, created_at')
    .eq('payload->>signal_type', 'stuck')
    .gte('created_at', since)
    .limit(200);
  const out = [];
  for (const row of data || []) {
    const body = row.payload?.body || '';
    const sdKey = row.payload?.sd_key;
    if (!sdKey || !DENIAL_RX.test(body)) continue;
    const m = body.match(COMMAND_RX);
    out.push({ sd_key: sdKey, kind: 'classifier_denied_command', signal_id: row.id, command: (m?.[1] || m?.[2] || body.slice(0, 200)).trim() });
  }
  return out;
}

/**
 * Run one probe tick. Own try/catch per candidate (mirrors chairman-gated-decision-row-guard's
 * shape) so one bad row never aborts the rest.
 * @returns {Promise<{hits:number, recorded:number, errors:Array<{sd_key:string,error:string}>}>}
 */
export async function runClassifierDenialGuard(supabase) {
  const errors = [];
  const [migrationCandidates, signalCandidates] = await Promise.all([
    findMigrationApplyWaitCandidates(supabase).catch((e) => {
      errors.push({ sd_key: null, error: `migration_apply_wait_scan_failed: ${e.message}` });
      return [];
    }),
    findClassifierDeniedSignalCandidates(supabase).catch((e) => {
      errors.push({ sd_key: null, error: `classifier_denied_signal_scan_failed: ${e.message}` });
      return [];
    }),
  ]);
  const candidates = [...migrationCandidates, ...signalCandidates];
  let recorded = 0;
  for (const c of candidates) {
    try {
      if (await alreadyCovered(supabase, c.sd_key, c.kind, c.file)) continue;
      const result = await recordPendingDecision(supabase, {
        title: `[CLASSIFIER-DENIED ${c.sd_key}] ${c.command}`,
        decisionType: 'chairman_approval',
        blocking: false,
        context: { sd_key: c.sd_key, kind: c.kind, command: c.command, requested_at: new Date().toISOString(), file: c.file || null },
      });
      if (result.recorded) recorded += 1;
      else errors.push({ sd_key: c.sd_key, error: result.error || 'record_failed' });
    } catch (e) {
      errors.push({ sd_key: c.sd_key, error: e.message });
    }
  }
  return { hits: candidates.length, recorded, errors };
}

/** Verifier predicates, keyed by context.kind. Only the demonstrated, measured case
 *  (migration_apply_wait) has a real predicate today — schtasks/permissions.allow denials have
 *  no automated check here yet, so approval alone must NOT falsely close their flag; a future
 *  increment can add entries here without touching the caller below. */
const VERIFIERS = {
  async migration_apply_wait(context) {
    const { files, error } = await classifyMigrationApplyState();
    if (error) return false;
    return files.some((f) => f.file === context.file && f.status === 'APPLIED');
  },
};

/**
 * Post-approval hook (called from scripts/chairman-decisions.mjs's chairmanDecide writer, same
 * trigger point as the existing site-review-attestation / acquisition-pipeline bridges). On a
 * verified approval, resolves the covering completion-flag feedback row this item's
 * deferred_followup finding was captured under (scripts/capture-completion-flags.js) — reusing
 * the existing row type rather than inventing a new "closed" concept.
 */
export async function resolveAndVerifyClassifierDenial(supabase, { decisionId, action } = {}) {
  if (action !== 'approve') return { ran: false, reason: 'not_an_approval' };
  const { data: row } = await supabase.from('chairman_decisions').select('brief_data').eq('id', decisionId).maybeSingle();
  const context = row?.brief_data?.context;
  const verifier = context?.kind && VERIFIERS[context.kind];
  if (!verifier) return { ran: false, reason: 'no_verifier_for_kind' };
  const verified = await verifier(context);
  if (!verified) return { ran: true, verified: false };
  // In practice at most 1-2 completion-flag rows exist per (sd_key, category); 50 is a
  // generous, provably-bounded cap, not an expected-to-truncate one.
  const { data: flagRows } = await supabase
    .from('feedback')
    .select('id, description')
    .eq('category', 'completion_flag_finding')
    .eq('status', 'new')
    .contains('metadata', { [COMPLETION_FLAG.SOURCE_SD_KEY]: context.sd_key })
    .limit(50);
  // A completion-flag finding's only link to an SD is source_sd — there is no per-item
  // correlation key shared with this guard's (sd_key, kind, file) candidates. Matching on
  // sd_key alone would resolve EVERY open completion-flag finding for the SD (e.g. an
  // unrelated harness-friction note), not just the one this verified migration/command
  // covers. Narrow to findings whose own text names the specific file/command verified;
  // a needle-less context (should not happen for a real candidate) resolves nothing rather
  // than falling back to "resolve everything".
  const needle = context.file || context.command;
  const matching = needle
    ? (flagRows || []).filter((fr) => typeof fr.description === 'string' && fr.description.includes(needle))
    : [];
  for (const fr of matching) {
    await supabase.from('feedback').update({
      status: 'resolved',
      resolution_notes: `Verified via chairman_decisions ${decisionId}: ${context.command} confirmed applied.`,
      resolved_at: new Date().toISOString(),
    }).eq('id', fr.id);
  }
  return { ran: true, verified: true, closed: matching.length };
}
