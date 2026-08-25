/**
 * Unit tests for lib/eva/uat-failure-triage.js — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C
 * (FR-4). TS-5: venture-vs-factory classification and routing.
 *
 * SECURITY sub-agent finding S1 (EXEC-TO-PLAN evidence): recordFactoryDefect's dedup hash does
 * not include venture_id (correct for ITS contract -- one row per broken factory instrument,
 * shared across every venture) so checkFailureCeiling previously undercounted: after 5 real
 * failures for the SAME venture, only 1 feedback row ever existed (failures 2-5 deduped), and
 * a DIFFERENT venture hitting the SAME gap_class would read count:0 forever, sharing that one
 * row. The tests below exercise the corrected per-venture occurrence-bumping fix.
 */
import { describe, it, expect, vi } from 'vitest';
import { triageUatFailure, checkFailureCeiling } from '../../../lib/eva/uat-failure-triage.js';

function buildSupabase({ existing = null, insertedRows = [], feedbackRow = { metadata: {} } } = {}) {
  return {
    from: vi.fn((table) => {
      if (table !== 'feedback') throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
                })),
              })),
            })),
            single: vi.fn().mockResolvedValue({ data: feedbackRow, error: null }),
          })),
        })),
        insert: vi.fn((row) => {
          insertedRows.push(row);
          return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) })) };
        }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      };
    }),
  };
}

describe('triageUatFailure', () => {
  it('TS-5: routes a mechanism error to factory_defect', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ insertedRows });
    const result = await triageUatFailure(supabase, {
      ventureId: 'venture-1',
      sourceSdId: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C',
      mechanismError: true,
      journeyExecuted: false,
      title: 'Fencing check errored',
    });
    expect(result.side).toBe('factory_defect');
    expect(insertedRows[0].category).toBe('factory_defect');
  });

  it('TS-5: routes a genuinely executed, failing journey to venture_defect', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ insertedRows });
    const result = await triageUatFailure(supabase, {
      ventureId: 'venture-1',
      sourceSdId: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C',
      mechanismError: false,
      journeyExecuted: true,
      title: 'Checkout button broken',
    });
    expect(result.side).toBe('venture_defect');
    expect(insertedRows[0].category).toBe('venture_defect');
  });

  it('S1 regression: a factory-defect dedup hit still bumps this venture\'s own occurrence count on the shared row', async () => {
    const insertedRows = [];
    const existingSharedRow = { id: 'shared-factory-row', metadata: { uat_venture_occurrences: { 'venture-A': 2 } } };
    const supabase = buildSupabase({ existing: existingSharedRow, insertedRows, feedbackRow: existingSharedRow });
    let capturedUpdate = null;
    const realFrom = supabase.from;
    supabase.from = (table) => {
      const chain = realFrom(table);
      const originalUpdate = chain.update;
      chain.update = vi.fn((payload) => { capturedUpdate = payload; return originalUpdate(payload); });
      return chain;
    };
    await triageUatFailure(supabase, {
      ventureId: 'venture-A',
      sourceSdId: 'SD-X',
      mechanismError: true,
      journeyExecuted: false,
      title: 'same broken instrument, venture-A again',
    });
    expect(insertedRows).toHaveLength(0); // dedup hit -- no new row, matches recordFactoryDefect's contract
    expect(capturedUpdate.metadata.uat_venture_occurrences['venture-A']).toBe(3); // 2 -> 3, not reset/lost
  });
});

describe('checkFailureCeiling', () => {
  it('shouldEscalate=false when this venture\'s summed occurrence count is below ceiling', async () => {
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [{ metadata: { uat_venture_occurrences: { 'venture-1': 1 } } }], error: null }) })) })) })) })) };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(1);
    expect(result.shouldEscalate).toBe(false);
  });

  it('shouldEscalate=true when this venture\'s occurrence count meets or exceeds ceiling, even from a SINGLE shared row', async () => {
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [{ metadata: { uat_venture_occurrences: { 'venture-1': 3 } } }], error: null }) })) })) })) })) };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(3);
    expect(result.shouldEscalate).toBe(true);
  });

  it('S1 regression: a DIFFERENT venture\'s occurrences on a shared row never leak into this venture\'s count', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [{ metadata: { uat_venture_occurrences: { 'venture-OTHER': 10 } } }],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(0);
    expect(result.shouldEscalate).toBe(false);
  });

  it('sums occurrences across multiple factory-defect rows for the same venture', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { metadata: { uat_venture_occurrences: { 'venture-1': 2 } } },
                  { metadata: { uat_venture_occurrences: { 'venture-1': 1 } } },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(3);
    expect(result.shouldEscalate).toBe(true);
  });
});
