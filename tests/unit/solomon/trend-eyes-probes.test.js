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
import {
  CANDIDATE_CATEGORY,
  questionClass,
  isAutomatedMessage,
  resolveT1Facts,
  resolveT2Facts,
  toProbeFacts,
  resolveT3Facts,
} from '../../../scripts/solomon/trend-eyes-sweep.mjs';

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
  //
  // THE CONSTANT IS IMPORTED, NOT RETYPED. An earlier version of this test hardcoded the literal
  // 'solomon_trend_candidate', which meant the writer could be repointed at an aggregating category
  // and this test — the very test that exists to prevent that — would still pass. Asserting against
  // the value the writer actually uses is what makes the guard real. (Surviving mutant M23.)
  it('the category the writer actually uses is NOT a machine-telemetry category', () => {
    expect(MACHINE_TELEMETRY_CATEGORIES).not.toContain(CANDIDATE_CATEGORY);
  });

  it('the candidate category is still the expected value', () => {
    expect(CANDIDATE_CATEGORY).toBe('solomon_trend_candidate');
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

describe('questionClass — the classifier that silently dropped 95.9% of the corpus', () => {
  // Measured against the full population of sms_relay_staging (342 rows, all fetched): the first
  // cut classified 328 to null, and assigned sms-coverage to ZERO of the 97 rows mentioning
  // sms/text/message. Two causes, both fixed and both pinned below: the anchors required
  // subject-before-predicate ORDER, and \btext\b/\bworker\b rejected the plural forms.
  it('matches regardless of subject/predicate ORDER', () => {
    expect(questionClass('Are we missing any texts?')).toBe('sms-coverage');
    expect(questionClass('Are texts being missed?')).toBe('sms-coverage');
  });

  it('matches PLURAL forms', () => {
    expect(questionClass('did the texts get through')).toBe('sms-coverage');
    expect(questionClass('are the workers still alive')).toBe('fleet-liveness');
    expect(questionClass('are the belts empty')).toBe('belt-depth');
  });

  it('still returns null for genuinely unrelated content rather than over-matching', () => {
    expect(questionClass('thanks, looks good')).toBeNull();
    expect(questionClass('')).toBeNull();
    expect(questionClass(null)).toBeNull();
  });

  // 73 rows across 12 distinct days on the inbound lane are the 80-minute watchdog, and the whole
  // lane shares one from_phone so nothing upstream separates it from the chairman. Admitting it
  // would give T1 a guaranteed daily false positive built entirely from a robot repeating itself.
  it('excludes the automated watchdog from the chairman corpus', () => {
    expect(isAutomatedMessage('Are you still there?')).toBe(true);
    expect(isAutomatedMessage('are we missing any texts?')).toBe(false);
  });
});

describe('TS-3 resolver — the retention_archive UNION is real, not assumed', () => {
  /** Records every table queried, so the union can be asserted rather than trusted. */
  function recordingSupabase(byTable) {
    const queried = [];
    return {
      queried,
      from(table) {
        queried.push(table);
        const rows = byTable[table] || [];
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          then: (resolve) => resolve({ data: rows, error: null }),
        };
        return chain;
      },
    };
  }

  it('queries BOTH session_coordination and retention_archive', async () => {
    const sb = recordingSupabase({ session_coordination: [], retention_archive: [] });
    const out = await resolveT2Facts(sb, { now: new Date('2026-08-07T12:00:00Z') });
    expect(sb.queried).toContain('session_coordination');
    expect(sb.queried).toContain('retention_archive');
    expect(out.queried).toEqual(['session_coordination', 'retention_archive']);
  });

  // The archived row nests the original under row_data — retention_archive has NO `payload` column
  // (verified live: id, source_table, source_id, row_data, row_timestamp, archived_at, archived_by,
  // run_id). Selecting the phantom name returned 42703 and threw before anything was written.
  it('reads the archived payload from row_data, and detects a recurrence carried ONLY by the archive', async () => {
    const sb = recordingSupabase({
      session_coordination: [
        { id: 1, created_at: '2026-08-05T10:00:00Z', payload: { lesson_class: 'pointer-writer', fix_shipped_at: '2026-06-01T00:00:00Z' } },
      ],
      retention_archive: [
        { id: 2, source_table: 'session_coordination', archived_at: '2026-05-02T10:00:00Z', row_data: { payload: { lesson_class: 'pointer-writer', fix_shipped_at: '2026-06-01T00:00:00Z' } } },
      ],
    });
    const out = await resolveT2Facts(sb, { now: new Date('2026-08-07T12:00:00Z') });
    expect(out.blind).toBeNull();
    const cls = out.classes.find((c) => c.classKey === 'pointer-writer');
    expect(cls.occurrences.map((o) => o.source).sort()).toEqual(['retention_archive', 'session_coordination']);
  });

  // THE FALSE ALL-CLEAR. fix_shipped_at appears in 0 of 3,786 live rows, so a corpus that cannot
  // answer "did it recur AFTER the fix" must reach the probe as UNKNOWN. Returning [] here would
  // have produced FLAT — "no class recurred after its fix" — from an absent field rather than an
  // observation, which is exactly the lie this instrument exists to catch in others.
  // The OTHER blindness branch. Found by mutation: disabling `classedRows === 0` left the whole
  // suite green, because the only blindness test exercised the fix_shipped_at branch. Two reasons
  // to be blind need two tests — a single one lets its sibling rot unnoticed.
  it('returns null (-> UNKNOWN) when no row carries a class key at all', async () => {
    const sb = recordingSupabase({
      session_coordination: [{ id: 1, created_at: '2026-08-05T10:00:00Z', payload: { unrelated: true } }],
      retention_archive: [],
    });
    const out = await resolveT2Facts(sb, { now: new Date('2026-08-07T12:00:00Z') });
    expect(out.classes).toBeNull();
    expect(out.blind).toMatch(/lesson_class or signal_type/);
    expect(probeRecurrenceAfterFix({ classes: out.classes ?? undefined }).verdict).toBe(VERDICT.UNKNOWN);
  });

  it('returns null (-> UNKNOWN), never [], when no row carries a fix timestamp', async () => {
    const sb = recordingSupabase({
      session_coordination: [
        { id: 1, created_at: '2026-08-05T10:00:00Z', payload: { lesson_class: 'pointer-writer' } },
      ],
      retention_archive: [],
    });
    const out = await resolveT2Facts(sb, { now: new Date('2026-08-07T12:00:00Z') });
    expect(out.classes).toBeNull();
    expect(out.blind).toMatch(/fix_shipped_at/);
    expect(probeRecurrenceAfterFix({ classes: out.classes ?? undefined }).verdict).toBe(VERDICT.UNKNOWN);
  });
});

describe('T3 resolver — distinct counting, and a span guard that is reachable in production', () => {
  function sbWith(patterns, lane) {
    return {
      from(table) {
        const rows = table === 'issue_patterns' ? patterns : lane;
        const chain = { select: () => chain, eq: () => chain, gte: () => chain, then: (r) => r({ data: rows, error: null }) };
        return chain;
      },
    };
  }

  // Counting ROWS rather than DISTINCT pattern_ids let one lane class matched by three
  // issue_patterns rows contribute 3 to a numerator whose denominator counts it once — emitting
  // 1.000 where the truth was 0.5.
  it('counts DISTINCT pattern_ids, so duplicate rows cannot inflate the numerator', async () => {
    const at = '2026-08-06T10:00:00Z';
    const out = await resolveT3Facts(
      sbWith(
        [{ id: 1, pattern_id: 'PAT-X', created_at: at }, { id: 2, pattern_id: 'PAT-X', created_at: at }, { id: 3, pattern_id: 'PAT-X', created_at: at }],
        [{ id: 1, created_at: at, payload: { lesson_class: 'PAT-X' } }, { id: 2, created_at: at, payload: { lesson_class: 'PAT-Y' } }],
      ),
      { now: new Date('2026-08-07T00:00:00Z'), days: 3 },
    );
    const r = out.readings.find((x) => x.laneNamed === 2);
    expect(r.reachedPatterns).toBe(1); // not 3
  });

  // The clamp that made the guard dead code is gone, so a genuinely mismatched extent now reaches
  // the probe and is refused there. A guard only reachable from a test fixture guards nothing.
  it('emits an out-of-range numerator to the probe rather than clamping it away', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { windowStart: '2026-07-01T00:00:00Z', windowEnd: '2026-07-01T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-02T00:00:00Z', windowEnd: '2026-07-02T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-03T00:00:00Z', windowEnd: '2026-07-03T23:59:59Z', laneNamed: 2, reachedPatterns: 5 },
      ],
    });
    expect(v.verdict).toBe(VERDICT.UNKNOWN);
  });

  it('returns null (-> UNKNOWN), never [], when no window has a denominator', async () => {
    const out = await resolveT3Facts(sbWith([], []), { now: new Date('2026-08-07T00:00:00Z'), days: 3 });
    expect(out.readings).toBeNull();
    expect(probeLessonDisjunctionDrift({ readings: out.readings ?? undefined }).verdict).toBe(VERDICT.UNKNOWN);
  });
});

describe('THE CONSUMER SIDE — where the blindness fix is actually delivered', () => {
  // M49/M50. The resolvers returning null was verified at the MERGE; nothing tested the CONSUMER,
  // where runSweep converts null -> undefined for the probe. Flipping `?? undefined` to `?? []` is
  // one token, leaves all 52 tests green, and restores the false all-clear against LIVE data — T2
  // goes from UNKNOWN back to "no class recurred after its fix". A fix proven only at the merge is
  // not proven. These pin the conversion itself.
  // These call toProbeFacts — THE ACTUAL CONVERSION runSweep uses. An earlier version of this test
  // asserted on a `classes ?? undefined` expression written inline in the test itself, which tested
  // the test and not the code: the M49 mutation survived it untouched. Exercising the real function
  // is the difference between a guard and a decoration.
  it('toProbeFacts turns a null resolver bundle into UNKNOWN at the probe, never FLAT', () => {
    const facts = toProbeFacts({ clusters: [] }, { classes: null }, { readings: null });
    expect(facts.classes).toBeUndefined();
    expect(facts.readings).toBeUndefined();
    expect(probeRecurrenceAfterFix(facts).verdict).toBe(VERDICT.UNKNOWN);
    expect(probeLessonDisjunctionDrift(facts).verdict).toBe(VERDICT.UNKNOWN);
  });

  // The mutation stated explicitly, so the wrongness of the alternative is on the record: had
  // toProbeFacts used `?? []`, this is the verdict the live sweep would report instead.
  it('an empty-array bundle would report FLAT — which is why the conversion must not produce one', () => {
    expect(probeRecurrenceAfterFix({ classes: [] }).verdict).toBe(VERDICT.FLAT);
  });

  it('toProbeFacts passes real resolver output through unchanged', () => {
    const clusters = [{ questionClass: 'sms-coverage', occurrences: [] }];
    const facts = toProbeFacts({ clusters }, { classes: [] }, { readings: [] });
    expect(facts.clusters).toBe(clusters);
    expect(facts.classes).toEqual([]);
  });

  // SEC-TE-04. A series too short to measure was reporting FLAT — an admission of not-knowing
  // wearing the label of a clean look. Live, days=14/30/60 all yield exactly 2 readings, so this
  // was not a transient state: T3 would have said "stable" forever without ever being able to look.
  it('a series too short to measure is UNKNOWN, not a reassuring FLAT', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { windowStart: '2026-07-01T00:00:00Z', windowEnd: '2026-07-01T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
        { windowStart: '2026-07-02T00:00:00Z', windowEnd: '2026-07-02T23:59:59Z', laneNamed: 10, reachedPatterns: 8 },
      ],
    });
    expect(v.verdict).toBe(VERDICT.UNKNOWN);
    expect(v.detail).toMatch(/needed before drift is measurable/);
  });
});

describe('T3 zero-overlap guard — a join key that parses but does not correspond', () => {
  function sbWith(patterns, lane) {
    return {
      from(table) {
        const rows = table === 'issue_patterns' ? patterns : lane;
        const chain = { select: () => chain, eq: () => chain, gte: () => chain, then: (r) => r({ data: rows, error: null }) };
        return chain;
      },
    };
  }

  // SEC-TE-03. Repairing the phantom `pattern_name` by swapping in `pattern_id` made the query
  // succeed while the numerator became structurally always zero: lane keys are values like
  // 'harness-bug', pattern_ids are 'PAT-AUTO-…'. A ratio that can never be non-zero reports the
  // absence of a join key as though it were total disjunction.
  it('reports UNKNOWN when lane keys and pattern ids share nothing at all', async () => {
    const at = '2026-08-06T10:00:00Z';
    const out = await resolveT3Facts(
      sbWith(
        [{ id: 1, pattern_id: 'PAT-AUTO-b442fd90', created_at: at }],
        [{ id: 1, created_at: at, payload: { signal_type: 'harness-bug' } }],
      ),
      { now: new Date('2026-08-07T00:00:00Z'), days: 3 },
    );
    expect(out.readings).toBeNull();
    expect(out.blind).toMatch(/do not intersect/);
    expect(probeLessonDisjunctionDrift({ readings: out.readings ?? undefined }).verdict).toBe(VERDICT.UNKNOWN);
  });

  it('does NOT trip the guard when the vocabularies genuinely correspond', async () => {
    const at = '2026-08-06T10:00:00Z';
    const out = await resolveT3Facts(
      sbWith(
        [{ id: 1, pattern_id: 'harness-bug', created_at: at }],
        [{ id: 1, created_at: at, payload: { signal_type: 'harness-bug' } }, { id: 2, created_at: at, payload: { signal_type: 'stuck' } }],
      ),
      { now: new Date('2026-08-07T00:00:00Z'), days: 3 },
    );
    expect(out.blind).toBeNull();
    expect(out.overlap).toBe(1);
  });
});

describe('questionClass against the REAL corpus, not fixtures I invented', () => {
  // The prior questionClass tests asserted on synthetic strings written from the same mental model
  // as the fix — so they confirmed the fix and missed the population. These are VERBATIM bodies
  // from sms_relay_staging. The 08-05 one is the SD's own founding case, and it returned null.
  it('classifies the founding case from the charter', () => {
    expect(questionClass('Does Solomon have a CRON job that reviews the SMS message history?')).toBe('sms-coverage');
  });

  // The watchdog is 76 of 342 rows AND classifies as sms-coverage on its own text — so exclusion
  // must happen BEFORE classification. Only the ordering of two lines in resolveT1Facts prevents a
  // guaranteed daily false positive, and nothing tested that ordering.
  it('the watchdog body classifies as sms-coverage, which is exactly why it must be excluded first', () => {
    const watchdog = "I haven't received any text messages from you in over an hour. are you still there?";
    expect(questionClass(watchdog)).toBe('sms-coverage');
    expect(isAutomatedMessage(watchdog)).toBe(true);
  });

  // THE ORDERING, tested through resolveT1Facts itself. Asserting questionClass and
  // isAutomatedMessage separately proves neither: both can be perfect while the resolver calls them
  // in the wrong order. The M33 mutation — dropping the `continue` after the automated branch —
  // took the live run from 2 firing classes to 3 and left the whole suite green, because nothing
  // exercised resolveT1Facts at all. 76 of 342 corpus rows are this watchdog.
  function laneDouble(inboundBodies) {
    const rows = inboundBodies.map((body, i) => ({
      id: `m${i}`, from_phone: '+15551230000', to_phone: '+15559999999',
      body_raw: body, received_at: new Date(Date.parse('2026-08-01T00:00:00Z') + i * 36 * 3600_000).toISOString(),
    }));
    return {
      from(table) {
        const data = table === 'sms_relay_staging' ? rows : [];
        const chain = { select: () => chain, gte: () => chain, lte: () => chain, order: () => chain, then: (r) => r({ data, error: null }) };
        return chain;
      },
    };
  }

  it('excludes the watchdog BEFORE classifying, so it can never form a cluster', async () => {
    const watchdog = "I haven't received any text messages from you in over an hour. are you still there?";
    const out = await resolveT1Facts(laneDouble([watchdog, watchdog, watchdog]), { now: new Date('2026-08-07T00:00:00Z') });
    expect(out.clusters).toEqual([]);
    expect(out.coverage.automated).toBe(3);
    expect(out.coverage.classified).toBe(0);
  });

  it('still clusters genuine chairman repeats alongside the excluded watchdog', async () => {
    const watchdog = 'are you still there?';
    const real = 'Does Solomon have a CRON job that reviews the SMS message history?';
    const out = await resolveT1Facts(laneDouble([real, watchdog, real]), { now: new Date('2026-08-07T00:00:00Z') });
    const cluster = out.clusters.find((c) => c.questionClass === 'sms-coverage');
    expect(cluster.occurrences).toHaveLength(2);
    expect(out.coverage.automated).toBe(1);
  });
});

describe('surviving-mutant kills', () => {
  // M9: with Math.abs(delta) mutated to (-delta) the detector becomes downward-only, and the sole
  // T3 positive was a FALLING ratio — so a one-sided detector shipped green.
  it('T3 fires on UPWARD drift, not only downward', () => {
    const v = probeLessonDisjunctionDrift({
      readings: [
        { windowStart: '2026-07-01T00:00:00Z', windowEnd: '2026-07-01T23:59:59Z', laneNamed: 10, reachedPatterns: 1 },
        { windowStart: '2026-07-02T00:00:00Z', windowEnd: '2026-07-02T23:59:59Z', laneNamed: 10, reachedPatterns: 1 },
        { windowStart: '2026-07-03T00:00:00Z', windowEnd: '2026-07-03T23:59:59Z', laneNamed: 10, reachedPatterns: 9 },
      ],
    });
    expect(v.verdict).toBe(VERDICT.FIRE);
    expect(v.evidence.delta).toBeGreaterThan(0);
  });

  // M3: the positive spanned 43.65h and the negative 3h, so ANY threshold in (3h, 43.65h] survived
  // — T1's "across days, not one thread" semantic was pinned by nothing. These bracket 24h.
  it('T1 threshold is pinned at 24h from both sides', () => {
    const cluster = (hours) => ({
      clusters: [{
        questionClass: 'sms-coverage',
        occurrences: [
          { at: '2026-08-03T00:00:00Z', id: 'a' },
          { at: new Date(Date.parse('2026-08-03T00:00:00Z') + hours * 3600000).toISOString(), id: 'b' },
        ],
      }],
    });
    expect(probeRepeatQuestion(cluster(23.5)).verdict).toBe(VERDICT.FLAT);
    expect(probeRepeatQuestion(cluster(24.5)).verdict).toBe(VERDICT.FIRE);
  });

  // M21: a future-dated receipt yields a negative age, which fails `> threshold` and pinned the
  // predicate to alarm:false for as long as the timestamp stayed ahead of the clock — silencing
  // the one alarm that notices a dead sweep.
  it('a future-dated receipt alarms rather than reading as fresh', () => {
    const now = Date.parse('2026-08-07T12:00:00Z');
    const r = checkTrendEyesLiveness('2026-09-01T00:00:00Z', now);
    expect(r.alarm).toBe(true);
    expect(r.reason).toMatch(/FUTURE/);
  });
});
