/**
 * Trend-Eyes two-sided validation — SD-LEO-INFRA-TREND-EYES-OFF-001 FR-7.
 *
 * THE CONTRACT: for EACH trend class, a seeded known-trend MUST fire AND a flat series MUST NOT,
 * in the same suite. One-sided coverage admits a detector that can never fire — the suite stays
 * green while the instrument is blind, which is the failure this whole SD is about.
 *
 * EACH NEGATIVE VARIES A DIFFERENT AXIS THAN ITS POSITIVE. A control built on the same assumption
 * as the thing it controls passes while the answer is wrong. So:
 *   T1 positive varies TIME  -> T1 negative varies CLASS
 *   T2 positive varies WHERE ROWS LIVE -> T2 negative varies ORDER VS THE FIX
 *   T3 positive varies DRIFT MAGNITUDE -> T3 negative varies VARIANCE on an identical skeleton
 * A negative that only inverts its positive's single knob proves the knob is read, not that the
 * detector discriminates.
 *
 * THIRD ARM PER CLASS: absent facts must return UNKNOWN, never FLAT. A resolver that breaks must
 * not be indistinguishable from a quiet week.
 */
import { describe, it, expect } from 'vitest';
import {
  VERDICT,
  probeRepeatQuestion,
  probeRecurrenceAfterFix,
  probeLessonDisjunctionDrift,
  runTrendEyesProbes,
} from '../../../lib/solomon/trend-eyes-probes.js';
import {
  checkTrendEyesLiveness,
  TREND_EYES_RECEIPT_DIMENSION,
} from '../../../lib/solomon/trend-eyes-liveness.js';
import { classifyRequiresInvocation } from '../../../lib/invocation-detector/requires-invocation.js';
import { MACHINE_TELEMETRY_CATEGORIES } from '../../../lib/governance/feedback-audience.js';

describe('T1 REPEAT-QUESTION', () => {
  // TS-1 POSITIVE — the founding specimen, verbatim from the SD: the SMS-coverage question asked
  // 2026-08-03 and again 2026-08-05. Asserts the TRIGGER NAME, not merely that something fired.
  it('fires on the founding specimen (SMS-coverage question, 08-03 + 08-05)', () => {
    const v = probeRepeatQuestion({
      clusters: [{
        questionClass: 'sms-coverage',
        occurrences: [
          { at: '2026-08-03T14:02:00Z', id: 'sms-a' },
          { at: '2026-08-05T09:41:00Z', id: 'sms-b' },
        ],
      }],
    });
    expect(v.trigger).toBe('t1_repeat_question');
    expect(v.verdict).toBe(VERDICT.FIRE);
    expect(v.evidence[0].questionClass).toBe('sms-coverage');
    expect(v.evidence[0].ids).toEqual(['sms-a', 'sms-b']);
  });

  // TS-2 NEGATIVE, DIFFERENT AXIS — two messages 26h apart (so the TIME condition is SATISFIED)
  // but of DIFFERENT classes. A detector broken in the over-collapse direction — lumping unlike
  // questions into one class — passes a same-class negative and fails this one. That break is the
  // likely one, since question-class assignment is new work: chairman-sms-exchanges.js:43-46
  // explicitly refuses similarity correlation, so nothing existing supplies it.
  it('does NOT fire on two messages 26h apart of DIFFERENT classes', () => {
    const v = probeRepeatQuestion({
      clusters: [
        { questionClass: 'sms-coverage', occurrences: [{ at: '2026-08-03T14:00:00Z', id: 'a' }] },
        { questionClass: 'belt-depth', occurrences: [{ at: '2026-08-04T16:00:00Z', id: 'b' }] },
      ],
    });
    expect(v.verdict).toBe(VERDICT.FLAT);
  });

  // The time axis still has to hold on its own.
  it('does NOT fire on two same-class messages inside one 24h window', () => {
    const v = probeRepeatQuestion({
      clusters: [{
        questionClass: 'sms-coverage',
        occurrences: [
          { at: '2026-08-03T09:00:00Z', id: 'a' },
          { at: '2026-08-03T12:00:00Z', id: 'b' },
        ],
      }],
    });
    expect(v.verdict).toBe(VERDICT.FLAT);
  });

  // TS-2b THIRD ARM
  it('returns UNKNOWN (never FLAT) when clusters are absent or unusable', () => {
    expect(probeRepeatQuestion({}).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeRepeatQuestion({ clusters: null }).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeRepeatQuestion({ clusters: 'nope' }).verdict).toBe(VERDICT.UNKNOWN);
    const bad = probeRepeatQuestion({
      clusters: [{ questionClass: 'x', occurrences: [{ at: 'not-a-date', id: 'a' }, { at: 'also-bad', id: 'b' }] }],
    });
    expect(bad.verdict).toBe(VERDICT.UNKNOWN);
  });
});

describe('T2 RECURRENCE-AFTER-FIX', () => {
  // TS-3 POSITIVE (probe half) — occurrences straddling the fix, with the pre-fix one carried by
  // retention_archive. The probe cannot see which table a row came from; that the UNION was
  // actually queried is asserted separately against the resolver, because the union lives there.
  it('fires when a class recurs after its fix shipped', () => {
    const v = probeRecurrenceAfterFix({
      classes: [{
        classKey: 'sess-987-pointer-writer',
        fixedAt: '2026-06-01T00:00:00Z',
        occurrences: [
          { at: '2026-03-14T10:00:00Z', source: 'retention_archive' },
          { at: '2026-08-05T10:00:00Z', source: 'session_coordination' },
        ],
      }],
    });
    expect(v.trigger).toBe('t2_recurrence_after_fix');
    expect(v.verdict).toBe(VERDICT.FIRE);
    expect(v.evidence[0].classKey).toBe('sess-987-pointer-writer');
    expect(v.evidence[0].occurrencesAfterFix).toBe(1);
    expect(v.evidence[0].sources).toContain('retention_archive');
  });

  // TS-4 NEGATIVE, DIFFERENT AXIS — TWO occurrences (so any count>=2 detector is satisfied) that
  // BOTH precede the fix. This is the arm a degenerate n=1 negative cannot provide: it is passed
  // only by a detector that actually reads fixedAt. The after-fix pivot IS T2's semantic content.
  it('does NOT fire when both occurrences precede the fix', () => {
    const v = probeRecurrenceAfterFix({
      classes: [{
        classKey: 'sess-987-pointer-writer',
        fixedAt: '2026-08-01T00:00:00Z',
        occurrences: [
          { at: '2026-03-14T10:00:00Z', source: 'retention_archive' },
          { at: '2026-05-02T10:00:00Z', source: 'retention_archive' },
        ],
      }],
    });
    expect(v.verdict).toBe(VERDICT.FLAT);
  });

  it('does NOT fire for a class that was never fixed', () => {
    const v = probeRecurrenceAfterFix({
      classes: [{
        classKey: 'never-fixed',
        fixedAt: null,
        occurrences: [
          { at: '2026-03-14T10:00:00Z', source: 'retention_archive' },
          { at: '2026-08-05T10:00:00Z', source: 'session_coordination' },
        ],
      }],
    });
    expect(v.verdict).toBe(VERDICT.FLAT);
  });

  // TS-4b THIRD ARM
  it('returns UNKNOWN (never FLAT) when classes are absent or unusable', () => {
    expect(probeRecurrenceAfterFix({}).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeRecurrenceAfterFix({ classes: null }).verdict).toBe(VERDICT.UNKNOWN);
    const bad = probeRecurrenceAfterFix({
      classes: [{ classKey: 'x', fixedAt: 'not-a-date', occurrences: [{ at: '2026-08-05T10:00:00Z', source: 's' }] }],
    });
    expect(bad.verdict).toBe(VERDICT.UNKNOWN);
  });
});

describe('T3 LESSON-DISJUNCTION drift', () => {
  // A stable skeleton the positive and negative both build on, so the ONLY difference between
  // them is the axis each is meant to vary.
  const win = (i) => ({
    windowStart: `2026-07-${String(i).padStart(2, '0')}T00:00:00Z`,
    windowEnd: `2026-07-${String(i).padStart(2, '0')}T23:59:59Z`,
  });

  // TS-5 POSITIVE — a seeded drifting ratio MUST FIRE. This arm was entirely absent from the first
  // PRD draft, which meant T3 could have shipped with a detector incapable of emitting while the
  // suite stayed green. It is the reason FR-7 is written per-class rather than per-suite.
  it('fires on a seeded drifting ratio', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { ...win(1), laneNamed: 10, reachedPatterns: 8 },
        { ...win(2), laneNamed: 10, reachedPatterns: 8 },
        { ...win(3), laneNamed: 12, reachedPatterns: 1 },
      ],
    });
    expect(v.trigger).toBe('t3_lesson_disjunction_drift');
    expect(v.verdict).toBe(VERDICT.FIRE);
    expect(v.evidence.delta).toBeLessThan(0);
  });

  // TS-6 NEGATIVE, DIFFERENT AXIS — the identical skeleton with LOW VARIANCE. The positive varies
  // drift magnitude; substituting a differently-shaped series here would confound the two.
  it('does NOT fire on the same skeleton with a stable ratio', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { ...win(1), laneNamed: 10, reachedPatterns: 8 },
        { ...win(2), laneNamed: 10, reachedPatterns: 8 },
        { ...win(3), laneNamed: 12, reachedPatterns: 9 },
      ],
    });
    expect(v.verdict).toBe(VERDICT.FLAT);
  });

  // TS-6b SPAN GUARD — a ratio whose numerator and denominator span different extents is not a
  // ratio of anything, but it still yields a plausible number, which is how it survives review.
  it('returns UNKNOWN when a numerator exceeds its own denominator (span mismatch)', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { ...win(1), laneNamed: 10, reachedPatterns: 8 },
        { ...win(2), laneNamed: 10, reachedPatterns: 8 },
        { ...win(3), laneNamed: 5, reachedPatterns: 40 },
      ],
    });
    expect(v.verdict).toBe(VERDICT.UNKNOWN);
    expect(v.detail).toMatch(/span different extents/);
  });

  it('returns UNKNOWN on an inverted window or an empty denominator', () => {
    const inverted = probeLessonDisjunctionDrift({
      readings: [
        { ...win(1), laneNamed: 10, reachedPatterns: 8 },
        { ...win(2), laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-04T23:00:00Z', windowEnd: '2026-07-04T01:00:00Z', laneNamed: 10, reachedPatterns: 2 },
      ],
    });
    expect(inverted.verdict).toBe(VERDICT.UNKNOWN);

    const emptyDenominator = probeLessonDisjunctionDrift({
      readings: [
        { ...win(1), laneNamed: 10, reachedPatterns: 8 },
        { ...win(2), laneNamed: 10, reachedPatterns: 8 },
        { ...win(3), laneNamed: 0, reachedPatterns: 0 },
      ],
    });
    expect(emptyDenominator.verdict).toBe(VERDICT.UNKNOWN);
  });

  it('returns UNKNOWN (never FLAT) when readings are absent', () => {
    expect(probeLessonDisjunctionDrift({}).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeLessonDisjunctionDrift({ readings: null }).verdict).toBe(VERDICT.UNKNOWN);
  });
});

describe('the sweep as a whole', () => {
  // The both-directions requirement stated once more at the suite level: a totally flat input
  // must produce three FLAT readings and zero fires, and an empty input must produce three
  // UNKNOWNs — not three FLATs. That difference is the run-receipt's whole reason to exist.
  it('reads FLAT across all three classes on a genuinely quiet window', () => {
    const verdicts = runTrendEyesProbes({
      clusters: [],
      classes: [],
      readings: [
        { windowStart: '2026-07-01T00:00:00Z', windowEnd: '2026-07-01T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-02T00:00:00Z', windowEnd: '2026-07-02T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-03T00:00:00Z', windowEnd: '2026-07-03T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
      ],
    });
    expect(verdicts).toHaveLength(3);
    expect(verdicts.every((v) => v.verdict === VERDICT.FLAT)).toBe(true);
  });

  it('reads UNKNOWN across all three classes when the resolver supplied nothing', () => {
    const verdicts = runTrendEyesProbes({});
    expect(verdicts.every((v) => v.verdict === VERDICT.UNKNOWN)).toBe(true);
  });
});

describe('TS-8 run-receipt liveness', () => {
  const now = Date.parse('2026-08-07T12:00:00Z');

  it('alarms when no receipt has ever been recorded', () => {
    const r = checkTrendEyesLiveness(null, now);
    expect(r.alarm).toBe(true);
    expect(r.ageMs).toBeNull();
  });

  it('alarms on a stale receipt', () => {
    expect(checkTrendEyesLiveness('2026-08-04T12:00:00Z', now).alarm).toBe(true);
  });

  it('does not alarm on a fresh receipt', () => {
    expect(checkTrendEyesLiveness('2026-08-07T06:00:00Z', now).alarm).toBe(false);
  });

  it('alarms on an unparseable receipt timestamp rather than treating it as fresh', () => {
    expect(checkTrendEyesLiveness('whenever', now).alarm).toBe(true);
  });
});

describe('TS-11 candidate category must not be force-aggregated', () => {
  // MACHINE_TELEMETRY_CATEGORIES membership routes a category through an aggregate UPSERT whose
  // dedup hash is always `${today}::telemetry::${category}`, collapsing every row of that category
  // into ONE PER DAY and ignoring the caller's own dedup_key. For a candidate writer that is
  // silent data loss: findings would vanish with every gauge still green.
  it('solomon_trend_candidate is NOT a machine-telemetry category', () => {
    expect(MACHINE_TELEMETRY_CATEGORIES).not.toContain('solomon_trend_candidate');
  });
});

describe('TS-12 WIRING REGRESSION', () => {
  // THE TEST THAT WOULD HAVE CAUGHT THE PRECEDENT. scripts/eva/eva-trend-snapshot.mjs and
  // scripts/eva/trend-detector.mjs both shipped under COMPLETED SDs and are unwired to this day,
  // because the invocation classifier is NAME-KEYED: requires-invocation.js:26 matches
  // -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 matches only cron/clockwork dirs.
  // The original filename here was trend-eyes-scan.mjs, which matches NEITHER — this SD would
  // have shipped into the exact blind spot it was chartered to escape, via its own filename.
  // Asserting the classifier verdict makes a rename back a red test rather than a silent regression.
  it('the sweep entrypoint is visible to the invocation classifier', () => {
    const v = classifyRequiresInvocation('scripts/solomon/trend-eyes-sweep.mjs');
    expect(v.requiresInvocation).toBe(true);
  });

  // The control: the name we did NOT ship is genuinely invisible. Without this arm the assertion
  // above could pass for a reason unrelated to the filename, and the finding would go unrecorded.
  it('the original -scan name would have been invisible to it', () => {
    const v = classifyRequiresInvocation('scripts/solomon/trend-eyes-scan.mjs');
    expect(v.requiresInvocation).toBe(false);
  });

  it('the receipt dimension is a shared constant, not a duplicated literal', () => {
    expect(TREND_EYES_RECEIPT_DIMENSION).toBe('trend_eyes_sweep_receipt');
  });
});
