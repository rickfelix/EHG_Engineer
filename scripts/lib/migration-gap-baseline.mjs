/**
 * Migration RECENT-gap run-history baseline (SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-2).
 *
 * migration-deploy-drift-guard.yml has been loud (::error, non-zero exit) on every push to
 * main and its daily cron since at least 2026-08-17T13:42Z, but that verdict never reaches
 * an actionable ticket -- it only ever lands in CI logs. This module gives the notifier a
 * durable place to remember "which RECENT gap filenames did the LAST run see", so a NEW gap
 * (one not present last time) can be told apart from a gap that has simply not been fixed
 * yet and already has a ticket.
 *
 * Persisted in audit_log rather than a CI-runner-local file: GitHub Actions runners are
 * ephemeral per run, so any state that must survive across runs has to live in the DB
 * (TR-2). Reuses the existing audit_log table rather than adding a new one.
 */

const EVENT_TYPE = 'MIGRATION_RECENT_GAP_BASELINE';

/**
 * Pure diff: files present in `currentFiles` but not in `priorFiles`.
 * @param {string[]} priorFiles
 * @param {string[]} currentFiles
 * @returns {string[]}
 */
export function diffNewGaps(priorFiles, currentFiles) {
  const prior = new Set(priorFiles || []);
  return (currentFiles || []).filter((f) => !prior.has(f));
}

/**
 * Load the most recently recorded RECENT-gap filename set.
 * @param {Object} supabase
 * @returns {Promise<{files: string[], recorded_at: string|null}>}
 */
export async function loadGapBaseline(supabase) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('metadata, created_at')
    .eq('event_type', EVENT_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { files: [], recorded_at: null };
  const files = Array.isArray(data.metadata?.recent_files) ? data.metadata.recent_files : [];
  return { files, recorded_at: data.created_at || null };
}

/**
 * Persist the current RECENT-gap filename set as the new baseline for the next run.
 * Non-fatal on write failure (matches the fail-soft audit pattern in
 * pending-migrations-check.js's recordTierAudit).
 * @param {Object} supabase
 * @param {string[]} files
 */
export async function saveGapBaseline(supabase, files) {
  try {
    await supabase.from('audit_log').insert({
      event_type: EVENT_TYPE,
      entity_type: 'migration_gap_run',
      severity: 'info',
      metadata: { recent_files: [...new Set(files || [])].sort() },
    });
  } catch (e) {
    console.log(`   [GapBaseline] ⚠️ non-fatal: failed to persist baseline: ${e?.message || e}`);
  }
}

export default { diffNewGaps, loadGapBaseline, saveGapBaseline };
