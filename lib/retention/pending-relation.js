/**
 * QF-20260913-915: distinguish a relation that is genuinely missing (a real reaper defect)
 * from one whose creating migration is a KNOWN wait state -- CEREMONY_PENDING (chairman-gated,
 * merged but not yet applied) or DEFERRED (disposition ledger, reason + not expired).
 *
 * Deliberately cheap: no live-DB apply-state classification here. The caller (enforcePolicy)
 * only invokes this AFTER a count-mode query has already proven the relation does not exist,
 * so for a chairman-gated creating file, CEREMONY_PENDING follows from the path alone -- the
 * full verifier's "is it actually applied" check is redundant with the fact already in hand.
 */
import path from 'node:path';
import { loadLedger, isSuppressingEntry } from '../../scripts/lib/migration-disposition-ledger.mjs';

const CHAIRMAN_GATED_PREFIX = 'database/chairman-gated/';

/**
 * @param {string|undefined} pendingFile repo-relative path to the table's creating migration
 * @param {string} [ledgerPath] injection point for tests; production callers omit it
 * @returns {'CEREMONY_PENDING'|'DEFERRED'|null} null when there is no known wait-state reason
 */
export function resolvePendingRelationStatus(pendingFile, ledgerPath = undefined) {
  if (!pendingFile) return null;
  if (pendingFile.startsWith(CHAIRMAN_GATED_PREFIX)) return 'CEREMONY_PENDING';
  const ledger = ledgerPath === undefined ? loadLedger() : loadLedger(ledgerPath);
  const entry = ledger.get(path.basename(pendingFile));
  if (isSuppressingEntry(entry) && entry.disposition === 'DEFERRED') return 'DEFERRED';
  return null;
}
