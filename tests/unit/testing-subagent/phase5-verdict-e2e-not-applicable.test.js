/**
 * SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-D
 *
 * generateVerdict() must distinguish "E2E infra genuinely absent" (e2e_not_applicable,
 * non-BLOCKED) from "tests genuinely failed / zero evidence" (still BLOCKED). PLAN-phase
 * testing-agent review (G1) found the originally-planned "checked FIRST" branch order would
 * swallow an unrelated critical_issue -- the branch must sit AFTER critical_issues, so an
 * e2e_not_applicable repo with an unrelated critical finding (e.g. a missing user story)
 * still BLOCKS.
 */
import { describe, it, expect } from 'vitest';
import { generateVerdict } from '../../../lib/sub-agents/testing/phases/phase5-verdict.js';

describe('generateVerdict — e2e_not_applicable', () => {
  it('returns a non-BLOCKED verdict when phase3_execution.e2e_not_applicable is true', () => {
    const results = {
      findings: {
        phase3_execution: {
          e2e_not_applicable: true,
          reason: 'No E2E infrastructure found in /fake/repo',
          tests_executed: 0,
          failed_tests: 0
        }
      },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).not.toBe('BLOCKED');
    expect(out.recommendations.some((r) => /not applicable/i.test(r))).toBe(true);
  });

  it('regression guard (G1): an unrelated critical_issue still BLOCKS even when e2e_not_applicable is set', () => {
    const results = {
      findings: {
        phase3_execution: { e2e_not_applicable: true, reason: 'no infra', tests_executed: 0, failed_tests: 0 }
      },
      critical_issues: [{ issue: 'No user stories found — cannot generate test cases' }],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).toBe('BLOCKED');
  });

  it('regression guard: tests_executed===0 with NO e2e_not_applicable flag (prospective) is still BLOCKED', () => {
    const results = {
      findings: { phase3_execution: { tests_executed: 0, tests_passed: 0, failed_tests: 0 } },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).toBe('BLOCKED');
  });

  it('regression guard: real failed_tests>0 (infra-having repo, genuine failure) is still BLOCKED, not swallowed', () => {
    const results = {
      findings: {
        phase3_execution: { tests_executed: 20, tests_passed: 10, failed_tests: 10 }
      },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).toBe('BLOCKED');
  });
});
