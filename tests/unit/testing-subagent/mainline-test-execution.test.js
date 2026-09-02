/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-4 / TS-9.
 *
 * Prior to this SD, lib/sub-agents/testing/index.js's MAINLINE executed-test branch (real
 * Playwright/E2E runs, via executeE2ETests or buildPhase3FromEvidence) stored counts only in
 * results.findings.phase3_execution -- never translated into metadata.test_execution, the
 * field mandatory-testing-validation.js and storeSubAgentResults' new guard (FR-1) both read.
 * Only the policy_non_applicable_* early-exit branches called buildTestExecution(). This pins
 * the fix: buildMainlinePhase3TestExecution() correctly maps a real phase3 result.
 *
 * SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 FR-1/FR-3 (TS-1/TS-2/TS-3/TS-9): the same function
 * also stamps artifact_path/artifact_sha/source, so those fields on the canonical shape stop
 * being write-only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildMainlinePhase3TestExecution } from '../../../lib/sub-agents/testing/index.js';
import { isMeasuredExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('buildMainlinePhase3TestExecution (FR-4, TS-9)', () => {
  it('maps a genuine passing E2E run to the canonical test_execution shape', () => {
    const phase3 = { tests_executed: 10, tests_passed: 10, failed_tests: 0, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result).toEqual({
      tests_executed: 10,
      tests_passed: 10,
      tests_failed: 0,
      tests_skipped: 0,
      artifact_sha: null,
      runner: 'playwright',
      artifact_path: null,
      source: null,
    });
    expect(isMeasuredExecution(result)).toBe(true);
  });

  it('maps a run with failures correctly (still measured, just not a clean pass)', () => {
    const phase3 = { tests_executed: 10, tests_passed: 7, failed_tests: 3, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.tests_failed).toBe(3);
    expect(isMeasuredExecution(result)).toBe(true);
  });

  it('a zero-executed phase3 (e.g. E2E not applicable / cache miss) is NOT measured', () => {
    const phase3 = { tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(isMeasuredExecution(result)).toBe(false);
  });

  it('handles a missing/undefined phase3 field gracefully (coerces to 0, never throws)', () => {
    const result = buildMainlinePhase3TestExecution({});
    expect(result.tests_executed).toBe(0);
    expect(isMeasuredExecution(result)).toBe(false);
  });
});

describe('buildMainlinePhase3TestExecution -- provenance stamping (SD-LEARN-FIX-LEARNING-IMPROVEMENT-005 FR-1/FR-3)', () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('TS-1: a fresh single-repo run stamps a real artifact_path/artifact_sha/source:"fresh"', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mainline-te-'));
    const reportPath = path.join(dir, 'playwright-results.json');
    const report = { stats: { expected: 10, unexpected: 0, skipped: 0 } };
    writeFileSync(reportPath, JSON.stringify(report));
    // computeArtifactSha hashes JSON.stringify(JSON.parse(rawFileContent)) -- the
    // re-serialized form, not raw bytes (artifact-verification.js hashArtifactContent).
    const expectedSha = createHash('sha256').update(JSON.stringify(report)).digest('hex');

    const phase3 = { tests_executed: 10, tests_passed: 10, failed_tests: 0, skipped_tests: 0, report_url: reportPath };
    const result = buildMainlinePhase3TestExecution(phase3);

    expect(result.artifact_path).toBe(reportPath);
    expect(result.artifact_sha).toBe(expectedSha);
    expect(result.source).toBe('fresh');
  });

  it('TS-2: a reused/cached run stamps source:"reused" using the ALREADY-verified artifact_sha, never recomputing', () => {
    // Deliberately WRONG on disk vs the claimed hash -- if this function recomputed, the
    // returned sha would NOT match the claimed value, proving reuse (not recomputation).
    dir = mkdtempSync(path.join(tmpdir(), 'mainline-te-'));
    const reportPath = path.join(dir, 'playwright-results.json');
    writeFileSync(reportPath, JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 } }));

    const phase3 = {
      tests_executed: 5, tests_passed: 5, failed_tests: 0, skipped_tests: 0,
      report_url: reportPath, evidence_reused: true, artifact_sha: 'claimed-already-verified-sha',
    };
    const result = buildMainlinePhase3TestExecution(phase3);

    expect(result.artifact_path).toBe(reportPath);
    expect(result.artifact_sha).toBe('claimed-already-verified-sha');
    expect(result.source).toBe('reused');
  });

  it('TESTING sub-agent review (evidence 24ae08ab): from_cache is a co-equal reuse signal to evidence_reused -- a cached artifact_sha is never recomputed/relabeled as fresh', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mainline-te-'));
    const reportPath = path.join(dir, 'playwright-results.json');
    // Deliberately wrong on disk vs the claimed hash -- proves reuse, not recomputation.
    writeFileSync(reportPath, JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 } }));

    const phase3 = {
      tests_executed: 5, tests_passed: 5, failed_tests: 0, skipped_tests: 0,
      report_url: reportPath, from_cache: true, artifact_sha: 'claimed-cached-sha',
    };
    const result = buildMainlinePhase3TestExecution(phase3);

    expect(result.source).toBe('reused');
    expect(result.artifact_sha).toBe('claimed-cached-sha');
  });

  it('TS-2b: a reused run with no artifact_sha on phase3 omits provenance entirely rather than fabricating one', () => {
    const phase3 = { tests_executed: 5, tests_passed: 5, failed_tests: 0, skipped_tests: 0, report_url: '/some/path.json', evidence_reused: true };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.artifact_path).toBeNull();
    expect(result.artifact_sha).toBeNull();
    expect(result.source).toBeNull();
  });

  it('TS-3 / D5-class: a zero-executed run with no real artifact omits artifact_path rather than fabricating one', () => {
    const phase3 = { tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.artifact_path).toBeNull();
    expect(result.artifact_sha).toBeNull();
    expect(result.source).toBeNull();
  });

  it('an unreadable/missing artifact path omits provenance (fail-soft), never throws', () => {
    const phase3 = { tests_executed: 10, tests_passed: 10, failed_tests: 0, skipped_tests: 0, report_url: '/definitely/does/not/exist.json' };
    expect(() => buildMainlinePhase3TestExecution(phase3)).not.toThrow();
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.artifact_path).toBeNull();
    expect(result.artifact_sha).toBeNull();
    expect(result.source).toBeNull();
  });

  it('TS-9: a multi-repo aggregate (report_url is an array) omits provenance rather than picking one repo\'s path/sha', () => {
    const phase3 = {
      tests_executed: 20, tests_passed: 20, failed_tests: 0, skipped_tests: 0,
      report_url: ['/repo1/playwright-results.json', '/repo2/playwright-results.json'],
    };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.artifact_path).toBeNull();
    expect(result.artifact_sha).toBeNull();
    expect(result.source).toBeNull();
  });

  it('TS-9b: a truthy EMPTY array report_url is still detected as the multi-repo branch, not mistaken for absence', () => {
    const phase3 = { tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0, report_url: [] };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.artifact_path).toBeNull();
    expect(result.artifact_sha).toBeNull();
    expect(result.source).toBeNull();
  });
});
