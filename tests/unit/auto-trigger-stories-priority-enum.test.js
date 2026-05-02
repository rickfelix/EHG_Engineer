/**
 * QF-20260502-stories-priority-enum
 *
 * PRD functional_requirements arrive with MoSCoW priority values
 * (must/should/could/wont) but user_stories.priority CHECK constraint accepts
 * only critical/high/medium/low/minimal. Without normalization, story inserts
 * fail with 23514 and force a manual-author fallback (witnessed during
 * SD-EHG-AI-GEN-GUARDRAILS-001 — feedback row 13fc76ea).
 *
 * Covers:
 *   - normalizePriorityForUserStory: MoSCoW + canonical (case-insensitive) +
 *     unknown values
 *   - derivePriorityStoryPoints: Fibonacci mapping from canonical priority
 *
 * Together these guarantee both columns user_stories writes (priority +
 * story_points) come from the same canonical token.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizePriorityForUserStory,
  derivePriorityStoryPoints
} from '../../scripts/modules/auto-trigger-stories.mjs';

describe('normalizePriorityForUserStory', () => {
  it('maps MoSCoW must variants → critical', () => {
    expect(normalizePriorityForUserStory('must')).toBe('critical');
    expect(normalizePriorityForUserStory('MUST')).toBe('critical');
    expect(normalizePriorityForUserStory('must-have')).toBe('critical');
    expect(normalizePriorityForUserStory('must_have')).toBe('critical');
  });

  it('maps MoSCoW should variants → high', () => {
    expect(normalizePriorityForUserStory('should')).toBe('high');
    expect(normalizePriorityForUserStory('SHOULD')).toBe('high');
    expect(normalizePriorityForUserStory('should-have')).toBe('high');
  });

  it('maps MoSCoW could variants → medium', () => {
    expect(normalizePriorityForUserStory('could')).toBe('medium');
    expect(normalizePriorityForUserStory('Could_Have')).toBe('medium');
  });

  it("maps MoSCoW wont/won't variants → low", () => {
    expect(normalizePriorityForUserStory('wont')).toBe('low');
    expect(normalizePriorityForUserStory("won't")).toBe('low');
    expect(normalizePriorityForUserStory('wont-have')).toBe('low');
  });

  it('passes canonical values through (case-insensitive)', () => {
    for (const v of ['critical', 'high', 'medium', 'low', 'minimal']) {
      expect(normalizePriorityForUserStory(v)).toBe(v);
      expect(normalizePriorityForUserStory(v.toUpperCase())).toBe(v);
    }
  });

  it('falls back to medium for unknown / empty / null', () => {
    expect(normalizePriorityForUserStory(undefined)).toBe('medium');
    expect(normalizePriorityForUserStory(null)).toBe('medium');
    expect(normalizePriorityForUserStory('')).toBe('medium');
    expect(normalizePriorityForUserStory('   ')).toBe('medium');
    expect(normalizePriorityForUserStory('priority-9000')).toBe('medium');
  });

  it('output is always one of the DB CHECK constraint values', () => {
    const allowed = new Set(['critical', 'high', 'medium', 'low', 'minimal']);
    const samples = ['must', 'SHOULD', 'could_have', 'wont', 'critical',
                     'HIGH', '', null, 42, 'unknown'];
    for (const s of samples) {
      expect(allowed.has(normalizePriorityForUserStory(s))).toBe(true);
    }
  });
});

describe('derivePriorityStoryPoints', () => {
  it('returns Fibonacci points per canonical priority', () => {
    expect(derivePriorityStoryPoints('critical')).toBe(5);
    expect(derivePriorityStoryPoints('high')).toBe(3);
    expect(derivePriorityStoryPoints('medium')).toBe(2);
    expect(derivePriorityStoryPoints('low')).toBe(1);
    expect(derivePriorityStoryPoints('minimal')).toBe(1);
  });

  it('defaults to 1 for unexpected input (defensive)', () => {
    expect(derivePriorityStoryPoints('CRITICAL')).toBe(1);
    expect(derivePriorityStoryPoints(undefined)).toBe(1);
  });

  it('composes with normalizePriorityForUserStory end-to-end', () => {
    expect(derivePriorityStoryPoints(normalizePriorityForUserStory('MUST'))).toBe(5);
    expect(derivePriorityStoryPoints(normalizePriorityForUserStory('should'))).toBe(3);
    expect(derivePriorityStoryPoints(normalizePriorityForUserStory('could'))).toBe(2);
    expect(derivePriorityStoryPoints(normalizePriorityForUserStory('wont'))).toBe(1);
    expect(derivePriorityStoryPoints(normalizePriorityForUserStory('garbage'))).toBe(2);
  });
});
