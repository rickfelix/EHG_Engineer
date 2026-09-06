// SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001
//
// Finding A: GATE2's ambiguity/stub preflight scan reads product_requirements_v2's
// persisted metadata.grounding_validation as though it were authored content. That field is
// a DERIVED analysis cache (lib/prd-grounding-validator.js, persisted by
// scripts/prd/index.js) computed once from the PRD's authored text and never re-synced when
// the authored text (functional_requirements, the rendered content mirror) is later edited
// -- so a marker word landing in the cache (via a committed docs/prds/*.json full-row
// mirror) can permanently block a genuinely-clean SD with no honest fix available.
//
// Finding B: the stub-detection counter (checkStubbedCode) deduped to unique LINE TEXT,
// silently collapsing 2 distinct occurrences sharing identical rendered text into a
// reported count of 1.
import { describe, it, expect } from 'vitest';
import {
  addedLinesForAmbiguityScan,
  stripGroundingValidationBlock,
  isAmbiguityScanExemptTestFile,
} from '../../../scripts/modules/implementation-fidelity/preflight/index.js';

describe('SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 Finding A: stripGroundingValidationBlock', () => {
  it('elides an added grounding_validation object containing a marker word, leaving authored text intact', () => {
    const diff = [
      '+  "functional_requirements": [{"id":"FR-1","description":"Do not leave it ambiguous for EXEC to guess"}],',
      '+  "metadata": {',
      '+    "grounding_validation": {',
      '+      "all_results": [{"factors":[{"name":"sd_text_similarity","detail":"45.2% semantic overlap"}],"requirement_title":"This is ambiguous and unclear"}]',
      '+    },',
      '+    "other_field": "kept"',
      '+  }',
    ].join('\n');
    const result = stripGroundingValidationBlock(diff);
    // The authored FR-1 line's genuine "ambiguous" hit survives -- the scanner's real target.
    expect(result).toMatch(/Do not leave it ambiguous for EXEC to guess/);
    // The cached blob's marker words are gone.
    expect(result).not.toMatch(/This is ambiguous and unclear/);
    expect(result).not.toMatch(/sd_text_similarity/);
    // A sibling metadata key after the elided block is preserved (brace-depth tracked correctly).
    expect(result).toMatch(/other_field/);
  });

  it('a genuinely clean PRD (no marker words anywhere) is unaffected by the stripper', () => {
    const diff = '+  "functional_requirements": [{"id":"FR-1","description":"Clean text"}],';
    expect(stripGroundingValidationBlock(diff)).toBe(diff);
  });

  it('handles a single-line grounding_validation value (e.g. null) without eating the next line', () => {
    const diff = [
      '+  "metadata": {',
      '+    "grounding_validation": null,',
      '+    "other_field": "ambiguous should still be caught here"',
      '+  }',
    ].join('\n');
    const result = stripGroundingValidationBlock(diff);
    expect(result).toMatch(/ambiguous should still be caught here/);
  });

  it('a grounding_validation block at the very end of a diff (no trailing sibling key) does not throw and closes correctly', () => {
    const diff = [
      '+  "metadata": {',
      '+    "grounding_validation": {',
      '+      "requirement_title": "ambiguous cache text"',
      '+    }',
      '+  }',
    ].join('\n');
    expect(() => stripGroundingValidationBlock(diff)).not.toThrow();
    expect(stripGroundingValidationBlock(diff)).not.toMatch(/ambiguous cache text/);
  });

  it('malformed/unbalanced braces inside a grounding_validation value degrade gracefully without throwing', () => {
    const diff = [
      '+  "grounding_validation": {',
      '+    "detail": "unbalanced { brace",',
      '+  "trailing_authored_field": "still ambiguous"',
    ].join('\n');
    // Real PRD JSON is always well-formed (JSON.stringify) -- this is defensive-only coverage.
    expect(() => stripGroundingValidationBlock(diff)).not.toThrow();
  });

  it('isAmbiguityScanExemptTestFile: a real test file under tests/ with a recognized suffix is exempt', () => {
    expect(isAmbiguityScanExemptTestFile('tests/unit/implementation-fidelity/foo.test.js')).toBe(true);
  });

  it('isAmbiguityScanExemptTestFile: a non-test file under tests/ (no .test./.spec. suffix) is NOT exempt', () => {
    expect(isAmbiguityScanExemptTestFile('tests/fixtures/sample-data.js')).toBe(false);
  });

  it('isAmbiguityScanExemptTestFile: a file OUTSIDE tests/ cannot claim the exemption by filename alone (no copycat)', () => {
    expect(isAmbiguityScanExemptTestFile('scripts/evil.test.js')).toBe(false);
  });

  it('a marker word inside an ADDED test fixture string is excluded from the scan (the self-referential FP this SD hit building its own PR)', () => {
    const combinedDiff = [
      'diff --git a/tests/unit/example.test.js b/tests/unit/example.test.js',
      '+++ b/tests/unit/example.test.js',
      "+  expect(check('This is ambiguous and unclear')).toBe(true);",
    ].join('\n');
    const result = addedLinesForAmbiguityScan(combinedDiff);
    expect(result).not.toMatch(/ambiguous/);
  });

  it('addedLinesForAmbiguityScan applies the grounding_validation elision on top of the existing added-lines/exempt-file filtering', () => {
    const combinedDiff = [
      'diff --git a/docs/prds/prd-example.json b/docs/prds/prd-example.json',
      '+++ b/docs/prds/prd-example.json',
      '+  "metadata": {',
      '+    "grounding_validation": {',
      '+      "requirement_title": "flagged as ambiguous by the cache"',
      '+    }',
      '+  }',
      '-  "removed_line": "ambiguous but removed, must not count"',
    ].join('\n');
    const result = addedLinesForAmbiguityScan(combinedDiff);
    expect(result).not.toMatch(/flagged as ambiguous by the cache/);
    expect(result).not.toMatch(/removed, must not count/); // removed lines already excluded
  });
});
