import { describe, it, expect } from 'vitest';
import { impliesUserInteraction } from '../../../../lib/eva/utils/user-interaction-signal.js';

describe('impliesUserInteraction — SD-LEO-INFRA-S19-DECOMPOSITION-COVERAGE-001', () => {
  it('matches the two named MarketLens defect specimens', () => {
    expect(impliesUserInteraction({ title: 'Develop Landing Page with Hero and CTA' })).toBe(true);
    expect(impliesUserInteraction({ title: 'User Registration and Login Flow' })).toBe(true);
  });

  it('does not match the genuinely backend-only counter-example', () => {
    expect(impliesUserInteraction({
      title: 'Wire Error Capture Middleware',
      description: 'Express error middleware for API request handling',
      acceptanceCriteria: 'Errors are captured and logged server-side',
    })).toBe(false);
  });

  it('does not false-positive on common backend words containing "ui" as a substring', () => {
    expect(impliesUserInteraction({
      title: 'Build the requirements pipeline',
      description: 'Quick build for the acquire-lead pipeline',
    })).toBe(false);
  });

  it('checks description and acceptanceCriteria, not just title', () => {
    expect(impliesUserInteraction({ title: 'Backend Task', description: 'Renders a modal dialog on error' })).toBe(true);
    expect(impliesUserInteraction({ title: 'Backend Task', acceptanceCriteria: 'User completes the checkout flow' })).toBe(true);
  });

  it('returns false for empty/missing fields', () => {
    expect(impliesUserInteraction({})).toBe(false);
    expect(impliesUserInteraction(undefined)).toBe(false);
  });
});
