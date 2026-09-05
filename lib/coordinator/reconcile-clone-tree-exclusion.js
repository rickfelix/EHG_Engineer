/**
 * Bidirectional clone-tree-exclusion reconciliation.
 * SD-LEO-INFRA-CLONE-TREE-EXCLUSION-FAIL-OPEN-LEAK-001 (FR-2).
 *
 * Reconciles strategic_directives_v2.metadata.test_clone_build_tree against the
 * ventures.seeded_from_venture_id GROUND TRUTH for every SD that carries a metadata.venture_id:
 *   (a) a CLONE venture (seeded_from_venture_id NOT NULL) whose SD is UNMARKED  -> MARK it
 *       (catches a tree that leaked onto the belt before the FR-1 fix, or via any other path), and
 *   (b) a REAL venture (seeded_from_venture_id IS NULL) whose SD is MARKED      -> UN-MARK it
 *       (corrects an FR-1 fail-closed false-positive so a real venture is not stranded out of
 *       worker self-claim).
 *
 * dryRun=true by default — reports counts without mutating. Fail-soft per item; idempotent (a row
 * already in the correct state is a no-op).
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { mergeMetadataKeys, removeMetadataKey } from './safe-metadata-merge.mjs';

const TERMINAL_SD_STATUSES = ['completed', 'cancelled', 'archived'];

const isMarked = (sd) => (sd && sd.metadata && sd.metadata.test_clone_build_tree) === true;

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {boolean} [opts.dryRun=true]
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{ dryRun: boolean, scanned: number, marked: number, unmarked: number, errors: string[] }>}
 */
export async function reconcileCloneTreeExclusion({ supabase, dryRun = true, log = () => {}, mergeMetadataKeysFn = mergeMetadataKeys, removeMetadataKeyFn = removeMetadataKey } = {}) {
  const summary = { dryRun, scanned: 0, marked: 0, unmarked: 0, errors: [] };
  if (!supabase) { summary.errors.push('no_supabase'); return summary; }

  // SDs that carry a venture_id and are not terminal (terminal SDs need no belt reconciliation).
  // FR-6 (count-truncation discipline): this read GUARDS mark/unmark mutations — paginate to
  // completion so a PostgREST-capped page can never hide rows; on failure SKIP reconciliation
  // (same errors.push + return policy the raw error took).
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, metadata')
      .not('metadata->>venture_id', 'is', null)
      .not('status', 'in', `(${TERMINAL_SD_STATUSES.join(',')})`)
      .order('id')); // unique-key tiebreaker for stable pagination
  } catch (sdErr) { summary.errors.push(`sd_read: ${sdErr.message}`); return summary; }
  if (!sds || sds.length === 0) { log('[reconcile] no venture-linked SDs to reconcile'); return summary; }

  // Ground truth: seeded_from_venture_id per venture_id (a single batched read).
  const ventureIds = [...new Set(sds.map((sd) => sd.metadata && sd.metadata.venture_id).filter(Boolean))];
  const { data: ventures, error: vErr } = await supabase
    .from('ventures')
    .select('id, seeded_from_venture_id')
    .in('id', ventureIds);
  if (vErr) { summary.errors.push(`ventures_read: ${vErr.message}`); return summary; }
  const isClone = new Map((ventures || []).map((v) => [v.id, v.seeded_from_venture_id != null]));

  for (const sd of sds) {
    const ventureId = sd.metadata && sd.metadata.venture_id;
    if (!isClone.has(ventureId)) continue; // venture row missing -> leave the marker untouched (no ground truth)
    summary.scanned++;
    const clone = isClone.get(ventureId);
    const marked = isMarked(sd);

    // SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001: both branches used to spread sd.metadata
    // whole (or delete a key from a local copy) and full-blob .update({metadata:...}) -- a
    // TOCTOU race against any concurrent stamper (claim-stamp.cjs, dispatch.cjs, ...) between
    // the batch read above and this per-row write. mergeMetadataKeys/removeMetadataKey touch
    // ONLY test_clone_build_tree via an atomic server-side jsonb operation.
    if (clone && !marked) {
      // leaked clone tree -> mark + exclude
      log(`[reconcile] ${dryRun ? 'WOULD mark' : 'marking'} ${sd.sd_key} (clone venture ${ventureId}, was unmarked)`);
      if (!dryRun) {
        const { merged, error } = await mergeMetadataKeysFn(sd.sd_key, { test_clone_build_tree: true });
        if (!merged) { summary.errors.push(`mark ${sd.sd_key}: ${error || 'no row matched'}`); continue; }
      }
      summary.marked++;
    } else if (!clone && marked) {
      // real venture wrongly marked (FR-1 fail-closed false-positive) -> un-mark + restore claimability
      log(`[reconcile] ${dryRun ? 'WOULD un-mark' : 'un-marking'} ${sd.sd_key} (real venture ${ventureId}, was marked)`);
      if (!dryRun) {
        const { removed, error } = await removeMetadataKeyFn(sd.sd_key, 'test_clone_build_tree');
        if (!removed) { summary.errors.push(`unmark ${sd.sd_key}: ${error || 'no row matched'}`); continue; }
      }
      summary.unmarked++;
    }
    // else: already in the correct state -> no-op (idempotent)
  }

  log(`[reconcile] ${dryRun ? '(dry-run) ' : ''}scanned=${summary.scanned} marked=${summary.marked} unmarked=${summary.unmarked} errors=${summary.errors.length}`);
  return summary;
}

export default { reconcileCloneTreeExclusion };
