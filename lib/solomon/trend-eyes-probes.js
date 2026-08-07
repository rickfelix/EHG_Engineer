/**
 * Trend-Eyes PURE PROBES — SD-LEO-INFRA-TREND-EYES-OFF-001 FR-2/FR-3/FR-4.
 *
 * OFF-SEAT EYES + ON-SEAT JUDGMENT. A GHA cron runs these probes and writes candidate rows;
 * Solomon's seat grades and promotes later. These functions NEVER judge, NEVER promote, and
 * NEVER touch IO — they take injected facts and return a verdict. The resolver half lives in
 * scripts/solomon/trend-eyes-sweep.mjs.
 *
 * THE SPLIT IS WHAT MAKES FR-7 POSSIBLE. Two-sided validation (a seeded trend MUST fire, a flat
 * series MUST NOT) needs both arms runnable without a database, because this repo's vitest db
 * project resolves zero files unless VITEST_DB_ALLOW_REF names the live ref. A probe that could
 * only be exercised against Supabase would be a probe that CI never runs.
 *
 * UNKNOWN IS NOT FLAT. Every probe returns UNKNOWN when its facts are absent or unusable, never
 * FLAT. Collapsing the two would let a broken resolver render as "no trend detected" — a silent
 * all-clear produced by blindness rather than by observation, which is the exact failure this
 * whole instrument exists to catch elsewhere. Idiom taken from lib/solomon/conduct-probes.js.
 */
'use strict';

/** FIRE = a trend candidate. FLAT = looked, found none. UNKNOWN = could not look. */
export const VERDICT = Object.freeze({ FIRE: 'fire', FLAT: 'flat', UNKNOWN: 'unknown' });

/** T1: two members of a question-class this far apart is a repeat, not a follow-up in one thread. */
export const T1_MIN_SEPARATION_MS = 24 * 60 * 60 * 1000;
/** T1: a cluster needs at least this many members to count as a repeat. */
export const T1_MIN_CLUSTER = 2;
/** T3: a ratio moving at least this much against its own baseline is drift, not noise. */
export const T3_DRIFT_DELTA = 0.25;
/** T3: a series shorter than this cannot establish a baseline to drift away from. */
export const T3_MIN_READINGS = 3;

function bar(trigger, verdict, detail, evidence = null) {
  return { trigger, verdict, detail, evidence };
}

function unusable(trigger, what) {
  return bar(trigger, VERDICT.UNKNOWN, `${what} — NOT verified (this is not a flat reading)`);
}

function ms(at) {
  const t = new Date(at).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * T1 REPEAT-QUESTION — the chairman asking a question-class twice across days IS a harness gap.
 *
 * Fires on a class with T1_MIN_CLUSTER+ members separated by T1_MIN_SEPARATION_MS or more.
 * Founding specimen: the SMS-coverage question asked 2026-08-03 and again 2026-08-05.
 *
 * THE SEPARATION AND THE CLASS ARE INDEPENDENT CONDITIONS, deliberately. A detector that only
 * checked elapsed time would fire on any two messages a day apart; one that only checked class
 * would fire on a single conversation. The suite exercises each axis separately for that reason.
 *
 * NOTE ON REUSE: readChairmanSmsExchanges (lib/solomon/chairman-sms-exchanges.js:100) supplies the
 * bounded lane READ only. Its docblock at :43-46 states correlation is chronological adjacency,
 * NOT similarity, and explains why it refuses similarity matching. Question-class assignment is
 * therefore the resolver's job and is new work — it is not inherited from that module.
 *
 * @param {{clusters?: Array<{questionClass: string, occurrences: Array<{at: string, id: string}>}>|null}} facts
 */
export function probeRepeatQuestion(facts = {}) {
  const trigger = 't1_repeat_question';
  const clusters = facts.clusters;
  if (clusters === null || clusters === undefined) return unusable(trigger, 'no chairman SMS clusters supplied');
  if (!Array.isArray(clusters)) return unusable(trigger, `unusable clusters ${JSON.stringify(clusters)}`);

  const fired = [];
  for (const c of clusters) {
    const occ = Array.isArray(c?.occurrences) ? c.occurrences : null;
    if (!occ) return unusable(trigger, `cluster ${JSON.stringify(c?.questionClass)} has unusable occurrences`);
    if (occ.length < T1_MIN_CLUSTER) continue;

    const times = occ.map((o) => ms(o?.at));
    if (times.some((t) => t === null)) return unusable(trigger, `cluster ${c.questionClass} has an unparseable timestamp`);

    const spread = Math.max(...times) - Math.min(...times);
    if (spread >= T1_MIN_SEPARATION_MS) {
      fired.push({ questionClass: c.questionClass, members: occ.length, spreadMs: spread, ids: occ.map((o) => o.id) });
    }
  }

  return fired.length
    ? bar(trigger, VERDICT.FIRE,
      `${fired.length} question-class(es) asked ${T1_MIN_CLUSTER}+ times at least 24h apart`, fired)
    : bar(trigger, VERDICT.FLAT, 'no question-class repeated across a 24h+ gap');
}

/**
 * T2 RECURRENCE-AFTER-FIX — a lesson-channel class reappearing AFTER its fix shipped.
 *
 * THE FIX TIMESTAMP IS THE WHOLE SEMANTIC CONTENT. A class occurring twice is not the signal; a
 * class occurring again after someone believed they had fixed it is. A detector that only counted
 * occurrences would satisfy a naive test while never reading fixedAt, so the negative arm of the
 * suite is built specifically to catch that (two occurrences, both pre-fix, must stay FLAT).
 *
 * SOURCE CONSTRAINT (FR-3 / LEAD condition C1): the caller must supply occurrences drawn from
 * retention_archive UNION session_coordination. session_coordination alone is a SURVIVOR table —
 * measured 3,725 rows spanning ~2 weeks with 84% from the last 7 days — so a recurrence computed
 * on it measures the retention policy rather than conduct. lib/coordination/answered-rate.cjs:3-8
 * states the same rule for the same reason. This probe cannot enforce that (it sees only facts),
 * which is why the resolver test asserts BOTH tables were queried.
 *
 * @param {{classes?: Array<{classKey: string, fixedAt: string|null, occurrences: Array<{at: string, source: string}>}>|null}} facts
 */
export function probeRecurrenceAfterFix(facts = {}) {
  const trigger = 't2_recurrence_after_fix';
  const classes = facts.classes;
  if (classes === null || classes === undefined) return unusable(trigger, 'no lesson-channel classes supplied');
  if (!Array.isArray(classes)) return unusable(trigger, `unusable classes ${JSON.stringify(classes)}`);

  const fired = [];
  for (const c of classes) {
    const occ = Array.isArray(c?.occurrences) ? c.occurrences : null;
    if (!occ) return unusable(trigger, `class ${JSON.stringify(c?.classKey)} has unusable occurrences`);
    // No fix shipped means there is nothing to recur AFTER. Not a gap in the data — a class that
    // was never fixed simply cannot exhibit this trend, so it is skipped rather than UNKNOWN.
    if (!c.fixedAt) continue;

    const fixedMs = ms(c.fixedAt);
    if (fixedMs === null) return unusable(trigger, `class ${c.classKey} has an unparseable fixedAt`);

    const times = occ.map((o) => ms(o?.at));
    if (times.some((t) => t === null)) return unusable(trigger, `class ${c.classKey} has an unparseable occurrence`);

    const after = times.filter((t) => t > fixedMs);
    const before = times.filter((t) => t <= fixedMs);
    if (after.length > 0 && before.length > 0) {
      fired.push({
        classKey: c.classKey,
        fixedAt: c.fixedAt,
        occurrencesBeforeFix: before.length,
        occurrencesAfterFix: after.length,
        sources: [...new Set(occ.map((o) => o.source).filter(Boolean))],
      });
    }
  }

  return fired.length
    ? bar(trigger, VERDICT.FIRE, `${fired.length} class(es) recurred after their fix shipped`, fired)
    : bar(trigger, VERDICT.FLAT, 'no class recurred after its fix');
}

/**
 * T3 LESSON-DISJUNCTION drift — the lane-named-classes-reaching-issue_patterns ratio, as a SERIES.
 *
 * SPAN GUARD, and it is not decoration. A ratio whose numerator and denominator are measured over
 * different extents is not a ratio of anything; it will still produce a plausible number, which is
 * how it survives review. Any reading whose two halves disagree on their window is refused outright
 * rather than emitted, so a span mismatch surfaces as UNKNOWN instead of as a trend.
 *
 * Fires when the latest reading has moved at least T3_DRIFT_DELTA from the mean of the readings
 * before it. Drift is measured against the series' own baseline, never against a fixed target —
 * the point is movement, and a fixed target would make the shrink-event unnameable.
 *
 * DOES NOT WRITE issue_patterns.trend (LEAD condition C2): that column already has writers —
 * calculate_pattern_trends() in pg_proc (zero callers, over a 0-row table) and the age-based decay
 * marker at scripts/detect-stale-patterns.js:104-120. This probe emits a reading and nothing more.
 *
 * @param {{readings?: Array<{windowStart: string, windowEnd: string, laneNamed: number, reachedPatterns: number}>|null}} facts
 */
export function probeLessonDisjunctionDrift(facts = {}) {
  const trigger = 't3_lesson_disjunction_drift';
  const readings = facts.readings;
  if (readings === null || readings === undefined) return unusable(trigger, 'no disjunction series supplied');
  if (!Array.isArray(readings)) return unusable(trigger, `unusable readings ${JSON.stringify(readings)}`);
  // TOO SHORT IS UNKNOWN, NOT FLAT. This returned FLAT while its own detail said "needed before
  // drift is meaningful" — an admission of not-knowing wearing the label of a clean look, in direct
  // violation of the contract at the top of this file. It is not a transient state either: at
  // days=14, 30 and 60 the live corpus yields exactly 2 readings, so T3 would have reported a
  // reassuring FLAT forever while never once being able to answer.
  if (readings.length < T3_MIN_READINGS) {
    return unusable(trigger,
      `series has only ${readings.length} reading(s); ${T3_MIN_READINGS} needed before drift is measurable`);
  }

  const ratios = [];
  for (const r of readings) {
    const startMs = ms(r?.windowStart);
    const endMs = ms(r?.windowEnd);
    if (startMs === null || endMs === null) return unusable(trigger, 'a reading has an unparseable window');
    if (endMs <= startMs) return unusable(trigger, 'a reading has a non-positive window');
    if (typeof r.laneNamed !== 'number' || typeof r.reachedPatterns !== 'number') {
      return unusable(trigger, 'a reading has a non-numeric count');
    }
    // THE SPAN GUARD: reachedPatterns is a subset of laneNamed over the SAME window. A count
    // exceeding its own denominator proves the two were measured over different extents.
    if (r.reachedPatterns > r.laneNamed) {
      return unusable(trigger,
        `reading ${r.windowStart}..${r.windowEnd} has reachedPatterns(${r.reachedPatterns}) > laneNamed(${r.laneNamed}) — numerator and denominator span different extents`);
    }
    if (r.laneNamed === 0) return unusable(trigger, `reading ${r.windowStart}..${r.windowEnd} has an empty denominator`);
    ratios.push(r.reachedPatterns / r.laneNamed);
  }

  const latest = ratios[ratios.length - 1];
  const prior = ratios.slice(0, -1);
  const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;
  const delta = latest - baseline;

  return Math.abs(delta) >= T3_DRIFT_DELTA
    ? bar(trigger, VERDICT.FIRE,
      `disjunction ratio moved ${delta.toFixed(3)} from baseline ${baseline.toFixed(3)} to ${latest.toFixed(3)}`,
      { latest, baseline, delta, readings: ratios.length })
    : bar(trigger, VERDICT.FLAT,
      `disjunction ratio stable (${latest.toFixed(3)} vs baseline ${baseline.toFixed(3)}, delta ${delta.toFixed(3)})`);
}

/** The V1 class set. T4 escalation-drift and T5 instrument-health are follow-on, not v1. */
export const TREND_EYES_PROBES = Object.freeze([
  probeRepeatQuestion,
  probeRecurrenceAfterFix,
  probeLessonDisjunctionDrift,
]);

/** Run every probe over one facts bundle. Pure. */
export function runTrendEyesProbes(facts = {}) {
  return TREND_EYES_PROBES.map((p) => p(facts));
}
