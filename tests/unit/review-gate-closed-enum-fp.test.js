/**
 * Regression test for QF-20260529-237 (feedback a78478f9 + 03ccc4d4).
 *
 * Two closed-enumeration patterns in config/review-critical-findings.json produced
 * false-positive CRITICAL merge-blocks:
 *   - CRIT-005 data_loss: the negative lookahead allow-listed only `.eq`, so a
 *     `.delete()` scoped by `.like()`/`.in()` (test teardown) was flagged.
 *   - CRIT-002 sql_injection: the keyword alternation had no word boundaries, so the
 *     substring INSERT inside the prose word "inserts" matched after an interpolation.
 * The fix broadens the delete allow-list to all supabase filter methods and
 * word-boundaries the SQL keyword alternation. These tests pin both directions:
 * the false positives no longer fire AND genuine signatures still fire.
 */
import { describe, it, expect } from 'vitest';
import { checkCriticalFindings } from '../../lib/ship/review-gate.js';

const names = (diff) => checkCriticalFindings(diff).findings.map((f) => f.name);

describe('review-gate closed-enum false-positive fixes (a78478f9 + 03ccc4d4)', () => {
  // CRIT-005 data_loss — scoped deletes must NOT be flagged; unscoped MUST be.
  it('does NOT flag a .delete() scoped by .like() (the witnessed test-teardown FP)', () => {
    expect(names("+ await sb.from('caps').delete().like('capability_key', 'TEST-%')")).not.toContain('data_loss');
  });
  it('does NOT flag a .delete() scoped by .in()', () => {
    expect(names("+ await sb.from('caps').delete().in('id', staleIds)")).not.toContain('data_loss');
  });
  it('preserves the original .eq() allow-list', () => {
    expect(names("+ await sb.from('caps').delete().eq('id', 1)")).not.toContain('data_loss');
  });
  it('STILL flags a truly unscoped .delete() (no filter)', () => {
    expect(names("+ await sb.from('caps').delete()")).toContain('data_loss');
  });

  // CRIT-002 sql_injection — prose must NOT match; interpolated SQL keyword MUST.
  it('does NOT flag the prose word "inserts" after an interpolation', () => {
    expect(names('+ console.log(`Backfilled ${count} inserts complete`)')).not.toContain('sql_injection');
  });
  it('STILL flags an interpolated SQL keyword (real injection shape)', () => {
    expect(names('+ const sql = `${prefix} DELETE FROM users`;')).toContain('sql_injection');
  });
});
