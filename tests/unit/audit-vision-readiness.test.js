/**
 * SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 — unit tests for lib/eva/audit-vision-readiness.js
 *
 * Validates:
 *  - 60s dedup window collapses repeat writes
 *  - reason CHECK enum enforced at helper layer (defense-in-depth before DB)
 *  - Missing visionKey rejected
 *  - Insert failure does NOT throw (returns {error} for caller-side logging)
 *  - Successful insert returns {id, dedup:false}
 *  - Dedup cache cleared via _clearDedupCache for test isolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  writeVisionReadinessBlocked,
  _clearDedupCache,
  VISION_READINESS_REASONS,
} from '../../lib/eva/audit-vision-readiness.js';

// Mock supabase client (in-memory; no real DB writes in unit test)
function makeMockSupabase({ shouldFail = false, errorMessage = 'mock error' } = {}) {
  return {
    from(_table) {
      return {
        insert(_row) {
          return {
            select(_cols) {
              return {
                single() {
                  if (shouldFail) {
                    return Promise.resolve({ data: null, error: { message: errorMessage } });
                  }
                  return Promise.resolve({
                    data: { id: 'mock-uuid-' + Math.random().toString(36).slice(2, 10) },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('writeVisionReadinessBlocked', () => {
  beforeEach(() => _clearDedupCache());

  it('inserts a row and returns {id, dedup:false} on success', async () => {
    const supabase = makeMockSupabase();
    const result = await writeVisionReadinessBlocked({
      visionKey: 'VISION-TEST-L2-001',
      reason: 'extracted_dimensions_null',
      supabase,
    });
    expect(result.id).toMatch(/^mock-uuid-/);
    expect(result.dedup).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('rejects missing visionKey (returns error, no throw)', async () => {
    const result = await writeVisionReadinessBlocked({
      reason: 'extracted_dimensions_null',
    });
    expect(result.id).toBeNull();
    expect(result.error).toBe('visionKey is required');
  });

  it('rejects reason not in CHECK enum', async () => {
    const result = await writeVisionReadinessBlocked({
      visionKey: 'VISION-TEST-L2-001',
      reason: 'invalid_reason',
    });
    expect(result.id).toBeNull();
    expect(result.error).toContain('reason must be one of');
  });

  it('collapses repeat writes within 60s dedup window', async () => {
    const supabase = makeMockSupabase();
    const first = await writeVisionReadinessBlocked({
      visionKey: 'VISION-DEDUP-L2-001',
      reason: 'vision_not_found',
      supabase,
    });
    expect(first.dedup).toBe(false);
    expect(first.id).toMatch(/^mock-uuid-/);

    const second = await writeVisionReadinessBlocked({
      visionKey: 'VISION-DEDUP-L2-001',
      reason: 'vision_not_found',
      supabase,
    });
    expect(second.dedup).toBe(true);
    expect(second.id).toBeNull();
  });

  it('different reasons for same vision_key bypass dedup', async () => {
    const supabase = makeMockSupabase();
    const first = await writeVisionReadinessBlocked({
      visionKey: 'VISION-MULTI-L2-001',
      reason: 'vision_not_found',
      supabase,
    });
    const second = await writeVisionReadinessBlocked({
      visionKey: 'VISION-MULTI-L2-001',
      reason: 'extracted_dimensions_null',
      supabase,
    });
    expect(first.dedup).toBe(false);
    expect(second.dedup).toBe(false);
    expect(first.id).not.toBe(second.id);
  });

  it('does NOT throw when insert fails (returns {error} for caller logging)', async () => {
    const supabase = makeMockSupabase({ shouldFail: true, errorMessage: 'simulated FK violation' });
    const result = await writeVisionReadinessBlocked({
      visionKey: 'VISION-FAIL-L2-001',
      reason: 'extracted_dimensions_null',
      supabase,
    });
    expect(result.id).toBeNull();
    expect(result.dedup).toBe(false);
    expect(result.error).toBe('simulated FK violation');
  });

  it('does NOT update dedup cache when insert fails', async () => {
    const failingSupabase = makeMockSupabase({ shouldFail: true });
    await writeVisionReadinessBlocked({
      visionKey: 'VISION-RETRY-L2-001',
      reason: 'vision_not_found',
      supabase: failingSupabase,
    });

    // Retry with working supabase — should NOT be deduped because previous failed
    const workingSupabase = makeMockSupabase();
    const retry = await writeVisionReadinessBlocked({
      visionKey: 'VISION-RETRY-L2-001',
      reason: 'vision_not_found',
      supabase: workingSupabase,
    });
    expect(retry.dedup).toBe(false);
    expect(retry.id).toMatch(/^mock-uuid-/);
  });
});

describe('VISION_READINESS_REASONS enum', () => {
  it('exports the 7 documented reason values', () => {
    expect(VISION_READINESS_REASONS).toEqual([
      'vision_not_found',
      'vision_query_error',
      'extracted_dimensions_null',
      'content_too_short',
      'status_inactive',
      'level_below_minimum',
      'venture_id_missing',
    ]);
  });

  it('enum is frozen (immutable)', () => {
    expect(Object.isFrozen(VISION_READINESS_REASONS)).toBe(true);
  });
});
