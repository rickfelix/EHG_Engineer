// Vitest fixture for rca-required-after-retries-gate.js — QF-20260830-657.
import { describe, it, expect } from 'vitest';
import { createRcaRequiredAfterRetriesGate, readEnforcementMode, GATE_NAME } from './rca-required-after-retries-gate.js';

function makeFakeSupabase({ configValue, rejections = [], rcaRows = [] } = {}) {
  const appConfigEq = () => ({
    maybeSingle: async () => ({ data: configValue !== undefined ? { value: configValue } : null, error: null }),
  });
  const handoffsEq3 = () => ({ order: async () => ({ data: rejections, error: null }) });
  const handoffsEq2 = () => ({ eq: handoffsEq3 });
  const handoffsEq1 = () => ({ eq: handoffsEq2 });
  const rcaEq2 = () => ({
    gt: async (_col, cutoff) => ({ data: rcaRows.filter((r) => r.created_at > cutoff), error: null }),
  });
  const rcaEq1 = () => ({ eq: rcaEq2 });

  return {
    from(table) {
      if (table === 'app_config') return { select: () => ({ eq: appConfigEq }) };
      if (table === 'sd_phase_handoffs') return { select: () => ({ eq: handoffsEq1 }) };
      if (table === 'sub_agent_execution_results') return { select: () => ({ eq: rcaEq1 }) };
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const CTX = { sd_id: 'sd-uuid-1', handoffType: 'EXEC-TO-PLAN' };

describe('rca-required-after-retries-gate', () => {
  it('GATE_NAME is stable', () => {
    expect(GATE_NAME).toBe('RCA_REQUIRED_AFTER_2_RETRIES');
  });

  it('readEnforcementMode defaults to advisory with no config row', async () => {
    expect(await readEnforcementMode(makeFakeSupabase({}))).toBe('advisory');
  });

  it('readEnforcementMode reads a blocking value', async () => {
    expect(await readEnforcementMode(makeFakeSupabase({ configValue: 'blocking' }))).toBe('blocking');
  });

  it('passes with skipped:true when supabase/sd_id/handoffType are missing', async () => {
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({}));
    const result = await gate.validator({});
    expect(result.passed).toBe(true);
  });

  it('1st attempt (0 rejections): passes, attempt_index=1', async () => {
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections: [] }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.details.attempt_index).toBe(1);
  });

  it('2nd attempt (1 rejection): passes, attempt_index=2 — unaffected', async () => {
    const rejections = [{ rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.details.attempt_index).toBe(2);
  });

  it('[fixture] 3rd attempt, 2 rejections + NO fresh RCA row, blocking mode: refuses naming RCA_REQUIRED_AFTER_2_RETRIES', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
    ];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows: [] }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('RCA_REQUIRED_AFTER_2_RETRIES');
    expect(result.details.prior_rejection_reasons).toEqual(['r1', 'r2']);
    expect(result.issues[0]).toMatch(/RCA_REQUIRED_AFTER_2_RETRIES/);
    expect(result.remediation).toMatch(/rca-agent/);
  });

  it('[fixture] 3rd attempt, 2 rejections + a fresh RCA row after the 2nd rejection, blocking mode: proceeds', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
    ];
    const rcaRows = [{ id: 'rca-row-1', created_at: '2026-08-30T11:30:00Z' }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.details.rca_evidence).toEqual(['rca-row-1']);
  });

  it('[VALIDATION 2013c6ad regression] 5th attempt: an RCA row after the 2nd-ever rejection but BEFORE the most recent (4th) rejection does NOT satisfy the gate -- the requirement re-arms on the latest retry cycle', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
      { rejection_reason: 'r3', created_at: '2026-08-30T12:00:00Z' },
      { rejection_reason: 'r4', created_at: '2026-08-30T13:00:00Z' },
    ];
    // This RCA row is fresh relative to r2 (the old, buggy anchor) but STALE relative to the
    // most recent rejection r4 -- the fixed gate must still refuse.
    const rcaRows = [{ id: 'stale-rca', created_at: '2026-08-30T11:30:00Z' }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(false);
    expect(result.details.reason).toBe('RCA_REQUIRED_AFTER_2_RETRIES');
    expect(result.details.attempt_index).toBe(5);
    expect(result.details.prior_rejection_reasons).toEqual(['r3', 'r4']);
  });

  it('[VALIDATION 2013c6ad regression] 5th attempt: a fresh RCA row after the most recent (4th) rejection satisfies the gate', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
      { rejection_reason: 'r3', created_at: '2026-08-30T12:00:00Z' },
      { rejection_reason: 'r4', created_at: '2026-08-30T13:00:00Z' },
    ];
    const rcaRows = [{ id: 'fresh-rca', created_at: '2026-08-30T13:30:00Z' }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.details.rca_evidence).toEqual(['fresh-rca']);
  });

  it('3rd attempt, no fresh RCA row, advisory mode (default): still passes -- never blocks in advisory', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
    ];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ rejections, rcaRows: [] }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
  });

  it('disabled mode: always passes without querying rejections', async () => {
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'disabled' }));
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.details.skipped).toBe(true);
  });

  it('fails open (passes) when the rejection-count read errors', async () => {
    const handoffsEq3 = () => ({ order: async () => ({ data: null, error: { message: 'boom' } }) });
    const handoffsEq2 = () => ({ eq: handoffsEq3 });
    const handoffsEq1 = () => ({ eq: handoffsEq2 });
    const appConfigEq = () => ({ maybeSingle: async () => ({ data: { value: 'blocking' }, error: null }) });
    const supabase = {
      from(table) {
        if (table === 'app_config') return { select: () => ({ eq: appConfigEq }) };
        if (table === 'sd_phase_handoffs') return { select: () => ({ eq: handoffsEq1 }) };
        throw new Error('unexpected table');
      },
    };
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.issues[0]).toMatch(/rejection-read-error/);
  });
});
