/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-3 (QF-20260904-724): TS-5c / AC-9
 * (DB-tier half). resolveHoldProvenance's own docblock has conceded since July that "writers
 * SHOULD stamp requires_human_action_reason" is an expectation, not an enforcement -- this test
 * makes the divergence self-detecting instead of relying on a future human noticing a new writer
 * key the reader does not know about.
 *
 * A "reason-shaped" key is any top-level strategic_directives_v2.metadata key matching /_reason$/,
 * OR an explicit named allowlist for flag-shaped keys that are also reason-shaped in intent
 * (human_action_note, human_action_required). KNOWN_BENIGN_EXCLUSIONS lists reason-shaped keys
 * that are deliberately NOT hold provenance (e.g. a dedup rationale, not a claim-eligibility gate).
 *
 * Routed to the opt-in `db` vitest project via the `.db.test.js` suffix, so a no-DB `npm test`
 * run skips it cleanly (HAS_REAL_DB fails closed with nothing designated by default -- see
 * tests/helpers/db-available.js's own documented posture). Read-only: this test writes nothing.
 */
import { describe, it, expect } from 'vitest';
import { HAS_REAL_DB } from '../../helpers/db-available.js';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.cjs';

const describeDb = describe.skipIf(!HAS_REAL_DB);

const { HOLD_REASON_KEYS } = await import('../../../lib/fleet/claim-eligibility.cjs');

const REASON_SHAPED_RE = /_reason$/;
const REASON_SHAPED_ALLOWLIST = new Set(['human_action_note', 'human_action_required']);

/** Known reason-shaped-by-name keys that are NOT hold provenance (a different concern entirely). */
const KNOWN_BENIGN_EXCLUSIONS = new Set([
  'dedup_judgement',
  'coordinator_review_reason', // distinct from needs_coordinator_review_reason -- an audit note, not a gate
  'unfenced_reason',
  'human_action_review_at', // set-at timestamp, not a reason string, despite the name pattern miss
]);

function isReasonShaped(key) {
  return REASON_SHAPED_RE.test(key) || REASON_SHAPED_ALLOWLIST.has(key);
}

describeDb('QF-20260904-724 FR-3: live metadata key drift vs HOLD_REASON_KEYS (TS-5c / AC-9 db half)', () => {
  it('AC-9: every live reason-shaped metadata key is either in HOLD_REASON_KEYS or the known-benign exclusion list', async () => {
    const supabase = createSupabaseServiceClient();
    const known = new Set([...HOLD_REASON_KEYS, ...KNOWN_BENIGN_EXCLUSIONS]);
    const unrecognized = new Set();

    let from = 0;
    const pageSize = 500;
    // Paginate defensively rather than trust an unbounded .select() on a 755-table production DB.
    for (;;) {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('metadata')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        for (const key of Object.keys(row.metadata || {})) {
          if (isReasonShaped(key) && !known.has(key)) unrecognized.add(key);
        }
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }

    expect([...unrecognized]).toEqual([]);
  });
});
