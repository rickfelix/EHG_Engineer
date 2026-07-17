/**
 * Tests for Vision Upsert Module
 * SD: SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C
 * SD: SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001 (FR-1 venture linkage, FR-2 deliberate approval)
 */
import { describe, test, expect, vi } from 'vitest';
import { upsertVision, buildAddendumUpdatePayload } from '../vision-upsert.js';

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

  // ── SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: governed-tier keys ────────
  describe('governed-tier vision_key (FORCE-APPROVE trap closure)', () => {
    const GOVERNED_KEY = 'VISION-PORTFOLIO-STRATEGY-001';

    test('governed key with no options at all writes draft + not approved (no auto-activate)', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: GOVERNED_KEY }, captured });

      await upsertVision({ supabase, visionKey: GOVERNED_KEY, content: 'test' });

      expect(captured.record.status).toBe('draft');
      expect(captured.record.chairman_approved).toBe(false);
    });

    test('governed key with approved=true but no chairmanRatified still writes draft (approved is ignored)', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: GOVERNED_KEY }, captured });

      await upsertVision({ supabase, visionKey: GOVERNED_KEY, content: 'test', approved: true });

      expect(captured.record.status).toBe('draft');
      expect(captured.record.chairman_approved).toBe(false);
    });

    test('governed key with chairmanRatified=true writes active + chairman_approved', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: GOVERNED_KEY }, captured });

      await upsertVision({ supabase, visionKey: GOVERNED_KEY, content: 'test', chairmanRatified: true });

      expect(captured.record.status).toBe('active');
      expect(captured.record.chairman_approved).toBe(true);
    });

    test('governed key with chairmanRatified=false explicitly writes draft', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: GOVERNED_KEY }, captured });

      await upsertVision({ supabase, visionKey: GOVERNED_KEY, content: 'test', approved: true, chairmanRatified: false });

      expect(captured.record.status).toBe('draft');
      expect(captured.record.chairman_approved).toBe(false);
    });

    test('an unratified revision proposal to an already-ACTIVE governed row demotes it back to draft — each revision needs its own ratification', async () => {
      const captured = {};
      const supabase = mockSupabase({
        existing: { id: 'u', version: 1, addendums: [], extracted_dimensions: ['x'] },
        upsertResult: { id: 'u', vision_key: GOVERNED_KEY },
        captured,
      });

      // Simulates a new revision proposal (e.g. updated content) landing without re-ratification.
      await upsertVision({ supabase, visionKey: GOVERNED_KEY, content: 'revised content', approved: true });

      expect(captured.record.status).toBe('draft');
      expect(captured.record.chairman_approved).toBe(false);
    });

    test('non-governed key is unaffected by chairmanRatified option (default approval behavior preserved)', async () => {
      const captured = {};
      const supabase = mockSupabase({ upsertResult: { id: 'u', vision_key: 'V-1' }, captured });

      await upsertVision({ supabase, visionKey: 'V-1', content: 'test' });

      expect(captured.record.status).toBe('active');
      expect(captured.record.chairman_approved).toBe(true);
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

  // ── SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: addendum bypass closure ───
  // Adversarial review (PR #6138) found the CLI's `addendum` subcommand wrote
  // directly to eva_vision_documents, bypassing upsertVision()'s governed-key
  // ratification gate entirely. buildAddendumUpdatePayload() closes that gap.
  describe('buildAddendumUpdatePayload (governed-key demotion on addendum)', () => {
    const GOVERNED_KEY = 'VISION-PORTFOLIO-STRATEGY-001';

    test('addendum to a governed key demotes an already-active row back to draft', () => {
      const existing = { content: 'original content', addendums: [] };

      const { updatePayload } = buildAddendumUpdatePayload({
        visionKey: GOVERNED_KEY, existing, section: 'new section text', dimensions: null,
      });

      expect(updatePayload.status).toBe('draft');
      expect(updatePayload.chairman_approved).toBe(false);
    });

    test('addendum to a non-governed key does not touch status/chairman_approved', () => {
      const existing = { content: 'original content', addendums: [] };

      const { updatePayload } = buildAddendumUpdatePayload({
        visionKey: 'V-1', existing, section: 'new section text', dimensions: null,
      });

      expect(updatePayload.status).toBeUndefined();
      expect(updatePayload.chairman_approved).toBeUndefined();
    });

    test('combined content and addendums array are built correctly regardless of governance', () => {
      const existing = { content: 'original content', addendums: [{ section: 'first' }] };

      const { updatePayload, updatedAddendums, combinedContent } = buildAddendumUpdatePayload({
        visionKey: GOVERNED_KEY, existing, section: 'second addendum', dimensions: ['dim'],
      });

      expect(updatedAddendums).toHaveLength(2);
      expect(updatedAddendums[1].section).toBe('second addendum');
      expect(combinedContent).toContain('original content');
      expect(combinedContent).toContain('second addendum');
      expect(updatePayload.content).toBe(combinedContent);
      expect(updatePayload.extracted_dimensions).toEqual(['dim']);
    });

    test('brainstormId is threaded into both the addendum entry and the top-level payload', () => {
      const existing = { content: 'original content', addendums: [] };

      const { updatePayload, updatedAddendums } = buildAddendumUpdatePayload({
        visionKey: 'V-1', existing, section: 'new section', dimensions: null, brainstormId: 'bs-1',
      });

      expect(updatePayload.source_brainstorm_id).toBe('bs-1');
      expect(updatedAddendums[0].source_brainstorm_id).toBe('bs-1');
    });
  });
});
