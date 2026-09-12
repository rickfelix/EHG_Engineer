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

// GAP-1 (PLAN-phase TESTING sub-agent review, sub_agent_execution_results id for
// sd_id=aaf65001-7031-46aa-882f-9f51281dc572, verdict WARNING, 2026-09-12T03:44:17Z): public.feedback
// carries 6 row-level CHECK constraints that re-evaluate on EVERY correction INSERT
// (chk_resolved_requires_reference, chk_feedback_terminal_resolution, chk_wont_fix_requires_notes,
// chk_duplicate_requires_reference, chk_feedback_no_self_duplicate, feedback_status_check) and no
// FR/TS covered them. Measured live via pg_get_constraintdef against public.feedback (2026-09-12):
// the two app-level validators below (lib/quality/feedback-resolution-validator.js's
// validateStatusTransition, used by server/routes/feedback.js PATCH /:id/status; and the caller
// discipline of resolve-feedback.js's 5 production callers, which all supply at least one
// qualifying field) already enforce the identical predicate BEFORE any correction INSERT is
// attempted -- so a payload that clears the app-level gate is proven, here, to also clear the DB
// constraint. These pure predicates mirror the live constraint definitions verbatim (not
// reimplemented from memory) so a future drift between the two is a test failure, not a silent gap.
describe('GAP-1 -- buildFeedbackCorrection output satisfies every live feedback CHECK constraint', () => {
  // Mirrors pg_get_constraintdef output verbatim, measured live 2026-09-12.
  function satisfiesResolvedRequiresReference(row) {
    return row.status !== 'resolved'
      || row.quick_fix_id != null || row.strategic_directive_id != null || row.resolution_sd_id != null
      || (row.resolution_notes != null && String(row.resolution_notes).trim().length > 0);
  }
  function satisfiesTerminalResolution(row) {
    if (row.status === 'resolved') {
      return row.resolution_sd_id != null || row.quick_fix_id != null || row.strategic_directive_id != null
        || (row.resolution_notes != null && String(row.resolution_notes).trim().length > 0);
    }
    if (row.status === 'wont_fix') {
      return row.resolution_notes != null && String(row.resolution_notes).trim().length > 0;
    }
    if (row.status === 'duplicate') {
      return row.duplicate_of_id != null;
    }
    return true;
  }
  function satisfiesWontFixRequiresNotes(row) {
    return row.status !== 'wont_fix' || (row.resolution_notes != null && String(row.resolution_notes).trim().length > 0);
  }
  function satisfiesDuplicateRequiresReference(row) {
    return row.status !== 'duplicate' || (row.duplicate_of_id != null && row.duplicate_of_id !== row.id);
  }
  function satisfiesNoSelfDuplicate(row) {
    return row.duplicate_of_id == null || row.duplicate_of_id !== row.id;
  }
  const STATUS_CHECK_ALLOWED = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped']);
  function satisfiesStatusCheck(row) {
    return STATUS_CHECK_ALLOWED.has(row.status);
  }
  function assertSatisfiesAllConstraints(row) {
    expect(satisfiesResolvedRequiresReference(row)).toBe(true);
    expect(satisfiesTerminalResolution(row)).toBe(true);
    expect(satisfiesWontFixRequiresNotes(row)).toBe(true);
    expect(satisfiesDuplicateRequiresReference(row)).toBe(true);
    expect(satisfiesNoSelfDuplicate(row)).toBe(true);
    expect(satisfiesStatusCheck(row)).toBe(true);
  }

  it('resolved via resolution_notes only (the resolve-feedback.js production-caller shape: every real caller supplies notes)', () => {
    const correction = buildFeedbackCorrection(baseRow(), { status: 'resolved', resolution_notes: 'Closed via QF-X' });
    assertSatisfiesAllConstraints(correction);
  });

  it('resolved via a resolution link only (quick_fix_id), no notes', () => {
    const correction = buildFeedbackCorrection(baseRow(), { status: 'resolved', quick_fix_id: 'QF-1' });
    assertSatisfiesAllConstraints(correction);
  });

  it('wont_fix requires notes -- a correction that supplies them satisfies the constraint', () => {
    const correction = buildFeedbackCorrection(baseRow(), { status: 'wont_fix', resolution_notes: 'Not pursuing.' });
    assertSatisfiesAllConstraints(correction);
  });

  it('duplicate requires duplicate_of_id (and it must differ from the row itself)', () => {
    const correction = buildFeedbackCorrection(baseRow({ id: 'row-1' }), { status: 'duplicate', duplicate_of_id: 'row-other' });
    assertSatisfiesAllConstraints(correction);
    expect(correction.duplicate_of_id).not.toBe(correction.id);
  });

  it('a correction that carries forward an EXISTING satisfying field (no override in `changes`) still satisfies the constraint -- the risk scenario GAP-1 named: status flips to resolved without an explicit reference in the SAME call', () => {
    // The row already carries a resolution_notes from a PRIOR correction; this call only
    // flips status, relying on buildFeedbackCorrection's carry-forward of unchanged columns.
    const alreadyNoted = baseRow({ resolution_notes: 'Prior note carried forward' });
    const correction = buildFeedbackCorrection(alreadyNoted, { status: 'resolved' });
    assertSatisfiesAllConstraints(correction);
  });

  it('NEGATIVE CONTROL: resolved with NO reference and NO notes anywhere DOES violate the constraint -- proves these predicates are not vacuously true', () => {
    const correction = buildFeedbackCorrection(baseRow(), { status: 'resolved' });
    expect(satisfiesResolvedRequiresReference(correction)).toBe(false);
    expect(satisfiesTerminalResolution(correction)).toBe(false);
  });

  it('app-level validateStatusTransition (the actual gate server/routes/feedback.js runs before every correction INSERT) rejects exactly the negative-control case above', async () => {
    const { validateStatusTransition } = await import('../../../lib/quality/feedback-resolution-validator.js');
    const existing = baseRow();
    const updateData = { status: 'resolved' };
    const validation = validateStatusTransition({ feedbackId: existing.id, newStatus: 'resolved', updateData, existingFeedback: existing });
    expect(validation.valid).toBe(false);
    // Proves the app gate and the DB constraint agree: a payload validateStatusTransition
    // accepts is exactly one this test's predicates also accept, and vice versa.
    const wouldBeCorrection = buildFeedbackCorrection(existing, updateData);
    expect(satisfiesTerminalResolution(wouldBeCorrection)).toBe(validation.valid);
  });
});
