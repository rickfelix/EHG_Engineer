/**
 * Pure-logic unit tests for lib/sd-park.js computeUnparkPlan().
 *
 * No DB: exercises the reason/actor/status guards, the restore-status resolution
 * (never silently defaulting to 'draft'), the audit stamp, and stale-key stripping.
 *
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 — TS-1, TS-3, TS-4, TS-10. Landed here
 * (not the DB-tier integration file) per PLAN-TO-EXEC TESTING sub-agent review
 * (evidence e03cc24e-6d29-4dd5-ba23-777ffd66c88f), which measured that file
 * currently executes zero tests in this environment.
 */
import { describe, it, expect } from 'vitest';
import { computeUnparkPlan, PARK_STATUS } from '../../lib/sd-park.js';

const NOW = '2026-09-07T00:00:00.000Z';

describe('computeUnparkPlan — guards', () => {
  it('throws when no reason is provided', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft' } },
      '', 'PLAN', NOW,
    )).toThrow(/reason/i);
  });

  it('throws when actor is EXEC (non-EXEC actor guard)', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft' } },
      'restoring', 'EXEC', NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when actor is empty/undefined', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft' } },
      'restoring', undefined, NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when the SD is not parked (status != deferred)', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: 'active', metadata: {} },
      'restoring', 'PLAN', NOW,
    )).toThrow(/not parked/i);
  });
});

describe('computeUnparkPlan — FR-4: never silently default to draft', () => {
  it('TS-3: refuses with an actionable error when parked_from_status is missing and no --restore given', () => {
    let caught;
    try {
      computeUnparkPlan(
        { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
        'restoring', 'PLAN', NOW,
      );
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toMatch(/--restore/);
    expect(caught.code).toBe('UNPARK_RESTORE_STATUS_REQUIRED');
  });

  it('refuses when parked_from_status is present but NOT a workable status (e.g. an "unknown" backfill sentinel)', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'unknown' } },
      'restoring', 'PLAN', NOW,
    )).toThrow(/--restore/);
  });

  it('refuses when parked_from_status is a stale non-workable value (e.g. pending_approval)', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'pending_approval' } },
      'restoring', 'PLAN', NOW,
    )).toThrow(/--restore/);
  });

  it('succeeds automatically when parked_from_status IS present and workable (happy path, TS-1)', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active', park_reason: 'x', parked_by: 'y', parked_at: 'z' } },
      'restoring', 'PLAN', NOW,
    );
    expect(plan.target).toBe('active');
  });
});

describe('computeUnparkPlan — SECURITY C1: --restore must itself be a WORKABLE status', () => {
  it('rejects --restore completed (would fire the full completion cascade past LEAD-FINAL-APPROVAL)', () => {
    let caught;
    try {
      computeUnparkPlan(
        { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
        'restoring', 'PLAN', NOW,
        { restoreStatus: 'completed' },
      );
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('UNPARK_RESTORE_STATUS_INVALID');
  });

  it('rejects --restore cancelled', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'cancelled' },
    )).toThrow(/not a workable status/);
  });

  it('rejects an arbitrary/typo\'d --restore value', () => {
    expect(() => computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'pending_approval' },
    )).toThrow(/UNPARK_RESTORE_STATUS_INVALID|not a workable status/);
  });

  it('accepts every WORKABLE value for --restore', () => {
    for (const s of ['draft', 'active', 'planning', 'in_progress']) {
      const plan = computeUnparkPlan(
        { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
        'restoring', 'PLAN', NOW,
        { restoreStatus: s },
      );
      expect(plan.target).toBe(s);
    }
  });
});

describe('computeUnparkPlan — SECURITY C2: a backfill-inferred parked_from_status requires explicit --restore', () => {
  it('refuses to auto-resolve when parked_from_status_source=backfill_inferred, even though the value IS workable', () => {
    let caught;
    try {
      computeUnparkPlan(
        { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft', parked_from_status_source: 'backfill_inferred' } },
        'restoring', 'PLAN', NOW,
      );
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('UNPARK_RESTORE_STATUS_REQUIRED');
    expect(caught.message).toMatch(/INFERRED/);
  });

  it('an explicit --restore still resolves an inferred row', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft', parked_from_status_source: 'backfill_inferred' } },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'in_progress' },
    );
    expect(plan.target).toBe('in_progress');
  });

  it('strips parked_from_status_source from the resulting metadata once unparked', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft', parked_from_status_source: 'backfill_inferred' } },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'draft' },
    );
    expect(plan.unparkMetadata.parked_from_status_source).toBeUndefined();
  });

  it('a NON-inferred (recorded) row with the same workable value auto-resolves normally', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'draft' } },
      'restoring', 'PLAN', NOW,
    );
    expect(plan.target).toBe('draft');
  });
});

describe('computeUnparkPlan — TS-4: explicit --restore always honored', () => {
  it('an explicit restoreStatus wins even when parked_from_status is present and workable', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'planning' },
    );
    expect(plan.target).toBe('planning');
  });

  it('an explicit restoreStatus resolves the otherwise-refused missing-parked_from_status case', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: {} },
      'restoring', 'PLAN', NOW,
      { restoreStatus: 'draft' },
    );
    expect(plan.target).toBe('draft');
  });
});

describe('computeUnparkPlan — audit stamp (TS-1/TS-10) and stale-key stripping', () => {
  it('TS-1: stamps unparked_by/unparked_at/unparked_reason/stamped_by_session via buildProvenancedStamp', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } },
      'no longer needed', 'PLAN', NOW,
      { writingSessionId: 'sess-123' },
    );
    expect(plan.unparkMetadata.unparked_by).toBe('PLAN');
    expect(plan.unparkMetadata.unparked_at).toBe(NOW);
    expect(plan.unparkMetadata.unparked_reason).toBe('no longer needed');
    expect(plan.unparkMetadata.stamped_by_session).toBe('sess-123');
  });

  it('security Q5 analogue: a caller cannot override stamped_by_session via the reason/actor fields', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } },
      'set aside', 'PLAN', NOW,
      { writingSessionId: 'the-real-session' },
    );
    expect(plan.unparkMetadata.stamped_by_session).toBe('the-real-session');
  });

  it('TS-10: stamped_by_session is omitted (not written as a key at all) when writingSessionId is falsy', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.unparkMetadata).not.toHaveProperty('stamped_by_session');
  });

  it('strips all PARK_META_KEYS from the returned metadata, preserving unrelated keys', () => {
    const plan = computeUnparkPlan(
      {
        sd_key: 'SD-X', status: PARK_STATUS,
        metadata: {
          park_reason: 'x', parked_at: 'y', parked_by: 'z', parked_from_status: 'active',
          parked_progress_original: 50, park_review_at: 'w', park_release_condition: 'q',
          keep_me: 'yes',
        },
      },
      'restoring', 'PLAN', NOW,
    );
    expect(plan.unparkMetadata.park_reason).toBeUndefined();
    expect(plan.unparkMetadata.parked_at).toBeUndefined();
    expect(plan.unparkMetadata.parked_by).toBeUndefined();
    expect(plan.unparkMetadata.parked_from_status).toBeUndefined();
    expect(plan.unparkMetadata.parked_progress_original).toBeUndefined();
    expect(plan.unparkMetadata.park_review_at).toBeUndefined();
    expect(plan.unparkMetadata.park_release_condition).toBeUndefined();
    expect(plan.unparkMetadata.keep_me).toBe('yes');
  });

  it('strips a stale unpark audit trail from a PRIOR unpark cycle before writing the new one', () => {
    const plan = computeUnparkPlan(
      {
        sd_key: 'SD-X', status: PARK_STATUS,
        metadata: {
          parked_from_status: 'active',
          unparked_by: 'STALE', unparked_at: '2020-01-01T00:00:00Z', unparked_reason: 'stale reason',
        },
      },
      'fresh reason', 'PLAN', NOW,
    );
    expect(plan.unparkMetadata.unparked_by).toBe('PLAN');
    expect(plan.unparkMetadata.unparked_reason).toBe('fresh reason');
    expect(plan.unparkMetadata.unparked_at).toBe(NOW);
  });

  it('restores parked_progress_original as origProg when present', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'in_progress', parked_progress_original: 100 } },
      'restoring', 'PLAN', NOW,
    );
    expect(plan.origProg).toBe(100);
  });

  it('origProg is null when parked_progress_original was never set (no edge-normalization happened)', () => {
    const plan = computeUnparkPlan(
      { sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } },
      'restoring', 'PLAN', NOW,
    );
    expect(plan.origProg).toBeNull();
  });
});
