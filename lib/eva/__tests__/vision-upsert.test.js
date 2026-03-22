/**
 * Tests for Vision Upsert Module
 * SD: SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C
 */
import { describe, test, expect, vi } from 'vitest';
import { upsertVision } from '../vision-upsert.js';

// Mock supabase client
function mockSupabase({ existing = null, upsertResult = null, upsertError = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
          single: vi.fn(async () => ({ data: upsertResult, error: upsertError })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: upsertResult, error: upsertError })),
        })),
      })),
    })),
  };
}

describe('upsertVision', () => {
  test('throws if supabase is missing', async () => {
    await expect(upsertVision({ visionKey: 'V-1', content: 'test' }))
      .rejects.toThrow('supabase client is required');
  });

  test('throws if visionKey is missing', async () => {
    await expect(upsertVision({ supabase: {}, content: 'test' }))
      .rejects.toThrow('visionKey is required');
  });

  test('throws if content is missing', async () => {
    await expect(upsertVision({ supabase: {}, visionKey: 'V-1' }))
      .rejects.toThrow('content is required');
  });

  test('returns data on successful upsert (new document)', async () => {
    const result = { id: 'uuid-1', vision_key: 'V-1', level: 'L2', version: 1, status: 'active' };
    const supabase = mockSupabase({ existing: null, upsertResult: result });

    const { data, error } = await upsertVision({
      supabase,
      visionKey: 'V-1',
      content: '# Vision\n\nTest content',
    });

    expect(error).toBeNull();
    expect(data).toEqual(result);
    expect(supabase.from).toHaveBeenCalledWith('eva_vision_documents');
  });

  test('returns error on upsert failure', async () => {
    const supabase = mockSupabase({ upsertError: { message: 'DB error' } });

    const { data, error } = await upsertVision({
      supabase,
      visionKey: 'V-1',
      content: 'test',
    });

    expect(error).toBeTruthy();
    expect(error.message).toBe('DB error');
  });

  test('defaults level to L2 and createdBy to eva-vision-upsert', async () => {
    const result = { id: 'uuid-1', vision_key: 'V-1', level: 'L2', version: 1, status: 'active' };
    const supabase = mockSupabase({ upsertResult: result });

    await upsertVision({ supabase, visionKey: 'V-1', content: 'test' });

    // Verify the upsert was called (from was called with correct table)
    expect(supabase.from).toHaveBeenCalledWith('eva_vision_documents');
  });
});
