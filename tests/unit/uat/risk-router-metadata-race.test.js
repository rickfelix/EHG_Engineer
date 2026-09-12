/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G
 *
 * lib/uat/risk-router.js's notifyHighSeverityFeedback() and
 * lib/eva/event-bus/handlers/feedback-quality-updated.js both read-modify-write the SAME
 * feedback.metadata jsonb column on a P0+HIGH-risk row (risk-router fires synchronously from
 * feedback-capture.js; feedback-quality-updated.js fires via a never-awaited fire-and-forget
 * vision event). risk-router used to merge from feedbackRecord.metadata -- the PRE-INSERT
 * in-memory snapshot passed into the call -- instead of a fresh read, so whichever write landed
 * second won wholesale and silently dropped the other's fields. This was inert while both UPDATEs
 * were unconditionally rejected by the pre-2026-09-12 append-only trigger; the lifecycle-allowlist
 * migration reactivated it. Fix: read feedback.metadata fresh immediately before merging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeFakeDb(initialMetadata) {
  const row = { id: 'fb-race-1', metadata: { ...initialMetadata } };
  return {
    _row: row,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            eq(_col, val) {
              return {
                single() {
                  if (val !== row.id) return Promise.resolve({ data: null, error: { message: 'not found' } });
                  return Promise.resolve({ data: { metadata: { ...row.metadata } }, error: null });
                },
              };
            },
          };
        },
        update(patch) {
          return {
            eq(_col, val) {
              if (val !== row.id) return Promise.resolve({ error: { message: 'not found' } });
              Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

let fakeDb;
vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => fakeDb),
}));

let notifyHighSeverityFeedback;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../../lib/uat/risk-router.js');
  notifyHighSeverityFeedback = mod.notifyHighSeverityFeedback;
});

describe('notifyHighSeverityFeedback metadata race (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G)', () => {
  const highRiskDefect = {
    id: 'fb-race-1',
    priority: 'P0',
    title: 'authentication bug in login flow',
    description: 'authentication token validation broken',
    metadata: { estimated_loc: 51 }, // STALE pre-insert snapshot: no dimension_codes yet
  };

  it('preserves a concurrently-written metadata field (dimension_codes) instead of clobbering it with a stale snapshot', async () => {
    // Simulate feedback-quality-updated.js's classifier having already written dimension_codes
    // to the ROW before risk-router's own update runs (the row is fresh; feedbackRecord.metadata
    // passed into notifyHighSeverityFeedback is the OLDER pre-insert snapshot).
    fakeDb = makeFakeDb({
      estimated_loc: 51,
      dimension_codes: ['V03'],
      dimension_classifications: [{ id: 'V03', name: 'Reliability', confidence: 0.9 }],
    });
    vi.resetModules();
    const mod = await import('../../../lib/uat/risk-router.js');
    notifyHighSeverityFeedback = mod.notifyHighSeverityFeedback;

    const result = await notifyHighSeverityFeedback(highRiskDefect);
    expect(result.escalationActions).toContain('RECOMMEND_FULL_SD');
    expect(result.assessment.riskLevel).toBe('HIGH');

    // The fix: risk-router must have read metadata FRESH (picking up dimension_codes) before
    // merging in its own fields, not clobbered the row with feedbackRecord.metadata (which has
    // no dimension_codes at all).
    expect(fakeDb._row.metadata.dimension_codes).toEqual(['V03']);
    expect(fakeDb._row.metadata.risk_assessment).toBeTruthy();
    expect(fakeDb._row.metadata.escalation_actions).toContain('RECOMMEND_FULL_SD');
    expect(fakeDb._row.metadata.escalated_at).toBeTruthy();
  });

  it('still writes its own fields when no concurrent write happened first', async () => {
    fakeDb = makeFakeDb({ estimated_loc: 51 });
    vi.resetModules();
    const mod = await import('../../../lib/uat/risk-router.js');
    notifyHighSeverityFeedback = mod.notifyHighSeverityFeedback;

    await notifyHighSeverityFeedback(highRiskDefect);

    expect(fakeDb._row.metadata.risk_assessment).toBeTruthy();
    expect(fakeDb._row.metadata.escalated_at).toBeTruthy();
  });
});
