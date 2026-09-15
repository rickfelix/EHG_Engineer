/**
 * SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001, FR-3, TS-3.
 *
 * promoteVisionDocument() mirrors promoteArchPlan()'s shape and constraints for
 * eva_vision_documents: distinct-seat approval writes approved_by/approved_by_at,
 * self-approval is refused and writes nothing, a concurrent-promotion race is lost safely,
 * created_by is never touched, and the write degrades gracefully if the new columns are not
 * yet live (42703).
 */
import { describe, it, expect } from 'vitest';
import { promoteVisionDocument } from '../../../lib/eva/vision-promote.js';

function makeSupabase({ row, raceWon = true, failCallsWithCode = null }) {
  const capture = { updates: [] };
  let failuresRemaining = failCallsWithCode ? failCallsWithCode.count : 0;
  const failCode = failCallsWithCode ? failCallsWithCode.code : null;
  return {
    capture,
    from(table) {
      expect(table).toBe('eva_vision_documents');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
        update: (payload) => {
          capture.updates.push(payload);
          const shouldFail = failuresRemaining > 0;
          if (shouldFail) failuresRemaining -= 1;
          const chain = {
            eq: () => chain,
            select: () => ({
              single: async () => {
                if (shouldFail) {
                  return { data: null, error: { code: failCode, message: `simulated ${failCode}` } };
                }
                if (!raceWon) {
                  return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
                }
                return { data: { ...row, ...payload }, error: null };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
}

describe('promoteVisionDocument (FR-3, TS-3): distinct-seat approval writes approved_by/approved_by_at', () => {
  it('writes approved_by=promotedBy and a real approved_by_at timestamp', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'seat-A' },
    });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(true);
    expect(result.columnsApplied).toBe(true);
    const updated = sb.capture.updates[0];
    expect(updated.approved_by).toBe('seat-B');
    expect(typeof updated.approved_by_at).toBe('string');
    expect(new Date(updated.approved_by_at).toString()).not.toBe('Invalid Date');
  });

  it('flips status/chairman_approved/chairman_approved_at like promoteArchPlan does', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'seat-A' },
    });

    await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    const updated = sb.capture.updates[0];
    expect(updated.status).toBe('active');
    expect(updated.chairman_approved).toBe(true);
    expect(typeof updated.chairman_approved_at).toBe('string');
  });

  it('never writes created_by (author provenance untouched)', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'seat-A' },
    });

    await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    expect(sb.capture.updates[0]).not.toHaveProperty('created_by');
  });
});

describe('promoteVisionDocument (FR-3): self-approval refusal writes nothing', () => {
  it('refuses when promotedBy === row.created_by, and no UPDATE call is made at all', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'eva-vision-command' },
    });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'eva-vision-command' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('self_approval_refused');
    expect(sb.capture.updates).toHaveLength(0);
  });

  it('already-approved rows are a no-op at the pre-write check and write nothing', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'active', chairman_approved: true, created_by: 'seat-A' },
    });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('already_approved');
    expect(sb.capture.updates).toHaveLength(0);
  });

  it('a missing row is reported explicitly, never a silent no-op', async () => {
    const sb = makeSupabase({ row: null });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-MISSING', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});

describe('promoteVisionDocument: concurrency guard (adversarial /ship review finding, MEDIUM)', () => {
  it('a promotion that loses a concurrent race reports already_approved, not a hard error', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'seat-A' },
      raceWon: false,
    });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('already_approved');
    expect(sb.capture.updates).toHaveLength(1);
  });
});

describe('promoteVisionDocument: fail-soft when approved_by/approved_by_at are not yet live (adversarial /ship review finding, HIGH)', () => {
  it('a 42703 on the full payload retries with only the 3 pre-existing fields, and still promotes', async () => {
    const sb = makeSupabase({
      row: { id: 'row-1', vision_key: 'VISION-X', status: 'draft', chairman_approved: false, created_by: 'seat-A' },
      failCallsWithCode: { count: 1, code: '42703' },
    });

    const result = await promoteVisionDocument({ supabase: sb, visionKey: 'VISION-X', promotedBy: 'seat-B' });

    expect(result.promoted).toBe(true);
    expect(result.columnsApplied).toBe(false);
    expect(sb.capture.updates).toHaveLength(2);
    expect(sb.capture.updates[0]).toHaveProperty('approved_by');
    expect(sb.capture.updates[1]).not.toHaveProperty('approved_by');
    expect(sb.capture.updates[1].status).toBe('active');
    expect(sb.capture.updates[1].chairman_approved).toBe(true);
  });
});
