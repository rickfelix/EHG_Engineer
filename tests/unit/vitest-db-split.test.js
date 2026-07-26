/**
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 — unit coverage for the db/no-db split.
 *
 * Pure, no-DB tests for:
 *   - the FR-3 audit predicate (isUnguardedDbTest) — TS-3
 *   - the FR-1 shared helper exports (HAS_REAL_DB / describeDb / itDb)
 *
 * This file itself must NOT touch a DB (it belongs to the no-DB `unit` project),
 * so it asserts on the detection logic rather than running a connection.
 */
import { describe, it, expect } from 'vitest';
import { isUnguardedDbTest, DB_IMPORT_SIGNAL, GUARD_SIGNAL } from '../../scripts/audit-db-test-guards.mjs';
import { HAS_REAL_DB, describeDb, itDb, DB_TARGET_IS_DESIGNATED, assessDbTarget } from '../helpers/db-available.js';

describe('FR-3 audit: isUnguardedDbTest', () => {
  it('flags a DB-touching test with no skip guard (TS-3)', () => {
    const src = `
      import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
      const supabase = createSupabaseServiceClient();
      describe('queries', () => {
        it('reads a row', async () => { const { data } = await supabase.from('t').select('*'); });
      });
    `;
    expect(isUnguardedDbTest(src)).toBe(true);
  });

  it('does NOT flag a DB test guarded by describeDb', () => {
    const src = `
      import { createClient } from '@supabase/supabase-js';
      import { describeDb } from '../helpers/db-available.js';
      describeDb('queries', () => { it('reads', () => {}); });
    `;
    expect(isUnguardedDbTest(src)).toBe(false);
  });

  it('does NOT flag a DB test guarded by an inline HAS_REAL_DB skipIf', () => {
    const src = `
      import { createClient } from '@supabase/supabase-js';
      const HAS_REAL_DB = !!process.env.SUPABASE_URL;
      describe.skipIf(!HAS_REAL_DB)('queries', () => {});
    `;
    expect(isUnguardedDbTest(src)).toBe(false);
  });

  it('does NOT flag a pure-logic test that never touches a client or SUPABASE_URL', () => {
    const src = `
      import { describe, it, expect } from 'vitest';
      import { add } from '../../lib/math.js';
      describe('add', () => { it('sums', () => expect(add(1,2)).toBe(3)); });
    `;
    expect(isUnguardedDbTest(src)).toBe(false);
  });

  it('exposes the import + guard signal regexes', () => {
    expect(DB_IMPORT_SIGNAL.test('createSupabaseServiceClient()')).toBe(true);
    expect(GUARD_SIGNAL.test('describe.skipIf(!HAS_REAL_DB)')).toBe(true);
  });
});

describe('FR-1 shared helper: tests/helpers/db-available.js', () => {
  it('exports HAS_REAL_DB as a boolean', () => {
    expect(typeof HAS_REAL_DB).toBe('boolean');
  });

  it('exports describeDb and itDb as callable suite/test wrappers', () => {
    expect(typeof describeDb).toBe('function');
    expect(typeof itDb).toBe('function');
  });

  it('HAS_REAL_DB agrees with the SAFETY predicate for the current env (QF-20260726-459)', () => {
    // REPLACED, not patched around. This assertion used to RE-DERIVE the old sentinel predicate
    // inline —
    //   Boolean(url && !url.includes('test.invalid.local') && key && !key.includes('...not-real'))
    // — and assert HAS_REAL_DB matched it. Two problems, and the second is why the defect survived:
    //   1. it pinned the DEFECT. That predicate answers "is a real DB reachable?", which is TRUE for
    //      production, so the assertion actively certified the behaviour QF-459 exists to remove.
    //   2. it was a PARALLEL RE-DERIVATION of the thing under test. Re-implementing the predicate in
    //      the test means the test agrees with the implementation by construction and can never
    //      detect that the implementation asks the wrong question.
    // The subject of this test is the guard itself, so when the guard's contract deliberately
    // changed, this had to change with it. It now asserts the identity that actually matters.
    expect(HAS_REAL_DB).toBe(DB_TARGET_IS_DESIGNATED);
    expect(HAS_REAL_DB).toBe(assessDbTarget(process.env).allowed);
  });

  it('fails closed in this environment: no designated target means no DB tests run', () => {
    // The unit project injects the synthetic sentinel, so the target is unrecognisable and the
    // guard must refuse. Pinning the REASON, not just the false, so a future always-skip regression
    // (which would also produce false) is distinguishable from a correct refusal.
    const r = assessDbTarget(process.env);
    expect(r.allowed).toBe(false);
    expect(['unrecognised_target', 'no_designated_target', 'no_supabase_url', 'no_service_role_key'])
      .toContain(r.reason);
  });
});
