// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-2) -- S1 backup-diff extraction mechanism.
// Part B restore ceremony, incident ba330d67.
//
// PURE MODULE -- given a backup-snapshot row set and the corresponding live row set, produces
// restore candidates for rows where the snapshot's decision_by differs from the live value, and
// validates every candidate via lib/solomon/restore-candidate-validator.js::validateRestoreCandidate
// before it can be marked apply-ready. No candidate is EVER auto-applied by this module -- it only
// classifies.
import { validateRestoreCandidate } from './restore-candidate-validator.js';

/**
 * @typedef {{id: string, decision_by: string|null}} LedgerRow
 * @typedef {{id: string, status: 'apply_ready'|'no_diff'|'missing_in_snapshot'|'invalid_candidate', candidate: string|null, currentDecisionBy: string|null, reason: string}} S1Candidate
 */

/**
 * Pure: diff a backup snapshot against the live row set and classify each live row.
 * @param {LedgerRow[]} snapshotRows - rows read from the restored-project snapshot
 * @param {LedgerRow[]} liveRows - the corresponding rows read from the live table
 * @returns {S1Candidate[]}
 */
export function extractS1Candidates(snapshotRows, liveRows) {
  const snapshotById = new Map(snapshotRows.map((r) => [r.id, r]));
  const results = [];
  for (const liveRow of liveRows) {
    const snapshotRow = snapshotById.get(liveRow.id);
    if (!snapshotRow) {
      results.push({
        id: liveRow.id,
        status: 'missing_in_snapshot',
        candidate: null,
        currentDecisionBy: liveRow.decision_by,
        reason: 'Row not present in the backup snapshot -- no candidate to extract.',
      });
      continue;
    }
    if (snapshotRow.decision_by === liveRow.decision_by) {
      results.push({
        id: liveRow.id,
        status: 'no_diff',
        candidate: snapshotRow.decision_by,
        currentDecisionBy: liveRow.decision_by,
        reason: 'Snapshot and live decision_by are identical -- nothing to restore for this row.',
      });
      continue;
    }
    const verdict = validateRestoreCandidate(snapshotRow.decision_by, liveRow.decision_by);
    results.push({
      id: liveRow.id,
      status: verdict.valid ? 'apply_ready' : 'invalid_candidate',
      candidate: snapshotRow.decision_by,
      currentDecisionBy: liveRow.decision_by,
      reason: verdict.reason,
    });
  }
  return results;
}
