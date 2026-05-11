/**
 * SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-7
 *
 * Pin extended emitFeedback API contract:
 *   - FR-1: priority / priority_reasoning / source_id pass-through
 *   - TR-2: dedup_hash composition guard (source_id MUST NOT join hash)
 *   - TR-4: priority enum validation throws INVALID_PRIORITY:<value>
 *   - FR-2: emitFeedbackBatch happy path / dedup / empty / invalid / PA-5 dual-write
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the audit-events-emitter BEFORE importing emit-feedback.js
const writeAuditEventMock = vi.fn();
vi.mock('../../lib/security/audit-events-emitter.js', () => ({
  writeAuditEvent: (...args) => writeAuditEventMock(...args),
}));

const { emitFeedback, emitFeedbackBatch, ALLOWED_PRIORITIES } = await import('../../lib/governance/emit-feedback.js');

// --- mock supabase client factory ---
function makeMockSupabase({ existingDedupHash = null, insertReturn = null, insertError = null } = {}) {
  const inserts = [];
  const insertCalls = []; // record full payloads
  const dedupLookups = [];

  const client = {
    from(_table) {
      return {
        select(_cols) {
          return {
            eq: (col, val) => ({
              eq: (col2, val2) => ({
                maybeSingle: async () => {
                  dedupLookups.push({ col, val, col2, val2 });
                  if (existingDedupHash && val2 === existingDedupHash) {
                    return { data: { id: 'existing-row-id' } };
                  }
                  return { data: null };
                },
              }),
              not: () => ({ then: async () => ({ data: [], error: null }) }),
            }),
          };
        },
        insert(payload) {
          insertCalls.push(payload);
          if (Array.isArray(payload)) {
            inserts.push(...payload);
            return {
              select: () => ({
                then: (cb) => cb({ data: insertReturn ?? payload.map((_, i) => ({ id: `new-id-${i}` })), error: insertError }),
              }),
            };
          }
          inserts.push(payload);
          return {
            select: () => ({
              single: async () => ({ data: insertReturn ?? { id: 'new-row-id' }, error: insertError }),
            }),
          };
        },
      };
    },
    inserts,
    insertCalls,
    dedupLookups,
  };
  return client;
}

beforeEach(() => {
  writeAuditEventMock.mockReset();
  delete process.env.SECURITY_AUDIT_DUAL_WRITE_PA5;
  process.env.AUTO_FILL_DEFERRED_FROM_SD_KEY = '0'; // disable auto-fill in tests
});

describe('FR-1: emitFeedback pass-through fields', () => {
  it('passes priority + priority_reasoning + source_id to INSERT row', async () => {
    const sb = makeMockSupabase();
    await emitFeedback({
      supabase: sb,
      title: 't', description: 'd',
      priority: 'high',
      priority_reasoning: 'UAT failure',
      source_id: 'scenario-42',
      dedup_key: 'k1',
    });
    const row = sb.inserts[0];
    expect(row.priority).toBe('high');
    expect(row.priority_reasoning).toBe('UAT failure');
    expect(row.source_id).toBe('scenario-42');
  });

  it('omits optional fields from INSERT when not provided (additive backward-compat)', async () => {
    const sb = makeMockSupabase();
    await emitFeedback({ supabase: sb, title: 't', description: 'd' });
    const row = sb.inserts[0];
    expect(row).not.toHaveProperty('priority');
    expect(row).not.toHaveProperty('priority_reasoning');
    expect(row).not.toHaveProperty('source_id');
  });
});

describe('TR-4: priority enum validation', () => {
  it('throws INVALID_PRIORITY:HIGH on uppercase', async () => {
    const sb = makeMockSupabase();
    await expect(
      emitFeedback({ supabase: sb, title: 't', description: 'd', priority: 'HIGH' }),
    ).rejects.toThrow(/INVALID_PRIORITY:HIGH/);
  });

  it('accepts all 4 allowed values', async () => {
    for (const p of ['critical', 'high', 'medium', 'low']) {
      const sb = makeMockSupabase();
      await emitFeedback({ supabase: sb, title: 't', description: 'd', priority: p, dedup_key: `k-${p}` });
      expect(sb.inserts[0].priority).toBe(p);
    }
  });

  it('exposes ALLOWED_PRIORITIES as a frozen Set', () => {
    expect(ALLOWED_PRIORITIES instanceof Set).toBe(true);
    expect(Object.isFrozen(ALLOWED_PRIORITIES)).toBe(true);
    expect(ALLOWED_PRIORITIES.size).toBe(4);
  });
});

describe('TR-2: dedup_hash composition guard (source_id MUST NOT join hash)', () => {
  it('produces identical dedup_hash when only source_id varies', async () => {
    const sb1 = makeMockSupabase();
    const sb2 = makeMockSupabase();
    await emitFeedback({ supabase: sb1, title: 't', description: 'd', dedup_key: 'k', source_id: 'A' });
    await emitFeedback({ supabase: sb2, title: 't', description: 'd', dedup_key: 'k', source_id: 'B' });
    const hash1 = sb1.inserts[0].metadata.dedup_hash;
    const hash2 = sb2.inserts[0].metadata.dedup_hash;
    expect(hash1).toBe(hash2);
  });

  it('produces identical dedup_hash when only priority varies', async () => {
    const sb1 = makeMockSupabase();
    const sb2 = makeMockSupabase();
    await emitFeedback({ supabase: sb1, title: 't', description: 'd', dedup_key: 'k', priority: 'high' });
    await emitFeedback({ supabase: sb2, title: 't', description: 'd', dedup_key: 'k', priority: 'low' });
    expect(sb1.inserts[0].metadata.dedup_hash).toBe(sb2.inserts[0].metadata.dedup_hash);
  });
});

describe('FR-2: emitFeedbackBatch', () => {
  it('happy path inserts N items in single .insert() call', async () => {
    const sb = makeMockSupabase();
    const items = [
      { title: 't1', description: 'd1', dedup_key: 'k1' },
      { title: 't2', description: 'd2', dedup_key: 'k2' },
      { title: 't3', description: 'd3', dedup_key: 'k3' },
    ];
    const result = await emitFeedbackBatch({ supabase: sb, items });
    expect(result.inserted).toHaveLength(3);
    expect(result.skipped).toBe(0);
    expect(result.deduped).toEqual([]);
    // Single .insert() call with array payload
    const arrayCalls = sb.insertCalls.filter(p => Array.isArray(p));
    expect(arrayCalls).toHaveLength(1);
    expect(arrayCalls[0]).toHaveLength(3);
  });

  it('returns clean shape without INSERT call when items=[]', async () => {
    const sb = makeMockSupabase();
    const result = await emitFeedbackBatch({ supabase: sb, items: [] });
    expect(result).toEqual({ inserted: [], skipped: 0, deduped: [] });
    expect(sb.insertCalls).toEqual([]);
  });

  it('throws BATCH_ITEM_INVALID:<idx> for missing title or description', async () => {
    const sb = makeMockSupabase();
    await expect(
      emitFeedbackBatch({ supabase: sb, items: [{ title: 't', description: 'd' }, { title: '' }] }),
    ).rejects.toThrow(/BATCH_ITEM_INVALID:1/);
  });

  it('throws when supabase missing', async () => {
    await expect(emitFeedbackBatch({ items: [] })).rejects.toThrow(/supabase client is required/);
  });

  it('throws when items is not an array', async () => {
    const sb = makeMockSupabase();
    await expect(emitFeedbackBatch({ supabase: sb, items: 'not-an-array' })).rejects.toThrow(/items must be an array/);
  });

  it('shared fields apply to each item with per-item override', async () => {
    const sb = makeMockSupabase();
    const items = [
      { title: 't1', description: 'd1', dedup_key: 'k1' },
      { title: 't2', description: 'd2', dedup_key: 'k2', severity: 'high' },
    ];
    await emitFeedbackBatch({ supabase: sb, items, shared: { severity: 'medium', source_application: 'engineer' } });
    expect(sb.inserts[0].severity).toBe('medium');
    expect(sb.inserts[0].source_application).toBe('engineer');
    expect(sb.inserts[1].severity).toBe('high'); // per-item wins
    expect(sb.inserts[1].source_application).toBe('engineer');
  });

  it('PA-5 dual-write fires per qualifying item in batch when env flag set', async () => {
    process.env.SECURITY_AUDIT_DUAL_WRITE_PA5 = 'true';
    const sb = makeMockSupabase({ insertReturn: [{ id: 'id-0' }, { id: 'id-1' }, { id: 'id-2' }] });
    const items = [
      { title: 't1', description: 'd1', dedup_key: 'k1', metadata: { event_type: 'capability_suppression' } },
      { title: 't2', description: 'd2', dedup_key: 'k2' }, // not qualifying
      { title: 't3', description: 'd3', dedup_key: 'k3', metadata: { event_type: 'capability_suppression' } },
    ];
    await emitFeedbackBatch({ supabase: sb, items });
    expect(writeAuditEventMock).toHaveBeenCalledTimes(2);
    // Confirm feedback_id arg matches batch insert id ordering
    expect(writeAuditEventMock.mock.calls[0][0].event_payload.feedback_id).toBe('id-0');
    expect(writeAuditEventMock.mock.calls[1][0].event_payload.feedback_id).toBe('id-2');
  });

  it('PA-5 dual-write does NOT fire when env flag not set', async () => {
    delete process.env.SECURITY_AUDIT_DUAL_WRITE_PA5;
    const sb = makeMockSupabase();
    const items = [
      { title: 't1', description: 'd1', dedup_key: 'k1', metadata: { event_type: 'capability_suppression' } },
    ];
    await emitFeedbackBatch({ supabase: sb, items });
    expect(writeAuditEventMock).not.toHaveBeenCalled();
  });
});
