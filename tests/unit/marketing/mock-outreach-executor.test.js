/**
 * SD-LEO-INFRA-DEMAND-ENGINE-PART-001 US-001..US-005 — the Part B mock first-stranger-run
 * executor. Exercises the REAL assertOutreachAuthorized() (no mock of it) so these tests also
 * prove the authorization wiring itself, not just a stub of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { declareMockRun, runMockOutreachSend, NO_MOCK_RUN_DECLARED } from '../../../lib/marketing/mock-outreach-executor.js';
import { __resetExecutionModeProbeForTests } from '../../../lib/marketing/ledger-execution-mode-probe.js';

// The execution_mode probe caches process-lifetime; reset before EVERY test in this file so a
// later test's stub (which always reports the column present) is never short-circuited by an
// earlier cached result from a different stub shape.
beforeEach(() => {
  __resetExecutionModeProbeForTests();
});

function makeSupabase({ venture, ledgerInsertError = null } = {}) {
  const inserted = [];
  const ventureChain = {
    select: () => ventureChain,
    eq: () => ventureChain,
    maybeSingle: async () => ({ data: venture, error: null }),
  };
  const chairmanDecisionsChain = {
    select: () => chairmanDecisionsChain,
    eq: () => chairmanDecisionsChain,
    is: () => chairmanDecisionsChain,
    gt: () => chairmanDecisionsChain,
    limit: () => chairmanDecisionsChain,
    maybeSingle: async () => ({ data: null, error: null }), // no active override
  };
  const auditLogChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
  const ledgerChain = {
    select: () => ledgerChain,
    limit: async () => ({ error: null }), // execution_mode column present
    insert: vi.fn((row) => {
      inserted.push(row);
      return {
        select: () => ({
          single: async () => (ledgerInsertError ? { data: null, error: ledgerInsertError } : { data: { id: `ledger-${inserted.length}` }, error: null }),
        }),
      };
    }),
  };

  return {
    from: vi.fn((table) => {
      if (table === 'ventures') return ventureChain;
      if (table === 'chairman_decisions') return chairmanDecisionsChain;
      if (table === 'audit_log') return auditLogChain;
      return ledgerChain; // venture_channel_publish_ledger
    }),
    _inserted: inserted,
  };
}

const BELOW_GO_LIVE_VENTURE = { is_demo: false, current_lifecycle_stage: 10, launch_mode: 'simulated', status: 'active' };
const LIVE_VENTURE = { is_demo: false, current_lifecycle_stage: 24, launch_mode: 'live', status: 'active' };

describe('declareMockRun (US-001)', () => {
  it('returns a fresh UUID each call -- the sole mock-mode declaration mechanism', () => {
    const a = declareMockRun();
    const b = declareMockRun();
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a).not.toBe(b);
  });
});

describe('runMockOutreachSend — authorization read shape (US-002)', () => {
  it('never forwards the wrapper-internal mode field to the caller\'s buildSend or the result', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    const buildSend = vi.fn(async (ctx) => {
      expect(ctx).not.toHaveProperty('authorized');
      expect(ctx).not.toHaveProperty('wrapperMode');
      return { built: true };
    });
    const result = await runMockOutreachSend({
      supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId: declareMockRun(), buildSend,
    });
    expect(buildSend).toHaveBeenCalledTimes(1);
    // The result surfaces mode (this module's own decision), not the wrapper's internal field.
    expect(result.mode).toBe('mock');
  });
});

describe('runMockOutreachSend — mock pipeline (US-003)', () => {
  it('authorized=false + mock_run_id set: runs the full pipeline, zero adapter/Resend calls possible (no adapter import exists in this module)', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    const mockRunId = declareMockRun();
    const buildSend = vi.fn(async () => ({ persona: 'p1', content: 'synthetic copy' }));

    const result = await runMockOutreachSend({ supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId, buildSend });

    expect(result.executed).toBe(true);
    expect(result.mode).toBe('mock');
    expect(buildSend).toHaveBeenCalledWith(expect.objectContaining({ mode: 'mock', mockRunId }));
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0]).toMatchObject({ venture_id: 'v1', channel_type: 'x', mock_run_id: mockRunId, execution_mode: 'mock' });
  });
});

describe('runMockOutreachSend — clean refusal (US-004)', () => {
  it('authorized=false + no mock_run_id: clean refusal, zero ledger rows, never reinterpreted as mock', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    const buildSend = vi.fn();

    const result = await runMockOutreachSend({ supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId: undefined, buildSend });

    expect(result.executed).toBe(false);
    expect(result.mode).toBeNull();
    expect(buildSend).not.toHaveBeenCalled();
    expect(supabase._inserted).toHaveLength(0);
  });

  it('NO_MOCK_RUN_DECLARED names the reason class this module contributes', () => {
    expect(NO_MOCK_RUN_DECLARED).toBe('no_mock_run_declared');
  });
});

describe('runMockOutreachSend — execution_mode stamping (US-005)', () => {
  it('stamps mock on a mock-mode ledger write', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    await runMockOutreachSend({ supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId: declareMockRun(), buildSend: async () => ({}) });
    expect(supabase._inserted[0].execution_mode).toBe('mock');
  });

  it('stamps live on a live (authorized=true) ledger write', async () => {
    const supabase = makeSupabase({ venture: LIVE_VENTURE });
    const result = await runMockOutreachSend({ supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId: undefined, buildSend: async () => ({}) });
    expect(result.mode).toBe('live');
    expect(supabase._inserted[0].execution_mode).toBe('live');
    expect(supabase._inserted[0].mock_run_id).toBeNull();
  });

  it('never leaves execution_mode unstamped on any write path', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    await runMockOutreachSend({ supabase, ventureId: 'v1', channelType: 'x', contentId: 'c1', mockRunId: declareMockRun(), buildSend: async () => ({}) });
    for (const row of supabase._inserted) {
      expect(row.execution_mode).toBeTruthy();
    }
  });
});
