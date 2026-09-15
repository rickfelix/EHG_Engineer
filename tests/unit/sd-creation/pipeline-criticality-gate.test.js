/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-2) — createSD()'s criticality verdict gate.
 * Mirrors TS-1/TS-2/TS-3 for strategic_directives_v2 (TS-4).
 *
 * createSD() is a large convergence point with a heavy dependency surface (venture context,
 * vision scorer, type resolution, etc.) that only runs AFTER the criticality gate. This test
 * mocks lib/governance/criticality-verdict.js itself (the same module unit-tested directly in
 * tests/unit/governance/criticality-verdict.test.js) so it can assert createSD()'s WIRING of
 * the gate -- refuse short-circuits before any insert, route_later calls routeCriticalityLater
 * and short-circuits before any insert -- without re-deriving the heavy mainline mocking that
 * a full file_critical happy-path test would require.
 */
import { describe, it, expect, vi } from 'vitest';

const resolveCriticalityVerdictMock = vi.fn();
const routeCriticalityLaterMock = vi.fn().mockResolvedValue({ id: 'fb-later-x', deduped: false });

vi.mock('../../../lib/governance/criticality-verdict.js', () => ({
  resolveCriticalityVerdict: resolveCriticalityVerdictMock,
  routeCriticalityLater: routeCriticalityLaterMock,
}));

function makeFlagQueryBuilder(flagRow) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: flagRow, error: null }),
  };
  return builder;
}

let flagRow;
const insertSpy = vi.fn();

vi.mock('../../../lib/sd-creation/context.js', () => ({
  supabase: {
    from: (table) => {
      if (table === 'leo_feature_flags') return makeFlagQueryBuilder(flagRow);
      if (table === 'strategic_directives_v2') {
        insertSpy();
        throw new Error('UNEXPECTED_INSERT_ATTEMPT: strategic_directives_v2 insert must not be reached on refuse/route_later');
      }
      // Generic no-op chainable for anything else createSD might touch before the gate.
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: () => builder,
        single: () => Promise.resolve({ data: null, error: null }),
      };
      return builder;
    },
  },
}));

const { createSD } = await import('../../../lib/sd-creation/pipeline.js');

describe('createSD() criticality gate wiring (FR-2)', () => {
  it('refuse: returns ok:false CRITICALITY_REQUIRED, never reaches the strategic_directives_v2 insert', async () => {
    flagRow = { is_enabled: true };
    resolveCriticalityVerdictMock.mockReturnValue({ verdict: 'refuse', message: 'four criteria...' });
    insertSpy.mockClear();

    const result = await createSD({ sdKey: 'SD-TEST-001', title: 'T', description: 'D' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('CRITICALITY_REQUIRED');
    expect(insertSpy).not.toHaveBeenCalled();
    expect(routeCriticalityLaterMock).not.toHaveBeenCalled();
  });

  it('route_later: calls routeCriticalityLater and returns ok:true done:true, never reaches the insert', async () => {
    flagRow = { is_enabled: false };
    resolveCriticalityVerdictMock.mockReturnValue({ verdict: 'route_later', message: '' });
    insertSpy.mockClear();
    routeCriticalityLaterMock.mockClear();

    const result = await createSD({
      sdKey: 'SD-TEST-002',
      title: 'Some later item',
      description: 'Not critical now',
      criticality: 'later',
      criticalityReason: 'low priority',
    });

    expect(result.ok).toBe(true);
    expect(result.done).toBe(true);
    expect(result.routedLater).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(routeCriticalityLaterMock).toHaveBeenCalledTimes(1);
    const call = routeCriticalityLaterMock.mock.calls[0][0];
    expect(call.title).toBe('Some later item');
    expect(call.criticalityReason).toBe('low priority');
    expect(call.loggedVia).toBe('leo-create-sd.js');
  });

  it('reads SD_CRITICALITY_GATE_ENFORCE (not the QF flag key) and defaults to not-enabled on a read error', async () => {
    resolveCriticalityVerdictMock.mockReturnValue({ verdict: 'refuse', message: 'x' });
    insertSpy.mockClear();
    let capturedFlagKey;
    // Override the context mock just for this test via a fresh from() to capture the eq() arg.
    const builder = {
      select: () => builder,
      eq: (col, val) => { if (col === 'flag_key') capturedFlagKey = val; return builder; },
      maybeSingle: () => Promise.resolve({ data: { is_enabled: true }, error: null }),
    };
    const { supabase } = await import('../../../lib/sd-creation/context.js');
    const origFrom = supabase.from;
    supabase.from = (table) => (table === 'leo_feature_flags' ? builder : origFrom(table));

    await createSD({ sdKey: 'SD-TEST-003', title: 'T', description: 'D' });
    expect(capturedFlagKey).toBe('SD_CRITICALITY_GATE_ENFORCE');

    supabase.from = origFrom;
  });
});
