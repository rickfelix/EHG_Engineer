// QF-20260509-COMPLIANCE-LOOP: refinement-prompt at compliance-loop.js:77
// must auto-skip under flags.forceComplete instead of wedging on stdin.
// Closes feedback 0974d18b. 9th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001
// (sibling miss in QF-20260509-552 which patched validateTests + mergeToMain
// + commit/push prompts but not the compliance-loop refinement prompt).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the rubric so we can control verdict
const runComplianceRubricMock = vi.fn();
vi.mock('../../../lib/quickfix-compliance-rubric.js', () => ({
  runComplianceRubric: (...args) => runComplianceRubricMock(...args)
}));

// Mock execSync so applyAutoRefinement's npm-lint path doesn't run
vi.mock('child_process', async () => ({
  execSync: vi.fn(() => '')
}));

import { runComplianceWithRefinement } from '../../../scripts/modules/complete-quick-fix/compliance-loop.js';

const failingResult = {
  totalScore: 40,
  verdict: 'FAIL',
  criteriaResults: [
    { id: 'targeted_fix', name: 'Targeted Fix', passed: false, score: 0, maxScore: 10, evidence: 'too many files' },
    { id: 'unit_tests_pass', name: 'Unit Tests', passed: true, score: 10, maxScore: 10, evidence: '' },
  ],
};
const passingResult = { ...failingResult, totalScore: 90, verdict: 'PASS', criteriaResults: failingResult.criteriaResults.map(c => ({ ...c, passed: true })) };

describe('QF-20260509-COMPLIANCE-LOOP: runComplianceWithRefinement honors flags.forceComplete', () => {
  beforeEach(() => {
    runComplianceRubricMock.mockReset();
  });

  it('with FAIL verdict and forceComplete=true, auto-skips refinement-prompt (no prompt() call)', async () => {
    runComplianceRubricMock.mockResolvedValue(failingResult);
    const promptSpy = vi.fn();  // assert NOT called

    const { refinementHistory } = await runComplianceWithRefinement(
      'QF-TEST',
      { description: 'test fix', actual_behavior: 'broken', estimated_loc: 20 },
      { errorsBeforeFix: [], errorsAfterFix: [], actualLoc: 20, filesChanged: [], testsPass: true },
      promptSpy,
      { forceComplete: true, reason: 'autonomous-sweep' }
    );

    expect(promptSpy).not.toHaveBeenCalled();
    // Still records the FAIL attempt before breaking
    expect(refinementHistory).toHaveLength(1);
    expect(refinementHistory[0].verdict).toBe('FAIL');
  });

  it('with FAIL verdict and forceComplete absent (default), DOES call prompt()', async () => {
    runComplianceRubricMock.mockResolvedValue(failingResult);
    const promptSpy = vi.fn().mockResolvedValue('skip');  // user types 'skip'

    await runComplianceWithRefinement(
      'QF-TEST',
      { description: 'test fix', actual_behavior: 'broken', estimated_loc: 20 },
      { errorsBeforeFix: [], errorsAfterFix: [], actualLoc: 20, filesChanged: [], testsPass: true },
      promptSpy
    );

    // The original interactive behavior is preserved when no flag passed
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(promptSpy.mock.calls[0][0]).toMatch(/Attempt auto-refinement/);
  });

  it('with PASS verdict on first attempt, prompt() never called regardless of flags', async () => {
    runComplianceRubricMock.mockResolvedValue(passingResult);
    const promptSpy = vi.fn();

    const { refinementHistory } = await runComplianceWithRefinement(
      'QF-TEST',
      { description: 'test fix', actual_behavior: 'ok', estimated_loc: 10 },
      { errorsBeforeFix: [], errorsAfterFix: [], actualLoc: 10, filesChanged: [], testsPass: true },
      promptSpy,
      { forceComplete: false }
    );

    expect(promptSpy).not.toHaveBeenCalled();
    expect(refinementHistory[0].verdict).toBe('PASS');
  });

  it('flags param defaults to {} when omitted (backward-compat)', async () => {
    runComplianceRubricMock.mockResolvedValue(passingResult);
    const promptSpy = vi.fn();

    // 4 args (no flags) — must not throw on flags.forceComplete read
    await expect(
      runComplianceWithRefinement(
        'QF-TEST',
        { description: 'x', actual_behavior: 'y', estimated_loc: 5 },
        { errorsBeforeFix: [], errorsAfterFix: [], actualLoc: 5, filesChanged: [], testsPass: true },
        promptSpy
      )
    ).resolves.toBeDefined();
  });
});

describe('QF-20260509-COMPLIANCE-LOOP: source-level guard verifies the auto-skip branch is wired', () => {
  it('compliance-loop.js source contains the forceComplete-aware refineChoice ternary', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.join(__dirname, '../../../scripts/modules/complete-quick-fix/compliance-loop.js'),
      'utf-8'
    );
    // Must contain the flag-gated ternary (auto-skip path)
    expect(src).toMatch(/flags\.forceComplete[\s\S]+?'skip'/);
    // Must still preserve the original prompt for interactive use
    expect(src).toMatch(/Attempt auto-refinement/);
  });
});
