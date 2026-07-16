/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-3 — fail-closed LOW/MEDIUM/HIGH classifier.
 */
import { describe, it, expect } from 'vitest';
import { classifyConsequence } from '../../../lib/chairman/consequence-classifier.js';

describe('classifyConsequence — HIGH keyword categories', () => {
  it('venture kill', () => {
    expect(classifyConsequence({ title: 'Should we kill the Alt-Text venture?' })).toBe('high');
  });
  it('large spend (>= $5,000)', () => {
    expect(classifyConsequence({ title: 'Approve a $6,000 ad spend?' })).toBe('high');
    expect(classifyConsequence({ title: 'Approve a $10k contractor invoice?' })).toBe('high');
  });
  it('governance change', () => {
    expect(classifyConsequence({ title: 'Change the governance structure for VP_MARKETING?' })).toBe('high');
  });
  it('secrets/credentials', () => {
    expect(classifyConsequence({ title: 'Rotate the API key credentials now?' })).toBe('high');
  });
  it('contracts', () => {
    expect(classifyConsequence({ title: 'Sign the vendor contract?' })).toBe('high');
  });
  it('irreversible prod change', () => {
    expect(classifyConsequence({ title: 'Drop the prod table, this is irreversible' })).toBe('high');
  });
});

describe('classifyConsequence — fail-closed default', () => {
  it('unrecognized/unmatched input classifies HIGH, not LOW or MEDIUM', () => {
    expect(classifyConsequence({ title: 'xqzplorf frobnicate the widget' })).toBe('high');
    expect(classifyConsequence({})).toBe('high');
  });
});

describe('classifyConsequence — LOW', () => {
  it('plain scheduling/preference questions', () => {
    expect(classifyConsequence({ title: 'Which time works better for the call, 2pm or 4pm?' })).toBe('low');
    expect(classifyConsequence({ title: 'Quick FYI on venture progress' })).toBe('low');
  });
});

describe('classifyConsequence — MEDIUM', () => {
  it('a small, real dollar amount below the HIGH threshold', () => {
    expect(classifyConsequence({ title: 'Approve a $200 tool subscription?' })).toBe('medium');
  });
  it('bounded operational approve/pause/defer without risk keywords', () => {
    expect(classifyConsequence({ title: 'Approve the blog post draft?' })).toBe('medium');
  });
});

// Adversarial review findings (deep-tier PR #6093) — regression coverage for two
// confirmed classifier bypasses.
describe('classifyConsequence — adversarial-review regressions', () => {
  it('venture-shutdown phrased with "venture" BEFORE "shut down" still classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Venture Zeta pivot: shut it down?' })).toBe('high');
  });
  it('a >=$5,000 spend phrased without a $ prefix or "dollars" suffix still classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Approve 5000 USD for the campaign?' })).toBe('high');
    expect(classifyConsequence({ title: 'Approve a 5,000 payment to the vendor?' })).toBe('high');
    expect(classifyConsequence({ title: 'Proceed with a 6000 spend on ads?' })).toBe('high');
  });
});
