import { describe, it, expect } from 'vitest';
import { getFourBucketsPrompt } from '../four-buckets-prompt.js';

describe('getFourBucketsPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = getFourBucketsPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('contains all four bucket types', () => {
    const prompt = getFourBucketsPrompt();
    expect(prompt).toContain('fact');
    expect(prompt).toContain('assumption');
    expect(prompt).toContain('simulation');
    expect(prompt).toContain('unknown');
  });

  it('contains the epistemicClassification instruction', () => {
    const prompt = getFourBucketsPrompt();
    expect(prompt).toContain('epistemicClassification');
  });

  it('is under 200 tokens (approximated as <1000 chars)', () => {
    const prompt = getFourBucketsPrompt();
    expect(prompt.length).toBeLessThan(1000);
  });
});
