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

describe('SD-LEARN-FIX-ADDRESS-PAT-LES-008: isBoilerplateImprovement filters the legacy generator literals via anchored matching', () => {
  // The generator side (scripts/generate-comprehensive-retrospective.js) was already fixed
  // by SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-144 / QF-20260822-453 (see
  // generate-comprehensive-retrospective-boilerplate-fabrication.test.js). This covers a
  // SECOND, still-live agent-authored producer of the same 3 literals -- measured against
  // the full retrospectives corpus (9,321 retros / 48,944 improvement items) by two rounds
  // of sub-agent evidence (sub_agent_execution_results rows 3f4812ab.../d6ab2756...).
  const KNOWN_BAD_MUST_FILTER = [
    'Documentation could be enhanced with more visual diagrams',
    'Testing coverage could be expanded to include edge cases',
    'Performance benchmarks could be added for future comparison',
    'Documentation could be enhanced with more visual diagrams (auto-extracted boilerplate item, low priority).',
    'Performance benchmarks could be added for future comparison (auto-extracted boilerplate item, low priority).',
  ];

  // Measured false positives from the corpus -- naive substring/includes() matching would
  // wrongly filter these, including two real harness defect reports that merely begin with
  // similar phrasing to the fabricated boilerplate.
  const FALSE_POSITIVES_MUST_NOT_FILTER = [
    'Documentation could be enhanced with more visual diagrams of the Kind-A/Kind-B predicate classification',
    'Testing coverage could be expanded to include edge cases around the deferred dispatch_state DDL interaction once that follow-on SD lands',
    'Documentation could be enhanced with more visual diagrams of the purpose-key routing table.',
    'Documentation could be enhanced with more visual diagrams of the defense-in-depth (app-layer + DB-layer) enforcement flow.',
    'Documentation could be enhanced with more visual diagrams of the wrapper\'s control flow.',
    'Documentation could be enhanced with more visual diagrams in future architecture materializations.',
    "THE RETROSPECTIVE GENERATOR IS ITSELF A HARNESS DEFECT SOURCE: it rejects sd_key and accepts only the UUID `id` despite advertising `<SD-ID>`; it destroyed 4 lessons with `s.solution.toLowerCase is not a function`; and it awarded quality_score 90 to content containing 'Progress achieved: 0%' and 'Documentation could be enhanced with more visual diagrams'.",
  ];

  it.each(KNOWN_BAD_MUST_FILTER)('filters known-bad literal: %s', (text) => {
    expect(isBoilerplateImprovement(text)).toBe(true);
  });

  it.each(FALSE_POSITIVES_MUST_NOT_FILTER)('does NOT filter measured false positive: %s', (text) => {
    expect(isBoilerplateImprovement(text)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isBoilerplateImprovement('testing coverage could be expanded to include edge cases')).toBe(true);
  });

  it('does not falsely filter due to punctuation-before-suffix stripping order (suffix ends in "." itself)', () => {
    expect(isBoilerplateImprovement(
      'Testing coverage could be expanded to include edge cases (auto-extracted boilerplate item, low priority).'
    )).toBe(true);
  });
});
