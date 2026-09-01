/**
 * SD-FDBK-INFRA-TESTING-EVIDENCE-REUSE-001 (FR-5, TS-6)
 *
 * Property-style test proving "PASS with unexpected>0 is impossible" through the REAL,
 * unmocked consumer chain (processPhase3Results + generateVerdict) -- not an isolated
 * deriver -- per prospective-TESTING finding GAP-2 (isolated-deriver tests can pass green
 * while the end-to-end pipeline stays false, since phase5's own downgrade-to-warning at
 * >=95% pass rate reads phase3.failed_tests, a field this SD's fix must actually populate
 * from the artifact).
 */
import { describe, it, expect } from 'vitest';
import { processPhase3Results } from '../../../lib/sub-agents/testing/index.js';
import { generateVerdict } from '../../../lib/sub-agents/testing/phases/phase5-verdict.js';
import { deriveCountsFromArtifact } from '../../../lib/sub-agents/testing/artifact-verification.js';

function runThroughRealConsumers(artifact, { provenanceOk = true, validationMode = 'retrospective' } = {}) {
  const counts = deriveCountsFromArtifact(artifact);
  const phase3 = {
    ...counts,
    failures: [],
    evidence_reused: true,
    provenance_verified: provenanceOk,
    ingest_source: provenanceOk ? 'PLAYWRIGHT_REPORTER' : 'claude-code'
  };
  const results = { findings: { phase3_execution: phase3 }, critical_issues: [], warnings: [], verdict: 'PASS', confidence: 100 };
  processPhase3Results(results, phase3);
  const verdict = generateVerdict(results, validationMode);
  return verdict.verdict;
}

describe('TS-6: PASS with unexpected>0 is impossible, through the real consumer chain', () => {
  const unexpectedValues = [0, 1, 5, 1276];
  const provenanceValues = [true, false];
  const flakyValues = [0, 3];

  for (const unexpected of unexpectedValues) {
    for (const provenanceOk of provenanceValues) {
      for (const flaky of flakyValues) {
        it(`unexpected=${unexpected}, provenanceOk=${provenanceOk}, flaky=${flaky} -> never PASS when unexpected>0`, () => {
          const artifact = { expected: 45, unexpected, skipped: 2, flaky };
          const verdict = runThroughRealConsumers(artifact, { provenanceOk });
          if (unexpected > 0) {
            expect(verdict).not.toBe('PASS');
          }
        });
      }
    }
  }

  it('unexpected=0, expected=0 (all-skipped, nothing ran) never yields PASS regardless of provenance', () => {
    for (const provenanceOk of [true, false]) {
      const artifact = { expected: 0, unexpected: 0, skipped: 1673, flaky: 0 };
      const verdict = runThroughRealConsumers(artifact, { provenanceOk });
      expect(verdict).not.toBe('PASS');
    }
  });

  it('unexpected=0, expected>0, provenanceOk=true -> PASS (the genuine happy path)', () => {
    const artifact = { expected: 51, unexpected: 0, skipped: 0, flaky: 0 };
    expect(runThroughRealConsumers(artifact, { provenanceOk: true })).toBe('PASS');
  });

  it('unexpected=0, expected>0, provenanceOk=false -> CONDITIONAL_PASS, never an unqualified PASS (FR-4)', () => {
    const artifact = { expected: 51, unexpected: 0, skipped: 0, flaky: 0 };
    expect(runThroughRealConsumers(artifact, { provenanceOk: false })).toBe('CONDITIONAL_PASS');
  });

  it('flaky>0, unexpected=0 is not treated as zero-evidence (flaky tests still count as executed+passed)', () => {
    const artifact = { expected: 48, unexpected: 0, skipped: 0, flaky: 3 };
    expect(runThroughRealConsumers(artifact, { provenanceOk: true })).toBe('PASS');
  });
});
