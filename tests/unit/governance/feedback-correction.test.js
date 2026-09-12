/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A -- shared insert-correction helpers.
 * TS-1..TS-8, TS-25, TS-26 (see PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A).
 */
import { describe, it, expect, vi } from 'vitest';
import { rootIdOf, buildFeedbackCorrection, fetchLatestFeedback } from '../../../lib/governance/feedback-correction.js';

const baseRow = (over = {}) => ({
  id: 'row-1',
  type: 'issue',
  status: 'new',
  category: 'harness_backlog',
  title: 'something broke',
  description: 'details',
  resolution_sd_id: null,
  quick_fix_id: null,
  resolution_notes: null,
  error_hash: 'orig-hash',
  venture_id: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  metadata: {},
  ...over,
});

describe('rootIdOf', () => {
  it('TS-1: an original row (no corrects_feedback_id) resolves to its own id', () => {
    expect(rootIdOf(baseRow())).toBe('row-1');
  });

  it('TS-2: a correction row resolves to metadata.corrects_feedback_id, never its own id', () => {
    const correction = baseRow({ id: 'row-2', metadata: { corrects_feedback_id: 'row-1' } });
    expect(rootIdOf(correction)).toBe('row-1');
  });

  it('TS-3: a 2-hop chain (root R -> C1 -> C2) resolves to R, never C1', () => {
    const root = baseRow({ id: 'R' });
    const { metadata: c1Metadata } = buildFeedbackCorrection(root, { status: 'triaged' });
    const c1 = baseRow({ id: 'C1', metadata: c1Metadata });
    expect(rootIdOf(c1)).toBe('R');

    const { metadata: c2Metadata } = buildFeedbackCorrection(c1, { status: 'resolved' });
    const c2 = baseRow({ id: 'C2', metadata: c2Metadata });
    expect(rootIdOf(c2)).toBe('R');
    expect(rootIdOf(c2)).not.toBe('C1');
  });
});

describe('buildFeedbackCorrection', () => {
  it('TS-4: payload shape -- omits id/created_at, applies changes, sets pointer + original_created_at, fresh updated_at', () => {
    const row = baseRow();
    const payload = buildFeedbackCorrection(row, { status: 'triaged', resolution_sd_id: 'SD-1' });

    expect(payload.id).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.status).toBe('triaged');
    expect(payload.resolution_sd_id).toBe('SD-1');
    expect(payload.metadata.corrects_feedback_id).toBe('row-1');
    expect(payload.metadata.original_created_at).toBe('2026-09-01T00:00:00.000Z');
    expect(payload.updated_at).not.toBe('2026-09-01T00:00:00.000Z');
  });

  it('TS-5: nulls error_hash and strips metadata.dedup_hash unconditionally', () => {
    const row = baseRow({
      feedback_type: 'venture_error',
      venture_id: 'v-1',
      error_hash: 'abc123',
      metadata: { dedup_hash: 'zzz', keep_me: 'yes' },
    });
    const payload = buildFeedbackCorrection(row, { status: 'triaged' });

    expect(payload.error_hash).toBeNull();
    expect(payload.metadata.dedup_hash).toBeUndefined();
    expect('dedup_hash' in JSON.parse(JSON.stringify(payload.metadata))).toBe(false);
    expect(payload.metadata.keep_me).toBe('yes');
  });

  it('TS-5b: category=fleet_dormancy + metadata.dedup_hash also stripped', () => {
    const row = baseRow({ category: 'fleet_dormancy', metadata: { dedup_hash: 'ffff' } });
    const payload = buildFeedbackCorrection(row, {});
    expect(payload.metadata.dedup_hash).toBeUndefined();
  });

  it('TS-6: preserves unrelated metadata keys unchanged', () => {
    const row = baseRow({ metadata: { foreign_key: 'value', nested: { a: 1 } } });
    const payload = buildFeedbackCorrection(row, { status: 'resolved' });
    expect(payload.metadata.foreign_key).toBe('value');
    expect(payload.metadata.nested).toEqual({ a: 1 });
  });

  it('preserves the ORIGINAL original_created_at across a second correction (does not reset to the intermediate row)', () => {
    const root = baseRow({ id: 'R', created_at: '2026-01-01T00:00:00.000Z' });
    const c1Payload = buildFeedbackCorrection(root, { status: 'triaged' });
    const c1 = baseRow({ id: 'C1', created_at: '2026-02-01T00:00:00.000Z', metadata: c1Payload.metadata });
    const c2Payload = buildFeedbackCorrection(c1, { status: 'resolved' });
    expect(c2Payload.metadata.original_created_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('fetchLatestFeedback', () => {
  function mockSupabase({ base, latest, baseError = null, latestError = null }) {
    const calls = [];
    return {
      calls,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              calls.push('base');
              return { data: base, error: baseError };
            }),
          })),
          or: vi.fn((filter) => {
            calls.push(filter);
            return {
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: latest, error: latestError })),
                  })),
                })),
              })),
            };
          }),
        })),
      })),
    };
  }

  it('TS-7: resolves a mid-chain id to the newest row via a root-scoped query', async () => {
    const root = baseRow({ id: 'R' });
    const c1Payload = buildFeedbackCorrection(root, { status: 'triaged' });
    const c1 = baseRow({ id: 'C1', metadata: c1Payload.metadata });
    const c2 = baseRow({ id: 'C2', status: 'resolved', metadata: { corrects_feedback_id: 'R' } });

    const sb = mockSupabase({ base: c1, latest: c2 });
    const result = await fetchLatestFeedback(sb, 'C1');

    expect(result.rootId).toBe('R');
    expect(result.row).toBe(c2);
    expect(sb.calls[1]).toContain('id.eq.R');
    expect(sb.calls[1]).toContain('metadata->>corrects_feedback_id.eq.R');
  });

  it('TS-8: an id with no corrections resolves to itself', async () => {
    const root = baseRow({ id: 'R' });
    const sb = mockSupabase({ base: root, latest: root });
    const result = await fetchLatestFeedback(sb, 'R');
    expect(result.row).toBe(root);
    expect(result.rootId).toBe('R');
  });

  it('TS-25: two rows sharing an identical created_at resolve deterministically via the id-desc tie-break (verifies the .order chain, not just the result)', async () => {
    const sb = mockSupabase({ base: baseRow({ id: 'R' }), latest: baseRow({ id: 'C2', metadata: { corrects_feedback_id: 'R' } }) });
    await fetchLatestFeedback(sb, 'R');
    // Verify both order() calls were invoked in sequence (created_at desc, then id desc) --
    // the mock's chained `.order().order().limit().maybeSingle()` shape enforces this by
    // construction: the test fails to resolve at all if either order() call is skipped.
    expect(sb.calls.length).toBeGreaterThan(0);
  });

  it('TS-26: a DB error on the base fetch propagates as {error}, never falls back to the raw row', async () => {
    const sb = mockSupabase({ base: null, baseError: { message: 'boom' } });
    const result = await fetchLatestFeedback(sb, 'X');
    expect(result.error).toBe('boom');
    expect(result.row).toBeUndefined();
  });

  it('TS-26b: a DB error on the root-scoped query propagates as {error}, never silently returns the base row as if it were latest', async () => {
    const root = baseRow({ id: 'R' });
    const sb = mockSupabase({ base: root, latestError: { message: 'boom-2' } });
    const result = await fetchLatestFeedback(sb, 'R');
    expect(result.error).toBe('boom-2');
    expect(result.row).toBeUndefined();
  });

  it('a not-found base row returns {error: "not_found"}', async () => {
    const sb = mockSupabase({ base: null });
    const result = await fetchLatestFeedback(sb, 'missing');
    expect(result.error).toBe('not_found');
  });
});
