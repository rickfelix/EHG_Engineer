import { describe, it, expect } from 'vitest';
import { resolvePatternSuccessUpdate } from './resolve-pattern-success-update.js';

describe('resolvePatternSuccessUpdate (SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001, feedback 85faa739, INV-001)', () => {
  it("could-not-check branch: a fetch error produces action='could-not-check' with no update payload, and a message distinct from the not-found branch", () => {
    const result = resolvePatternSuccessUpdate({ fetchError: { message: 'connection reset' }, pattern: null, outcomeScore: 100 });
    expect(result.action).toBe('could-not-check');
    expect(result.payload).toBeUndefined();
    expect(result.logMessage).toContain('COULD NOT BE CHECKED');
    expect(result.logMessage).toContain('connection reset');
    expect(result.logMessage).not.toContain('not found');
  });

  it("not-found branch: no fetch error but no row produces action='not-found', distinct from the could-not-check message", () => {
    const result = resolvePatternSuccessUpdate({ fetchError: null, pattern: null, outcomeScore: 100 });
    expect(result.action).toBe('not-found');
    expect(result.payload).toBeUndefined();
    expect(result.logMessage).toContain('not found');
    expect(result.logMessage).not.toContain('COULD NOT BE CHECKED');
  });

  it("update branch: an existing row produces action='update' with a correctly-computed running average", () => {
    const result = resolvePatternSuccessUpdate({
      fetchError: null,
      pattern: { occurrence_count: 3, success_rate: 60 },
      outcomeScore: 100,
    });
    expect(result.action).toBe('update');
    expect(result.payload).toEqual({ occurrence_count: 4, success_rate: 70 }); // (60*3+100)/4
  });

  it('update branch treats a missing occurrence_count/success_rate as 0 rather than throwing', () => {
    const result = resolvePatternSuccessUpdate({ fetchError: null, pattern: {}, outcomeScore: 50 });
    expect(result.action).toBe('update');
    expect(result.payload).toEqual({ occurrence_count: 1, success_rate: 50 });
  });

  it('a fetch error always wins over a truthy pattern (could-not-check takes priority)', () => {
    const result = resolvePatternSuccessUpdate({
      fetchError: { message: 'timeout' },
      pattern: { occurrence_count: 3, success_rate: 60 },
      outcomeScore: 100,
    });
    expect(result.action).toBe('could-not-check');
  });
});
