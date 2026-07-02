#!/usr/bin/env node
// @wire-check-exempt: one-off, human-reviewed data-repair backfill CLI — dry-run by
// default, --apply is run manually under human/coordinator review (no production
// caller by design). The pure logic (detectCorruption, recoverRepoPath) is unit-tested.
/**
 * Backfill corrupted sub_agent_execution_results.{metadata.repo_path,
 * metadata.executed_from_cwd, executed_from_cwd} rows.
 * SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 (FR-3).
 *
 * ROOT CAUSE (see the sibling FR-2 migration
 * database/migrations/20260702_subagent_evidence_control_char_trigger.sql for the
 * forward-fix that now REJECTS new writes): Windows path literals
 * (e.g. C:\Users\rickf\Projects\_EHG\EHG_Engineer) hand-typed inline into a
 * JS/shell INSERT script get corrupted when that literal passes through JS
 * string-escape parsing before reaching the DB. Backslash sequences like \U, \P,
 * \_, \E are silently DROPPED because they are not recognized JS escapes (the
 * backslash disappears, e.g. "C:\Users\..." -> "C:Users..."), while \r IS a
 * recognized JS escape and gets converted into a literal embedded
 * carriage-return control byte (0x0D) in the stored string. Both failure modes
 * produce a path that looks superficially plausible but is silently wrong, and
 * corrupted evidence rows can falsely pass/fail the SUB_AGENT_REPO_RESOLUTION
 * gate's exact-string repo_path comparison.
 *
 * REMEDIATION:
 *   - metadata.repo_path IS recoverable: it must equal applications.local_path
 *     for the SD's target_application (the same DB-first SSOT the canonical
 *     writer `lib/sub-agents/resolve-repo.js` `applySubAgentRepoVerdict` uses),
 *     so a fresh DB join reconstructs the correct value. recoverRepoPath() is
 *     therefore a trivial passthrough — the real "recovery" is the join in
 *     main(), not string manipulation, because the corrupted string has
 *     genuinely lost information (dropped separators can't be un-dropped).
 *   - metadata.executed_from_cwd and the top-level executed_from_cwd column are
 *     NOT recoverable: they capture the exact worktree cwd the sub-agent ran
 *     from, which is not derivable from any other row/column. Fabricating a
 *     value (e.g. guessing it equals repo_path) would produce false evidence
 *     that is indistinguishable from a genuine reading, so both are set to
 *     NULL instead — an honest "unknown" rather than a plausible-looking lie.
 *
 * Only the specific field(s) that are actually flagged corrupted on a given row
 * are touched; clean fields are left byte-identical. This also keeps every
 * UPDATE compatible with the FR-2 BEFORE-trigger, which rejects the whole write
 * if ANY of the three fields still contains a control character in NEW.
 *
 * Idempotent: re-running (including --apply twice) only ever touches rows that
 * still fail detectCorruption(); a clean row is never re-written.
 *
 * Usage:
 *   node scripts/backfill-corrupted-subagent-repo-paths.mjs           # dry-run (default, zero writes)
 *   node scripts/backfill-corrupted-subagent-repo-paths.mjs --apply   # perform the UPDATEs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const PAGE_SIZE = 1000;
// C0 control characters except tab (\x09) — mirrors the FR-2 trigger's reject
// class exactly, so "clean per this backfill" == "clean per the DB trigger".
// (Fixed from an earlier draft that also excluded \x0A/newline by accident —
// that gap let a `\node_modules`-style corrupted path go undetected.)
const CONTROL_CHAR_RE = /[\x00-\x08\x0A-\x1F]/;

/**
 * Pure: does `value` contain a control character consistent with the
 * JS-string-escape corruption described above? Non-strings (null/undefined/
 * numbers/etc.) are never corrupted by definition and must not throw.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function detectCorruption(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return CONTROL_CHAR_RE.test(value);
}

/**
 * Pure: "recover" a repo path. Trivial passthrough by design — the corrupted
 * string has lost information (dropped path separators, embedded control
 * bytes) that cannot be algorithmically un-corrupted. The actual recovery
 * mechanism is the sd_id -> strategic_directives_v2.target_application ->
 * applications.local_path DB join performed by main(); this function just
 * names that final step so callers/tests have a stable seam.
 *
 * @param {string} correctLocalPath - applications.local_path for the row's target_application
 * @returns {string}
 */
export function recoverRepoPath(correctLocalPath) {
  return correctLocalPath;
}

/**
 * Paginate through ALL rows of sub_agent_execution_results (no default
 * row-limit reliance) and return only rows with a control character in
 * metadata.repo_path, metadata.executed_from_cwd, or the top-level
 * executed_from_cwd column, annotated with which field(s) triggered it.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<Array<{id:string, sd_id:string|null, metadata:object|null, executed_from_cwd:string|null, repoBad:boolean, metaCwdBad:boolean, topCwdBad:boolean}>>}
 */
async function scanCorruptedRows(sb) {
  const corrupted = [];
  let from = 0;
  let examined = 0;
  for (;;) {
    const { data, error } = await sb
      .from('sub_agent_execution_results')
      .select('id, sd_id, metadata, executed_from_cwd')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`sub_agent_execution_results scan failed: ${error.message}`);
    if (!data || data.length === 0) break;
    examined += data.length;
    for (const row of data) {
      const repoBad = detectCorruption(row.metadata?.repo_path);
      const metaCwdBad = detectCorruption(row.metadata?.executed_from_cwd);
      const topCwdBad = detectCorruption(row.executed_from_cwd);
      if (repoBad || metaCwdBad || topCwdBad) {
        corrupted.push({ ...row, repoBad, metaCwdBad, topCwdBad });
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { corrupted, examined };
}

/**
 * Resolve applications.local_path for a set of sd_ids via
 * strategic_directives_v2.target_application, batched (no N+1 per row).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} sdIds
 * @returns {Promise<Map<string,string>>} sd_id -> local_path (only resolvable entries)
 */
async function resolveLocalPathsBySdId(sb, sdIds) {
  const result = new Map();
  const uniqueSdIds = [...new Set(sdIds.filter(Boolean))];
  if (uniqueSdIds.length === 0) return result;

  const { data: sds, error: sdErr } = await sb
    .from('strategic_directives_v2')
    .select('id, target_application')
    .in('id', uniqueSdIds);
  if (sdErr) throw new Error(`strategic_directives_v2 lookup failed: ${sdErr.message}`);

  const targetApps = [...new Set((sds || []).map((s) => s.target_application).filter(Boolean))];
  if (targetApps.length === 0) return result;

  const { data: apps, error: appErr } = await sb
    .from('applications')
    .select('name, local_path')
    .in('name', targetApps);
  if (appErr) throw new Error(`applications lookup failed: ${appErr.message}`);

  const localPathByApp = new Map((apps || []).filter((a) => a.local_path).map((a) => [a.name, a.local_path]));
  for (const sd of sds || []) {
    const localPath = sd.target_application && localPathByApp.get(sd.target_application);
    if (localPath) result.set(sd.id, localPath);
  }
  return result;
}

export async function main({ apply = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[backfill-corrupted-subagent-repo-paths] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exitCode = 1;
    return;
  }
  const sb = createClient(url, key);

  const { corrupted, examined } = await scanCorruptedRows(sb);
  console.log(`[backfill-corrupted-subagent-repo-paths] examined=${examined} corrupted=${corrupted.length} mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  if (corrupted.length === 0) {
    console.log('[backfill-corrupted-subagent-repo-paths] no corrupted rows found — nothing to do.');
    return { examined, corruptedCount: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const localPathBySdId = await resolveLocalPathsBySdId(sb, corrupted.map((r) => r.sd_id));

  let wouldUpdate = 0;
  let skippedUnresolvable = 0;
  const plan = [];
  for (const row of corrupted) {
    const needsRepoFix = row.repoBad;
    let newRepoPath;
    if (needsRepoFix) {
      const localPath = localPathBySdId.get(row.sd_id);
      if (!localPath) {
        // Unresolvable (missing sd_id / target_application / applications.local_path):
        // never fabricate a repo_path. Skip the WHOLE row — a partial fix that
        // leaves repo_path corrupted would still be rejected by the FR-2 trigger.
        skippedUnresolvable++;
        continue;
      }
      newRepoPath = recoverRepoPath(localPath);
    }

    // Only touch the columns that actually need to change — an untouched
    // metadata/executed_from_cwd is sent as `undefined` and omitted from the
    // update payload entirely, so a genuinely-NULL metadata column (or an
    // already-clean cwd value) is never rewritten to `{}`/overwritten.
    const updatePayload = {};
    if (needsRepoFix || row.metaCwdBad) {
      const newMetadata = { ...(row.metadata || {}) };
      if (needsRepoFix) newMetadata.repo_path = newRepoPath;
      if (row.metaCwdBad) newMetadata.executed_from_cwd = null;
      updatePayload.metadata = newMetadata;
    }
    if (row.topCwdBad) updatePayload.executed_from_cwd = null;

    wouldUpdate++;
    plan.push({ id: row.id, sd_id: row.sd_id, updatePayload });
  }

  console.log(`[backfill-corrupted-subagent-repo-paths] resolvable=${wouldUpdate} skipped_unresolvable=${skippedUnresolvable}`);
  console.log('[backfill-corrupted-subagent-repo-paths] sample (up to 5):');
  for (const p of plan.slice(0, 5)) {
    console.log(`  id=${p.id} sd_id=${p.sd_id} update=${JSON.stringify(p.updatePayload)}`);
  }

  if (!apply) {
    console.log('\nDRY RUN — zero writes made. Re-run with --apply to perform the UPDATEs.');
    return { examined, corruptedCount: corrupted.length, updated: 0, skipped: skippedUnresolvable, failed: 0, wouldUpdate };
  }

  let updated = 0;
  let failed = 0;
  for (const p of plan) {
    const { error } = await sb
      .from('sub_agent_execution_results')
      .update(p.updatePayload)
      .eq('id', p.id);
    if (error) {
      failed++;
      console.error(`  ✗ id=${p.id} update failed: ${error.message}`);
    } else {
      updated++;
    }
  }
  console.log(`[backfill-corrupted-subagent-repo-paths] APPLIED: updated=${updated} skipped_unresolvable=${skippedUnresolvable} failed=${failed}`);
  return { examined, corruptedCount: corrupted.length, updated, skipped: skippedUnresolvable, failed };
}

if (isMainModule(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  main({ apply }).catch((err) => {
    console.error('[backfill-corrupted-subagent-repo-paths] fatal:', err.message);
    process.exitCode = 1;
  });
}
