/**
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-1/FR-2 — session_coordination lane
 * delivery contract: SEND validation (staged off/observe/enforce) + canonical body read.
 *
 * No live DB calls — isEnabledFn / supabase are injected stubs throughout.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveLaneContractMode,
  validateOnSend,
  formatWouldDenyLine,
  recordWouldDenyEvidence,
  readCanonicalBody,
  WOULD_DENY_EVENT_TYPE,
  BASE_FLAG,
  ENFORCE_FLAG,
} = require('../../../lib/coordination/lane-contract.cjs');

describe('resolveLaneContractMode — staged off/observe/enforce ladder (FR-1)', () => {
  it('resolves off when the base flag is disabled', async () => {
    const isEnabledFn = vi.fn().mockResolvedValue(false);
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('off');
    expect(isEnabledFn).toHaveBeenCalledWith(BASE_FLAG);
  });

  it('resolves observe when base is on but enforce is off', async () => {
    const isEnabledFn = vi.fn((flag) => Promise.resolve(flag === BASE_FLAG));
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('observe');
  });

  it('resolves enforce when both flags are on', async () => {
    const isEnabledFn = vi.fn().mockResolvedValue(true);
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('enforce');
    expect(isEnabledFn).toHaveBeenCalledWith(ENFORCE_FLAG);
  });

  it('fail-soft: resolves off when the evaluator throws (a flag-infrastructure error must never change delivery behavior)', async () => {
    const isEnabledFn = vi.fn().mockRejectedValue(new Error('flag service down'));
    const mode = await resolveLaneContractMode({ isEnabledFn });
    expect(mode).toBe('off');
  });
});

describe('validateOnSend — off/observe/enforce verdicts (FR-1)', () => {
  const typedRow = { payload: { kind: 'adam_advisory' } };
  const untypedRow = { payload: {} };
  const noPayloadRow = {};

  it('off mode: always valid, zero checks performed (even on an untyped row)', () => {
    expect(validateOnSend(untypedRow, { mode: 'off' })).toEqual({ valid: true, mode: 'off' });
    expect(validateOnSend(undefined, { mode: 'off' })).toEqual({ valid: true, mode: 'off' });
  });

  it('observe mode: a typed row is valid with no would-deny', () => {
    expect(validateOnSend(typedRow, { mode: 'observe' })).toEqual({ valid: true, mode: 'observe' });
  });

  it('observe mode: an untyped row is NOT blocked (valid:true) but flags would_deny', () => {
    const v = validateOnSend(untypedRow, { mode: 'observe' });
    expect(v.valid).toBe(true);
    expect(v.would_deny).toBe(true);
    expect(v.reason).toBe('lane_contract_untyped_payload_kind');
  });

  it('observe mode: a row with no payload at all is also flagged (untyped) without blocking', () => {
    const v = validateOnSend(noPayloadRow, { mode: 'observe' });
    expect(v.valid).toBe(true);
    expect(v.would_deny).toBe(true);
  });

  it('enforce mode: a typed row is valid', () => {
    expect(validateOnSend(typedRow, { mode: 'enforce' })).toEqual({ valid: true, mode: 'enforce' });
  });

  it('enforce mode: an untyped row is REJECTED (the SAME row that observe mode let through)', () => {
    const v = validateOnSend(untypedRow, { mode: 'enforce' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('lane_contract_untyped_payload_kind');
  });

  it('an empty-string kind is treated as untyped in both observe and enforce', () => {
    const row = { payload: { kind: '' } };
    expect(validateOnSend(row, { mode: 'observe' }).would_deny).toBe(true);
    expect(validateOnSend(row, { mode: 'enforce' }).valid).toBe(false);
  });
});

describe('formatWouldDenyLine', () => {
  it('names the row id and the reason', () => {
    const line = formatWouldDenyLine({ id: 'row-1' }, { reason: 'lane_contract_untyped_payload_kind' });
    expect(line).toContain('row-1');
    expect(line).toContain('lane_contract_untyped_payload_kind');
    expect(line).toContain('observe mode');
  });

  it('falls back to a pre-insert marker when the row has no id yet', () => {
    const line = formatWouldDenyLine({}, { reason: 'x' });
    expect(line).toContain('(pre-insert)');
  });
});

describe('recordWouldDenyEvidence — fail-soft durable observe-window evidence', () => {
  it('inserts a system_events row with the reason and row subject/target', async () => {
    const inserted = [];
    const supabase = { from: (table) => ({ insert: (row) => { inserted.push({ table, row }); return Promise.resolve({ error: null }); } }) };
    await recordWouldDenyEvidence(supabase, { subject: 'subj', target_session: 't1' }, { reason: 'lane_contract_untyped_payload_kind' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('system_events');
    expect(inserted[0].row.event_type).toBe(WOULD_DENY_EVENT_TYPE);
    expect(inserted[0].row.payload).toEqual({ reason: 'lane_contract_untyped_payload_kind', row_subject: 'subj', target_session: 't1' });
  });

  it('never throws even if the insert fails (fail-soft — never blocks or alters the send)', async () => {
    const supabase = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) };
    await expect(recordWouldDenyEvidence(supabase, { subject: 'x' }, { reason: 'y' })).resolves.toBeUndefined();
  });
});

describe('readCanonicalBody — dual-read, payload.body primary / body-column fallback (FR-2)', () => {
  it('returns the correct text for a row with body only in payload.body', () => {
    expect(readCanonicalBody({ payload: { body: 'from payload' }, body: null })).toBe('from payload');
  });

  it('returns the correct text for a legacy row with body only in the body column (fallback path)', () => {
    expect(readCanonicalBody({ payload: {}, body: 'legacy column body' })).toBe('legacy column body');
  });

  it('prefers payload.body over the body column when both are present', () => {
    expect(readCanonicalBody({ payload: { body: 'canonical' }, body: 'legacy' })).toBe('canonical');
  });

  it('falls back to the body column when payload.body is an empty string', () => {
    expect(readCanonicalBody({ payload: { body: '' }, body: 'legacy fallback' })).toBe('legacy fallback');
  });

  it('returns "" (never null/undefined) when neither location has content', () => {
    expect(readCanonicalBody({ payload: {}, body: null })).toBe('');
    expect(readCanonicalBody({ payload: null, body: undefined })).toBe('');
    expect(readCanonicalBody(null)).toBe('');
    expect(readCanonicalBody(undefined)).toBe('');
  });

  it('ignores a non-string body column value', () => {
    expect(readCanonicalBody({ payload: {}, body: 12345 })).toBe('');
  });
});
