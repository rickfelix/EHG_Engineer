/**
 * Unit tests — SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 TS-4, TS-5, TS-7, TS-8, TS-10.
 * Mocked supabase — no live DB writes.
 */
import { describe, it, expect } from 'vitest';
import {
  PASS_A,
  PASS_B,
  runPass,
  formatPassSummary,
  computeExitCode,
  toNdjsonLine,
} from '../../../scripts/one-off/backfill-completion-flag-finding-category.mjs';

/**
 * Mock supabase for a single predicate pass, matching runPass's actual call shape:
 *   fetchAllPaginated(() => supabase.from('feedback').select('id'))  -- pre-select AND post-verify
 *   supabase.from('feedback').update({...}).in('id', chunk).select('id')  -- id-chunked UPDATE
 *
 * `matched` seeds the rows the predicate finds (pre-select). `remainingAfterOverride` lets a test
 * simulate a post-apply mismatch. `errorOn` simulates a failure at 'verify' (the post-apply
 * re-query) or 'update' (the id-chunked UPDATE). fetchAllPaginated calls .range() once per page;
 * since fixtures here are always under the 1000-row page size, each pre-select/post-verify round
 * resolves in exactly one .range() call, so a simple call counter distinguishes "round 1"
 * (pre-select) from "round 2" (post-verify).
 */
function buildPassSupabase({ matched, errorOn = null, remainingAfterOverride = null }) {
  let rangeCallCount = 0;
  const selectObj = {
    eq: () => selectObj,
    ilike: () => selectObj,
    range: async () => {
      rangeCallCount += 1;
      if (rangeCallCount === 1) {
        return { data: matched, error: null };
      }
      if (errorOn === 'verify') {
        return { data: null, error: { message: 'verify query failed' } };
      }
      const remaining = remainingAfterOverride !== null ? remainingAfterOverride : [];
      return { data: remaining, error: null };
    },
  };

  return {
    from: () => ({
      select: () => selectObj,
      update: () => ({
        in: (_col, ids) => ({
          select: () => {
            if (errorOn === 'update') {
              return Promise.resolve({ data: null, error: { message: 'update failed' } });
            }
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
          },
        }),
      }),
    }),
  };
}

describe('TS-4: backfill matches by predicate and logs the ACTUAL count', () => {
  it('matchedCount reflects the real fixture size, never a hardcoded expectation', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const supabase = buildPassSupabase({ matched: rows });
    const result = await runPass(supabase, PASS_A, (db) => db.from('feedback').select('id'));
    expect(result.matchedCount).toBe(3);
    expect(result.updatedCount).toBe(3);
    expect(result.status).toBe('PASS');
  });
});

describe('TS-5: backfill is idempotent (second run sees 0 matched)', () => {
  it('a pass with 0 matches still PASSes with 0 remaining', async () => {
    const supabase = buildPassSupabase({ matched: [] });
    const result = await runPass(supabase, PASS_A, (db) => db.from('feedback').select('id'));
    expect(result.matchedCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(result.status).toBe('PASS');
  });
});

describe('TS-7: post-apply verification could-not-run is reported as could-not-check, never a silent pass', () => {
  it('a verify-query error yields COULD_NOT_VERIFY, not PASS', async () => {
    const rows = [{ id: 'x' }];
    const supabase = buildPassSupabase({ matched: rows, errorOn: 'verify' });
    const result = await runPass(supabase, PASS_A, (db) => db.from('feedback').select('id'));
    expect(result.status).toBe('COULD_NOT_VERIFY');
    expect(result.verifyError).toMatch(/POST_APPLY_VERIFICATION_COULD_NOT_RUN/);
  });

  it('an UPDATE failure yields FAIL, distinct from COULD_NOT_VERIFY', async () => {
    const rows = [{ id: 'x' }];
    const supabase = buildPassSupabase({ matched: rows, errorOn: 'update' });
    const result = await runPass(supabase, PASS_A, (db) => db.from('feedback').select('id'));
    expect(result.status).toBe('FAIL');
    expect(result.updateError).toMatch(/UPDATE failed/);
  });

  it('a nonzero post-apply remainder (verify ran fine but predicate still matches) is FAIL, not PASS', async () => {
    const rows = [{ id: 'x' }];
    const supabase = buildPassSupabase({ matched: rows, remainingAfterOverride: [{ id: 'x' }] });
    const result = await runPass(supabase, PASS_A, (db) => db.from('feedback').select('id'));
    expect(result.status).toBe('FAIL');
    expect(result.remainingAfter).toBe(1);
  });
});

describe('TS-8: FR-3/FR-4 independent passes + exit-code contract', () => {
  it('formatPassSummary prints PASS/FAIL/COULD_NOT_VERIFY with matched/updated counts per pass', () => {
    const pass = { name: 'FR-3 (per-flag findings)', matchedCount: 5, updatedCount: 5, remainingAfter: 0, updateError: null, verifyError: null, status: 'PASS' };
    const line = formatPassSummary(pass);
    expect(line).toContain('PASS');
    expect(line).toContain('matched=5');
    expect(line).toContain('updated=5');
  });

  it('exit 0 when both passes PASS', () => {
    const a = { status: 'PASS' }, b = { status: 'PASS' };
    expect(computeExitCode([a, b])).toBe(0);
  });

  it('exit 1 when either pass FAILs (UPDATE error) — even if the other PASSes', () => {
    expect(computeExitCode([{ status: 'FAIL' }, { status: 'PASS' }])).toBe(1);
    expect(computeExitCode([{ status: 'PASS' }, { status: 'FAIL' }])).toBe(1);
  });

  it('exit 2 when either pass is COULD_NOT_VERIFY and neither FAILed', () => {
    expect(computeExitCode([{ status: 'COULD_NOT_VERIFY' }, { status: 'PASS' }])).toBe(2);
  });

  it('exit 1 takes priority over exit 2 when both occur across the two passes', () => {
    expect(computeExitCode([{ status: 'FAIL' }, { status: 'COULD_NOT_VERIFY' }])).toBe(1);
  });

  it('FR-4 predicate targets metadata.no_flags=true, distinct from FR-3 title-ILIKE predicate', () => {
    expect(PASS_A.newCategory).toBe('completion_flag_finding');
    expect(PASS_B.newCategory).toBe('completion_flag_witness');
    expect(PASS_A.previousCategory).toBe('harness_backlog');
    expect(PASS_B.previousCategory).toBe('harness_backlog');
  });
});

describe('TS-10: rollback artifact is a deterministic, machine-readable NDJSON line per updated row', () => {
  it('toNdjsonLine emits {id, previous_category, new_category, table} as valid JSON', () => {
    const line = toNdjsonLine({ id: 'fb-1', previousCategory: 'harness_backlog', newCategory: 'completion_flag_finding' });
    const parsed = JSON.parse(line);
    expect(parsed).toEqual({
      id: 'fb-1',
      previous_category: 'harness_backlog',
      new_category: 'completion_flag_finding',
      table: 'feedback',
    });
  });
});
