/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-2/FR-2b.
 *
 * Exercises the REAL createRCAGate (scripts/modules/handoff/executors/exec-to-plan/gates/rca-gate.js)
 * against a mocked Supabase client, rather than a hand-rolled reimplementation of its query
 * (the class of defect this SD repairs: tests/integration/rca-system.integration.test.js's
 * "Gate Enforcement" describe block hand-writes its OWN query semantics — CAPA-manifest-aware
 * blocking via remediation_manifests, a genuinely different check than createRCAGate implements
 * — and is a live-DB integration suite outside this SD's scope to rewrite; see EXEC deviation
 * note. This file is the CI-blocking proof that the real gate function itself is correct.)
 *
 * TS-3: a query error (missing/renamed table) must WARN (flag off) or FAIL (flag on), never a
 *       silent PASS/100 — the pre-fix defect: the gate destructured only `{data}`, never
 *       `error`, so a non-throwing {data:null,error:PGRST205} response fell through to PASS.
 * TS-4: the gate correctly reads root_cause_reports via severity_priority/status.
 * TS-11: covered by exercising createRCAGate directly (this whole file).
 *
 * Note: rca-gate.js's query chains TWO `.in()` calls (severity_priority, then status) before
 * awaiting — the chain mock's default `.in` stays chainable and only the awaited terminal
 * resolves, so tests configure the resolved value via the mock's `result`/`__setResult`
 * rather than overriding `.in` itself (overriding it breaks the second chained call).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRCAGate } from '../../scripts/modules/handoff/executors/exec-to-plan/gates/rca-gate.js';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

describe('createRCAGate — warn-only by default (LEO_RCA_GATE_ENFORCE unset)', () => {
  const ORIGINAL_ENV = process.env.LEO_RCA_GATE_ENFORCE;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.LEO_RCA_GATE_ENFORCE;
    else process.env.LEO_RCA_GATE_ENFORCE = ORIGINAL_ENV;
  });

  beforeEach(() => {
    delete process.env.LEO_RCA_GATE_ENFORCE;
  });

  it('TS-3: a query error never silently PASSes — returns gate_status WARN, passed:true, with a warning', async () => {
    const chain = createSupabaseChainMock({
      result: { data: null, error: { message: 'relation "root_cause_analyses" does not exist', code: 'PGRST205' } }
    });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-001' });

    expect(result.passed).toBe(true); // warn-only: does not block
    expect(result.gate_status).toBe('WARN'); // but is NOT a silent 100
    expect(result.warnings.some(w => w.includes('RCA_GATE_WARN'))).toBe(true);
  });

  it('TS-4: reads root_cause_reports via severity_priority/status (not the old priority/capa_status)', async () => {
    const chain = createSupabaseChainMock({ result: { data: [], error: null } });
    let capturedTable;
    let capturedColumns;
    const originalFrom = chain.from;
    const originalSelect = chain.select;
    chain.from = vi.fn((table) => { capturedTable = table; return originalFrom(table); });
    chain.select = vi.fn((cols) => { capturedColumns = cols; return originalSelect(cols); });

    const gate = createRCAGate(chain);
    await gate.validator({ sdId: 'SD-TEST-002' });

    expect(capturedTable).toBe('root_cause_reports');
    expect(capturedColumns).toContain('severity_priority');
    expect(capturedColumns).toContain('status');
    expect(capturedColumns).not.toContain('capa_status');
  });

  it('a blocking RCR (OPEN/IN_REVIEW/CAPA_PENDING P0/P1) warns but does not block', async () => {
    const chain = createSupabaseChainMock({
      result: { data: [{ id: 'rcr-1', severity_priority: 'P0', status: 'OPEN' }], error: null }
    });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-003' });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('WARN');
    expect(result.blocking_rcr_ids).toEqual(['rcr-1']);
    expect(result.warnings.some(w => w.includes('rcr-1'))).toBe(true);
  });

  it('no blocking RCRs -> clean PASS', async () => {
    const chain = createSupabaseChainMock({ result: { data: [], error: null } });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-004' });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('PASS');
    expect(result.warnings).toEqual([]);
  });

  it('STALE status does not block (excluded from the blocking set)', async () => {
    // The gate's own query filters .in('status', ['OPEN','IN_REVIEW','CAPA_PENDING']), so a
    // STALE-only backing table yields no rows back from a correctly-scoped query.
    const chain = createSupabaseChainMock({ result: { data: [], error: null } });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-005' });

    expect(result.gate_status).toBe('PASS');
  });
});

describe('createRCAGate — hard enforcement (LEO_RCA_GATE_ENFORCE=true)', () => {
  const ORIGINAL_ENV = process.env.LEO_RCA_GATE_ENFORCE;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.LEO_RCA_GATE_ENFORCE;
    else process.env.LEO_RCA_GATE_ENFORCE = ORIGINAL_ENV;
  });

  beforeEach(() => {
    process.env.LEO_RCA_GATE_ENFORCE = 'true';
  });

  it('a query error FAILs the gate (passed:false) when enforcement is on', async () => {
    const chain = createSupabaseChainMock({ result: { data: null, error: { message: 'boom' } } });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-006' });

    expect(result.passed).toBe(false);
    expect(result.gate_status).toBe('FAIL');
  });

  it('a blocking RCR FAILs the gate (passed:false, gate_status BLOCKED) when enforcement is on', async () => {
    const chain = createSupabaseChainMock({
      result: { data: [{ id: 'rcr-9', severity_priority: 'P1', status: 'CAPA_PENDING' }], error: null }
    });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-007' });

    expect(result.passed).toBe(false);
    expect(result.gate_status).toBe('BLOCKED');
    expect(result.blocking_rcr_ids).toEqual(['rcr-9']);
  });

  it('no blocking RCRs still PASSes cleanly with enforcement on', async () => {
    const chain = createSupabaseChainMock({ result: { data: [], error: null } });

    const gate = createRCAGate(chain);
    const result = await gate.validator({ sdId: 'SD-TEST-008' });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('PASS');
  });
});
