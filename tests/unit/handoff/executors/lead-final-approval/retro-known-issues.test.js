/**
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-A (F1) -- covers PRD TS-1..TS-7 plus the 6
 * gaps the TESTING sub-agent flagged during PLAN-TO-EXEC review: GAP-1 (write-site fail-open,
 * proven here by extractRetroKnownIssues never throwing), GAP-2 (reconcile clean-retro
 * regression), GAP-3 (aggregate-detector over-suppression -- boilerplate in an unrelated field
 * must not hide a genuine caveat), GAP-4 (mixed genuine+boilerplate list, >100-char item), GAP-5
 * (both getFilteredRetrospective failure modes: throw, and returned {error}), GAP-6 (write-site
 * behavior tested via the directly-exported, non-DB functions rather than live integration).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../scripts/modules/handoff/retro-filters.js', () => ({
  getFilteredRetrospective: vi.fn(),
}));

import { getFilteredRetrospective } from '../../../../../scripts/modules/handoff/retro-filters.js';
import {
  NO_ISSUES_FALLBACK,
  dereferenceImprovementItem,
  isGenuineCaveat,
  isFallbackKnownIssues,
  extractRetroKnownIssues,
  combineKnownIssuesWithProvenance,
} from '../../../../../scripts/modules/handoff/executors/lead-final-approval/retro-known-issues.js';

const SD = { id: 'sd-uuid-1', created_at: '2026-01-01T00:00:00Z', sd_key: 'SD-TEST-001' };
const SUPABASE = {};

beforeEach(() => {
  getFilteredRetrospective.mockReset();
});

describe('dereferenceImprovementItem', () => {
  it('passes through plain strings', () => {
    expect(dereferenceImprovementItem('a real caveat')).toBe('a real caveat');
  });

  it('extracts .improvement from object-shaped items', () => {
    expect(dereferenceImprovementItem({ improvement: 'the caveat text', is_boilerplate: false })).toBe(
      'the caveat text'
    );
  });

  it('falls back to JSON.stringify for an object with no .improvement key', () => {
    expect(dereferenceImprovementItem({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  it('handles null/undefined without throwing', () => {
    expect(dereferenceImprovementItem(null)).toBe('');
    expect(dereferenceImprovementItem(undefined)).toBe('');
  });
});

describe('isGenuineCaveat', () => {
  it('rejects empty/whitespace-only text', () => {
    expect(isGenuineCaveat('')).toBe(false);
    expect(isGenuineCaveat('   ')).toBe(false);
    expect(isGenuineCaveat(null)).toBe(false);
  });

  it('rejects known BOILERPLATE_PATTERNS phrasing', () => {
    expect(isGenuineCaveat('improve communication going forward')).toBe(false);
    expect(isGenuineCaveat('continue monitoring for improvement')).toBe(false);
    expect(isGenuineCaveat('maintain momentum on this initiative')).toBe(false);
  });

  it('rejects the supplementary no-issues-identified family', () => {
    expect(isGenuineCaveat('No specific issues identified - handoff executed smoothly')).toBe(false);
    expect(isGenuineCaveat('No significant challenges encountered')).toBe(false);
  });

  it('accepts a genuine, specific caveat', () => {
    expect(
      isGenuineCaveat('FR-4 negative back-propagation ships with 0 live exact-matches today -- currently unexercised')
    ).toBe(true);
  });

  it('accepts a genuine caveat longer than 100 chars (GAP-4: truncation must not affect per-item filtering)', () => {
    const longCaveat =
      'This is a genuinely specific finding that exceeds one hundred characters in length to verify the filter still works correctly end to end';
    expect(longCaveat.length).toBeGreaterThan(100);
    expect(isGenuineCaveat(longCaveat)).toBe(true);
  });
});

describe('isFallbackKnownIssues', () => {
  it('recognizes the fallback via reference identity (the only shape extractRetroKnownIssues actually returns)', () => {
    expect(isFallbackKnownIssues(NO_ISSUES_FALLBACK)).toBe(true);
  });

  it('does not misfire on a genuine single-item list', () => {
    expect(isFallbackKnownIssues([{ issue: 'a real caveat' }])).toBe(false);
  });

  it('does not misfire on a multi-item list', () => {
    expect(isFallbackKnownIssues([{ issue: 'a' }, { issue: 'b' }])).toBe(false);
  });

  it('SECURITY fix: a genuine caveat whose text happens to equal the fallback string is NOT misdetected (reference, not content, equality)', () => {
    // A freshly-constructed array with matching CONTENT is not the same reference as
    // NO_ISSUES_FALLBACK -- this is the exact collision the SECURITY review flagged as a risk
    // under the old strict-string-equality implementation.
    expect(isFallbackKnownIssues([{ issue: 'None at approval time' }])).toBe(false);
  });
});

describe('extractRetroKnownIssues -- TS-1..TS-5, GAP-1, GAP-3, GAP-4', () => {
  it('TS-1: returns the genuine caveat when what_needs_improvement has real content', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { what_needs_improvement: ['FR-4 ships with 0 live exact-matches today -- unexercised'] },
      error: null,
    });
    const result = await extractRetroKnownIssues(SD, SUPABASE);
    expect(result).toEqual([{ issue: 'FR-4 ships with 0 live exact-matches today -- unexercised' }]);
  });

  it('TS-2: falls back when what_needs_improvement is only boilerplate', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { what_needs_improvement: ['improve communication', 'continue monitoring for improvement'] },
      error: null,
    });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual(NO_ISSUES_FALLBACK);
  });

  it('TS-3: falls back when no retrospective exists', async () => {
    getFilteredRetrospective.mockResolvedValue({ retrospective: null, error: null });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual(NO_ISSUES_FALLBACK);
  });

  it('TS-4: handles object-shaped what_needs_improvement items', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { what_needs_improvement: [{ improvement: 'a real object-shaped caveat', is_boilerplate: false }] },
      error: null,
    });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual([{ issue: 'a real object-shaped caveat' }]);
  });

  it('TS-5a (GAP-5): falls back when getFilteredRetrospective throws -- never propagates (GAP-1)', async () => {
    getFilteredRetrospective.mockRejectedValue(new Error('simulated DB outage'));
    await expect(extractRetroKnownIssues(SD, SUPABASE)).resolves.toEqual(NO_ISSUES_FALLBACK);
  });

  it('TS-5b (GAP-5): falls back when getFilteredRetrospective resolves with {error, retrospective:null} (its actual non-throwing failure shape)', async () => {
    getFilteredRetrospective.mockResolvedValue({ retrospective: null, error: { message: 'query failed' } });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual(NO_ISSUES_FALLBACK);
  });

  it('GAP-3: a genuine what_needs_improvement caveat survives even when boilerplate-style text appears elsewhere', async () => {
    // Deliberately does NOT call the aggregate detectBoilerplate(retrospective) -- only
    // what_needs_improvement content is inspected, so a generic what_went_well entry never
    // suppresses a genuine what_needs_improvement caveat.
    getFilteredRetrospective.mockResolvedValue({
      retrospective: {
        what_went_well: ['maintain momentum on this initiative'], // boilerplate, unrelated field
        what_needs_improvement: ['FR-4 negative back-propagation ships with 0 live exact-matches today'],
      },
      error: null,
    });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual([
      { issue: 'FR-4 negative back-propagation ships with 0 live exact-matches today' },
    ]);
  });

  it('GAP-4: a mixed list of genuine + boilerplate items keeps only the genuine one', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: {
        what_needs_improvement: [
          'continue monitoring for improvement', // boilerplate
          'FR-4 negative back-propagation ships with 0 live exact-matches today', // genuine
          'improve communication going forward', // boilerplate
        ],
      },
      error: null,
    });
    expect(await extractRetroKnownIssues(SD, SUPABASE)).toEqual([
      { issue: 'FR-4 negative back-propagation ships with 0 live exact-matches today' },
    ]);
  });

  it('never throws even given a malformed sd argument (defensive)', async () => {
    getFilteredRetrospective.mockResolvedValue({ retrospective: null, error: null });
    await expect(extractRetroKnownIssues(null, SUPABASE)).resolves.toEqual(NO_ISSUES_FALLBACK);
    await expect(extractRetroKnownIssues({}, SUPABASE)).resolves.toEqual(NO_ISSUES_FALLBACK);
  });
});

describe('combineKnownIssuesWithProvenance -- FR-3, GAP-2', () => {
  const provenance = {
    issue: 'Row synthesized at verify-time; original completion-time gate context lives on the leo_handoff_executions execution row',
  };

  it('GAP-2: a clean retro yields ONLY the provenance entry -- the placeholder is dropped, not combined', () => {
    const result = combineKnownIssuesWithProvenance(NO_ISSUES_FALLBACK, provenance);
    expect(result).toEqual([provenance]);
    expect(result).toHaveLength(1); // regression guard: must never be [placeholder, provenance]
  });

  it('a genuine caveat is combined WITH the provenance note, not replacing it', () => {
    const retroIssues = [{ issue: 'a real caveat' }];
    const result = combineKnownIssuesWithProvenance(retroIssues, provenance);
    expect(result).toEqual([{ issue: 'a real caveat' }, provenance]);
  });

  it('multiple genuine caveats are all preserved alongside the provenance note', () => {
    const retroIssues = [{ issue: 'caveat one' }, { issue: 'caveat two' }];
    const result = combineKnownIssuesWithProvenance(retroIssues, provenance);
    expect(result).toEqual([{ issue: 'caveat one' }, { issue: 'caveat two' }, provenance]);
  });
});
