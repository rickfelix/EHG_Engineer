#!/usr/bin/env node
// SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-0: documented, idempotent procedure for restoring a
// retrospective row from its retrospectives_audit old_data after an unauthorized overwrite.
// Never a raw, unreviewed client.update() run from the scratchpad (the incident this SD exists
// to prevent) -- this script is tracked, reviewed, and consults isSafeToWriteRetro as a pre-flight
// safety check before writing, so it can never itself become the next uncanonical write.
//
// Usage: node scripts/one-off/restore-retro-from-audit.mjs <retrospective-id> <audit-row-id> [--disclosure '<json>']
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isSafeToWriteRetro } from '../modules/handoff/lib/retro-clobber-guard.js';
import { pathToFileURL } from 'node:url';

const CONTENT_COLUMNS = [
  'description', 'title', 'what_went_well', 'what_needs_improvement', 'improvement_areas',
  'key_learnings', 'objectives_met', 'action_items', 'failure_patterns', 'success_patterns',
  'related_prs', 'related_commits', 'related_files', 'affected_components', 'generated_by',
  'protocol_improvements', 'verbatim_citations', 'triangulation_divergence_insights',
  'unnecessary_work_identified', 'future_enhancements', 'coverage_analysis', 'bmad_insights',
  'business_value_delivered', 'customer_impact', 'performance_impact', 'status', 'quality_score',
];

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key);
}

/** Only the columns that actually differ, restricted to CONTENT_COLUMNS -- never touches metadata
 * wholesale, so any disclosure note already appended after the incident survives untouched. */
function diffContentColumns(current, target) {
  const patch = {};
  for (const col of CONTENT_COLUMNS) {
    if (!(col in target)) continue;
    if (JSON.stringify(current[col]) !== JSON.stringify(target[col])) patch[col] = target[col];
  }
  return patch;
}

export async function restoreRetroFromAudit(supabase, retrospectiveId, auditRowId, { disclosure } = {}) {
  const { data: current, error: e1 } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', retrospectiveId)
    .single();
  if (e1) throw new Error(`could not read target retrospective ${retrospectiveId}: ${e1.message}`);

  const { data: auditRow, error: e2 } = await supabase
    .from('retrospectives_audit')
    .select('id, retrospective_id, action, old_data, changed_at')
    .eq('id', auditRowId)
    .single();
  if (e2) throw new Error(`could not read audit row ${auditRowId}: ${e2.message}`);
  if (auditRow.retrospective_id !== retrospectiveId) {
    throw new Error(`audit row ${auditRowId} belongs to retrospective ${auditRow.retrospective_id}, not ${retrospectiveId}`);
  }
  if (!auditRow.old_data) throw new Error(`audit row ${auditRowId} has no old_data to restore from`);

  // Idempotency check FIRST, before any column diffing: the restored row's description legitimately
  // differs from old_data by design (it carries an appended disclosure note), so a raw column-value
  // diff against old_data would never be empty post-restore and would try to strip that note back
  // out. The reliable "already done" signal is the row's own metadata recording exactly this
  // restore, stamped by the restore that already ran.
  // Repo convention (matches ruling/amend fields elsewhere in this same metadata) stores short
  // 8-char hex prefixes, not full UUIDs -- compare accordingly in both directions so a caller can
  // pass either form.
  const restoredFrom = current.metadata?.integrity_disclosure?.restored_from_audit_row;
  if (restoredFrom && (auditRowId.startsWith(restoredFrom) || restoredFrom.startsWith(auditRowId))) {
    return { wrote: false, reason: 'already_restored_from_this_audit_row', retrospectiveId, auditRowId };
  }

  const patch = diffContentColumns(current, auditRow.old_data);

  if (Object.keys(patch).length === 0 && !disclosure) {
    return { wrote: false, reason: 'already_matches', retrospectiveId, auditRowId };
  }

  // Pre-flight safety check: never let this script itself become an uncanonical clobber. A restore
  // targeting a row the guard considers unsafe to touch (e.g. it is already a DIFFERENT, newer,
  // genuinely-published record) must be reviewed by a human before proceeding, not silently forced.
  const guard = await isSafeToWriteRetro(supabase, current.sd_id, { targetRowId: retrospectiveId, intendedType: current.retro_type });
  if (!guard.safe && !disclosure) {
    throw new Error(
      `isSafeToWriteRetro refused this restore (reason=${guard.reason}). This is a STOP per the retro-agent's ` +
      `own rule, not a script to work around -- if this restore is genuinely intended (recovering from a ` +
      `real overwrite, not clobbering a legitimate newer record), pass --disclosure with a documented ` +
      `human/coordinator decision to proceed.`
    );
  }

  if (disclosure) {
    patch.metadata = { ...(current.metadata || {}), integrity_disclosure: disclosure };
  }

  // FR-1's chairman-gated trigger (once applied) refuses a content-column UPDATE on a PUBLISHED
  // SD_COMPLETION row without this token matching a registered identity -- 'restore_from_audit' is
  // registered in retro_canonical_writer_policy() for exactly this script (testing-agent finding
  // F-3, EXEC evidence b60f5de1: without it, this script would itself be refused the moment FR-1
  // goes live). PRE-APPLY, retro_write_token does not exist as a column yet -- PostgREST rejects an
  // unknown column (PGRST204/42703), so attempt WITH it first and fail-soft to WITHOUT it, matching
  // the same convention lib/operator/cash-burn-substrate.js already uses for a chairman-gated column
  // that hasn't landed yet.
  const patchWithToken = { ...patch, retro_write_token: 'restore_from_audit' };
  let { error: e3 } = await supabase.from('retrospectives').update(patchWithToken).eq('id', retrospectiveId);
  if (e3 && (e3.code === 'PGRST204' || e3.code === '42703')) {
    ({ error: e3 } = await supabase.from('retrospectives').update(patch).eq('id', retrospectiveId));
  }
  if (e3) throw new Error(`restore write failed: ${e3.message}`);

  return { wrote: true, retrospectiveId, auditRowId, restoredColumns: Object.keys(patch) };
}

async function main() {
  const [retrospectiveId, auditRowId, ...rest] = process.argv.slice(2);
  if (!retrospectiveId || !auditRowId) {
    console.log("Usage: node scripts/one-off/restore-retro-from-audit.mjs <retrospective-id> <audit-row-id> [--disclosure '<json>']");
    process.exitCode = 1;
    return;
  }
  let disclosure;
  const disclosureFlagIndex = rest.indexOf('--disclosure');
  if (disclosureFlagIndex !== -1 && rest[disclosureFlagIndex + 1]) {
    disclosure = JSON.parse(rest[disclosureFlagIndex + 1]);
  }
  const supabase = buildSupabase();
  const result = await restoreRetroFromAudit(supabase, retrospectiveId, auditRowId, { disclosure });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FATAL', e.message); process.exitCode = 1; });
}
