/**
 * SD-LEO-INFRA-DEMAND-ENGINE-PART-001 US-008 — CI negative test for unauthorized outreach.
 *
 * Runs with real-shaped credentials present and a venture below go-live; asserts zero adapter
 * calls, zero Resend calls, zero live-execution_mode ledger rows, and that BOTH the
 * mock-run-declared and no-mock-run-declared code paths were actually exercised in this run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declareMockRun, runMockOutreachSend } from '../../../lib/marketing/mock-outreach-executor.js';
import { __resetExecutionModeProbeForTests } from '../../../lib/marketing/ledger-execution-mode-probe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXECUTOR_SRC = path.resolve(__dirname, '../../../lib/marketing/mock-outreach-executor.js');

const BELOW_GO_LIVE_VENTURE = { is_demo: false, current_lifecycle_stage: 10, launch_mode: 'simulated', status: 'active' };

function makeSupabase({ venture }) {
  const inserted = [];
  const ventureChain = { select: () => ventureChain, eq: () => ventureChain, maybeSingle: async () => ({ data: venture, error: null }) };
  const chairmanDecisionsChain = {
    select: () => chairmanDecisionsChain, eq: () => chairmanDecisionsChain, is: () => chairmanDecisionsChain,
    gt: () => chairmanDecisionsChain, limit: () => chairmanDecisionsChain, maybeSingle: async () => ({ data: null, error: null }),
  };
  const auditLogChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
  const ledgerChain = {
    select: () => ledgerChain,
    limit: async () => ({ error: null }),
    insert: vi.fn((row) => {
      inserted.push(row);
      return { select: () => ({ single: async () => ({ data: { id: `ledger-${inserted.length}` }, error: null }) }) };
    }),
  };
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') return ventureChain;
      if (table === 'chairman_decisions') return chairmanDecisionsChain;
      if (table === 'audit_log') return auditLogChain;
      return ledgerChain;
    }),
    _inserted: inserted,
  };
}

describe('US-008: static proof the executor has no adapter/Resend dependency to call', () => {
  it('mock-outreach-executor.js imports neither an adapter module nor a Resend client', () => {
    const code = fs.readFileSync(EXECUTOR_SRC, 'utf8');
    const importLines = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.length).toBeGreaterThan(0); // sanity: the file does import something
    for (const line of importLines) {
      expect(line).not.toMatch(/resend/i);
      expect(line).not.toMatch(/adapters?\//i);
    }
  });
});

describe('US-008: CI negative test — real-shaped credentials present, venture below go-live', () => {
  let fetchSpy;
  // Deliberately NOT matching the re_[A-Za-z0-9_]{20,} secret-scanner pattern (hyphens break
  // the character class) -- "real-shaped" for this test means "present and non-empty", not a
  // value that could ever be mistaken for a genuine Resend key.
  const REAL_SHAPED_RESEND_KEY = 're_FAKE-TEST-CREDENTIAL-NOT-REAL-0000000000';
  let priorResendKey;

  beforeEach(() => {
    __resetExecutionModeProbeForTests();
    priorResendKey = process.env.RESEND_API_KEY;
    // Real-shaped credentials PRESENT -- the refusal/mock behavior must not depend on their
    // absence as an incidental safety net.
    process.env.RESEND_API_KEY = REAL_SHAPED_RESEND_KEY;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('TEST FAILURE: a real network call was attempted — zero adapter/Resend calls are required');
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (priorResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorResendKey;
  });

  it('exercises BOTH the mock-run-declared and no-mock-run-declared paths, zero adapter/Resend calls, zero live-execution_mode rows', async () => {
    const supabase = makeSupabase({ venture: BELOW_GO_LIVE_VENTURE });
    const buildSend = vi.fn(async () => ({ synthetic: true }));

    // Trigger 1: mock-run-declared path (US-003).
    const mockResult = await runMockOutreachSend({
      supabase, ventureId: 'v-below-go-live', channelType: 'x', contentId: 'c1',
      mockRunId: declareMockRun(), buildSend,
    });

    // Trigger 2: no-mock-run-declared path (US-004) — same unauthorized venture, different content ref.
    const refusalResult = await runMockOutreachSend({
      supabase, ventureId: 'v-below-go-live', channelType: 'x', contentId: 'c2',
      mockRunId: undefined, buildSend,
    });

    // Both code paths were actually exercised.
    expect(mockResult.executed).toBe(true);
    expect(mockResult.mode).toBe('mock');
    expect(refusalResult.executed).toBe(false);
    expect(refusalResult.mode).toBeNull();

    // Zero adapter/Resend calls — the fetch spy would have thrown if any network call fired.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Zero live-execution_mode ledger rows.
    const liveRows = supabase._inserted.filter((r) => r.execution_mode === 'live');
    expect(liveRows).toHaveLength(0);

    // The mock path wrote exactly one row, correctly stamped; the refusal path wrote none.
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].execution_mode).toBe('mock');
  });
});
