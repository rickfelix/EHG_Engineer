/**
 * SD-LEO-INFRA-CORRECTIVE-FINDING-REDIRECT-001 — PR2 of 5
 * Unit tests for lib/eva/corrective-finding-recorder.js
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let recordCorrectiveFinding;
let computeDedupHash;

beforeAll(async () => {
  const mod = await import('../../../lib/eva/corrective-finding-recorder.js');
  recordCorrectiveFinding = mod.recordCorrectiveFinding;
  computeDedupHash = mod.computeDedupHash;
});

function mockSupabase({ existing = null, lookupErr = null, insertErr = null, insertedId = 'fb-uuid-1' } = {}) {
  let inserted = null;
  return {
    inserted: () => inserted,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: existing, error: lookupErr }),
              }),
            }),
          }),
        }),
        insert(row) {
          inserted = row;
          return {
            select: () => ({
              single: () => Promise.resolve({
                data: insertErr ? null : { id: insertedId },
                error: insertErr,
              }),
            }),
          };
        },
      };
    },
  };
}

describe('computeDedupHash', () => {
  it('produces stable hash for identical input', () => {
    const a = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    const b = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent for dimensions', () => {
    const a = computeDedupHash('SD-X', ['V02', 'V01'], 'run-1');
    const b = computeDedupHash('SD-X', ['V01', 'V02'], 'run-1');
    expect(a).toBe(b);
  });

  it('differs when source_sd_id differs', () => {
    const a = computeDedupHash('SD-X', ['V01'], 'run-1');
    const b = computeDedupHash('SD-Y', ['V01'], 'run-1');
    expect(a).not.toBe(b);
  });

  it('handles null source_sd_id and gate_run_id', () => {
    const h = computeDedupHash(null, ['V01'], null);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('recordCorrectiveFinding', () => {
  const baseFinding = {
    source_sd_id: 'SD-SOURCE-001',
    source_gate: 'eva_vision_score',
    gate_run_id: '11111111-1111-1111-1111-111111111111',
    corrective_class: 'vision_gap',
    dimensions: ['V03', 'V07'],
    tier: 'gap-closure',
    score: 72,
    title: 'Vision gap V03/V07 below threshold',
    description: 'Score 72 < 83 threshold for SD-SOURCE-001',
    metadata: { rubric_run: 'rb-1' },
  };

  it('inserts a new feedback row when no duplicate exists', async () => {
    const sb = mockSupabase({ existing: null, insertedId: 'fb-1' });
    const result = await recordCorrectiveFinding(sb, baseFinding);
    expect(result.recorded).toBe(true);
    expect(result.feedbackId).toBe('fb-1');
    expect(result.dedupHash).toMatch(/^[0-9a-f]{64}$/);

    const row = sb.inserted();
    expect(row).not.toBeNull();
    expect(row.category).toBe('corrective_finding');
    expect(row.status).toBe('new');
    expect(row.type).toBe('issue');
    expect(row.source_application).toBe('EHG_Engineer');
    expect(row.source_type).toBe('auto_capture');
    expect(row.feedback_type).toBe('corrective_finding');
    expect(row.corrective_class).toBe('vision_gap');
    expect(row.source_gate).toBe('eva_vision_score');
    expect(row.gate_run_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.severity).toBe('medium');
    expect(row.metadata.dedup_hash).toBe(result.dedupHash);
    expect(row.metadata.dimensions).toEqual(['V03', 'V07']);
    expect(row.metadata.rubric_run).toBe('rb-1');
    expect(row.metadata.tier).toBe('gap-closure');
    expect(row.metadata.score).toBe(72);
  });

  it('returns existing feedbackId without inserting on dedup hit', async () => {
    const sb = mockSupabase({ existing: { id: 'fb-existing' } });
    const result = await recordCorrectiveFinding(sb, baseFinding);
    expect(result.recorded).toBe(false);
    expect(result.feedbackId).toBe('fb-existing');
    expect(sb.inserted()).toBeNull();
  });

  it('maps tier=escalation to severity=high', async () => {
    const sb = mockSupabase({ existing: null });
    await recordCorrectiveFinding(sb, { ...baseFinding, tier: 'escalation' });
    expect(sb.inserted().severity).toBe('high');
  });

  it('maps tier=minor to severity=low', async () => {
    const sb = mockSupabase({ existing: null });
    await recordCorrectiveFinding(sb, { ...baseFinding, tier: 'minor' });
    expect(sb.inserted().severity).toBe('low');
  });

  it('rejects when source_gate is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, source_gate: undefined }))
      .rejects.toThrow(/source_gate is required/);
  });

  it('rejects when corrective_class is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, corrective_class: undefined }))
      .rejects.toThrow(/corrective_class is required/);
  });

  it('rejects when title is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, title: undefined }))
      .rejects.toThrow(/title is required/);
  });

  it('rejects when tier is missing', async () => {
    const sb = mockSupabase({ existing: null });
    await expect(recordCorrectiveFinding(sb, { ...baseFinding, tier: undefined }))
      .rejects.toThrow(/tier is required/);
  });

  it('propagates insert errors', async () => {
    const sb = mockSupabase({ existing: null, insertErr: { message: 'CHECK violation' } });
    await expect(recordCorrectiveFinding(sb, baseFinding))
      .rejects.toThrow(/insert failed: CHECK violation/);
  });

  it('propagates lookup errors', async () => {
    const sb = mockSupabase({ lookupErr: { message: 'connection lost' } });
    await expect(recordCorrectiveFinding(sb, baseFinding))
      .rejects.toThrow(/dedup lookup failed: connection lost/);
  });
});
