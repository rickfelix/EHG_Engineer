// QF-20260808-463: "s.solution.toLowerCase is not a function" — a lesson lost on the learning loop.
//
// PREMISE CORRECTION, stated first. The ticket says the extractor "DESTROYS 4 lessons while
// REPORTING SUCCESS". The reporting half is ALREADY FIXED on main by
// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001: auto-extract-patterns-from-retro.js logs a per-lesson
// "LESSON LOST", prints a structured "N lesson(s) DESTROYED and not persisted", returns them to
// the caller as `patterns.destroyed`, and exits NON-ZERO (`process.exit(lessons_destroyed > 0 ? 2
// : 0)`). It does not report success over a failure.
//
// The TYPE ERROR is real, but in a DIFFERENT FILE than the ticket names:
// lib/learning/issue-knowledge-base.js compared `s.solution.toLowerCase()` against every element
// of proven_solutions. That line already carried a guard from QF-20260525-885 — "coerce non-array
// proven_solutions to [] so .find() below is safe" — which hardened the CONTAINER and left the
// CONTENTS assumed. A guard that checks the array cannot see the shapes inside it.
//
// Fixed at BOTH ends of one data path: the producer coerces (here), and the consumer no longer
// assumes element shape.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { actionItemToText } from '../../scripts/auto-extract-patterns-from-retro.js';

describe('actionItemToText — the producer coercion', () => {
  it('passes a string straight through', () => {
    expect(actionItemToText('rerun the gate')).toBe('rerun the gate');
  });

  it('pulls the text field out of a typical action-item object', () => {
    expect(actionItemToText({ action: 'rerun the gate', owner: 'EXEC' })).toBe('rerun the gate');
    expect(actionItemToText({ description: 'add a guard' })).toBe('add a guard');
  });

  it('NEVER returns [object Object] — two unrelated objects must stay DISTINGUISHABLE', () => {
    // This is the whole reason String(item) was rejected. If both collapsed to the same string,
    // the KB would MERGE two unrelated solutions' stats — a silent wrong answer, which is worse
    // than the crash this replaces.
    const a = actionItemToText({ foo: 1 });
    const b = actionItemToText({ bar: 2 });
    expect(a).not.toContain('[object Object]');
    expect(b).not.toContain('[object Object]');
    expect(a).not.toBe(b);
  });

  it('returns a STRING or null for every shape the extractor can hand it', () => {
    for (const v of [null, undefined, 42, true, {}, { action: '' }, ['x']]) {
      const out = actionItemToText(v);
      expect(out === null || typeof out === 'string').toBe(true);
    }
  });

  it('ignores an empty/whitespace text field rather than returning blank', () => {
    expect(actionItemToText({ action: '   ', text: 'real one' })).toBe('real one');
  });
});

describe('issue-knowledge-base consumer guard', () => {
  const src = fs
    .readFileSync(path.join(process.cwd(), 'lib/learning/issue-knowledge-base.js'), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

  it('no longer calls .toLowerCase() directly on a proven_solutions element', () => {
    expect(src).not.toContain('s.solution.toLowerCase()');
  });

  it('routes both sides through a type-checked normaliser', () => {
    expect(src).toContain("typeof v === 'string'");
    expect(src).toContain('lower(s.solution) === target');
  });

  it('does NOT fall back to String() coercion (that would false-merge objects)', () => {
    expect(src).not.toMatch(/String\(\s*(v|s\.solution|solution_applied)\s*\)\s*\.toLowerCase/);
  });

  it('KNOWN, NOT FIXED HERE: pattern.issue_summary.toLowerCase() is the same unguarded class', () => {
    // Reported rather than fixed — it feeds similarity SCORING, so changing what it matches has
    // its own blast radius and belongs in its own change. Pinned so the finding is recorded
    // rather than rediscovered; flip this expectation when it is deliberately fixed.
    expect(src).toContain('pattern.issue_summary.toLowerCase()');
  });
});
