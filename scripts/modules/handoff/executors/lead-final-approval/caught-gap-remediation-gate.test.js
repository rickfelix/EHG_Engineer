import { describe, it, expect, vi } from 'vitest';
import {
  isCaughtGapRemediation,
  hasWhyMissedPreventionContent,
  checkCaughtGapRemediationGap,
} from './caught-gap-remediation-gate.js';

vi.mock('../../retro-filters.js', () => ({
  getFilteredRetrospective: vi.fn(),
}));

describe('isCaughtGapRemediation', () => {
  it('true when bugs_found > 0', () => {
    expect(isCaughtGapRemediation({ bugs_found: 2 })).toBe(true);
  });
  it('false when bugs_found is 0 or missing', () => {
    expect(isCaughtGapRemediation({ bugs_found: 0 })).toBe(false);
    expect(isCaughtGapRemediation({})).toBe(false);
    expect(isCaughtGapRemediation(null)).toBe(false);
  });
});

describe('hasWhyMissedPreventionContent', () => {
  it('true when failure_patterns has a genuine entry', () => {
    expect(hasWhyMissedPreventionContent({ failure_patterns: ['review missed the schema drift'] })).toBe(true);
  });
  it('true when improvement_areas has a genuine entry', () => {
    expect(hasWhyMissedPreventionContent({ improvement_areas: ['add a pre-write schema check'] })).toBe(true);
  });
  it('false when both are empty/boilerplate/missing', () => {
    expect(hasWhyMissedPreventionContent({})).toBe(false);
    expect(hasWhyMissedPreventionContent({ failure_patterns: [], improvement_areas: [] })).toBe(false);
    expect(hasWhyMissedPreventionContent({ failure_patterns: ['handoff executed smoothly'] })).toBe(false);
  });
});

describe('checkCaughtGapRemediationGap', () => {
  it('returns null when not a caught-gap remediation', async () => {
    const { getFilteredRetrospective } = await import('../../retro-filters.js');
    getFilteredRetrospective.mockResolvedValue({ retrospective: { bugs_found: 0 } });
    expect(await checkCaughtGapRemediationGap({ id: 'x' }, {})).toBeNull();
  });

  it('returns null when caught-gap AND has genuine prevention content', async () => {
    const { getFilteredRetrospective } = await import('../../retro-filters.js');
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { bugs_found: 2, failure_patterns: ['carried-forward schema belief not re-verified'] },
    });
    expect(await checkCaughtGapRemediationGap({ id: 'x' }, {})).toBeNull();
  });

  it('returns an issue when caught-gap with no prevention content', async () => {
    const { getFilteredRetrospective } = await import('../../retro-filters.js');
    getFilteredRetrospective.mockResolvedValue({ retrospective: { bugs_found: 1, failure_patterns: [] } });
    const result = await checkCaughtGapRemediationGap({ id: 'x' }, {});
    expect(result).not.toBeNull();
    expect(result.issue).toContain('cfeb9179');
  });

  it('fails open (returns null) on any error', async () => {
    const { getFilteredRetrospective } = await import('../../retro-filters.js');
    getFilteredRetrospective.mockRejectedValue(new Error('db down'));
    expect(await checkCaughtGapRemediationGap({ id: 'x' }, {})).toBeNull();
  });

  it('adversarial-review regression: fails open on the non-throwing {retrospective:null,error} shape (real getFilteredRetrospective failure return, not just a thrown exception)', async () => {
    const { getFilteredRetrospective } = await import('../../retro-filters.js');
    getFilteredRetrospective.mockResolvedValue({ retrospective: null, error: { message: 'query failed' } });
    expect(await checkCaughtGapRemediationGap({ id: 'x' }, {})).toBeNull();
  });
});
