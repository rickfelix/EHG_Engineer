/**
 * FR-2 lesson-quality-floor guard (anti-Goodhart) — pure unit tests.
 * DB-free. TS-4 equivalent for this satellite: a boilerplate lesson must score 0, a
 * signal-bearing lesson must score 1, and a templated repeat must be caught by distinctness.
 */
import { describe, it, expect } from 'vitest';
import { scoreLessonQuality, MIN_SIGNAL_LENGTH } from '../../../lib/eva/lesson-quality-guard.js';

describe('lesson-quality-guard (FR-2)', () => {
  it('scores 0 for pure boilerplate (no referent, too short after stripping scaffolding)', () => {
    const { score, reasons } = scoreLessonQuality('Traversal completed. No issues to report.');
    expect(score).toBe(0);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('scores 0 for a short lesson even with generic filler padding', () => {
    const { score } = scoreLessonQuality('Everything went fine, nothing notable to report this time around at all really.');
    expect(score).toBe(0);
  });

  it('scores 1 for a genuine lesson with a concrete file-path referent', () => {
    const lesson = 'Discovered lib/eva/post-lifecycle-decisions.js silently dropped the PIVOT decision rationale when ventureContext.name was undefined, causing a blank chairman summary.';
    const { score, reasons } = scoreLessonQuality(lesson);
    expect(score).toBe(1);
    expect(reasons).toHaveLength(0);
  });

  it('scores 1 for a lesson referencing an SD key', () => {
    const lesson = 'SD-LEO-FIX-EXAMPLE-001 fixed a race condition where two workers claimed the same venture stage simultaneously.';
    expect(scoreLessonQuality(lesson).score).toBe(1);
  });

  it('scores 1 for a lesson referencing a table name', () => {
    const lesson = 'The venture_artifacts table was missing a lifecycle_stage index, causing slow stage-completion queries during traversal.';
    expect(scoreLessonQuality(lesson).score).toBe(1);
  });

  it('scores 1 for a lesson referencing an issue_patterns pattern id', () => {
    const lesson = 'This traversal reproduced the exact failure mode already tracked as PAT-042, confirming the fix has not fully landed yet.';
    expect(scoreLessonQuality(lesson).score).toBe(1);
  });

  it('scores 0 for a long lesson with NO concrete referent (verbose but content-free)', () => {
    const filler = 'This traversal went through many stages and the team worked hard '.repeat(3);
    const { score, reasons } = scoreLessonQuality(filler);
    expect(score).toBe(0);
    expect(reasons.some((r) => r.includes('referent'))).toBe(true);
  });

  it('scores 0 for a near-verbatim repeat of a recent lesson (templated-repeat guard, criterion 3)', () => {
    const original = 'Discovered lib/eva/post-lifecycle-decisions.js silently dropped the PIVOT decision rationale when ventureContext.name was undefined.';
    const nearRepeat = 'Discovered lib/eva/post-lifecycle-decisions.js silently dropped the PIVOT decision rationale when ventureContext.name was empty.';
    const { score, reasons } = scoreLessonQuality(nearRepeat, { recentLessons: [original] });
    expect(score).toBe(0);
    expect(reasons.some((r) => r.includes('similarity'))).toBe(true);
  });

  it('scores 1 when a lesson is genuinely distinct from recent lessons even on the same file', () => {
    const original = 'Discovered lib/eva/post-lifecycle-decisions.js silently dropped the PIVOT decision rationale when ventureContext.name was undefined.';
    const distinct = 'lib/eva/stage-execution-worker.js leaked a processing lock when acquireProcessingLock threw mid-retry, blocking S12 for over an hour on venture v-994.';
    expect(scoreLessonQuality(distinct, { recentLessons: [original] }).score).toBe(1);
  });

  it('only compares against up to the 5 most-recent lessons (RECENT_LESSON_WINDOW)', () => {
    const lesson = 'lib/eva/example-module.js threw a TypeError on null artifacts during S8 traversal for venture v-1.';
    const manyOld = Array.from({ length: 10 }, (_, i) => `unrelated boilerplate lesson number ${i}`);
    const { score } = scoreLessonQuality(lesson, { recentLessons: manyOld });
    expect(score).toBe(1);
  });

  it('MIN_SIGNAL_LENGTH constant is exported and positive', () => {
    expect(MIN_SIGNAL_LENGTH).toBeGreaterThan(0);
  });
});
