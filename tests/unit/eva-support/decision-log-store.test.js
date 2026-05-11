/**
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-2, FR-4, TEST-2, US-003
 *
 * Unit tests for lib/eva-support/decision-log-store.js — happy path, conflict
 * (already-exists), schema-cache miss (fail-loud), and read-after-write mismatch.
 */

import { describe, it, expect, vi } from 'vitest';
import { insertEntry, DecisionLogStoreError } from '../../../lib/eva-support/decision-log-store.js';

function envelope(overrides = {}) {
  return {
    schema_version: '1.0',
    task_id: 't-001',
    sequence: 1,
    timestamp: '2026-05-11T00:00:00.000Z',
    flow: 'decision',
    eva_reply_summary: 'pick A',
    operator_input_summary: 'A or B?',
    override_reason: null,
    model: 'claude-opus-4-7',
    tokens_in: 50,
    tokens_out: 25,
    references: [],
    ...overrides,
  };
}

function fakeClient({ insertResult, insertError, readResult, readError } = {}) {
  const builder = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  // First call goes to INSERT path; ensure maybeSingle returns the insert response.
  // For conflict path, the second maybeSingle returns the read response.
  let calls = 0;
  builder.maybeSingle = vi.fn().mockImplementation(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve({ data: insertResult ?? null, error: insertError ?? null });
    return Promise.resolve({ data: readResult ?? null, error: readError ?? null });
  });
  return builder;
}

describe('decision-log-store.insertEntry', () => {
  it('returns inserted:true + verified:true on happy path', async () => {
    const entry = envelope();
    const client = fakeClient({ insertResult: { ...entry } });
    const result = await insertEntry(entry, { client });
    expect(result.inserted).toBe(true);
    expect(result.verified).toBe(true);
    expect(client.from).toHaveBeenCalledWith('eva_support_decision_log');
  });

  it('returns inserted:false + verified:true on unique-key conflict (idempotent)', async () => {
    const entry = envelope();
    const client = fakeClient({
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      readResult: { ...entry },
    });
    const result = await insertEntry(entry, { client });
    expect(result.inserted).toBe(false);
    expect(result.verified).toBe(true);
  });

  it('throws SCHEMA_CACHE_MISS when table not found (PGRST205)', async () => {
    const entry = envelope();
    const client = fakeClient({
      insertError: { code: 'PGRST205', message: 'Could not find the table' },
    });
    await expect(insertEntry(entry, { client })).rejects.toThrow(/migration probably not applied/);
  });

  it('throws SCHEMA_CACHE_MISS on 42P01 relation does not exist', async () => {
    const entry = envelope();
    const client = fakeClient({
      insertError: { code: '42P01', message: 'relation "eva_support_decision_log" does not exist' },
    });
    await expect(insertEntry(entry, { client })).rejects.toThrow(DecisionLogStoreError);
  });

  it('throws WRITEBACK_MISMATCH when read-after-write row differs from envelope', async () => {
    const entry = envelope({ eva_reply_summary: 'pick A' });
    const client = fakeClient({
      insertResult: { ...entry, eva_reply_summary: 'pick B' }, // DB returned different value
    });
    await expect(insertEntry(entry, { client })).rejects.toThrow(/read-after-write mismatch/);
  });

  it('throws ENVELOPE_INCOMPLETE when a REQUIRED_FIELDS entry is missing', async () => {
    const incomplete = envelope();
    delete incomplete.model;
    const client = fakeClient({});
    await expect(insertEntry(incomplete, { client })).rejects.toThrow(/envelope missing required field "model"/);
  });

  it('fail-soft mode returns inserted:false, verified:false on non-conflict insert error', async () => {
    const entry = envelope();
    const client = fakeClient({
      insertError: { code: '23514', message: 'check constraint violated' },
    });
    const result = await insertEntry(entry, { client, allowSoftFailures: true });
    expect(result.inserted).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
  });
});
