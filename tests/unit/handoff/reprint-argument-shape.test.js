/**
 * Closes a CRITICAL finding from the mandatory deep-tier adversarial ship review of PR #7126
 * (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001, pre-merge).
 *
 * handleExecuteCommand (cli-main.js) returns a WRAPPER: { success, sdId, handoffType, result }.
 * printHandoffResultLines/displayExecutionResult (execution-helpers.js) both expect the INNER
 * result object -- result.normalizedScore etc. cli-main.js:1031 captured the wrapper as
 * originalResult and passed it straight to printHandoffResultLines, so every reprinted score
 * read as NaN (undefined normalizedScore/qualityScore, and NaN ?? 0 stays NaN -- ?? only
 * catches null/undefined). lib/fleet/parent-completion.mjs's SCORE=(\d+) regex cannot match
 * "NaN", so the reprint became invisible to its one real consumer -- silently defeating this
 * SD's entire headline promise (the original SD's result survives a cascade attempt).
 *
 * Why the existing tests missed this: cli-main-cascade-reprint-wiring.test.js asserts only the
 * SOURCE TEXT of the printHandoffResultLines(...) call (a wiring/identifier check); nothing
 * anywhere actually INVOKED printHandoffResultLines with a realistic argument shape and
 * inspected the output. "Prove the primitive by execution, prove the wiring statically" left
 * exactly this gap: an argument-SHAPE mismatch is invisible to both halves by construction.
 *
 * This test closes it: builds the exact wrapper shape handleExecuteCommand really returns,
 * feeds it to the REAL printHandoffResultLines, captures REAL stdout, and requires it to match
 * parent-completion.mjs's actual consumer regex -- copied verbatim, not paraphrased.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHandoffResultLines } from '../../../scripts/modules/handoff/cli/execution-helpers.js';

// Copied verbatim from lib/fleet/parent-completion.mjs:74 -- if that regex changes, this
// test's copy must be updated too, or it stops proving what it claims to prove.
const PARENT_COMPLETION_CONSUMER_REGEX = /HANDOFF_RESULT=(PASS|FAIL)\s+SD=(\S+)\s+SCORE=(\d+)\s+PHASE=\S+(?:\s+REASON=(\S+))?/g;

describe('printHandoffResultLines argument shape -- fed the wrapper handleExecuteCommand actually returns', () => {
  let logSpy;
  let output;

  beforeEach(() => {
    output = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('[CRITICAL FIX PIN] the INNER result object (correct shape) produces a HANDOFF_RESULT line the real parent-completion.mjs regex can parse', async () => {
    // The shape handleExecuteCommand's INNER `result` variable has -- what displayExecutionResult
    // is handed at cli-main.js:999, and what originalResult must be after the fix.
    const innerResult = { success: true, normalizedScore: 92, gateResults: {}, warnings: [] };

    await printHandoffResultLines(innerResult, 'PLAN-TO-LEAD', 'SD-TEST-001');

    const line = output.find((l) => l.includes('HANDOFF_RESULT='));
    expect(line, 'no HANDOFF_RESULT= line was printed at all').toBeDefined();

    PARENT_COMPLETION_CONSUMER_REGEX.lastIndex = 0;
    const match = PARENT_COMPLETION_CONSUMER_REGEX.exec(line);
    expect(match, `line did not match the real consumer regex: ${line}`).not.toBeNull();
    expect(match[3]).toBe('92');
  });

  it('[CRITICAL FIX PIN, regression guard] the WRAPPER shape (the actual bug) would produce an unparseable SCORE=NaN -- documents the exact failure this fix prevents', async () => {
    // The WRAPPER handleExecuteCommand actually returns: { success, sdId, handoffType, result }.
    // This is what originalResult was BEFORE the fix (currentResult, unwrapped).
    const wrapperResult = {
      success: true,
      sdId: 'SD-TEST-001',
      handoffType: 'PLAN-TO-LEAD',
      result: { success: true, normalizedScore: 92, gateResults: {}, warnings: [] },
    };

    await printHandoffResultLines(wrapperResult, 'PLAN-TO-LEAD', 'SD-TEST-001');

    const line = output.find((l) => l.includes('HANDOFF_RESULT='));
    expect(line).toBeDefined();
    expect(line).toContain('SCORE=NaN');

    PARENT_COMPLETION_CONSUMER_REGEX.lastIndex = 0;
    const match = PARENT_COMPLETION_CONSUMER_REGEX.exec(line);
    expect(match, 'the wrapper shape should NOT be parseable -- if this now matches, either the regex or printHandoffResultLines changed and this pin needs re-evaluation').toBeNull();
  });
});
