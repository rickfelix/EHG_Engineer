/**
 * QF-20260727-404 — the executor path must stamp repo evidence through the CANONICAL writer.
 *
 * Before this fix, every evidence row written by lib/sub-agent-executor/executor.js had NO
 * metadata.repo_path. It was invisible because it was MASKED, not harmless: missing repo_path
 * classifies as explicit_null, an INTRA_REPO target degrades that to explicit_null_intra, and the
 * gate lists explicit_null_intra in CONDITIONAL_STATUSES — a conditional pass. On a CROSS-REPO
 * target explicit_null BLOCKS, so the first venture SD through this path would hard-fail
 * PLAN-TO-EXEC looking like a gate bug rather than a missing stamp.
 *
 * WHY THE STRUCTURAL ASSERTIONS, STATED HONESTLY: executeSubAgent is a long IO-bound function
 * (Supabase, dynamic sub-agent module import, contract completion) with no existing unit harness,
 * and standing one up to drive it end-to-end would be a far larger change than the fix. What these
 * assert is exactly the thing that was WRONG — the canonical writer was never invoked on this path
 * — and they are deliberately written on ORDER OF OCCURRENCE rather than line numbers, because a
 * line-pinned test breaks on every legitimate insertion above it and gets deleted rather than fixed.
 *
 * The limitation is real and named: these prove the call EXISTS and RUNS BEFORE the store. They do
 * not prove the arguments are right. The behavioural block below covers the writer itself, so the
 * suite demonstrates the instrument can actually fire rather than only that a string is present.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTOR = path.join(REPO_ROOT, 'lib/sub-agent-executor/executor.js');
const src = fs.readFileSync(EXECUTOR, 'utf8');

describe('executor repo-evidence stamp (QF-20260727-404)', () => {
  it('imports the canonical writer from lib/sub-agents/resolve-repo.js', () => {
    expect(src).toMatch(/import\s*\{[^}]*resolveSubAgentRepo[^}]*\}\s*from\s*['"][^'"]*sub-agents\/resolve-repo\.js['"]/);
    expect(src).toMatch(/applySubAgentRepoVerdict/);
  });

  it('invokes applySubAgentRepoVerdict BEFORE the results are stored', () => {
    // Order of occurrence, not line numbers — robust to insertions above either call.
    const stampAt = src.indexOf('applySubAgentRepoVerdict(results');
    const storeAt = src.indexOf('await storeSubAgentResults(code, sdUUID, subAgent, results');
    expect(stampAt, 'applySubAgentRepoVerdict(results, …) must be called on the executor path').toBeGreaterThan(-1);
    expect(storeAt, 'the main storeSubAgentResults call must still exist').toBeGreaterThan(-1);
    expect(stampAt).toBeLessThan(storeAt);
  });

  it('resolves the repo through resolveSubAgentRepo rather than hand-setting the path columns', () => {
    // CLAUDE.md prologue item 11: metadata.repo_path / executed_from_cwd are the canonical writer's
    // to set. Hand-rolling them is the folklore that produces evidence the gate cannot read.
    expect(src).toMatch(/resolveSubAgentRepo\(\s*\{/);
    expect(src).not.toMatch(/metadata\.repo_path\s*=/);
    expect(src).not.toMatch(/repo_path:\s*(?!.*resolution)/);
  });

  it('a stamp failure is surfaced, never swallowed silently', () => {
    // The whole class this QF belongs to is "reports success while producing nothing". If the stamp
    // throws, the row still stores (losing evidence entirely would be worse) — but it must SAY so,
    // or an unstamped row is indistinguishable from the pre-fix behaviour.
    const catchBlock = src.slice(src.indexOf('applySubAgentRepoVerdict(results'), src.indexOf('await storeSubAgentResults(code, sdUUID, subAgent, results'));
    expect(catchBlock).toMatch(/catch/);
    expect(catchBlock).toMatch(/console\.(warn|error)/);
    expect(catchBlock).toMatch(/FAULT|FAILED/);
  });
});

describe('applySubAgentRepoVerdict actually stamps (the instrument can fire)', () => {
  it('writes repo_path and executed_from_cwd into results.metadata', () => {
    const results = { verdict: 'PASS', metadata: { existing: 'kept' } };
    applySubAgentRepoVerdict(results, {
      repoPath: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      repoResolved: true,
      registrySource: 'applications',
    });
    expect(results.metadata.repo_path).toBeTruthy();
    expect(results.metadata.executed_from_cwd).toBeTruthy();
    expect(results.metadata.existing).toBe('kept'); // additive, never clobbers caller metadata
  });

  it('an UNSTAMPED result has no repo_path — the pre-fix shape, shown explicitly', () => {
    // Makes the defect concrete: this is exactly what every CLI-path row looked like, and why the
    // gate's repo_path-vs-local_path comparison was never exercised.
    const unstamped = { verdict: 'PASS', metadata: {} };
    expect(unstamped.metadata.repo_path).toBeUndefined();
  });
});
