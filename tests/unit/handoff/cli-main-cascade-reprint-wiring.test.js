/**
 * Structural wiring tests for cli-main.js's handleExecuteWithContinuation
 * (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001, FR-3/FR-4, TS-6/TS-7).
 *
 * WHY STATIC, NOT A RUNTIME INTEGRATION TEST. handleExecuteCommand is called via bare
 * lexical intra-module reference at every cascade site -- vi.mock cannot intercept a
 * same-module direct call (proven live precedent: tests/unit/handoff/standalone-sd-chaining.test.js
 * claims to test "the chaining logic in cli-main.js" but never imports that file at all).
 * A genuine runtime exercise of handleExecuteWithContinuation would require mocking the
 * DB client, execSync/git, gate validation, and sub-agent evidence checks reachable from
 * inside handleExecuteCommand -- a large surface for marginal confidence beyond what's
 * already covered:
 *   - runWithGuaranteedReprint's OWN try/finally contract is unit-tested in isolation
 *     with fake body/reprintFn (tests/unit/handoff/execution-helpers-guaranteed-reprint.test.js).
 *   - What's left to verify is purely STRUCTURAL: is the seam wired correctly at the 4
 *     real cascade call sites, and does the reprintFn close over the ORIGINAL SD's
 *     result/identity (captured before any cascade can mutate it) rather than the
 *     mutating currentResult/currentHandoffType/currentSdId loop variables.
 * Reading the file as plain text (not importing the module) avoids any risk of an
 * import-time side effect in cli-main.js's own dependency graph -- this repo has a
 * documented precedent of modules calling dotenv.config() at module scope (see
 * tests/helpers/credential-fence.js's discussion of lib/sub-agents/security.js).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PATH = path.resolve(__dirname, '../../../scripts/modules/handoff/cli/cli-main.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

// Isolate handleExecuteWithContinuation's own body so matches can't accidentally pick up
// unrelated occurrences elsewhere in this ~1300-line file.
function extractFunctionBody(fullSrc, exportedFnName) {
  const startMarker = `export async function ${exportedFnName}(`;
  const startIdx = fullSrc.indexOf(startMarker);
  if (startIdx === -1) return null;
  // Brace-depth scan from the function's opening brace to its matching close.
  const openBraceIdx = fullSrc.indexOf('{', startIdx);
  let depth = 0;
  for (let i = openBraceIdx; i < fullSrc.length; i++) {
    if (fullSrc[i] === '{') depth++;
    else if (fullSrc[i] === '}') {
      depth--;
      if (depth === 0) return fullSrc.slice(startIdx, i + 1);
    }
  }
  return null;
}

const fnBody = extractFunctionBody(src, 'handleExecuteWithContinuation');

describe('cli-main.js handleExecuteWithContinuation — reprint seam wiring (FR-3/FR-4)', () => {
  it('handleExecuteWithContinuation exists and was extracted (sanity check on the extraction itself)', () => {
    expect(fnBody, 'extractFunctionBody found no match -- either the function was renamed/removed, or the brace-depth scan is broken').not.toBeNull();
    expect(fnBody.length).toBeGreaterThan(500);
  });

  it('imports printHandoffResultLines and runWithGuaranteedReprint from execution-helpers.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*printHandoffResultLines[^}]*\}\s*from\s*['"]\.\/execution-helpers\.js['"]/);
    expect(src).toMatch(/import\s*\{[^}]*runWithGuaranteedReprint[^}]*\}\s*from\s*['"]\.\/execution-helpers\.js['"]/);
  });

  it('TS-6 — snapshots originalResult/originalHandoffType/originalSdId BEFORE the runWithGuaranteedReprint call, not after', () => {
    const snapshotIdx = fnBody.indexOf('const originalResult = currentResult;');
    const guaranteedReprintIdx = fnBody.indexOf('return runWithGuaranteedReprint(');

    expect(snapshotIdx, 'originalResult snapshot line not found').toBeGreaterThan(-1);
    expect(guaranteedReprintIdx, 'return runWithGuaranteedReprint( call not found').toBeGreaterThan(-1);
    expect(snapshotIdx, 'the ORIGINAL SD snapshot must be taken before the cascade loop can run, or a cascade could mutate currentResult first').toBeLessThan(guaranteedReprintIdx);
  });

  it('TS-6 — the reprintFn passed to runWithGuaranteedReprint reprints originalResult/originalHandoffType/originalSdId, never the mutating currentResult/currentHandoffType/currentSdId loop variables', () => {
    const guaranteedReprintIdx = fnBody.indexOf('return runWithGuaranteedReprint(');
    // The reprintFn is the second argument; isolate the call's own argument list from the
    // rest of the (much larger) function body that follows it.
    const callSlice = fnBody.slice(guaranteedReprintIdx, guaranteedReprintIdx + 600);

    expect(callSlice).toMatch(/printHandoffResultLines\(\s*originalResult\s*,\s*originalHandoffType\s*,\s*originalSdId\s*\)/);
    expect(callSlice).not.toMatch(/printHandoffResultLines\(\s*currentResult/);
  });

  it('TS-6 — handleExecuteWithContinuationLoop (the cascade loop body) is wrapped by runWithGuaranteedReprint, guaranteeing the reprintFn fires on every exit path (normal return, the parallelExecution early return, or a thrown error)', () => {
    expect(fnBody).toMatch(/runWithGuaranteedReprint\(\s*\(\)\s*=>\s*handleExecuteWithContinuationLoop\(\)/);
    expect(fnBody).toMatch(/async function handleExecuteWithContinuationLoop\(\)/);
  });

  it('TS-6 — every real cascade call site (LEAD-TO-PLAN chaining, standalone-SD chaining, parent LEAD-FINAL-APPROVAL, next-child chaining) sets cascadeAttempted = true immediately before reassigning currentResult', () => {
    // Exactly 4 real cascade sites per the SD's scope (a 5th, parent-cascade-on-child-completion,
    // was explicitly excluded as structurally different -- see PRD). Each must set the flag so
    // the reprintFn (guarded on `if (cascadeAttempted)`) knows a cascade was actually attempted.
    const flagSets = fnBody.match(/cascadeAttempted = true;/g) || [];
    expect(flagSets.length, `expected exactly 4 cascadeAttempted=true sites, found ${flagSets.length}`).toBe(4);
  });

  it('TS-7 — every cascadeAttempted=true site is immediately paired with the === AUTO-CHAIN ATTEMPT === delimiter before the cascaded handleExecuteCommand call', () => {
    // Split on the flag-set marker and check each subsequent chunk emits the delimiter
    // before the next handleExecuteCommand( call -- proves pairing, not just independent counts.
    const chunks = fnBody.split('cascadeAttempted = true;').slice(1); // drop the pre-first-match prefix
    expect(chunks.length).toBe(4);
    for (const chunk of chunks) {
      const delimiterIdx = chunk.indexOf('=== AUTO-CHAIN ATTEMPT ===');
      const nextCallIdx = chunk.indexOf('currentResult = await handleExecuteCommand(');
      expect(delimiterIdx, `no === AUTO-CHAIN ATTEMPT === delimiter found after a cascadeAttempted=true site:\n${chunk.slice(0, 200)}`).toBeGreaterThan(-1);
      expect(nextCallIdx, `no handleExecuteCommand( reassignment found after a cascadeAttempted=true site:\n${chunk.slice(0, 200)}`).toBeGreaterThan(-1);
      expect(delimiterIdx, 'the delimiter must print BEFORE the cascaded handoff runs, not after').toBeLessThan(nextCallIdx);
    }
  });

  it('TS-7 — the reprintFn prints a distinct, statically-matchable marker for the reprinted original-SD block', () => {
    expect(fnBody).toMatch(/=== ORIGINAL SD RESULT \(reprinted after cascade attempt\) ===/);
  });

  it('the common (non-cascading) path is untouched: printHandoffResultLines is called from the original success/fail branches in execution-helpers.js, not duplicated inline', () => {
    const helpersPath = path.resolve(__dirname, '../../../scripts/modules/handoff/cli/execution-helpers.js');
    const helpersSrc = fs.readFileSync(helpersPath, 'utf8');
    const callSites = helpersSrc.match(/printHandoffResultLines\(result, handoffType, sdId\)/g) || [];
    expect(callSites.length, 'expected printHandoffResultLines to be called from both the success and fail branches of displayExecutionResult').toBeGreaterThanOrEqual(2);
  });
});
