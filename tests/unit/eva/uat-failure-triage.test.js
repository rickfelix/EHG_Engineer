/**
 * Unit tests for lib/eva/uat-failure-triage.js — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C
 * (FR-4). TS-5: venture-vs-factory classification and routing.
 */
import { describe, it, expect, vi } from 'vitest';
import { triageUatFailure, checkFailureCeiling } from '../../../lib/eva/uat-failure-triage.js';

function buildSupabase({ existing = null, insertedRows = [] } = {}) {
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
            'metadata->>venture_id': undefined,
          })),
        })),
        insert: vi.fn((row) => {
          insertedRows.push(row);
          return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) })) };
        }),
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
});

describe('checkFailureCeiling', () => {
  it('shouldEscalate=false when count is below ceiling', async () => {
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }) })) })) })) })) };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(1);
    expect(result.shouldEscalate).toBe(false);
  });

  it('shouldEscalate=true when count meets or exceeds ceiling', async () => {
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null }) })) })) })) })) };
    const result = await checkFailureCeiling(supabase, 'venture-1', 3);
    expect(result.count).toBe(3);
    expect(result.shouldEscalate).toBe(true);
  });
});
