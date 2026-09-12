// SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A (FR-8/FR-9): pure-logic tests for the
// withheld_promotion_markers backfill -- no live DB, mirrors this SD's other feedback-lifecycle
// test files (hand-rolled fixtures, no real Supabase client).
import { describe, it, expect } from 'vitest';
import {
  buildMarkerRowFromWithheldPending,
  buildMarkerRowFromPromotedOnly,
  buildBackfillRows,
  computeBeforeCounts,
  computeAfterCounts,
  verifyBackfillCounts,
} from '../../../lib/governance/withheld-promotion-markers-backfill.mjs';
import { MARKER_KEY } from '../../../lib/governance/withheld-registry.mjs';

const pendingMarker = (over = {}) => ({
  fingerprint: 'fp-1',
  member_feedback_ids: ['fb-1'],
  max_severity: 'critical',
  admission_path: 'severity_bypass',
  gauge_value: 19,
  floor: 3,
  engine: 'feedback-fingerprint-promoter',
  decision: 'withheld',
  first_withheld_at: '2026-09-01T00:00:00.000Z',
  last_withheld_at: '2026-09-01T00:00:00.000Z',
  first_withheld_run: '111',
  last_withheld_run: '111',
  withheld_run_count: 1,
  promoted_at: null,
  promoted_qf_id: null,
  promoted_fingerprint: null,
  disposed_by: null,
  disposed_reason: null,
  disposed_at: null,
  ...over,
});

describe('TS-21/TS-28 — buildMarkerRowFromWithheldPending (set A)', () => {
  it('maps every field from the marker sub-object 1:1', () => {
    const row = { id: 'fb-1', metadata: { [MARKER_KEY]: pendingMarker() } };
    expect(buildMarkerRowFromWithheldPending(row)).toEqual({
      feedback_id: 'fb-1',
      fingerprint: 'fp-1',
      member_feedback_ids: ['fb-1'],
      max_severity: 'critical',
      admission_path: 'severity_bypass',
      gauge_value: 19,
      floor: 3,
      engine: 'feedback-fingerprint-promoter',
      decision: 'withheld',
      first_withheld_at: '2026-09-01T00:00:00.000Z',
      last_withheld_at: '2026-09-01T00:00:00.000Z',
      first_withheld_run: '111',
      last_withheld_run: '111',
      withheld_run_count: 1,
      promoted_at: null,
      promoted_qf_id: null,
      promoted_fingerprint: null,
      disposed_by: null,
      disposed_reason: null,
      disposed_at: null,
    });
  });

  it('a withheld-then-promoted row carries the promotion stamp already merged into the marker (no separate handling needed)', () => {
    const row = { id: 'fb-2', metadata: { promoted_to_qf: true, [MARKER_KEY]: pendingMarker({ promoted_at: '2026-09-05T00:00:00.000Z', promoted_fingerprint: 'fp-1' }) } };
    const built = buildMarkerRowFromWithheldPending(row);
    expect(built.promoted_at).toBe('2026-09-05T00:00:00.000Z');
    expect(built.promoted_fingerprint).toBe('fp-1');
    expect(built.withheld_run_count).toBe(1);
  });

  it('returns null for a row with no marker', () => {
    expect(buildMarkerRowFromWithheldPending({ id: 'fb-3', metadata: {} })).toBeNull();
  });
});

describe('buildMarkerRowFromPromotedOnly (set B — promoted directly, never withheld)', () => {
  it('synthesizes a promotion-only row with withheld_run_count=0', () => {
    const row = { id: 'fb-9', metadata: { promoted_to_qf: true, promoted_at: '2026-09-06T00:00:00.000Z', promoted_fingerprint: 'fp-9' } };
    expect(buildMarkerRowFromPromotedOnly(row)).toEqual({
      feedback_id: 'fb-9',
      fingerprint: 'fp-9',
      member_feedback_ids: ['fb-9'],
      max_severity: null,
      admission_path: null,
      gauge_value: null,
      floor: null,
      engine: null,
      decision: null,
      first_withheld_at: '2026-09-06T00:00:00.000Z',
      last_withheld_at: '2026-09-06T00:00:00.000Z',
      first_withheld_run: null,
      last_withheld_run: null,
      withheld_run_count: 0,
      promoted_at: '2026-09-06T00:00:00.000Z',
      promoted_qf_id: null,
      promoted_fingerprint: 'fp-9',
      disposed_by: null,
      disposed_reason: null,
      disposed_at: null,
    });
  });

  it('returns null when a withheld_pending marker is present -- set A owns that row', () => {
    const row = { id: 'fb-10', metadata: { promoted_to_qf: true, [MARKER_KEY]: pendingMarker() } };
    expect(buildMarkerRowFromPromotedOnly(row)).toBeNull();
  });

  it('returns null when promoted_to_qf is not true', () => {
    expect(buildMarkerRowFromPromotedOnly({ id: 'fb-11', metadata: {} })).toBeNull();
  });
});

describe('TS-28 — computeBeforeCounts / computeAfterCounts / verifyBackfillCounts', () => {
  const setA = [
    { id: 'a1', metadata: { [MARKER_KEY]: pendingMarker() } }, // pending
    { id: 'a2', metadata: { promoted_to_qf: true, [MARKER_KEY]: pendingMarker({ promoted_at: '2026-09-05T00:00:00.000Z' }) } }, // promoted
  ];
  const setB = [
    { id: 'b1', metadata: { promoted_to_qf: true, promoted_at: '2026-09-06T00:00:00.000Z', promoted_fingerprint: 'fp-b1' } },
  ];

  it('measures BEFORE counts from feedback.metadata directly (the live specimen shape: 136/110/117)', () => {
    expect(computeBeforeCounts(setA, setB)).toEqual({
      withheldPendingRows: 2,
      pendingRows: 1,
      promotedRows: 2, // a2 (in set A) + b1 (set B)
      totalMarkerRows: 3,
    });
  });

  it('a matching AFTER measurement (from the written rows) reports MATCH', () => {
    const before = computeBeforeCounts(setA, setB);
    const written = buildBackfillRows(setA, setB);
    const after = computeAfterCounts(written);
    expect(after).toEqual({ totalMarkerRows: 3, pendingRows: 1, promotedRows: 2 });
    expect(verifyBackfillCounts(before, after)).toEqual({ matched: true, mismatches: [] });
  });

  it('a mismatched AFTER count (e.g. a dropped row) is reported by name, never silently passed', () => {
    const before = computeBeforeCounts(setA, setB);
    const after = computeAfterCounts([{ promoted_at: null, disposed_at: null }]); // only 1 row landed, not 3
    const verdict = verifyBackfillCounts(before, after);
    expect(verdict.matched).toBe(false);
    expect(verdict.mismatches.some((m) => m.startsWith('totalMarkerRows'))).toBe(true);
  });
});

describe('buildBackfillRows -- idempotent shape (re-running produces the same rows)', () => {
  it('running twice over an unchanged source set produces byte-identical rows (safe to upsert repeatedly)', () => {
    const setA = [{ id: 'a1', metadata: { [MARKER_KEY]: pendingMarker() } }];
    const setB = [{ id: 'b1', metadata: { promoted_to_qf: true, promoted_at: '2026-09-06T00:00:00.000Z', promoted_fingerprint: 'fp-b1' } }];
    expect(buildBackfillRows(setA, setB)).toEqual(buildBackfillRows(setA, setB));
  });

  it('never produces two rows for the same feedback_id across set A and set B', () => {
    const setA = [{ id: 'shared', metadata: { promoted_to_qf: true, [MARKER_KEY]: pendingMarker({ promoted_at: '2026-09-05T00:00:00.000Z' }) } }];
    const setB = [{ id: 'shared', metadata: { promoted_to_qf: true, [MARKER_KEY]: pendingMarker() } }]; // would be excluded by the real query, but prove the builder itself is also safe
    const rows = buildBackfillRows(setA, setB);
    const ids = rows.map((r) => r.feedback_id);
    expect(ids.filter((id) => id === 'shared').length).toBe(1);
  });
});
