// Vitest fixture for rca-required-after-retries-gate.js — QF-20260830-657.
import { describe, it, expect } from 'vitest';
import { createRcaRequiredAfterRetriesGate, readEnforcementMode, GATE_NAME } from './rca-required-after-retries-gate.js';

function makeFakeSupabase({ configValue, rejections = [], rcaRows = [], rcrRows = [] } = {}) {
  const appConfigEq = () => ({
    maybeSingle: async () => ({ data: configValue !== undefined ? { value: configValue } : null, error: null }),
  });
  // Gate fetches descending + limit, then reverses to ascending -- mock simulates that by
  // handing back the fixture's ascending array reversed, so the round-trip is order-correct.
  const handoffsEq3 = () => ({ order: () => ({ limit: async () => ({ data: [...rejections].reverse(), error: null }) }) });
  const handoffsEq2 = () => ({ eq: handoffsEq3 });
  const handoffsEq1 = () => ({ eq: handoffsEq2 });
  // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2): the gate's outer sub_agent_execution_results
  // query now chains .order() between .gt() and .limit() (round-3 EXEC-phase fix, evidence
  // 28382f71/79f84159). This mock previously had no .order() method on that chain at all, so the
  // real call threw a TypeError caught by the gate's own fail-open catch(e) -- every test below
  // was silently reading the catch-all {passed:true, skipped:'unexpected-error'} result instead
  // of exercising the real branch it claims to test. Purely additive; matches real Supabase.
  const rcaEq2 = () => ({
    gt: (_col, cutoff) => ({
      order: () => ({
        limit: async () => ({ data: rcaRows.filter((r) => r.created_at > cutoff), error: null }),
      }),
    }),
  });
  const rcaEq1 = () => ({ eq: rcaEq2 });

  // FR-C2's content predicate also queries root_cause_reports (metadata.rcr_id -> content
  // check): a single .eq('sd_id', sdId) followed by .in('id', rcrIds).limit(20) -- one .eq()
  // level only, unlike sd_phase_handoffs' three-.eq() chain above. Fixtures whose rcaRows carry
  // metadata.rcr_id must also supply a matching rcrRows entry (id, root_cause, confidence>=70)
  // for the gate to treat that evidence as verified -- otherwise a bare row-reference alone no
  // longer satisfies the gate, per FR-C2's own intent.
  const rcrEq1 = () => ({ in: () => ({ limit: async () => ({ data: rcrRows, error: null }) }) });

  return {
    from(table) {
      if (table === 'app_config') return { select: () => ({ eq: appConfigEq }) };
      if (table === 'sd_phase_handoffs') return { select: () => ({ eq: handoffsEq1 }) };
      if (table === 'sub_agent_execution_results') return { select: () => ({ eq: rcaEq1 }) };
      if (table === 'root_cause_reports') return { select: () => ({ eq: rcrEq1 }) };
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

  it('[fixture] 3rd attempt, 2 rejections + a fresh, content-verified RCA row after the 2nd rejection, blocking mode: proceeds', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
    ];
    // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2): bare row-existence alone no longer
    // satisfies the gate -- the row must reference a root_cause_reports row with real content
    // (root_cause non-empty, confidence>=70). This test's intent is the retry-timing logic, not
    // the content predicate (covered separately in tests/unit/handoff/rca-required-after-
    // retries-gate.test.js), so the fixture is updated to be content-verified rather than
    // weakened to pre-FR-C2 behavior.
    const RCR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const rcaRows = [{ id: 'rca-row-1', created_at: '2026-08-30T11:30:00Z', metadata: { rcr_id: RCR_ID } }];
    const rcrRows = [{ id: RCR_ID, root_cause: 'A genuine analysis', confidence: 90 }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows, rcrRows }));
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

  it('[VALIDATION 2013c6ad regression] 5th attempt: a fresh, content-verified RCA row after the most recent (4th) rejection satisfies the gate', async () => {
    const rejections = [
      { rejection_reason: 'r1', created_at: '2026-08-30T10:00:00Z' },
      { rejection_reason: 'r2', created_at: '2026-08-30T11:00:00Z' },
      { rejection_reason: 'r3', created_at: '2026-08-30T12:00:00Z' },
      { rejection_reason: 'r4', created_at: '2026-08-30T13:00:00Z' },
    ];
    // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2): see the sibling '3rd attempt' fixture test
    // above -- bare row-existence alone no longer satisfies the gate.
    const RCR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const rcaRows = [{ id: 'fresh-rca', created_at: '2026-08-30T13:30:00Z', metadata: { rcr_id: RCR_ID } }];
    const rcrRows = [{ id: RCR_ID, root_cause: 'A genuine analysis', confidence: 90 }];
    const gate = createRcaRequiredAfterRetriesGate(makeFakeSupabase({ configValue: 'blocking', rejections, rcaRows, rcrRows }));
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
    const handoffsEq3 = () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) });
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

  it('[SECURITY SEC-1] fails open (passes) on an unexpected synchronous throw, not just a {data,error} pair -- the gate is required:true, so an uncaught throw would fail CLOSED fleet-wide', async () => {
    const supabase = {
      from() {
        throw new TypeError('unexpected shape');
      },
    };
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator(CTX);
    expect(result.passed).toBe(true);
    expect(result.issues[0]).toMatch(/unexpected-error/);
  });
});
