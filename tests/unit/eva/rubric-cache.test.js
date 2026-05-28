/**
 * Tests for lib/eva/rubric-cache.js
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 FR-3 (TS-1..TS-4, TS-3b).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeCacheKey,
  getCachedRubrics,
  setCachedRubrics,
} from '../../../lib/eva/rubric-cache.js';

function makeSupabaseMock({ row = null, upsertError = null, updateError = null } = {}) {
  const calls = { update: [], upsert: [], select: [] };
  return {
    calls,
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.select.push({ table });
            return { data: row, error: null };
          },
        }),
      }),
      update: (patch) => ({
        eq: (col, val) => {
          calls.update.push({ table, patch, col, val });
          return { error: updateError };
        },
      }),
      upsert: (newRow, opts) => {
        calls.upsert.push({ table, newRow, opts });
        return { error: upsertError };
      },
    }),
  };
}

describe('computeCacheKey', () => {
  it('TS-3 (vision side): key differs when vision_content_hash changes', () => {
    const k1 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'X' });
    const k2 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'B', plan_content_hash: 'X' });
    expect(k1).not.toBe(k2);
  });

  it('TS-3b (arch side): key differs when plan_content_hash changes (TR-7 dual-hash)', () => {
    const k1 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'X' });
    const k2 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'Y' });
    expect(k1).not.toBe(k2);
  });

  it('is deterministic for same inputs', () => {
    const k1 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'X' });
    const k2 = computeCacheKey({ vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'X' });
    expect(k1).toBe(k2);
  });

  it('produces a 64-char hex SHA-256', () => {
    const k = computeCacheKey({ vision_key: 'V', plan_key: 'P' });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getCachedRubrics', () => {
  it('TS-1: returns null on cache miss', async () => {
    const sb = makeSupabaseMock({ row: null });
    const result = await getCachedRubrics(sb, 'anykey');
    expect(result).toBeNull();
  });

  it('TS-4: returns Map on hit and updates last_hit_at', async () => {
    const rubricsObj = { V01: { id: 'V01', name: 'foo', checks: [] } };
    const sb = makeSupabaseMock({ row: { rubrics: rubricsObj } });
    const result = await getCachedRubrics(sb, 'somekey');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(1);
    expect(result.get('V01').id).toBe('V01');
    const hitUpdate = sb.calls.update.find(u => u.col === 'cache_key' && u.val === 'somekey');
    expect(hitUpdate).toBeDefined();
    expect(hitUpdate.patch.last_hit_at).toBeTypeOf('string');
  });
});

describe('setCachedRubrics', () => {
  it('TS-2: upserts the rubrics row keyed on cache_key', async () => {
    const sb = makeSupabaseMock();
    const rubrics = new Map([['V01', { id: 'V01', name: 'foo', checks: [] }]]);
    await setCachedRubrics(
      sb, 'somekey', rubrics,
      { vision_key: 'V', plan_key: 'P', vision_content_hash: 'A', plan_content_hash: 'X' },
      { generator_model: 'claude-sonnet-4-6', generator_cost_usd: 0.0123 }
    );
    expect(sb.calls.upsert).toHaveLength(1);
    const call = sb.calls.upsert[0];
    expect(call.table).toBe('eva_vision_rubric_cache');
    expect(call.newRow.cache_key).toBe('somekey');
    expect(call.newRow.vision_key).toBe('V');
    expect(call.newRow.plan_key).toBe('P');
    expect(call.newRow.vision_content_hash).toBe('A');
    expect(call.newRow.plan_content_hash).toBe('X');
    expect(call.newRow.rubrics).toEqual({ V01: { id: 'V01', name: 'foo', checks: [] } });
    expect(call.newRow.generator_model).toBe('claude-sonnet-4-6');
    expect(call.newRow.generator_cost_usd).toBe(0.0123);
    expect(call.opts).toEqual({ onConflict: 'cache_key' });
  });

  it('throws when upsert errors', async () => {
    const sb = makeSupabaseMock({ upsertError: { message: 'boom' } });
    const rubrics = new Map();
    await expect(setCachedRubrics(sb, 'k', rubrics, { vision_key: 'V', plan_key: 'P' }))
      .rejects.toThrow(/boom/);
  });
});

describe('round-trip', () => {
  it('TS-2 (full roundtrip): setCachedRubrics then getCachedRubrics returns same Map content', async () => {
    let stored = null;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: stored, error: null }),
          }),
        }),
        update: () => ({ eq: () => ({ error: null }) }),
        upsert: (row) => {
          stored = { rubrics: row.rubrics };
          return { error: null };
        },
      }),
    };
    const before = new Map([
      ['V01', { id: 'V01', name: 'foo', checks: [{ id: 'V01-C1', type: 'file_exists', weight: 100, params: { glob: 'x' } }] }],
      ['A01', { id: 'A01', name: 'bar', checks: [] }],
    ]);
    await setCachedRubrics(sb, 'rtkey', before, { vision_key: 'V', plan_key: 'P' });
    const after = await getCachedRubrics(sb, 'rtkey');
    expect(after).toBeInstanceOf(Map);
    expect(after.size).toBe(2);
    expect(after.get('V01')).toEqual(before.get('V01'));
    expect(after.get('A01')).toEqual(before.get('A01'));
  });
});
