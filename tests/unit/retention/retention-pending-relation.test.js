/**
 * QF-20260913-915: a relation absent because its creating migration is a KNOWN wait state
 * (CEREMONY_PENDING -- chairman-gated, merged but unapplied; or DEFERRED -- disposition
 * ledger, reason + not expired) must not read as a reaper defect. A relation absent with no
 * such disposition still fails exactly as before.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePendingRelationStatus } from '../../../lib/retention/pending-relation.js';
import { enforcePolicy } from '../../../scripts/retention-enforce.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_LEDGER = path.join(__dirname, 'fixtures', 'pending-relation-ledger.json');

function countUnmeasurableChain() {
  const chain = {
    select: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (_resolve, reject) => {
      const err = new Error(
        'Supabase schema drift detected (count unmeasurable): a count-mode query resolved with '
        + 'count=null and no error'
      );
      err.code = 'COUNT_UNMEASURABLE';
      return reject(err);
    },
  };
  return chain;
}

function okChain(count = 0) {
  const chain = {
    select: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve) => resolve({ count, data: [], error: null }),
  };
  return chain;
}

describe('resolvePendingRelationStatus', () => {
  it('a chairman-gated pendingFile resolves CEREMONY_PENDING without consulting the ledger at all', () => {
    expect(resolvePendingRelationStatus('database/chairman-gated/20260826_browser_actuation_session_cap.sql')).toBe('CEREMONY_PENDING');
  });

  it('a non-gated pendingFile with a valid, non-expired DEFERRED ledger entry resolves DEFERRED', () => {
    expect(resolvePendingRelationStatus('database/migrations/20990101_valid_deferred.sql', FIXTURE_LEDGER)).toBe('DEFERRED');
  });

  it('an EXPIRED DEFERRED entry (review_by in the past) resolves null -- a lapsed deferral is a real gap again', () => {
    expect(resolvePendingRelationStatus('database/migrations/20990101_expired_deferred.sql', FIXTURE_LEDGER)).toBe(null);
  });

  it('a RETIRED entry resolves null -- only DEFERRED is a pending wait state, not every suppressing disposition', () => {
    expect(resolvePendingRelationStatus('database/migrations/20990101_retired.sql', FIXTURE_LEDGER)).toBe(null);
  });

  it('a pendingFile with no ledger entry at all resolves null', () => {
    expect(resolvePendingRelationStatus('database/migrations/20990101_unknown.sql', FIXTURE_LEDGER)).toBe(null);
  });

  it('no pendingFile declared resolves null', () => {
    expect(resolvePendingRelationStatus(undefined)).toBe(null);
  });
});

describe('enforcePolicy — COUNT_UNMEASURABLE with a pendingFile (QF-20260913-915)', () => {
  const policyBase = { table: 't', timestampColumn: 'created_at', hotDays: 90, mode: 'archive', perRunCap: 100 };

  it('CEREMONY_PENDING: reports status=pending_relation, sets no error', async () => {
    const supabase = { from: () => countUnmeasurableChain() };
    const policy = { ...policyBase, pendingFile: 'database/chairman-gated/20260826_browser_actuation_session_cap.sql' };
    const result = await enforcePolicy(supabase, policy, { apply: false });
    expect(result.error).toBe(null);
    expect(result.status).toBe('pending_relation');
    expect(result.pendingReason).toBe('CEREMONY_PENDING');
    expect(result.pendingFile).toBe(policy.pendingFile);
  });

  it('REGRESSION: no pendingFile declared still fails exactly as before (error set, no silent pass)', async () => {
    const supabase = { from: () => countUnmeasurableChain() };
    const policy = { ...policyBase };
    const result = await enforcePolicy(supabase, policy, { apply: false });
    expect(result.status).toBeUndefined();
    expect(result.error).toMatch(/count unmeasurable/i);
  });

  it('REGRESSION: a pendingFile that resolves to no known wait state still fails (a real gap, not silenced)', async () => {
    const supabase = { from: () => countUnmeasurableChain() };
    const policy = { ...policyBase, pendingFile: 'database/migrations/20990101_unknown_not_in_ledger.sql' };
    const result = await enforcePolicy(supabase, policy, { apply: false });
    expect(result.status).toBeUndefined();
    expect(result.error).toMatch(/count unmeasurable/i);
  });

  it('REGRESSION: a present relation with a pendingFile declared is entirely unaffected', async () => {
    const supabase = { from: () => okChain(0) };
    const policy = { ...policyBase, pendingFile: 'database/chairman-gated/20260826_browser_actuation_session_cap.sql' };
    const result = await enforcePolicy(supabase, policy, { apply: false });
    expect(result.status).toBeUndefined();
    expect(result.error).toBe(null);
    expect(result.eligible).toBe(0);
  });
});
