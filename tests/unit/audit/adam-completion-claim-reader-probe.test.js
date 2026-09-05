/**
 * QF-20260903-098 — Adam completion-claim / named-reader probe.
 *
 * Three specimens named in the QF's own text as the 2026-09-03 correctness check on the probe
 * itself: a claim is not a genuine defect fixture (the DB rows are historical and not re-quoted
 * here verbatim), so each is a FAITHFUL RECONSTRUCTION from the QF's own precise description of
 * what each claim asserted and which reader it omitted, used to prove the probe's own logic
 * flags the shape it exists to catch. A zero result on the real probe means clean, not blind,
 * only because these three keep proving it can still fire.
 */
import { describe, it, expect } from 'vitest';
import { classifyCompletionClaim, auditAdamOutbound } from '../../../scripts/audit/adam-completion-claim-reader-probe.mjs';

describe('classifyCompletionClaim — the three 2026-09-03 specimens (self-test fixtures)', () => {
  it('specimen 1 (parent-cleared claim): flagged -- no parentLeadPending mention', () => {
    const body = 'The parent SD review is cleared, so the child batch is safe to dispatch.';
    const v = classifyCompletionClaim(body);
    expect(v.isCompletionClaim).toBe(true);
    expect(v.namesReader).toBe(false);
    expect(v.flagged).toBe(true);
  });

  it('specimen 1, corrected: not flagged once parentLeadPending is named', () => {
    const body = 'The parent SD review is cleared and parentLeadPending is false, so the child batch is safe to dispatch.';
    expect(classifyCompletionClaim(body).flagged).toBe(false);
  });

  it('specimen 2 (children-dispatchable claim): flagged -- the second predicate is never named', () => {
    const body = 'The ineligibility classifier returned null, so the children are claimable now.';
    const v = classifyCompletionClaim(body);
    expect(v.isCompletionClaim).toBe(true);
    expect(v.flagged).toBe(true);
  });

  it('specimen 2, corrected: not flagged once the second predicate is named', () => {
    const body = 'The ineligibility classifier returned null and isParentLeadPending() also returned false, so the children are claimable now.';
    expect(classifyCompletionClaim(body).flagged).toBe(false);
  });

  it('specimen 3 (encode-complete claim): flagged -- encoded_ref is never named', () => {
    const body = 'Ratification 558cf9c3 is complete: all three contract sections are now encoded.';
    const v = classifyCompletionClaim(body);
    expect(v.isCompletionClaim).toBe(true);
    expect(v.flagged).toBe(true);
  });

  it('specimen 3, corrected: not flagged once encoded_ref is named', () => {
    const body = 'Ratification 558cf9c3 is complete: all three sections are encoded; encoded_ref now stamped on each.';
    expect(classifyCompletionClaim(body).flagged).toBe(false);
  });
});

describe('classifyCompletionClaim — edge cases', () => {
  it('no completion word at all -> not a claim', () => {
    expect(classifyCompletionClaim('Working on the migration, will update shortly.').isCompletionClaim).toBe(false);
  });

  it('a NEGATED claim ("is not done") is never treated as a completion claim', () => {
    expect(classifyCompletionClaim('The migration is not done yet.').isCompletionClaim).toBe(false);
  });

  it('a backtick-quoted identifier counts as naming a reader', () => {
    const body = 'The sweep is complete; `cleanup_stale_sessions` confirms zero remaining rows.';
    expect(classifyCompletionClaim(body).flagged).toBe(false);
  });

  it('an explicit naming phrase counts as naming a reader', () => {
    const body = 'The handoff is safe, verified by the gate-verdict cache.';
    expect(classifyCompletionClaim(body).flagged).toBe(false);
  });

  it('a bare adjective claim with zero identifiers and zero naming phrases is flagged', () => {
    expect(classifyCompletionClaim('Everything is ready.').flagged).toBe(true);
  });
});

function makeSupabaseMock(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lt: () => ({
              order: () => ({
                range: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('auditAdamOutbound', () => {
  it('scans, counts claims, and lists only the flagged rows', async () => {
    const rows = [
      { id: 'r1', subject: null, body: 'The parent SD review is cleared, so the child batch is safe to dispatch.', created_at: '2026-09-03T10:00:00Z' },
      { id: 'r2', subject: null, body: 'The parent SD review is cleared and parentLeadPending is false, so the child batch is safe to dispatch.', created_at: '2026-09-03T11:00:00Z' },
      { id: 'r3', subject: null, body: 'Working on the migration, will update shortly.', created_at: '2026-09-03T12:00:00Z' },
    ];
    const result = await auditAdamOutbound({ supabase: makeSupabaseMock(rows), sinceIso: '2026-09-03T00:00:00Z', untilIso: '2026-09-04T00:00:00Z' });
    expect(result.scanned).toBe(3);
    expect(result.claims).toBe(2);
    expect(result.flagged).toBe(1);
    expect(result.flaggedRows).toHaveLength(1);
    expect(result.flaggedRows[0].id).toBe('r1');
  });

  it('a read error is fail-loud, never silently reports zero', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ lt: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }) }) }) }) }) }) }) };
    await expect(auditAdamOutbound({ supabase, sinceIso: '2026-09-03T00:00:00Z', untilIso: '2026-09-04T00:00:00Z' }))
      .rejects.toThrow(/load Adam outbound failed/);
  });
});
