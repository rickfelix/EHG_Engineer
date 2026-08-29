/**
 * QF-20260829-902 — the --decision <id> override on scripts/adam-decision-email.mjs was written
 * for a RACE (a row decided-or-created microseconds outside the pending query window) but had no
 * clock and no status check, so it emailed the named row regardless of how long ago it was
 * decided (measured live: a 17h-stale already-decided row reached the chairman).
 *
 * TWO-SIDED per the QF's own acceptance bar:
 *   (a) --decision <id> naming a DECIDED row beyond the race window must be refused.
 *   (b) --decision <id> naming a genuinely PENDING row, OR one decided WITHIN the race window,
 *       must still be treated as eligible (the exact case the bypass exists for).
 *
 * A third finding, verified rather than assumed: acceptance criterion (c) ("every sent email body
 * contains the decision id for each item") is ALREADY satisfied by the existing renderer --
 * renderLeanDecision's every branch ends in `[ref <decision_type>:<id>]` (added 2026-06-28, QF-20260702-241),
 * which flows into decision-layman.mjs's `lines` and from there into adam-decision-email.mjs's
 * copyBlock. This suite pins that existing behaviour rather than re-implementing it.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluatePrimaryDecisionEligibility,
  renderLeanDecisionEmail,
} from '../../lib/chairman/decision-layman.mjs';

describe('QF-20260829-902 evaluatePrimaryDecisionEligibility', () => {
  it('(b) a genuinely pending row is always eligible', () => {
    const v = evaluatePrimaryDecisionEligibility({ status: 'pending', updated_at: '2020-01-01T00:00:00Z' });
    expect(v.eligible).toBe(true);
    expect(v.reason).toBe('pending');
  });

  it('(b) a decided row within the race window is eligible (the race the bypass exists for)', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const decidedAt = new Date('2026-08-29T11:59:00Z'); // 60s ago
    const v = evaluatePrimaryDecisionEligibility({ status: 'decided', updated_at: decidedAt.toISOString() }, now);
    expect(v.eligible).toBe(true);
    expect(v.reason).toBe('race_window');
  });

  it('(a) a row decided 17 hours ago is refused -- the exact live-caught specimen', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const decidedAt = new Date('2026-08-28T19:00:00Z'); // 17h ago
    const v = evaluatePrimaryDecisionEligibility({ status: 'decided', updated_at: decidedAt.toISOString() }, now);
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe('stale');
    expect(v.ageMs).toBeGreaterThan(0);
  });

  it('(a) a row decided just outside the default 2-minute race window is refused', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const decidedAt = new Date('2026-08-29T11:57:59Z'); // 2m1s ago
    const v = evaluatePrimaryDecisionEligibility({ status: 'decided', updated_at: decidedAt.toISOString() }, now);
    expect(v.eligible).toBe(false);
  });

  it('(a) a missing row (not found) is refused, not treated as eligible', () => {
    expect(evaluatePrimaryDecisionEligibility(null).eligible).toBe(false);
  });

  it('a custom raceWindowMs is honored', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const decidedAt = new Date('2026-08-29T11:50:00Z'); // 10min ago
    const v = evaluatePrimaryDecisionEligibility({ status: 'decided', updated_at: decidedAt.toISOString() }, now, 15 * 60_000);
    expect(v.eligible).toBe(true);
  });
});

describe('QF-20260829-902 (c) decision id already visible in every rendered line (verified, not re-implemented)', () => {
  it('renderLeanDecisionEmail includes a [ref decision_type:id] token for every item', () => {
    const rows = [
      { id: 'aaaa-1111', decision_type: 'session_question', summary: 'Question A', created_at: new Date().toISOString() },
      { id: 'bbbb-2222', decision_type: 'chairman_approval', venture_id: 'v-1', lifecycle_stage: 3, summary: 'Approve stage 3', created_at: new Date().toISOString() },
    ];
    const { lines } = renderLeanDecisionEmail(rows, new Date());
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes('[ref session_question:aaaa-1111]'))).toBe(true);
    expect(lines.some((l) => l.includes('[ref chairman_approval:bbbb-2222]'))).toBe(true);
  });
});
