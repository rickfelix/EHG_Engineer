// QF-20260823-174: two real defects in the /learn pattern extractor, confirmed live via
// SD-LEARN-FIX-ADDRESS-PAT-LES-007 (auto-generated, then cancelled after a LEAD-phase
// risk-agent investigation found zero buildable deployment-code defect behind it).
//
// (1) determineSeverity() used bare .includes(), so "production" matched inside
//     "reproduction", "high" inside "highlight", "low" inside "follow" -- scoring
//     unrelated text as critical/high/low by substring accident.
// (2) The generic-item skip filter had no check for "Risk managed: <label>" -- a
//     mechanically-generated retro string (generate-comprehensive-retrospective.js's
//     insights.challenges.push) that restates an sd.risks[] entry the ORIGINATING SD
//     already avoided by design. Combined with (1) -- this exact text contains the word
//     "production" (inside "has never actually run in production", an assertion of
//     ABSENCE) -- it was scored critical, which unlocks the noise filter's
//     single-occurrence severity bypass and let one boilerplate line auto-spawn a full SD.
//
// Imported from PRODUCTION, not re-implemented -- these tests fail if the real logic drifts.
import { describe, it, expect } from 'vitest';
import { determineSeverity, isBoilerplateImprovement } from '../../../scripts/auto-extract-patterns-from-retro.js';

describe('QF-20260823-174: determineSeverity uses word-boundary matching', () => {
  it('does not score "reproduction" as critical via a bare "production" substring match', () => {
    expect(determineSeverity('Steps to aid reproduction of the bug were missing', '')).not.toBe('critical');
  });

  it('does not score "highlight" as high via a bare "high" substring match', () => {
    expect(determineSeverity('The dashboard should highlight failed rows', '')).not.toBe('high');
  });

  it('does not score "follow" as low via a bare "low" substring match', () => {
    expect(determineSeverity('The team did not follow the runbook', '')).not.toBe('low');
  });

  it('CONTROL: still scores critical on a genuine whole-word match', () => {
    expect(determineSeverity('This is a critical production outage', '')).toBe('critical');
  });

  it('CONTROL: a genuine whole-word "production" mention (e.g. an assertion of absence) still scores critical -- word-boundary matching fixes ACCIDENTAL substring matches, not negation-blindness; the live PAT-LES-5b8119684a4e text is instead kept out of severity scoring entirely by isBoilerplateImprovement below', () => {
    const text = 'Risk managed: The original FR-1 (direct, automated Cloud Run service deletion) is not executable from this repo/session: gcloud CLI is not on PATH, only a Drive-folder-scoped Google service account exists (no Cloud Run admin), and the CREATE-side deploy pipeline (promote.js/publish.js) has never actually run in production per VALIDATION (zero real importers, MarketLens was deployed by an out-of-band credential).';
    expect(determineSeverity(text, '')).toBe('critical');
  });
});

describe('QF-20260823-174: isBoilerplateImprovement skips "Risk managed:" narratives', () => {
  it('skips the exact live PAT-LES-5b8119684a4e text -- the actual specimen that auto-spawned SD-LEARN-FIX-ADDRESS-PAT-LES-007', () => {
    const text = 'Risk managed: The original FR-1 (direct, automated Cloud Run service deletion) is not executable from this repo/session: gcloud CLI is not on PATH, only a Drive-folder-scoped Google service account exists (no Cloud Run admin), and the CREATE-side deploy pipeline (promote.js/publish.js) has never actually run in production per VALIDATION (zero real importers, MarketLens was deployed by an out-of-band credential).';
    expect(isBoilerplateImprovement(text)).toBe(true);
  });

  it('skips case-insensitively', () => {
    expect(isBoilerplateImprovement('risk managed: some lowercase-prefixed risk narrative that is long enough')).toBe(true);
  });

  it('CONTROL: does not skip a real, substantive improvement item', () => {
    expect(isBoilerplateImprovement('The deploy pipeline lacks a rollback mechanism for failed migrations')).toBe(false);
  });

  it('still skips short items and the pre-existing exact-boilerplate string (no regression)', () => {
    expect(isBoilerplateImprovement('too short')).toBe(true);
    expect(isBoilerplateImprovement('No significant challenges documented')).toBe(true);
  });
});
