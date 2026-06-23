/**
 * SD-REFILL-00V67JEB (FR-1): the runtime contract-enforcement coverage signal.
 * emitContractCoverage appends one append-only audit_log row per enforced cross-stage transition,
 * FAIL-OPEN — it must never throw or disturb the venture pipeline. summarizeContractResult /
 * buildCoverageRow are pure and exercise the shape the (FR-2, follow-up) count_ratio probe will read.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  summarizeContractResult,
  buildCoverageRow,
  emitContractCoverage,
} from '../../../lib/eva/contracts/contract-coverage.js';

describe('summarizeContractResult', () => {
  it('extracts valid/blocked + error/warning counts', () => {
    expect(summarizeContractResult({ valid: true, blocked: false, errors: [], warnings: ['w'] }))
      .toEqual({ valid: true, blocked: false, error_count: 0, warning_count: 1 });
    expect(summarizeContractResult({ valid: false, blocked: true, errors: ['e1', 'e2'], warnings: [] }))
      .toEqual({ valid: false, blocked: true, error_count: 2, warning_count: 0 });
  });
  it('is robust to a malformed/empty result (fail-open shape)', () => {
    expect(summarizeContractResult(null)).toEqual({ valid: false, blocked: false, error_count: 0, warning_count: 0 });
    expect(summarizeContractResult({})).toEqual({ valid: false, blocked: false, error_count: 0, warning_count: 0 });
  });
});

describe('buildCoverageRow', () => {
  it('builds an audit_log row with event_type=contract_coverage + the coverage metadata', () => {
    const row = buildCoverageRow({ ventureId: 'v1', stageNumber: 5, phase: 'pre', result: { valid: true, errors: [], warnings: [] }, enforcementMode: 'BLOCKING' });
    expect(row.event_type).toBe('contract_coverage');
    expect(row.entity_type).toBe('venture_stage_contract');
    expect(row.entity_id).toBe('v1:5:pre');
    expect(row.metadata).toMatchObject({ venture_id: 'v1', stage_number: 5, phase: 'pre', valid: true, blocked: false, enforcement_mode: 'BLOCKING' });
    expect(row.created_by).toBe('eva-contract-validator');
  });
  it('maps severity to a valid audit_log value: blocked→error, invalid→warning, valid→info', () => {
    expect(buildCoverageRow({ result: { valid: true } }).severity).toBe('info');
    expect(buildCoverageRow({ result: { valid: false, blocked: false } }).severity).toBe('warning');
    expect(buildCoverageRow({ result: { valid: false, blocked: true } }).severity).toBe('error');
  });
});

describe('emitContractCoverage (FAIL-OPEN)', () => {
  it('inserts the coverage row when a client is provided', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };
    const res = await emitContractCoverage(supabase, { ventureId: 'v1', stageNumber: 3, phase: 'post', result: { valid: true, errors: [], warnings: [] }, enforcementMode: 'ADVISORY' });
    expect(res).toEqual({ emitted: true });
    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'contract_coverage', entity_id: 'v1:3:post' }));
  });
  it('no-ops (never throws) when the client is missing', async () => {
    expect(await emitContractCoverage(null, {})).toEqual({ emitted: false, reason: 'no_client' });
    expect(await emitContractCoverage({}, {})).toEqual({ emitted: false, reason: 'no_client' });
  });
  it('swallows an insert error (fail-open, returns reason — never throws)', async () => {
    const supabase = { from: () => ({ insert: async () => ({ error: { message: 'boom' } }) }) };
    const res = await emitContractCoverage(supabase, { ventureId: 'v', stageNumber: 1, phase: 'pre', result: {} });
    expect(res).toEqual({ emitted: false, reason: 'boom' });
  });
  it('swallows a thrown client error (fail-open — pipeline never breaks)', async () => {
    const supabase = { from: () => { throw new Error('client exploded'); } };
    const res = await emitContractCoverage(supabase, { ventureId: 'v', stageNumber: 1, phase: 'pre', result: {} });
    expect(res.emitted).toBe(false);
    expect(res.reason).toBe('client exploded');
  });
});
