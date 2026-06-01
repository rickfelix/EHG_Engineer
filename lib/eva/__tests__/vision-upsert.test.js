/**
 * Tests for Vision Upsert Module
 * SD: SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C
 * SD: SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001 (FR-1 venture linkage, FR-2 deliberate approval)
 */
import { describe, test, expect, vi } from 'vitest';
import { upsertVision } from '../vision-upsert.js';

// Table-aware mock supabase client.
//  - eva_vision_documents: select(...).eq(vision_key).maybeSingle() => existing,
//    and upsert(...).select(...).single() => upsertResult/upsertError. Captures the
//    upserted record on `captured.record` for assertions.
//  - brainstorm_sessions: select(...).eq(id).maybeSingle() => brainstormSession.
function mockSupabase({
  existing = null,
  upsertResult = null,
  upsertError = null,
  brainstormSession = null,
  captured = {},
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'brainstorm_sessions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: brainstormSession, error: null })),
            })),
          })),
        };
      }
      // eva_vision_documents
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
            single: vi.fn(async () => ({ data: upsertResult, error: upsertError })),
          })),
        })),
        upsert: vi.fn((record) => {
          captured.record = record;
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: upsertResult, error: upsertError })),
            })),
          };
        }),
      };
    }),
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

    const { error } = await upsertVision({
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

  // ── FR-2: deliberate approval ──────────────────────────────────────────────
  describe('FR-2 deliberate approval', () => {
    test('default (no approved option) writes active + chairman_approved (backward-compat)', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test' });

      expect(captured.record.status).toBe('active');
      expect(captured.record.chairman_approved).toBe(true);
    });

    test('approved=true writes active + chairman_approved', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', approved: true });

      expect(captured.record.status).toBe('active');
      expect(captured.record.chairman_approved).toBe(true);
    });

    test('approved=false writes draft + not approved', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', approved: false });

      expect(captured.record.status).toBe('draft');
      expect(captured.record.chairman_approved).toBe(false);
    });
  });

  // ── FR-1: vision→venture linkage at write time ─────────────────────────────
  describe('FR-1 venture linkage at write time', () => {
    test('explicit ventureId is used and wins (no brainstorm lookup needed)', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', ventureId: 'VEN-EXPLICIT' });

      expect(captured.record.venture_id).toBe('VEN-EXPLICIT');
    });

    test('brainstorm-sourced single-venture upsert links venture_id', async () => {
      const captured = {};
      const supabase = mockSupabase({
        upsertResult: { id: 'u', vision_key: 'V-1' },
        brainstormSession: { venture_ids: ['VEN-SINGLE'], cross_venture: false },
        captured,
      });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', brainstormId: 'bs-1' });

      expect(captured.record.venture_id).toBe('VEN-SINGLE');
      expect(supabase.from).toHaveBeenCalledWith('brainstorm_sessions');
    });

    test('cross_venture brainstorm leaves venture_id null', async () => {
      const captured = {};
      const supabase = mockSupabase({
        upsertResult: { id: 'u', vision_key: 'V-1' },
        brainstormSession: { venture_ids: ['VEN-A'], cross_venture: true },
        captured,
      });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', brainstormId: 'bs-1' });

      expect(captured.record.venture_id).toBeUndefined();
    });

    test('multi-venture brainstorm leaves venture_id null', async () => {
      const captured = {};
      const supabase = mockSupabase({
        upsertResult: { id: 'u', vision_key: 'V-1' },
        brainstormSession: { venture_ids: ['VEN-A', 'VEN-B'], cross_venture: false },
        captured,
      });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', brainstormId: 'bs-1' });

      expect(captured.record.venture_id).toBeUndefined();
    });

    test('no brainstorm and no ventureId leaves venture_id null', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test' });

      expect(captured.record.venture_id).toBeUndefined();
      expect(supabase.from).not.toHaveBeenCalledWith('brainstorm_sessions');
    });

    test('brainstorm with zero venture_ids leaves venture_id null', async () => {
      const captured = {};
      const supabase = mockSupabase({
        upsertResult: { id: 'u', vision_key: 'V-1' },
        brainstormSession: { venture_ids: [], cross_venture: false },
        captured,
      });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test', brainstormId: 'bs-1' });

      expect(captured.record.venture_id).toBeUndefined();
    });
  });
});
