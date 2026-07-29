/**
 * SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-1/FR-2 — query-error discipline.
 *
 * The point of this suite is NOT "does it throw". A wrapper that throws on everything would
 * satisfy a naive test while being useless. TS-W3 and TS-W4 are the negative controls that
 * prove it DISCRIMINATES: a real table still returns its count, and a genuinely empty (but
 * existing) table still returns an empty result without throwing. Without those two, TS-W1/TS-W2
 * prove nothing about which half of the wrapper is doing the work.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeQuery, safeCount, assertToleranceReason } from '../../../lib/db/safe-query.mjs';

// Shapes observed against the LIVE database, not invented:
//   missing column  -> data null, error 42703 'column X does not exist'   (HTTP 400)
//   missing table   -> count null, error null                            (HTTP 204)
//   real table      -> count <number>, error null                        (HTTP 206)
const missingColumn = () => Promise.resolve({ data: null, error: { code: '42703', message: 'column sd_phase_handoffs.score does not exist' } });
const okRows = rows => Promise.resolve({ data: rows, error: null });
const missingTableCount = () => Promise.resolve({ count: null, error: null });
const realTableCount = n => Promise.resolve({ count: n, error: null });

describe('safeQuery — a rejected query must not read as absence (TS-W1)', () => {
  it('THROWS on a PostgREST error instead of yielding null', async () => {
    await expect(safeQuery(missingColumn(), { site: 'test-site' }))
      .rejects.toThrow(/QUERY_FAILED at test-site/);
  });

  it('names the offending column, so the fault is diagnosable from the record', async () => {
    await expect(safeQuery(missingColumn(), { site: 'test-site' }))
      .rejects.toThrow(/column sd_phase_handoffs\.score does not exist/);
  });

  // TS-W4 — the control that matters most for safeQuery.
  it('returns rows normally on success, and an EMPTY array without throwing', async () => {
    expect(await safeQuery(okRows([{ id: 1 }]), { site: 's' })).toEqual([{ id: 1 }]);
    // A genuinely empty result is a legal answer and must pass through untouched. If this
    // throws, the wrapper is failing more often rather than discriminating.
    expect(await safeQuery(okRows([]), { site: 's' })).toEqual([]);
  });
});

describe('safeCount — the sub-shape with NO error to throw on (TS-W2)', () => {
  it('THROWS when count is null even though error is null (missing relation)', async () => {
    // This is the case a throw-on-error-only wrapper would pass straight through, shipping the
    // defect inside the fix meant to remove it.
    await expect(safeCount(missingTableCount(), { site: 'probe' }))
      .rejects.toThrow(/COUNT_UNMEASURABLE at probe/);
  });

  it('says WHICH half failed rather than collapsing the two diagnoses', async () => {
    await expect(safeCount(missingTableCount(), { site: 'probe' }))
      .rejects.toThrow(/count is null with no error/);
    await expect(safeCount(Promise.resolve({ count: null, error: { message: 'boom' } }), { site: 'probe' }))
      .rejects.toThrow(/boom/);
  });

  // TS-W3 — the negative control. Without this, TS-W2 is satisfied by throwing on all counts.
  it('returns the count for a REAL table, and returns 0 for a genuinely EMPTY one', async () => {
    expect(await safeCount(realTableCount(1155), { site: 'probe' })).toBe(1155);
    // The whole discrimination in one assertion: 0 is a measured answer, null is a failed
    // measurement. Coercing the second into the first is the original defect.
    expect(await safeCount(realTableCount(0), { site: 'probe' })).toBe(0);
  });
});

describe('opt-out requires a REASON STRING, never a boolean (TS-5, TS-6 / FR-2)', () => {
  it('REFUSES a boolean opt-out loudly', () => {
    expect(() => assertToleranceReason(true, 'site')).toThrow(/TOLERATE_REASON_REQUIRED/);
    expect(() => assertToleranceReason(false, 'site')).toThrow(/TOLERATE_REASON_REQUIRED/);
  });

  it('REFUSES an empty or whitespace-only reason — the boolean shape wearing a string costume', () => {
    expect(() => assertToleranceReason('', 'site')).toThrow(/TOLERATE_REASON_REQUIRED/);
    expect(() => assertToleranceReason('   ', 'site')).toThrow(/TOLERATE_REASON_REQUIRED/);
  });

  it('accepts a real reason and returns it trimmed, so it can be recorded and counted', () => {
    expect(assertToleranceReason('  best-effort telemetry, absence is expected  ', 'site'))
      .toBe('best-effort telemetry, absence is expected');
  });

  it('treats no opt-out as no opt-out (undefined/null are not silences)', () => {
    expect(assertToleranceReason(undefined, 'site')).toBeNull();
    expect(assertToleranceReason(null, 'site')).toBeNull();
  });
});

describe('a tolerated call site degrades to null, but says so on stderr', () => {
  let writes;
  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(s => { writes.push(s); return true; });
  });
  afterEach(() => vi.restoreAllMocks());

  it('safeQuery returns null and records the reason', async () => {
    const out = await safeQuery(missingColumn(), { site: 'tolerated-site', tolerate: 'optional lookup; absence is expected' });
    expect(out).toBeNull();
    expect(writes.join('')).toMatch(/TOLERATED at tolerated-site/);
    expect(writes.join('')).toMatch(/optional lookup; absence is expected/);
  });

  it('safeCount does the same for the errorless-null-count shape', async () => {
    const out = await safeCount(missingTableCount(), { site: 'tolerated-probe', tolerate: 'table is created lazily' });
    expect(out).toBeNull();
    expect(writes.join('')).toMatch(/table is created lazily/);
  });

  it('a boolean opt-out is still refused even at a call site that meant well', async () => {
    await expect(safeQuery(missingColumn(), { site: 's', tolerate: true }))
      .rejects.toThrow(/TOLERATE_REASON_REQUIRED/);
  });
});
